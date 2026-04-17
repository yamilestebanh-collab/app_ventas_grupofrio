export interface AnalyticOption {
  id: number;
  name: string;
  code: string;
  plan_id: number;
}

export interface AnalyticsDefaults {
  analytic_plaza_id: number | null;
  analytic_un_id: number | null;
}

export interface AnalyticsOptionsSnapshot {
  plazaOptions: AnalyticOption[];
  unOptions: AnalyticOption[];
  globalDefaults: AnalyticsDefaults;
  defaultsByPartner: Record<string, AnalyticsDefaults>;
}

export const ANALYTIC_PLAZA_OPTIONS: AnalyticOption[] = [
  { id: 902, name: 'Acapulco', code: 'ACA', plan_id: 2 },
  { id: 898, name: 'Celaya', code: 'CEL', plan_id: 2 },
  { id: 903, name: 'Chilpancingo', code: 'CHIL', plan_id: 2 },
  { id: 816, name: 'Ciudad de México', code: 'CDMX', plan_id: 2 },
  { id: 904, name: 'Cuernavaca', code: 'CUER', plan_id: 2 },
  { id: 818, name: 'Guadalajara', code: 'GDL', plan_id: 2 },
  { id: 899, name: 'Huetamo', code: 'HUE', plan_id: 2 },
  { id: 820, name: 'Iguala', code: 'IGU', plan_id: 2 },
  { id: 822, name: 'Manzanillo', code: 'MAN', plan_id: 2 },
  { id: 853, name: 'Morelia', code: 'MRL', plan_id: 2 },
  { id: 895, name: 'San Luis Potosí', code: 'SLP', plan_id: 2 },
  { id: 905, name: 'Tejupilco', code: 'TEJU', plan_id: 2 },
  { id: 897, name: 'Toluca', code: 'TOL', plan_id: 2 },
  { id: 901, name: 'Zihuatanejo', code: 'ZIH', plan_id: 2 },
  { id: 896, name: 'Centro de Servicios Compartidos', code: 'CSC', plan_id: 2 },
];

export const ANALYTIC_UN_OPTIONS: AnalyticOption[] = [
  { id: 863, name: 'Hub', code: 'HUB', plan_id: 12 },
  { id: 864, name: 'CEDIS', code: 'CDS', plan_id: 12 },
  { id: 865, name: 'Planta', code: 'PLT', plan_id: 12 },
  { id: 866, name: 'Center KoldLean', code: 'CTR', plan_id: 12 },
];

export const DEFAULT_ANALYTIC_UN_ID = 864;

function asPositiveNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

function normalizeOption(option: unknown, expectedPlanId: number): AnalyticOption | null {
  if (!option || typeof option !== 'object') return null;
  const record = option as Record<string, unknown>;
  const id = asPositiveNumber(record.id);
  const name = typeof record.name === 'string' ? record.name.trim() : '';
  const code = typeof record.code === 'string' ? record.code.trim() : '';
  const planId = asPositiveNumber(record.plan_id) ?? expectedPlanId;
  if (!id || !name || !code) return null;
  return { id, name, code, plan_id: planId };
}

function normalizeOptions(options: unknown, expectedPlanId: number, fallback: AnalyticOption[]): AnalyticOption[] {
  if (!Array.isArray(options)) return fallback;
  const normalized = options
    .map((option) => normalizeOption(option, expectedPlanId))
    .filter((option): option is AnalyticOption => option !== null);
  return normalized.length > 0 ? normalized : fallback;
}

function normalizeDefaults(value: unknown, fallback: AnalyticsDefaults): AnalyticsDefaults {
  if (!value || typeof value !== 'object') return fallback;
  const record = value as Record<string, unknown>;
  return {
    analytic_plaza_id: asPositiveNumber(record.analytic_plaza_id),
    analytic_un_id: asPositiveNumber(record.analytic_un_id) ?? fallback.analytic_un_id,
  };
}

export function buildFallbackAnalyticsSnapshot(): AnalyticsOptionsSnapshot {
  return {
    plazaOptions: ANALYTIC_PLAZA_OPTIONS,
    unOptions: ANALYTIC_UN_OPTIONS,
    globalDefaults: {
      analytic_plaza_id: null,
      analytic_un_id: DEFAULT_ANALYTIC_UN_ID,
    },
    defaultsByPartner: {},
  };
}

export function normalizeAnalyticsOptionsPayload(payload: unknown): AnalyticsOptionsSnapshot {
  const fallback = buildFallbackAnalyticsSnapshot();
  if (!payload || typeof payload !== 'object') return fallback;

  const root = payload as Record<string, unknown>;
  const plans = root.plans && typeof root.plans === 'object'
    ? root.plans as Record<string, unknown>
    : {};
  const plazaPlan = plans.plaza && typeof plans.plaza === 'object'
    ? plans.plaza as Record<string, unknown>
    : {};
  const unPlan = (
    plans.unidad_negocio && typeof plans.unidad_negocio === 'object'
      ? plans.unidad_negocio
      : plans.un
  ) as Record<string, unknown> | undefined;

  const plazaOptions = normalizeOptions(plazaPlan?.options, 2, fallback.plazaOptions);
  const unOptions = normalizeOptions(unPlan?.options, 12, fallback.unOptions);
  const globalDefaults = normalizeDefaults(root.defaults, fallback.globalDefaults);

  const defaultsByPartner: Record<string, AnalyticsDefaults> = {};
  const rawDefaultsByPartner = root.defaults_by_partner;
  if (rawDefaultsByPartner && typeof rawDefaultsByPartner === 'object') {
    for (const [partnerId, defaults] of Object.entries(rawDefaultsByPartner as Record<string, unknown>)) {
      defaultsByPartner[partnerId] = normalizeDefaults(defaults, globalDefaults);
    }
  }

  return {
    plazaOptions,
    unOptions,
    globalDefaults,
    defaultsByPartner,
  };
}

export function buildAnalyticDistribution(
  analyticPlazaId: number | null | undefined,
  analyticUnId: number | null | undefined,
): Record<string, number> | null {
  if (
    typeof analyticPlazaId !== 'number' ||
    analyticPlazaId <= 0 ||
    typeof analyticUnId !== 'number' ||
    analyticUnId <= 0
  ) {
    return null;
  }

  return {
    [String(analyticPlazaId)]: 100,
    [String(analyticUnId)]: 100,
  };
}

export function resolveImplicitSaleAnalytics(input: {
  employeeAnalyticPlazaId?: number | null;
  employeeAnalyticUnId?: number | null;
}): {
  analytic_plaza_id: number | null;
  analytic_un_id: number | null;
  analytic_distribution: Record<string, number> | null;
} {
  const analyticPlazaId = asPositiveNumber(input.employeeAnalyticPlazaId);
  const analyticUnId = DEFAULT_ANALYTIC_UN_ID;
  return {
    analytic_plaza_id: analyticPlazaId,
    analytic_un_id: analyticUnId,
    analytic_distribution: buildAnalyticDistribution(analyticPlazaId, analyticUnId),
  };
}
