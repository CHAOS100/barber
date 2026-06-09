import { useEffect, useState } from 'react';
import {
  subscribeToAdminAppointments,
  subscribeToCustomerAppointments,
} from '@/lib/appointmentsFirestore';

const useAppointmentsSubscription = (subscribe, enabled) => {
  const [appointments, setAppointments] = useState([]);
  const [isLoading, setIsLoading] = useState(enabled);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!enabled) {
      setAppointments([]);
      setIsLoading(false);
      setError(null);
      return undefined;
    }

    setIsLoading(true);
    const unsubscribe = subscribe(
      (nextAppointments) => {
        setAppointments(nextAppointments);
        setError(null);
        setIsLoading(false);
      },
      (nextError) => {
        setError(nextError);
        setIsLoading(false);
      },
    );

    return unsubscribe;
  }, [enabled, subscribe]);

  return { appointments, isLoading, error };
};

export const useAdminAppointmentsRealtime = (enabled = true) =>
  useAppointmentsSubscription(subscribeToAdminAppointments, enabled);

export const useCustomerAppointmentsRealtime = (enabled = true) =>
  useAppointmentsSubscription(subscribeToCustomerAppointments, enabled);
