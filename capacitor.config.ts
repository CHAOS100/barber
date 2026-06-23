import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ostbarber.app',
  appName: 'OST BARBER',
  webDir: 'dist',
  plugins: {
    FirebaseAuthentication: {
      skipNativeAuth: false,
      providers: ['phone'],
    },
    // Push notifications via FCM (Android) and APNS (iOS)
    // Permission is requested lazily after customer login (see src/lib/pushNotifications.js)
    // iOS TODO Phase 2: add Push Notifications capability in Xcode + APNS certificate/key
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
