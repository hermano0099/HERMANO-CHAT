module.exports = ({ config }) => {
  const productionBuild = process.env.EAS_BUILD_PROFILE === 'production';
  const mapsApiKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY;
  const privacyContactEmail = process.env.PRIVACY_CONTACT_EMAIL;

  if (productionBuild && !mapsApiKey) {
    throw new Error('GOOGLE_MAPS_ANDROID_API_KEY deve essere configurata nell’ambiente EAS production.');
  }
  if (productionBuild && !privacyContactEmail) {
    throw new Error('PRIVACY_CONTACT_EMAIL deve essere configurata nell’ambiente EAS production.');
  }
  if (productionBuild && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(privacyContactEmail || '')) {
    throw new Error('PRIVACY_CONTACT_EMAIL deve essere un indirizzo email valido.');
  }

  return {
    ...config,
    android: {
      ...config.android,
      ...(mapsApiKey ? {
        config: {
          ...config.android?.config,
          googleMaps: { ...config.android?.config?.googleMaps, apiKey: mapsApiKey },
        },
      } : {}),
    },
    extra: {
      ...config.extra,
      privacyContactEmail: privacyContactEmail || '',
    },
  };
};
