import { useCallback, useEffect, useState } from 'react';
import {
  subscribeToActiveBarbers,
  subscribeToAppointmentBlocks,
} from '@/lib/businessFirestore';

const useSubscription = (subscribe, enabled = true) => {
  const [data, setData] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!enabled) {
      setData([]);
      return undefined;
    }
    return subscribe(setData, setError);
  }, [enabled, subscribe]);

  return { data, error };
};

export const useActiveBarbersRealtime = () =>
  useSubscription(subscribeToActiveBarbers);

export const useAppointmentBlocksRealtime = (date) => {
  const subscribe = useCallback(
    (onData, onError) => subscribeToAppointmentBlocks(date, onData, onError),
    [date],
  );
  return useSubscription(subscribe, Boolean(date));
};
