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
import { ensureFirebaseAdmin, getFirestoreDb } from '@/lib/firebase';

const galleryCollection = () => collection(getFirestoreDb(), 'gallery');

const mapPhoto = (snapshot) => {
  const data = snapshot.data();
  return {
    id: snapshot.id,
    ...data,
    is_hidden: data.hidden === true,
    is_featured: data.featured === true,
  };
};

export const subscribeToPublishedGallery = (onData, onError) => onSnapshot(
  query(galleryCollection(), where('hidden', '==', false)),
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
  await ensureFirebaseAdmin();
  const url = String(input.url || '').trim();
  if (!url) throw new Error('Photo URL is required.');
  return addDoc(galleryCollection(), {
    url,
    category: String(input.category || 'haircuts'),
    hidden: false,
    featured: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
};

export const updateGalleryPhoto = async (id, changes) => {
  await ensureFirebaseAdmin();
  const payload = { updatedAt: serverTimestamp() };
  if (changes.hidden !== undefined) payload.hidden = changes.hidden === true;
  if (changes.featured !== undefined) payload.featured = changes.featured === true;
  if (changes.category !== undefined) payload.category = String(changes.category || '');
  if (changes.url !== undefined) payload.url = String(changes.url || '').trim();
  await updateDoc(doc(getFirestoreDb(), 'gallery', id), payload);
};

export const deleteGalleryPhoto = async (id) => {
  await ensureFirebaseAdmin();
  await deleteDoc(doc(getFirestoreDb(), 'gallery', id));
};
