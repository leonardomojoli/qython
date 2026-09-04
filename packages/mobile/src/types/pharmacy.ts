// Types and constants for the Pharmacy module

export interface GovernmentProgram {
  code: string;
  name: string;
  all_items_free: boolean;
}

export interface Medication {
  id: number;
  name: string;
  active_principle: string;
  presentation: string;
  therapeutic_class: string;
  controlled_type: string | null;
  administration_route: string | null;
  common_indications: string | null;
  usual_posology: string | null;
  max_daily_dose: string | null;
  pregnancy_category: string | null;
  renal_adjustment: boolean;
  hepatic_adjustment: boolean;
  requires_prescription: boolean;
  common_brands: string | null;
  country?: string;
  farmacia_popular: boolean;
  government_programs: GovernmentProgram[];
  item_type?: 'medication' | 'supply';
}

export interface DrugInteraction {
  active_principle_a: string;
  active_principle_b: string;
  severity: 'contraindicated' | 'severe' | 'moderate' | 'mild';
  description: string;
  mechanism: string | null;
  clinical_management: string | null;
  evidence_level: string | null;
  source: string | null;
}

export interface InteractionCheckResult {
  interactions: DrugInteraction[];
}

export interface PrescriptionItem {
  medication: string;
  dosage: string;
  quantity: string;
  instructions: string;
}

export interface PharmacySend {
  id: number;
  pharmacy_name: string;
  pharmacy_address: string | null;
  status: 'sent' | 'viewed' | 'fulfilled' | 'cancelled';
  sent_at: string;
}

export interface Prescription {
  id: number;
  prescription_type: string;
  items: PrescriptionItem[];
  created_at: string;
  patient_name?: string;
}

export interface Country {
  code: string;
  flag: string;
  labelKey: string;
}

export const COUNTRIES: Country[] = [
  // Latin America
  { code: 'br', flag: '\u{1F1E7}\u{1F1F7}', labelKey: 'brazil' },
  { code: 'uy', flag: '\u{1F1FA}\u{1F1FE}', labelKey: 'uruguay' },
  { code: 'ar', flag: '\u{1F1E6}\u{1F1F7}', labelKey: 'argentina' },
  { code: 'cl', flag: '\u{1F1E8}\u{1F1F1}', labelKey: 'chile' },
  { code: 'py', flag: '\u{1F1F5}\u{1F1FE}', labelKey: 'paraguay' },
  { code: 'bo', flag: '\u{1F1E7}\u{1F1F4}', labelKey: 'bolivia' },
  { code: 'co', flag: '\u{1F1E8}\u{1F1F4}', labelKey: 'colombia' },
  { code: 'mx', flag: '\u{1F1F2}\u{1F1FD}', labelKey: 'mexico' },
  { code: 'pe', flag: '\u{1F1F5}\u{1F1EA}', labelKey: 'peru' },
  { code: 'ec', flag: '\u{1F1EA}\u{1F1E8}', labelKey: 'ecuador' },
  // Europe
  { code: 'pt', flag: '\u{1F1F5}\u{1F1F9}', labelKey: 'portugal' },
  { code: 'es', flag: '\u{1F1EA}\u{1F1F8}', labelKey: 'spain' },
  { code: 'it', flag: '\u{1F1EE}\u{1F1F9}', labelKey: 'italy' },
  { code: 'de', flag: '\u{1F1E9}\u{1F1EA}', labelKey: 'germany' },
  { code: 'fr', flag: '\u{1F1EB}\u{1F1F7}', labelKey: 'france' },
  { code: 'ch', flag: '\u{1F1E8}\u{1F1ED}', labelKey: 'switzerland' },
  { code: 'gb', flag: '\u{1F1EC}\u{1F1E7}', labelKey: 'unitedKingdom' },
  // North America & Oceania
  { code: 'us', flag: '\u{1F1FA}\u{1F1F8}', labelKey: 'unitedStates' },
  { code: 'ca', flag: '\u{1F1E8}\u{1F1E6}', labelKey: 'canada' },
  { code: 'au', flag: '\u{1F1E6}\u{1F1FA}', labelKey: 'australia' },
];

export const SEVERITY_CONFIG: Record<string, { color: string; label: string }> = {
  contraindicated: { color: '#e74c3c', label: 'interactionContraindicated' },
  severe: { color: '#e67e22', label: 'interactionSevere' },
  moderate: { color: '#f1c40f', label: 'interactionModerate' },
  mild: { color: '#3498db', label: 'interactionMild' },
};

export const THERAPEUTIC_CLASSES = [
  'Anti-hipertensivo',
  'Antidiabético',
  'Analgésico',
  'Anti-inflamatório',
  'Antibiótico',
  'Antidepressivo',
  'Ansiolítico',
  'Antipsicótico',
  'Anticonvulsivante',
  'Gastroprotetor',
  'Hipolipemiante',
  'Broncodilatador',
  'Corticosteroide',
  'Anticoagulante',
  'Hormônio',
  'Anti-histamínico',
  'Contraceptivo',
];

export const CONTROLLED_TYPES = ['c1', 'c2', 'b1', 'b2'];

export const SUPPLY_CATEGORIES = [
  { value: 'Insumo para Diabetes', labelKey: 'supplyCategories_diabetes' },
  { value: 'Insumo para Ostomia', labelKey: 'supplyCategories_ostomy' },
  { value: 'Material de Curativo', labelKey: 'supplyCategories_wound' },
  { value: 'OPM — Mobilidade', labelKey: 'supplyCategories_mobility' },
  { value: 'OPM — Órteses e Próteses', labelKey: 'supplyCategories_prosthetics' },
  { value: 'Sondas e Cateteres', labelKey: 'supplyCategories_catheters' },
  { value: 'Nutrição', labelKey: 'supplyCategories_nutrition' },
  { value: 'Higiene', labelKey: 'supplyCategories_hygiene' },
  { value: 'Monitoramento', labelKey: 'supplyCategories_monitoring' },
  { value: 'Cuidados Respiratórios', labelKey: 'supplyCategories_respiratory' },
  { value: 'Curativos Avançados', labelKey: 'supplyCategories_advancedWound' },
  { value: 'Ortopedia', labelKey: 'supplyCategories_orthopedics' },
  { value: 'Nutrição Enteral', labelKey: 'supplyCategories_enteralNutrition' },
  { value: 'Higiene e Conforto', labelKey: 'supplyCategories_comfort' },
  { value: 'Administração', labelKey: 'supplyCategories_administration' },
  { value: 'Outros Dispositivos', labelKey: 'supplyCategories_other' },
];

export const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  sent: { label: 'prescriptionSent', color: '#3498db' },
  viewed: { label: 'prescriptionViewed', color: '#f1c40f' },
  fulfilled: { label: 'prescriptionFulfilled', color: '#27ae60' },
  cancelled: { label: 'cancelled', color: '#e74c3c' },
};

export const PAGE_SIZE = 50;
