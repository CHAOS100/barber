import { useState, useEffect } from 'react';
import {
  enterAdminPreview,
  exitAdminPreview,
  userStore,
  loginUser,
} from '../lib/userStore';
import { signOutFirebaseSession } from '../lib/firebase';

export function useCurrentUser() {
  const [sessionState, setSessionState] = useState(userStore.getState());

  useEffect(() => {
    return userStore.subscribe((state) => {
      setSessionState(state);
    });
  }, []);

  const currentUser = sessionState.currentUser;
  const isAdmin = currentUser?.isAdmin === true;
  const adminPreview = isAdmin && sessionState.adminPreview === true;

  return {
    currentUser,
    isAdmin,
    adminPreview,
    enterAdminPreview,
    exitAdminPreview,
    loginUser,
    logoutUser: signOutFirebaseSession,
  };
}
