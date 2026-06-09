import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';
import { demoClient } from '@/api/demoClient';

const { appId, token, functionsVersion, appBaseUrl } = appParams;

export const base44 = /** @type {any} */ (appId
  ? createClient({
      appId,
      token,
      functionsVersion,
      serverUrl: '',
      requiresAuth: false,
      appBaseUrl,
    })
  : demoClient);
