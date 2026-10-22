const assert = require('node:assert/strict');
const { afterEach, test } = require('node:test');
const configure = require('../app.config.js');

const originalEnvironment = {
  EAS_BUILD_PROFILE: process.env.EAS_BUILD_PROFILE,
  GOOGLE_MAPS_ANDROID_API_KEY: process.env.GOOGLE_MAPS_ANDROID_API_KEY,
  PRIVACY_CONTACT_EMAIL: process.env.PRIVACY_CONTACT_EMAIL,
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
  process.env.GOOGLE_MAPS_ANDROID_API_KEY = 'restricted-test-key';
  process.env.PRIVACY_CONTACT_EMAIL = 'privacy@example.test';
  const config = configure({
    config: { android: { config: { existing: true } }, extra: { existing: true } },
  });
  assert.equal(config.android.config.googleMaps.apiKey, 'restricted-test-key');
  assert.equal(config.android.config.existing, true);
  assert.equal(config.extra.privacyContactEmail, 'privacy@example.test');
  assert.equal(config.extra.existing, true);
});
