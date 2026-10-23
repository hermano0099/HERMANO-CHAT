module.exports = ({ config }) => {
  const productionBuild = process.env.EAS_BUILD_PROFILE === 'production';
  const buildPlatform = process.env.EAS_BUILD_PLATFORM;
  const mapsApiKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY;
  const privacyContactEmail = process.env.PRIVACY_CONTACT_EMAIL;
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (productionBuild && buildPlatform !== 'ios' && !mapsApiKey) {
    throw new Error('GOOGLE_MAPS_ANDROID_API_KEY deve essere configurata nell’ambiente EAS production.');
  }
  if (productionBuild && !privacyContactEmail) {
    throw new Error('PRIVACY_CONTACT_EMAIL deve essere configurata nell’ambiente EAS production.');
  }
  if (productionBuild && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(privacyContactEmail || '')) {
    throw new Error('PRIVACY_CONTACT_EMAIL deve essere un indirizzo email valido.');
  }
  if (productionBuild) {
    let validSupabaseUrl = false;
    try {
      const parsedUrl = new URL(supabaseUrl || '');
      validSupabaseUrl = parsedUrl.protocol === 'https:' && !!parsedUrl.hostname;
    } catch (error) {
      if (!(error instanceof TypeError)) throw error;
    }
    if (!validSupabaseUrl) {
      throw new Error('EXPO_PUBLIC_SUPABASE_URL deve essere un URL HTTPS valido nell’ambiente EAS production.');
    }
    const validSupabaseKey = /^(sb_publishable_[A-Za-z0-9_-]{20,}|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/.test(supabaseKey?.trim() || '');
    if (!validSupabaseKey) {
      throw new Error('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY deve essere una publishable key (o anon key legacy) valida nell’ambiente EAS production.');
    }
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
