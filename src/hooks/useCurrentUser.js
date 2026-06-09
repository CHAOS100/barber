import { useState, useEffect } from 'react';
import { userStore, loginUser, logoutUser } from '../lib/userStore';
import { ADMIN_PHONE, ADMIN_EMAIL } from '../lib/mockData';

export function useCurrentUser() {
  const [currentUser, setCurrentUser] = useState(userStore.getState().currentUser);

  useEffect(() => {
    return userStore.subscribe((state) => {
      setCurrentUser(state.currentUser);
    });
  }, []);

  const isAdmin =
    currentUser?.isAdmin === true ||
    currentUser?.email === ADMIN_EMAIL ||
    currentUser?.phone === ADMIN_PHONE ||
    currentUser?.phone === "0542244542";

  return { currentUser, isAdmin, loginUser, logoutUser };
}