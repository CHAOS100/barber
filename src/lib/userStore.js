// Simple store for current user session (OTP-based login)
let listeners = [];
let state = {
  currentUser: null,
};

try {
  const stored = localStorage.getItem('ost_user');
  if (stored) state.currentUser = JSON.parse(stored);
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
  userStore.setState({ currentUser: user });
  try { localStorage.setItem('ost_user', JSON.stringify(user)); } catch {}
};

export const logoutUser = () => {
  userStore.setState({ currentUser: null });
  try { localStorage.removeItem('ost_user'); } catch {}
};