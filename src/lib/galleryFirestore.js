import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  deleteObject,
  getDownloadURL,
  ref as storageRef,
  uploadBytes,
} from 'firebase/storage';
import {
  ensureFirebaseAdmin,
  getFirebaseStorage,
  getFirestoreDb,
} from '@/lib/firebase';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
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
  if (!String(file.type || '').startsWith('image/')) {
    throw Object.assign(new Error('ניתן להעלות קובצי תמונה בלבד.'), { code: 'gallery/invalid-file-type' });
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw Object.assign(new Error('גודל התמונה המרבי הוא 10MB.'), { code: 'gallery/file-too-large' });
  }
};

const buildStoragePath = (file, category) => {
  const safeName = String(file.name || 'image')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const uniqueId = globalThis.crypto?.randomUUID?.()
    || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `gallery/${normalizeCategory(category)}/${uniqueId}-${safeName || 'image'}`;
};

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

export const uploadGalleryImage = async (file, input = {}) => {
  validateImageFile(file);
  const admin = await ensureFirebaseAdmin();
  const storagePath = buildStoragePath(file, input.category);
  const imageRef = storageRef(getFirebaseStorage(), storagePath);

  await uploadBytes(imageRef, file, {
    contentType: file.type,
    customMetadata: { uploadedBy: admin.uid },
  });

  try {
    const imageUrl = await getDownloadURL(imageRef);
    const created = await addDoc(galleryCollection(), {
      ...galleryPayload({ ...input, imageUrl, storagePath }, admin.uid),
      createdAt: serverTimestamp(),
    });
    return { id: created.id, imageUrl, storagePath };
  } catch (error) {
    await deleteObject(imageRef).catch(() => {});
    throw error;
  }
};

export const replaceGalleryImage = async (photo, file, changes = {}) => {
  validateImageFile(file);
  if (!photo?.id) throw new Error('מזהה תמונה חסר.');
  const admin = await ensureFirebaseAdmin();
  const storagePath = buildStoragePath(file, changes.category || photo.category);
  const imageRef = storageRef(getFirebaseStorage(), storagePath);
  await uploadBytes(imageRef, file, {
    contentType: file.type,
    customMetadata: { uploadedBy: admin.uid },
  });

  try {
    const imageUrl = await getDownloadURL(imageRef);
    await updateGalleryPhoto(photo.id, { ...changes, imageUrl });
    if (photo.storagePath) {
      await deleteObject(storageRef(getFirebaseStorage(), photo.storagePath)).catch((error) => {
        if (error?.code !== 'storage/object-not-found') {
          console.warn('[Firebase Storage] Previous gallery image cleanup failed', {
            code: error?.code || 'unknown',
            storagePath: photo.storagePath,
          });
        }
      });
    }
    await updateDoc(doc(getFirestoreDb(), 'gallery', photo.id), {
      storagePath,
      uploadedBy: admin.uid,
      updatedAt: serverTimestamp(),
    });
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
