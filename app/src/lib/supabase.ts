import 'react-native-url-polyfill/auto';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { createClient } from '@supabase/supabase-js';

// Expo fornisce EXPO_PUBLIC_* tramite process.env durante il bundling.
// Tipizzazione locale per evitare una dipendenza Node.js non necessaria nell'app.
declare const process: { env: Record<string, string | undefined> };

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

function hasValidConfiguration() {
  if (!url?.trim() || !key?.trim()) return false;
  const validKey = /^(sb_publishable_[A-Za-z0-9_-]{20,}|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/.test(key.trim());
  if (!validKey) return false;
  try {
    const parsedUrl = new URL(url);
    return ['https:', 'http:'].includes(parsedUrl.protocol) && !!parsedUrl.hostname;
  } catch {
    return false;
  }
}

export const configured = hasValidConfiguration();

const authStorage = {
  getItem: (storageKey: string) => Platform.OS === 'web'
    ? Promise.resolve(globalThis.localStorage.getItem(storageKey))
    : SecureStore.getItemAsync(storageKey),
  setItem: (storageKey: string, value: string) => {
    if (Platform.OS === 'web') {
      globalThis.localStorage.setItem(storageKey, value);
      return Promise.resolve();
    }
    return SecureStore.setItemAsync(storageKey, value);
  },
  removeItem: (storageKey: string) => {
    if (Platform.OS === 'web') {
      globalThis.localStorage.removeItem(storageKey);
      return Promise.resolve();
    }
    return SecureStore.deleteItemAsync(storageKey);
  },
};

// La chiave publishable e' pubblica PER DESIGN. La sicurezza viene dalle RLS in Supabase.
// Non usare mai la service_role key nell'app.
export const supabase = createClient(
  configured ? url! : 'https://placeholder.supabase.co',
  configured ? key! : 'placeholder-publishable-key',
  {
    auth: {
      storage: authStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }
);
