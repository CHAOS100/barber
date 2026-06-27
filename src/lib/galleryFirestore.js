import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
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

const serializeGalleryError = (error) => ({
  code: error?.code || 'unknown',
  message: error?.message || String(error || 'Unknown gallery upload error'),
  name: error?.name || null,
});

const logGalleryUpload = (event, payload = {}) => {
  console.info('[Gallery Upload Debug]', JSON.stringify({
    event,
    ...payload,
  }));
};

const logGalleryUploadError = (event, error, payload = {}) => {
  console.error('[Gallery Upload Debug]', JSON.stringify({
    event,
    ...payload,
    error: serializeGalleryError(error),
  }));
};

const fileDebugPayload = (file) => ({
  fileName: file?.name || null,
  fileSize: file?.size || null,
  mimeType: file?.type || null,
});

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
  logGalleryUpload('validate-file', fileDebugPayload(file));
  if (!file) throw Object.assign(new Error('יש לבחור קובץ תמונה.'), { code: 'gallery/file-required' });
  const mimeType = String(file.type || '');
  if (!ALLOWED_IMAGE_TYPES.has(mimeType)) {
    throw Object.assign(new Error('פורמט התמונה לא נתמך. בחר JPG, PNG או WEBP.'), { code: 'gallery/invalid-file-type' });
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw Object.assign(new Error('התמונה גדולה מדי. בחר תמונה עד 10MB.'), { code: 'gallery/file-too-large' });
  }
  logGalleryUpload('validate-file-success', fileDebugPayload(file));
};

export const getGalleryUploadErrorMessage = (error) => {
  if (error?.code === 'gallery/file-too-large') return 'התמונה גדולה מדי. בחר תמונה עד 10MB.';
  if (error?.code === 'gallery/invalid-file-type') return 'פורמט התמונה לא נתמך. בחר JPG, PNG או WEBP.';
  if (error?.code === 'storage/unauthorized') return 'אין הרשאה להעלות תמונה. בדוק Storage Rules.';
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
  const storagePath = `gallery/${imageId}/${safeName || 'image'}`;
  logGalleryUpload('generated-storage-path', {
    imageId,
    storagePath,
    ...fileDebugPayload(file),
  });
  return storagePath;
};

const createUploadTimeoutError = (phase, progress) => Object.assign(
  new Error(`Gallery upload stalled during ${phase}. Progress stayed at ${progress}%.`),
  { code: 'storage/upload-stalled' },
);

