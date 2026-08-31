export type AppEnvironment = 'development' | 'staging' | 'production';

export type EnvironmentConfig = {
  environment: AppEnvironment;
  appName: string;
  appSlug: string;
  appScheme: string;
  bundleSuffix: string;
  defaultBaseUrl: string;
  defaultOdooDb: string;
};

function normalizeBaseUrl(raw: string | undefined): string {
  const trimmed = (raw ?? '').trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  return trimmed.replace(/\/odoo$/i, '');
}

export function resolveAppEnvironment(raw: string | undefined): AppEnvironment {
  const normalized = raw?.trim().toLowerCase();
  if (normalized === 'development') return 'development';
  if (normalized === 'staging' || normalized === 'preview') return 'staging';
  return 'production';
}

export function buildEnvironmentLabel(environment: AppEnvironment): string | null {
  if (environment === 'production') return null;
  return environment === 'staging' ? 'STAGING' : 'DEV';
}

export function getRuntimeAppEnvironment(
  raw: string | undefined,
): AppEnvironment {
  return resolveAppEnvironment(raw);
}

export function buildEnvironmentStorageKey(
  environment: AppEnvironment,
  key: string,
): string {
  return environment === 'production' ? key : `${environment}_${key}`;
}

export function createEnvironmentConfig(
  env: Record<string, string | undefined>,
): EnvironmentConfig {
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
