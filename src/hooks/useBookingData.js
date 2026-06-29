import { useCallback, useEffect, useState } from 'react';
import {
  subscribeToActiveServices,
  subscribeToAllServices,
  subscribeToActiveBarbers,
  subscribeToAllBarbers,
  subscribeToAppointmentBlocks,
  subscribeToBookingSettings,
  subscribeToBusinessSettings,
  subscribeToBookingSlotReleases,
  subscribeToUpcomingBookingSlotReleases,
  subscribeToBookingSlotReleasesAll,
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
  const [loading, setLoading] = useState(true);

  useEffect(() => subscribeToBookingSettings(
    (nextSettings) => {
      setSettings(nextSettings);
      setLoading(false);
    },
    (nextError) => {
      setError(nextError);
      setLoading(false);
    },
  ), []);
  return { settings, error, loading };
};

export const useBusinessSettingsRealtime = () => {
  const [settings, setSettings] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => subscribeToBusinessSettings(
    (nextSettings) => {
      setSettings(nextSettings);
      setLoading(false);
    },
    (nextError) => {
      setError(nextError);
      setLoading(false);
    },
  ), []);
  return { settings, error, loading };
};

export const useAppointmentBlocksRealtime = (date) => {
  const subscribe = useCallback(
    (onData, onError) => subscribeToAppointmentBlocks(date, onData, onError),
    [date],
  );
  return useSubscription(subscribe, Boolean(date));
};

export const useBookingSlotReleasesRealtime = (date) => {
  const subscribe = useCallback(
    (onData, onError) => subscribeToBookingSlotReleases(date, onData, onError),
    [date],
  );
  return useSubscription(subscribe, Boolean(date));
};

export const useUpcomingBookingSlotReleasesRealtime = (fromDate) => {
  const subscribe = useCallback(
    (onData, onError) => subscribeToUpcomingBookingSlotReleases(fromDate, onData, onError),
    [fromDate],
  );
  return useSubscription(subscribe, Boolean(fromDate));
};

export const useBookingSlotReleasesAllRealtime = (sinceDate) => {
  const subscribe = useCallback(
    (onData, onError) => subscribeToBookingSlotReleasesAll(sinceDate, onData, onError),
    [sinceDate],
  );
  return useSubscription(subscribe, Boolean(sinceDate));
};
