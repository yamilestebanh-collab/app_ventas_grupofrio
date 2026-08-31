function normalizeBaseUrl(raw) {
  const trimmed = (raw ?? '').trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  return trimmed.replace(/\/odoo$/i, '');
}

function resolveAppEnvironment(raw) {
  const normalized = raw?.trim().toLowerCase();
  if (normalized === 'development') return 'development';
  if (normalized === 'staging' || normalized === 'preview') return 'staging';
  return 'production';
}

function createEnvironmentConfig(env) {
  const environment = resolveAppEnvironment(
    env.EXPO_PUBLIC_APP_ENV ?? env.EXPO_PUBLIC_BUILD_PROFILE,
  );
  const isProduction = environment === 'production';

  return {
    environment,
    appName: isProduction ? 'KOLD Field' : 'KOLD Field Staging',
    appSlug: 'kold-field',
    appScheme: isProduction ? 'kold-field' : 'kold-field-staging',
    bundleSuffix: isProduction ? '' : '.staging',
    defaultBaseUrl: normalizeBaseUrl(env.EXPO_PUBLIC_KF_DEFAULT_BASE_URL),
    defaultOdooDb: (env.EXPO_PUBLIC_KF_ODOO_DB ?? '').trim(),
  };
}

module.exports = {
  createEnvironmentConfig,
};
