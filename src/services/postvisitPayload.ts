import type { GFStop } from '../types/plan';

type InterestLevel = 'high' | 'medium' | 'low';
type FreezerAnswer = 'yes' | 'no';

interface PostvisitFormValues {
  contactName: string;
  phone: string;
  email: string;
  competitor: string;
  freezer: FreezerAnswer;
  interestLevel: InterestLevel;
  notes: string;
}

interface BuildPostvisitPayloadInput {
  stop: Pick<GFStop, 'customer_name' | '_entityType' | '_leadId'>;
  form: PostvisitFormValues;
}

function mapInterestToPriority(level: InterestLevel): '1' | '2' | '3' {
  if (level === 'high') return '3';
  if (level === 'medium') return '2';
  return '1';
}

function buildDescription(form: PostvisitFormValues): string {
  return [
    `Competidor: ${form.competitor || 'No especificado'}`,
    `Freezer: ${form.freezer === 'yes' ? 'Sí' : 'No'}`,
    `Interés: ${form.interestLevel}`,
    `Notas: ${form.notes || 'Sin notas'}`,
  ].join('\n');
}

export function buildPostvisitPayload({ stop, form }: BuildPostvisitPayloadInput) {
  const basePayload = {
    model: 'crm.lead',
    contact_name: form.contactName || undefined,
    phone: form.phone || undefined,
    email_from: form.email || undefined,
    priority: mapInterestToPriority(form.interestLevel),
    description: buildDescription(form),
  };

  if (stop._entityType === 'lead' && stop._leadId) {
    return {
      ...basePayload,
      method: 'write' as const,
      id: stop._leadId,
    };
  }

  return {
    ...basePayload,
    method: 'create' as const,
    type: 'lead',
    name: stop.customer_name,
    partner_name: stop.customer_name,
  };
}
