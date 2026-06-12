import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import path from 'path'

const FIREBASE_ENVIRONMENT_NAMES = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
]
const EXPECTED_FIREBASE_API_KEY = 'AIzaSyDYKVodoIVuB2KDLLYV5q3ihkDudOjqMm4'

const maskApiKey = (apiKey) =>
  apiKey?.length > 8 ? `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}` : 'missing-or-invalid'

export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, process.cwd(), '')
  const missing = FIREBASE_ENVIRONMENT_NAMES.filter(name => !environment[name]?.trim())
  const invalid = FIREBASE_ENVIRONMENT_NAMES.filter(name => environment[name]?.trim() === name)

  if (environment.VITE_FIREBASE_API_KEY && !/^AIza[0-9A-Za-z_-]{35}$/.test(environment.VITE_FIREBASE_API_KEY.trim())) {
    invalid.push('VITE_FIREBASE_API_KEY')
  }

  if (environment.VITE_FIREBASE_API_KEY?.trim() !== EXPECTED_FIREBASE_API_KEY) {
    invalid.push('VITE_FIREBASE_API_KEY')
  }

  console.info('[Vite] Firebase build configuration', {
    projectId: environment.VITE_FIREBASE_PROJECT_ID || 'missing',
    authDomain: environment.VITE_FIREBASE_AUTH_DOMAIN || 'missing',
    appId: environment.VITE_FIREBASE_APP_ID || 'missing',
    apiKeyMasked: maskApiKey(environment.VITE_FIREBASE_API_KEY?.trim()),
    apiKeyMatchesExpected: environment.VITE_FIREBASE_API_KEY?.trim() === EXPECTED_FIREBASE_API_KEY,
  })

  if (missing.length > 0 || invalid.length > 0) {
    throw new Error(
      `Invalid Firebase build environment. Missing: ${missing.join(', ') || 'none'}. Invalid: ${[...new Set(invalid)].join(', ') || 'none'}.`,
    )
  }

  return {
    logLevel: 'error',
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  }
})
