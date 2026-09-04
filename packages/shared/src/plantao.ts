/**
 * @qython/shared - Plantão (Emergency On-Call) shared types
 */

export type EmergencyDrugCategory =
  | 'cardiac_arrest'
  | 'bradycardia'
  | 'hypotension'
  | 'anaphylaxis'
  | 'arrhythmia'
  | 'electrolytes'
  | 'reversal'
  | 'sedation';

export interface EmergencyDrugBase {
  id: string;
  nameKey: string;
  category: EmergencyDrugCategory;
  emoji: string;
  /** Dose per kg (mg/kg or mcg/kg depending on unit) — null if fixed dose only */
  dosePerKg: number | null;
  /** Fixed dose regardless of weight — null if weight-based only */
  fixedDose: number | null;
  unit: string;
  route: string;
  /** Concentration for dilution reference (e.g. "1mg/mL") */
  concentration: string;
  /** Maximum single dose */
  maxDose: number | null;
  /** i18n key for repeat/interval info */
  repeatInfoKey: string | null;
  /** i18n key for clinical notes */
  notesKey: string | null;
  /** Whether pediatric dosing differs */
  pediatric: boolean;
}

export interface ProtocolSubstep {
  textKey: string;
}

export interface ProtocolStepBase {
  order: number;
  actionKey: string;
  isCritical: boolean;
  /** Timer in seconds for timed steps (e.g. CPR cycle) — null if no timer */
  timerSeconds: number | null;
  substeps: ProtocolSubstep[];
}

export interface EmergencyProtocolBase {
  id: string;
  nameKey: string;
  emoji: string;
  sourceKey: string;
  descriptionKey: string;
  steps: ProtocolStepBase[];
  /** Drug IDs referenced by this protocol */
  keyDrugs: string[];
}

export interface DrugCategoryInfo {
  key: EmergencyDrugCategory;
  labelKey: string;
  emoji: string;
}
