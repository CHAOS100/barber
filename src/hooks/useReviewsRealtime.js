import { useEffect, useState } from 'react';
import {
  subscribeToAdminReviews,
  subscribeToCustomerReviews,
  subscribeToPublishedReviews,
} from '@/lib/reviewsFirestore';

const useReviewsSubscription = (subscribe, enabled = true) => {
  const [reviews, setReviews] = useState([]);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(enabled);

  useEffect(() => {
    if (!enabled) {
      setReviews([]);
      setError(null);
      setIsLoading(false);
      return undefined;
    }
    setIsLoading(true);
    return subscribe(
      (nextReviews) => {
        setReviews(nextReviews);
        setError(null);
        setIsLoading(false);
      },
      (nextError) => {
        setError(nextError);
        setIsLoading(false);
      },
    );
  }, [enabled, subscribe]);

  return { reviews, error, isLoading };
};

export const usePublishedReviewsRealtime = () =>
  useReviewsSubscription(subscribeToPublishedReviews);

export const useCustomerReviewsRealtime = (enabled = true) =>
  useReviewsSubscription(subscribeToCustomerReviews, enabled);

export const useAdminReviewsRealtime = (enabled = true) =>
  useReviewsSubscription(subscribeToAdminReviews, enabled);
