import { useCallback, useEffect, useState } from 'react';
import {
  subscribeToActiveServices,
  subscribeToAllServices,
  subscribeToActiveBarbers,
  subscribeToAllBarbers,
  subscribeToAppointmentBlocks,
  subscribeToBookingSettings,
  subscribeToBusinessSettings,
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

export const useAllBarbersRealtime = () =>
  useSubscription(subscribeToAllBarbers);

export const useActiveServicesRealtime = () =>
  useSubscription(subscribeToActiveServices);

export const useAllServicesRealtime = () =>
  useSubscription(subscribeToAllServices);

export const useBookingSettingsRealtime = () => {
  const [settings, setSettings] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => subscribeToBookingSettings(setSettings, setError), []);
  return { settings, error };
};

export const useBusinessSettingsRealtime = () => {
  const [settings, setSettings] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => subscribeToBusinessSettings(setSettings, setError), []);
  return { settings, error };
};

export const useAppointmentBlocksRealtime = (date) => {
  const subscribe = useCallback(
    (onData, onError) => subscribeToAppointmentBlocks(date, onData, onError),
    [date],
  );
  return useSubscription(subscribe, Boolean(date));
};
