import { useState, useEffect } from 'react';
import { userStore, loginUser } from '../lib/userStore';
import { signOutFirebaseSession } from '../lib/firebase';

export function useCurrentUser() {
  const [currentUser, setCurrentUser] = useState(userStore.getState().currentUser);

  useEffect(() => {
    return userStore.subscribe((state) => {
      setCurrentUser(state.currentUser);
    });
  }, []);

  const isAdmin = currentUser?.isAdmin === true;

  return { currentUser, isAdmin, loginUser, logoutUser: signOutFirebaseSession };
}