const uploadFileWithProgress = (imageRef, file, adminUid, imageId, onProgress) => new Promise((resolve, reject) => {
  let uploadTask;
  let settled = false;
  let stallTimer = null;
  let totalTimer = null;
  let lastProgress = 0;
  let lastPhase = 'before-uploadBytesResumable-state-changed';

  const clearTimers = () => {
    if (stallTimer) window.clearTimeout(stallTimer);
    if (totalTimer) window.clearTimeout(totalTimer);
  };

  const fail = (error) => {
    if (settled) return;
    settled = true;
    clearTimers();
    logGalleryUploadError('upload-failed', error, {
      imageId,
      adminUid,
      storagePath: imageRef.fullPath,
      lastProgress,
      lastPhase,
      hangingFirebaseCall: lastProgress === 0
        ? 'uploadBytesResumable(...).on("state_changed") did not report bytes transferred before timeout/error'
        : null,
      ...fileDebugPayload(file),
    });
    uploadTask?.cancel?.();
    reject(error);
  };

  const resetStallTimer = () => {
    if (stallTimer) window.clearTimeout(stallTimer);
    stallTimer = window.setTimeout(() => {
      logGalleryUpload('upload-stalled-timeout', {
        imageId,
        storagePath: imageRef.fullPath,
        lastProgress,
        lastPhase,
        hangingFirebaseCall: lastProgress === 0
          ? 'uploadBytesResumable(...).on("state_changed") did not emit a progress snapshot'
          : 'Firebase Storage upload task stopped emitting progress snapshots',
        ...fileDebugPayload(file),
      });
      fail(createUploadTimeoutError(lastPhase, lastProgress));
    }, UPLOAD_STALL_TIMEOUT_MS);
  };

  logGalleryUpload('upload-start', {
    imageId,
    adminUid,
    storagePath: imageRef.fullPath,
    ...fileDebugPayload(file),
  });
  onProgress?.(0);
  logGalleryUpload('calling-uploadBytesResumable', {
    imageId,
    storagePath: imageRef.fullPath,
    contentType: file.type,
  });
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
      lastPhase = `uploadBytesResumable-state-${snapshot.state || 'unknown'}`;
      const progress = snapshot.totalBytes
        ? Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100)
        : 0;
      lastProgress = progress;
      onProgress?.(progress);
      logGalleryUpload('upload-progress', {
        imageId,
        storagePath: imageRef.fullPath,
        progress,
        bytesTransferred: snapshot.bytesTransferred,
        totalBytes: snapshot.totalBytes,
        state: snapshot.state || null,
      });
      resetStallTimer();
    },
    fail,
    () => {
      if (settled) return;
      settled = true;
      clearTimers();
      onProgress?.(100);
      lastProgress = 100;
      lastPhase = 'upload-complete';
      logGalleryUpload('upload-completion', {
        imageId,
        storagePath: imageRef.fullPath,
        bytesTransferred: uploadTask.snapshot?.bytesTransferred || null,
        totalBytes: uploadTask.snapshot?.totalBytes || null,
      });
      resolve(uploadTask.snapshot);
    },
  );

  resetStallTimer();
  totalTimer = window.setTimeout(() => {
    logGalleryUpload('upload-total-timeout', {
      imageId,
      storagePath: imageRef.fullPath,
      lastProgress,
      lastPhase,
      hangingFirebaseCall: lastProgress === 0
        ? 'uploadBytesResumable never produced a progress snapshot'
        : 'Firebase Storage upload task did not complete',
      ...fileDebugPayload(file),
    });
    fail(createUploadTimeoutError(lastPhase, lastProgress));
  }, UPLOAD_TOTAL_TIMEOUT_MS);
});

const logAdminRoleLookup = async (adminUid) => {
  const adminDocPath = `admins/${adminUid}`;
  try {
    const adminSnapshot = await getDoc(doc(getFirestoreDb(), 'admins', adminUid));
    const adminData = adminSnapshot.exists() ? adminSnapshot.data() : null;
    logGalleryUpload('admin-role-lookup-result', {
      currentAuthenticatedUserUid: adminUid,
      adminDocPath,
      exists: adminSnapshot.exists(),
      role: adminData?.role || null,
      active: adminData?.active ?? null,
    });
  } catch (error) {
    logGalleryUploadError('admin-role-lookup-exception', error, {
      currentAuthenticatedUserUid: adminUid,
      adminDocPath,
    });
  }
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
  logGalleryUpload('create-gallery-photo-authenticated-user', {
    currentAuthenticatedUserUid: admin.uid,
  });
  await logAdminRoleLookup(admin.uid);
  const payload = galleryPayload(input, admin.uid);
  if (!payload.imageUrl) throw new Error('כתובת תמונה נדרשת.');
  try {
    logGalleryUpload('firestore-gallery-document-create-start', {
      mode: 'url-only',
      currentAuthenticatedUserUid: admin.uid,
      category: payload.category,
      active: payload.active,
    });
    const result = await addDoc(galleryCollection(), {
      ...payload,
      createdAt: serverTimestamp(),
    });
    logGalleryUpload('firestore-gallery-document-create-success', {
      galleryDocumentId: result.id,
      mode: 'url-only',
    });
    return result;
  } catch (error) {
    logGalleryUploadError('firestore-gallery-document-create-exception', error, {
      mode: 'url-only',
      currentAuthenticatedUserUid: admin.uid,
    });
    throw error;
  }
};

