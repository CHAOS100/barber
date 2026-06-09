import {
  BARBER_PHOTO,
  MOCK_APPOINTMENTS,
  MOCK_GALLERY,
  MOCK_REVIEWS,
  MOCK_SERVICES,
} from '@/lib/mockData';
import { DEFAULT_WORKING_HOURS } from '@/lib/slotEngine';

const STORAGE_KEY = 'ost_demo_database_v1';
const memoryStorage = new Map();

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
      reward_points: 0,
      is_blocked: false,
    };
    existing.total_appointments += 1;
    existing.reward_points += 10;
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

const saveDatabase = () => {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(database));
  } catch {
    // Demo mode remains usable in memory when storage is unavailable.
  }
};

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
    const records = sortRecords(database[entityName] || [], sort);
    return clone(limit ? records.slice(0, limit) : records);
  },
  filter: async (filters = {}, sort, limit) => {
    const records = (database[entityName] || []).filter((record) =>
      Object.entries(filters).every(([key, value]) => record[key] === value)
    );
    const sorted = sortRecords(records, sort);
    return clone(limit ? sorted.slice(0, limit) : sorted);
  },
  create: async (data) => {
    const now = new Date().toISOString();
    const record = {
      ...clone(data),
      id: data.id || `${entityName.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      created_date: data.created_date || now,
      updated_date: now,
    };
    database[entityName] = [...(database[entityName] || []), record];
    saveDatabase();
    return clone(record);
  },
  update: async (id, data) => {
    const records = database[entityName] || [];
    const index = records.findIndex((record) => record.id === id);
    if (index === -1) throw new Error(`${entityName} record not found`);
    records[index] = { ...records[index], ...clone(data), updated_date: new Date().toISOString() };
    saveDatabase();
    return clone(records[index]);
  },
  delete: async (id) => {
    database[entityName] = (database[entityName] || []).filter((record) => record.id !== id);
    saveDatabase();
    return { id };
  },
});

const entities = new Proxy({}, {
  get: (_, entityName) => entityApi(entityName),
});

const getStoredUser = () => {
  const raw = storage.getItem('ost_user');
  return raw ? JSON.parse(raw) : null;
};

const setStoredUser = (user) => storage.setItem('ost_user', JSON.stringify(user));

export const demoClient = {
  entities,
  auth: {
    me: async () => {
      const user = getStoredUser();
      if (!user) throw Object.assign(new Error('Not authenticated'), { status: 401 });
      return user;
    },
    loginViaEmailPassword: async (email) => {
      const user = { name: email.split('@')[0], email, isAdmin: false };
      setStoredUser(user);
      return user;
    },
    loginWithProvider: (_provider, next = '/') => {
      setStoredUser({ name: 'משתמש דמו', email: 'demo@example.com', isAdmin: false });
      window.location.href = next;
    },
    register: async () => ({ ok: true }),
    verifyOtp: async () => ({ access_token: 'demo-token' }),
    resendOtp: async () => ({ ok: true }),
    resetPasswordRequest: async () => ({ ok: true }),
    resetPassword: async () => ({ ok: true }),
    setToken: () => {},
    logout: (redirectUrl) => {
      storage.removeItem('ost_user');
      if (redirectUrl) window.location.href = redirectUrl;
    },
    redirectToLogin: () => {
      window.location.href = '/login';
    },
  },
  integrations: {
    Core: {
      UploadFile: async ({ file }) => ({
        file_url: URL.createObjectURL(file),
      }),
    },
  },
};
