import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  deleteObject,
  getDownloadURL,
  ref as storageRef,
  uploadBytesResumable,
} from 'firebase/storage';
import {
  ensureFirebaseAdmin,
  getFirebaseStorage,
  getFirestoreDb,
} from '@/lib/firebase';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const UPLOAD_STALL_TIMEOUT_MS = 90_000;
const UPLOAD_TOTAL_TIMEOUT_MS = 5 * 60_000;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_CATEGORIES = new Set(['gallery', 'business', 'barber', 'service']);
const galleryCollection = () => collection(getFirestoreDb(), 'gallery');

const normalizeCategory = (value) =>
  ALLOWED_CATEGORIES.has(String(value || '')) ? String(value) : 'gallery';

const mapPhoto = (snapshot) => {
  const data = snapshot.data();
  const active = data.active !== false && data.hidden !== true;
  const imageUrl = data.imageUrl || data.url || '';
  return {
    id: snapshot.id,
    ...data,
    imageUrl,
    url: imageUrl,
    active,
    is_hidden: !active,
  };
};

const galleryPayload = (input, adminUid) => ({
  imageUrl: String(input.imageUrl || input.url || '').trim(),
  storagePath: String(input.storagePath || '').trim(),
  title: String(input.title || '').trim(),
  description: String(input.description || '').trim(),
  category: normalizeCategory(input.category),
  serviceId: input.serviceId ? String(input.serviceId).trim() : null,
  barberId: input.barberId ? String(input.barberId).trim() : null,
  active: input.active !== false,
  uploadedBy: adminUid,
  updatedAt: serverTimestamp(),
});

const validateImageFile = (file) => {
  if (!file) throw Object.assign(new Error('יש לבחור קובץ תמונה.'), { code: 'gallery/file-required' });
  if (!ALLOWED_IMAGE_TYPES.has(String(file.type || ''))) {
    throw Object.assign(new Error('סוג קובץ לא נתמך'), { code: 'gallery/invalid-file-type' });
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw Object.assign(new Error('הקובץ גדול מדי'), { code: 'gallery/file-too-large' });
  }
};

export const getGalleryUploadErrorMessage = (error) => {
  if (error?.code === 'gallery/file-too-large') return 'הקובץ גדול מדי';
  if (error?.code === 'gallery/invalid-file-type') return 'סוג קובץ לא נתמך';
  if (error?.code === 'storage/unauthorized') return 'אין לך הרשאה להעלות תמונות.';
  if (error?.code === 'storage/canceled') return 'העלאת התמונה בוטלה.';
  if (error?.code === 'storage/upload-stalled') return 'העלאת התמונה נתקעה. בדוק חיבור אינטרנט ונסה שוב.';
  if (error?.code === 'storage/retry-limit-exceeded') return 'החיבור ל־Storage נכשל. נסה שוב בעוד רגע.';
  if (String(error?.message || '').includes('bucket')) return 'Firebase Storage לא מוגדר לפרויקט.';
  return 'העלאת התמונה נכשלה';
};

export const validateGalleryImageFile = validateImageFile;

const buildStoragePath = (imageId, file) => {
  const safeName = String(file.name || 'image')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `gallery/${imageId}/${safeName || 'image'}`;
};

const createUploadTimeoutError = () => Object.assign(
  new Error('Gallery upload stalled before Firebase Storage completed the upload.'),
  { code: 'storage/upload-stalled' },
);

const uploadFileWithProgress = (imageRef, file, adminUid, imageId, onProgress) => new Promise((resolve, reject) => {
  let uploadTask;
  let settled = false;
  let stallTimer = null;
  let totalTimer = null;

  const clearTimers = () => {
    if (stallTimer) window.clearTimeout(stallTimer);
    if (totalTimer) window.clearTimeout(totalTimer);
  };

  const fail = (error) => {
    if (settled) return;
    settled = true;
    clearTimers();
    uploadTask?.cancel?.();
    reject(error);
  };

  const resetStallTimer = () => {
    if (stallTimer) window.clearTimeout(stallTimer);
    stallTimer = window.setTimeout(() => fail(createUploadTimeoutError()), UPLOAD_STALL_TIMEOUT_MS);
  };

  onProgress?.(0);
  uploadTask = uploadBytesResumable(imageRef, file, {
    contentType: file.type,
    customMetadata: {
      uploadedBy: adminUid,
      imageId,
    },
  });

  uploadTask.on(
    'state_changed',
    (snapshot) => {
      const progress = snapshot.totalBytes
        ? Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100)
        : 0;
      onProgress?.(progress);
      resetStallTimer();
    },
    fail,
    () => {
      if (settled) return;
      settled = true;
      clearTimers();
      onProgress?.(100);
      resolve(uploadTask.snapshot);
    },
  );

  resetStallTimer();
  totalTimer = window.setTimeout(() => fail(createUploadTimeoutError()), UPLOAD_TOTAL_TIMEOUT_MS);
});

