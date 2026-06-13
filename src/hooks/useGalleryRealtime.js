import { useEffect, useState } from 'react';
import { subscribeToAdminGallery, subscribeToPublishedGallery } from '@/lib/galleryFirestore';

const useGallerySubscription = (subscribe, enabled = true) => {
  const [photos, setPhotos] = useState([]);
  const [error, setError] = useState(null);
  useEffect(() => {
    if (!enabled) {
      setPhotos([]);
      return undefined;
    }
    return subscribe(setPhotos, setError);
  }, [enabled, subscribe]);
  return { photos, error };
};

export const usePublishedGalleryRealtime = () =>
  useGallerySubscription(subscribeToPublishedGallery);

export const useAdminGalleryRealtime = (enabled = true) =>
  useGallerySubscription(subscribeToAdminGallery, enabled);
