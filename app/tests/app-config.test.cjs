const assert = require('node:assert/strict');
const { afterEach, test } = require('node:test');
const configure = require('../app.config.js');

const originalEnvironment = {
  EAS_BUILD_PROFILE: process.env.EAS_BUILD_PROFILE,
  EAS_BUILD_PLATFORM: process.env.EAS_BUILD_PLATFORM,
  GOOGLE_MAPS_ANDROID_API_KEY: process.env.GOOGLE_MAPS_ANDROID_API_KEY,
  PRIVACY_CONTACT_EMAIL: process.env.PRIVACY_CONTACT_EMAIL,
  EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
};

afterEach(() => {
  for (const [key, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test('production config refuses to build without release-critical settings', () => {
  process.env.EAS_BUILD_PROFILE = 'production';
  delete process.env.GOOGLE_MAPS_ANDROID_API_KEY;
  delete process.env.PRIVACY_CONTACT_EMAIL;
  assert.throws(() => configure({ config: { android: {}, extra: {} } }), /GOOGLE_MAPS_ANDROID_API_KEY/);
});

test('production config requires a valid privacy contact', () => {
  process.env.EAS_BUILD_PROFILE = 'production';
  process.env.GOOGLE_MAPS_ANDROID_API_KEY = 'restricted-test-key';
  process.env.PRIVACY_CONTACT_EMAIL = 'not-an-email';
  assert.throws(() => configure({ config: { android: {}, extra: {} } }), /indirizzo email valido/);
});

test('production config includes the restricted maps key and privacy contact', () => {
  process.env.EAS_BUILD_PROFILE = 'production';
  process.env.EAS_BUILD_PLATFORM = 'android';
  process.env.GOOGLE_MAPS_ANDROID_API_KEY = 'restricted-test-key';
  process.env.PRIVACY_CONTACT_EMAIL = 'privacy@example.test';
  process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://project.supabase.co';
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_12345678901234567890';
  const config = configure({
    config: { android: { config: { existing: true } }, extra: { existing: true } },
  });
  assert.equal(config.android.config.googleMaps.apiKey, 'restricted-test-key');
  assert.equal(config.android.config.existing, true);
  assert.equal(config.extra.privacyContactEmail, 'privacy@example.test');
  assert.equal(config.extra.existing, true);
});

test('production config requires Supabase credentials', () => {
  process.env.EAS_BUILD_PROFILE = 'production';
  process.env.EAS_BUILD_PLATFORM = 'android';
  process.env.GOOGLE_MAPS_ANDROID_API_KEY = 'restricted-test-key';
  process.env.PRIVACY_CONTACT_EMAIL = 'privacy@example.test';
  delete process.env.EXPO_PUBLIC_SUPABASE_URL;
  delete process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  assert.throws(
    () => configure({ config: { android: {}, extra: {} } }),
    /EXPO_PUBLIC_SUPABASE_URL/,
  );
});

test('production config rejects non-HTTPS Supabase URLs', () => {
  process.env.EAS_BUILD_PROFILE = 'production';
  process.env.EAS_BUILD_PLATFORM = 'android';
  process.env.GOOGLE_MAPS_ANDROID_API_KEY = 'restricted-test-key';
  process.env.PRIVACY_CONTACT_EMAIL = 'privacy@example.test';
  process.env.EXPO_PUBLIC_SUPABASE_URL = 'http://project.supabase.co';
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test-key';
  assert.throws(
    () => configure({ config: { android: {}, extra: {} } }),
    /URL HTTPS valido/,
  );
});

test('production config rejects non-publishable Supabase keys', () => {
  process.env.EAS_BUILD_PROFILE = 'production';
  process.env.EAS_BUILD_PLATFORM = 'android';
  process.env.GOOGLE_MAPS_ANDROID_API_KEY = 'restricted-test-key';
  process.env.PRIVACY_CONTACT_EMAIL = 'privacy@example.test';
  process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://project.supabase.co';
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_secret_not-for-mobile';
  assert.throws(
    () => configure({ config: { android: {}, extra: {} } }),
    /publishable key/,
  );
});

test('iOS production config does not require the Android Maps API key', () => {
  process.env.EAS_BUILD_PROFILE = 'production';
  process.env.EAS_BUILD_PLATFORM = 'ios';
  delete process.env.GOOGLE_MAPS_ANDROID_API_KEY;
  process.env.PRIVACY_CONTACT_EMAIL = 'privacy@example.test';
  process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://project.supabase.co';
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_12345678901234567890';
  const config = configure({ config: { android: {}, extra: {} } });
  assert.equal(config.extra.privacyContactEmail, 'privacy@example.test');
});