export const subscribeToPublishedGallery = (onData, onError) => onSnapshot(
  query(galleryCollection(), where('active', '==', true)),
  (snapshot) => onData(snapshot.docs.map(mapPhoto)),
  onError,
);

export const subscribeToAdminGallery = (onData, onError) => {
  let unsubscribe = () => {};
  let cancelled = false;
  ensureFirebaseAdmin()
    .then(() => {
      if (!cancelled) {
        unsubscribe = onSnapshot(galleryCollection(), (snapshot) => {
          onData(snapshot.docs.map(mapPhoto));
        }, onError);
      }
    })
    .catch(onError);
  return () => {
    cancelled = true;
    unsubscribe();
  };
};

export const createGalleryPhoto = async (input) => {
  const admin = await ensureFirebaseAdmin();
  const payload = galleryPayload(input, admin.uid);
  if (!payload.imageUrl) throw new Error('כתובת תמונה נדרשת.');
  return addDoc(galleryCollection(), {
    ...payload,
    createdAt: serverTimestamp(),
  });
};

export const uploadGalleryImage = async (file, input = {}, options = {}) => {
  validateImageFile(file);
  const admin = await ensureFirebaseAdmin();
  const photoRef = doc(galleryCollection());
  const storagePath = buildStoragePath(photoRef.id, file);
  const imageRef = storageRef(getFirebaseStorage(), storagePath);

  try {
    await uploadFileWithProgress(imageRef, file, admin.uid, photoRef.id, options.onProgress);
    const imageUrl = await getDownloadURL(imageRef);
    await setDoc(photoRef, {
      ...galleryPayload({ ...input, imageUrl, storagePath }, admin.uid),
      createdAt: serverTimestamp(),
    });
    return { id: photoRef.id, imageUrl, storagePath };
  } catch (error) {
    await deleteObject(imageRef).catch(() => {});
    throw error;
  }
};

export const replaceGalleryImage = async (photo, file, changes = {}, options = {}) => {
  validateImageFile(file);
  if (!photo?.id) throw new Error('מזהה תמונה חסר.');
  const admin = await ensureFirebaseAdmin();
  const storagePath = buildStoragePath(photo.id, file);
  const imageRef = storageRef(getFirebaseStorage(), storagePath);

  try {
    await uploadFileWithProgress(imageRef, file, admin.uid, photo.id, options.onProgress);
    const imageUrl = await getDownloadURL(imageRef);
    await updateDoc(doc(getFirestoreDb(), 'gallery', photo.id), {
      ...galleryPayload({ ...photo, ...changes, imageUrl, storagePath }, admin.uid),
    });
    if (photo.storagePath && photo.storagePath !== storagePath) {
      await deleteObject(storageRef(getFirebaseStorage(), photo.storagePath)).catch((error) => {
        if (error?.code !== 'storage/object-not-found') {
          console.warn('[Firebase Storage] Previous gallery image cleanup failed', {
            code: error?.code || 'unknown',
            storagePath: photo.storagePath,
          });
        }
      });
    }
    return { id: photo.id, imageUrl, storagePath };
  } catch (error) {
    await deleteObject(imageRef).catch(() => {});
    throw error;
  }
};

export const updateGalleryPhoto = async (id, changes) => {
  await ensureFirebaseAdmin();
  const payload = { updatedAt: serverTimestamp() };
  if (changes.title !== undefined) payload.title = String(changes.title || '').trim();
  if (changes.description !== undefined) payload.description = String(changes.description || '').trim();
  if (changes.category !== undefined) payload.category = normalizeCategory(changes.category);
  if (changes.serviceId !== undefined) payload.serviceId = changes.serviceId ? String(changes.serviceId).trim() : null;
  if (changes.barberId !== undefined) payload.barberId = changes.barberId ? String(changes.barberId).trim() : null;
  if (changes.active !== undefined) payload.active = changes.active === true;
  if (changes.imageUrl !== undefined || changes.url !== undefined) {
    payload.imageUrl = String(changes.imageUrl || changes.url || '').trim();
  }
  await updateDoc(doc(getFirestoreDb(), 'gallery', id), payload);
};

export const deleteGalleryPhoto = async (photoOrId) => {
  await ensureFirebaseAdmin();
  const photo = typeof photoOrId === 'string' ? { id: photoOrId } : photoOrId;
  if (!photo?.id) throw new Error('מזהה תמונה חסר.');

  if (photo.storagePath) {
    try {
      await deleteObject(storageRef(getFirebaseStorage(), photo.storagePath));
    } catch (error) {
      if (error?.code !== 'storage/object-not-found') throw error;
    }
  }
  await deleteDoc(doc(getFirestoreDb(), 'gallery', photo.id));
};
