// Simple store for the authenticated Firebase user session.
const ADMIN_STORAGE_KEY = 'ost_admin_session';
const LEGACY_USER_STORAGE_KEY = 'ost_user';
let listeners = [];
let state = {
  currentUser: null,
  adminPreview: false,
};

try {
  localStorage.removeItem(LEGACY_USER_STORAGE_KEY);
  const stored = localStorage.getItem(ADMIN_STORAGE_KEY);
  if (stored) {
    const user = JSON.parse(stored);
    const isValidAdmin = user?.isAdmin === true && Boolean(user.uid);
    if (isValidAdmin) {
      state.currentUser = user;
    } else {
      localStorage.removeItem(ADMIN_STORAGE_KEY);
    }
  }
} catch {}

export const userStore = {
  getState: () => state,
  setState: (newState) => {
    state = { ...state, ...newState };
    listeners.forEach(fn => fn(state));
  },
  subscribe: (fn) => {
    listeners.push(fn);
    return () => { listeners = listeners.filter(l => l !== fn); };
  }
};

export const loginUser = (user) => {
  userStore.setState({ currentUser: user, adminPreview: false });
  try {
    if (user?.isAdmin === true) {
      localStorage.setItem(ADMIN_STORAGE_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(ADMIN_STORAGE_KEY);
    }
  } catch {}
};

export const clearStoredAdminSession = () => {
  if (state.currentUser?.isAdmin === true) {
    userStore.setState({ currentUser: null, adminPreview: false });
  }
  try { localStorage.removeItem(ADMIN_STORAGE_KEY); } catch {}
};

export const logoutUser = () => {
  userStore.setState({ currentUser: null, adminPreview: false });
  try { localStorage.removeItem(ADMIN_STORAGE_KEY); } catch {}
};

export const enterAdminPreview = () => {
  if (state.currentUser?.isAdmin === true) userStore.setState({ adminPreview: true });
};

export const exitAdminPreview = () => {
  if (state.currentUser?.isAdmin === true) userStore.setState({ adminPreview: false });
};
