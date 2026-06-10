import {
  BARBER_PHOTO,
  MOCK_APPOINTMENTS,
  MOCK_GALLERY,
  MOCK_REVIEWS,
  MOCK_SERVICES,
} from '@/lib/mockData';
import { DEFAULT_WORKING_HOURS } from '@/lib/slotEngine';
import { loginUser, logoutUser } from '@/lib/userStore';

const STORAGE_KEY = 'ost_local_database_v1';
const PENDING_REGISTRATION_KEY = 'ost_pending_registration';
const memoryStorage = new Map();
const dataListeners = new Set();

const storage = typeof localStorage === 'undefined'
  ? {
      getItem: (key) => memoryStorage.get(key) ?? null,
      setItem: (key, value) => memoryStorage.set(key, String(value)),
      removeItem: (key) => memoryStorage.delete(key),
    }
  : localStorage;

const clone = (value) => JSON.parse(JSON.stringify(value));

const buildCustomers = () => {
  const customers = new Map();
  MOCK_APPOINTMENTS.forEach((appointment) => {
    const existing = customers.get(appointment.customer_phone) || {
      id: `customer-${appointment.customer_phone}`,
      name: appointment.customer_name,
      phone: appointment.customer_phone,
      total_appointments: 0,
      warning_count: 0,
      is_blocked: false,
    };
    existing.total_appointments += 1;
    customers.set(appointment.customer_phone, existing);
  });
  return [...customers.values()];
};

const createInitialDatabase = () => ({
  Appointment: clone(MOCK_APPOINTMENTS),
  Barber: [
    {
      id: 'b1',
      name: 'OST',
      photo_url: BARBER_PHOTO,
      specialties: ['פייד', 'תספורת', 'זקן'],
      is_active: true,
      sort_order: 0,
    },
  ],
  BlockedDate: [],
  CustomerProfile: buildCustomers(),
  GalleryPhoto: clone(MOCK_GALLERY),
  Notification: [],
  Review: clone(MOCK_REVIEWS),
  Service: clone(MOCK_SERVICES),
  WaitingList: [],
  Warning: [],
  WorkingHours: clone(DEFAULT_WORKING_HOURS),
});

const loadDatabase = () => {
  try {
    const saved = storage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : createInitialDatabase();
  } catch {
    return createInitialDatabase();
  }
};

let database = loadDatabase();

const refreshDatabase = () => {
  try {
    const saved = storage.getItem(STORAGE_KEY);
    if (saved) database = JSON.parse(saved);
  } catch {
    // Keep the latest in-memory database if persisted data cannot be read.
  }
};

const notifyDataListeners = (change) => {
  dataListeners.forEach((listener) => {
    try {
      listener(change);
    } catch {
      // One listener must not prevent the rest of the app from updating.
    }
  });
};

const saveDatabase = (change) => {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(database));
  } catch {
    // The app remains usable in memory when browser storage is unavailable.
  }
  notifyDataListeners(change);
};

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY || !event.newValue) return;
    try {
      database = JSON.parse(event.newValue);
      notifyDataListeners({ action: 'sync' });
    } catch {
      // Ignore malformed storage events and preserve the current database.
    }
  });
}

const compareValues = (left, right) => {
  if (left === right) return 0;
  if (left === undefined || left === null) return 1;
  if (right === undefined || right === null) return -1;
  return String(left).localeCompare(String(right), 'he', { numeric: true });
};

const sortRecords = (records, sort) => {
  if (!sort) return records;
  const descending = sort.startsWith('-');
  const field = descending ? sort.slice(1) : sort;
  return [...records].sort((a, b) => {
    const result = compareValues(a[field], b[field]);
    return descending ? -result : result;
  });
};

const entityApi = (entityName) => ({
  list: async (sort, limit) => {
    refreshDatabase();
    const records = sortRecords(database[entityName] || [], sort);
    return clone(limit ? records.slice(0, limit) : records);
  },
  filter: async (filters = {}, sort, limit) => {
    refreshDatabase();
    const records = (database[entityName] || []).filter((record) =>
      Object.entries(filters).every(([key, value]) => record[key] === value)
    );
    const sorted = sortRecords(records, sort);
    return clone(limit ? sorted.slice(0, limit) : sorted);
  },
  create: async (data) => {
    refreshDatabase();
    const now = new Date().toISOString();
    const record = {
      ...clone(data),
      id: data.id || `${entityName.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      created_date: data.created_date || now,
      updated_date: now,
    };
    database[entityName] = [...(database[entityName] || []), record];
    saveDatabase({ action: 'create', entityName, record: clone(record) });
    return clone(record);
  },
  update: async (id, data) => {
    refreshDatabase();
    const records = database[entityName] || [];
    const index = records.findIndex((record) => record.id === id);
    if (index === -1) throw new Error(`${entityName} record not found`);
    records[index] = { ...records[index], ...clone(data), updated_date: new Date().toISOString() };
    saveDatabase({ action: 'update', entityName, record: clone(records[index]) });
    return clone(records[index]);
  },
  delete: async (id) => {
    refreshDatabase();
    database[entityName] = (database[entityName] || []).filter((record) => record.id !== id);
    saveDatabase({ action: 'delete', entityName, id });
    return { id };
  },
});

export const localDb = /** @type {any} */ (new Proxy({}, {
  get: (_, entityName) => entityApi(entityName),
}));

export const subscribeLocalData = (listener) => {
  dataListeners.add(listener);
  return () => dataListeners.delete(listener);
};

export const localAuth = {
  loginViaEmailPassword: async (email, _password) => {
    const user = { name: email.split('@')[0], email, isAdmin: false };
    loginUser(user);
    return user;
  },
  loginWithProvider: (_provider, next = '/') => {
    loginUser({ name: 'משתמש מקומי', email: 'local@example.com', isAdmin: false });
    window.location.href = next;
  },
  register: async ({ email, password }) => {
    storage.setItem(PENDING_REGISTRATION_KEY, JSON.stringify({ email, password }));
    return { ok: true };
  },
  verifyOtp: async ({ email, otpCode }) => {
    if (String(otpCode).length !== 6) throw new Error('Invalid verification code');
    const pending = JSON.parse(storage.getItem(PENDING_REGISTRATION_KEY) || '{}');
    const user = { name: (pending.email || email).split('@')[0], email: pending.email || email, isAdmin: false };
    loginUser(user);
    storage.removeItem(PENDING_REGISTRATION_KEY);
    return user;
  },
  resendOtp: async (_email) => ({ ok: true }),
  resetPasswordRequest: async (_email) => ({ ok: true }),
  resetPassword: async (_payload) => ({ ok: true }),
  logout: () => logoutUser(),
  redirectToLogin: () => {
    window.location.href = '/login';
  },
};

export const localFiles = /** @type {any} */ ({
  upload: (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ fileUrl: reader.result });
    reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
    reader.readAsDataURL(file);
  }),
});