export const uploadGalleryImage = async (file, input = {}, options = {}) => {
  validateImageFile(file);
  const admin = await ensureFirebaseAdmin();
  logGalleryUpload('upload-gallery-image-authenticated-user', {
    currentAuthenticatedUserUid: admin.uid,
    ...fileDebugPayload(file),
  });
  await logAdminRoleLookup(admin.uid);
  const photoRef = doc(galleryCollection());
  const storagePath = buildStoragePath(photoRef.id, file);
  const imageRef = storageRef(getFirebaseStorage(), storagePath);

  try {
    await uploadFileWithProgress(imageRef, file, admin.uid, photoRef.id, options.onProgress);
    logGalleryUpload('download-url-generation-start', {
      galleryDocumentId: photoRef.id,
      storagePath,
    });
    const imageUrl = await getDownloadURL(imageRef);
    logGalleryUpload('download-url-generation-success', {
      galleryDocumentId: photoRef.id,
      storagePath,
      imageUrl,
    });
    logGalleryUpload('firestore-gallery-document-create-start', {
      galleryDocumentId: photoRef.id,
      storagePath,
      currentAuthenticatedUserUid: admin.uid,
      category: input.category || null,
      active: input.active !== false,
    });
    await setDoc(photoRef, {
      ...galleryPayload({ ...input, imageUrl, storagePath }, admin.uid),
      createdAt: serverTimestamp(),
    });
    logGalleryUpload('firestore-gallery-document-create-success', {
      galleryDocumentId: photoRef.id,
      storagePath,
    });
    return { id: photoRef.id, imageUrl, storagePath };
  } catch (error) {
    logGalleryUploadError('upload-gallery-image-caught-exception', error, {
      galleryDocumentId: photoRef.id,
      storagePath,
      currentAuthenticatedUserUid: admin.uid,
    });
    await deleteObject(imageRef).catch((cleanupError) => {
      logGalleryUploadError('upload-gallery-image-cleanup-exception', cleanupError, {
        galleryDocumentId: photoRef.id,
        storagePath,
      });
    });
    throw error;
  }
};

export const replaceGalleryImage = async (photo, file, changes = {}, options = {}) => {
  validateImageFile(file);
  if (!photo?.id) throw new Error('מזהה תמונה חסר.');
  const admin = await ensureFirebaseAdmin();
  logGalleryUpload('replace-gallery-image-authenticated-user', {
    currentAuthenticatedUserUid: admin.uid,
    existingGalleryDocumentId: photo.id,
    ...fileDebugPayload(file),
  });
  await logAdminRoleLookup(admin.uid);
  const storagePath = buildStoragePath(photo.id, file);
  const imageRef = storageRef(getFirebaseStorage(), storagePath);

  try {
    await uploadFileWithProgress(imageRef, file, admin.uid, photo.id, options.onProgress);
    logGalleryUpload('download-url-generation-start', {
      galleryDocumentId: photo.id,
      storagePath,
    });
    const imageUrl = await getDownloadURL(imageRef);
    logGalleryUpload('download-url-generation-success', {
      galleryDocumentId: photo.id,
      storagePath,
      imageUrl,
    });
    logGalleryUpload('firestore-gallery-document-update-start', {
      galleryDocumentId: photo.id,
      storagePath,
      currentAuthenticatedUserUid: admin.uid,
    });
    await updateDoc(doc(getFirestoreDb(), 'gallery', photo.id), {
      ...galleryPayload({ ...photo, ...changes, imageUrl, storagePath }, admin.uid),
    });
    logGalleryUpload('firestore-gallery-document-update-success', {
      galleryDocumentId: photo.id,
      storagePath,
    });
    if (photo.storagePath && photo.storagePath !== storagePath) {
      await deleteObject(storageRef(getFirebaseStorage(), photo.storagePath)).catch((error) => {
        if (error?.code !== 'storage/object-not-found') {
          logGalleryUploadError('previous-gallery-image-cleanup-exception', error, {
            galleryDocumentId: photo.id,
            storagePath: photo.storagePath,
          });
        }
      });
    }
    return { id: photo.id, imageUrl, storagePath };
  } catch (error) {
    logGalleryUploadError('replace-gallery-image-caught-exception', error, {
      galleryDocumentId: photo.id,
      storagePath,
      currentAuthenticatedUserUid: admin.uid,
    });
    await deleteObject(imageRef).catch((cleanupError) => {
      logGalleryUploadError('replace-gallery-image-cleanup-exception', cleanupError, {
        galleryDocumentId: photo.id,
        storagePath,
      });
    });
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
