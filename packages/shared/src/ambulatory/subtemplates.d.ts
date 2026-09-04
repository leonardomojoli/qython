// Tipos do subtemplates.js (JS puro). Mesmos shapes do mobile (types/ambulatory.ts).
export interface Subtemplate {
  id: string;
  category: string;
  labelKey: string;
  specialties: string[];
  content: string;
}

export interface SubtemplateCategory {
  labelKey: string;
}

export declare const SUBTEMPLATE_CATEGORIES: Record<string, SubtemplateCategory>;
export declare const SUBTEMPLATES: Subtemplate[];
export declare function getSubtemplatesForSpecialty(
  specialty: string,
): Record<string, { labelKey: string; items: Subtemplate[] }>;
