import { useEffect, useState } from 'react';
import { subscribeToAllCustomerProfiles } from '@/lib/customerProfilesFirestore';

export const useCustomerProfilesRealtime = (enabled = true) => {
  const [customers, setCustomers] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!enabled) {
      setCustomers([]);
      setError(null);
      return undefined;
    }
    return subscribeToAllCustomerProfiles(setCustomers, setError);
  }, [enabled]);

  return { customers, error };
};
