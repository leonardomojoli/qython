import { getObject, STORAGE_KEYS } from './storage';
import type { Medication, DrugInteraction } from '../types/pharmacy';
import type { Patient, Consultation } from '../types/ambulatory';

interface MedicationSearchParams {
  search?: string;
  country?: string;
  therapeutic_class?: string;
  controlled_type?: string;
  has_gov_program?: boolean;
  item_type?: 'medication' | 'supply';
}

export function searchMedicationsOffline(params: MedicationSearchParams): Medication[] {
  const all = getObject<Medication[]>(STORAGE_KEYS.MEDICATIONS) || [];
  let filtered = all;

  if (params.item_type) {
    filtered = filtered.filter((m) => m.item_type === params.item_type);
  } else {
    // Default: exclude supplies unless explicitly searching for them
    filtered = filtered.filter((m) => !m.item_type || m.item_type === 'medication');
  }

  if (params.country) {
    filtered = filtered.filter((m) => m.country === params.country);
  }

  if (params.therapeutic_class) {
    filtered = filtered.filter((m) => m.therapeutic_class === params.therapeutic_class);
  }

  if (params.controlled_type) {
    filtered = filtered.filter((m) => m.controlled_type === params.controlled_type);
  }

  if (params.has_gov_program) {
    filtered = filtered.filter(
      (m) => m.government_programs && m.government_programs.length > 0,
    );
  }

  if (params.search) {
    const q = params.search.toLowerCase();
    filtered = filtered.filter(
      (m) =>
        m.name?.toLowerCase().includes(q) ||
        m.active_principle?.toLowerCase().includes(q) ||
        m.common_brands?.toLowerCase().includes(q),
    );
  }

  return filtered;
}

export function checkInteractionsOffline(
  activePrinciples: string[],
): DrugInteraction[] {
  const all = getObject<DrugInteraction[]>(STORAGE_KEYS.INTERACTIONS) || [];
  const principlesLower = activePrinciples.map((p) => p.toLowerCase());
  const found: DrugInteraction[] = [];

  for (const interaction of all) {
    const a = interaction.active_principle_a?.toLowerCase();
    const b = interaction.active_principle_b?.toLowerCase();

    // Check if both sides of the interaction are in the selected principles
    const aMatch = principlesLower.some((p) => p === a);
    const bMatch = principlesLower.some((p) => p === b);

    if (aMatch && bMatch) {
      found.push(interaction);
    }
  }

  return found;
}

export function searchPatientsOffline(query?: string): Patient[] {
  const all = getObject<Patient[]>(STORAGE_KEYS.PATIENTS) || [];
  if (!query?.trim()) return all;

  const q = query.toLowerCase();
  return all.filter(
    (p) =>
      p.full_name?.toLowerCase().includes(q) ||
      p.document_id?.toLowerCase().includes(q) ||
      p.email?.toLowerCase().includes(q) ||
      p.phone?.toLowerCase().includes(q),
  );
}

export function getConsultationsOffline(): Consultation[] {
  return getObject<Consultation[]>(STORAGE_KEYS.CONSULTATIONS) || [];
}
