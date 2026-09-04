// Tipos do consultationTemplates.js (JS puro). Templates de anamnese por especialidade
// (1ª consulta / retorno). Disponível p/ web e mobile (corrige a lacuna de paridade).
export interface AnamneseTemplate {
  first: string;
  return: string;
}

export declare const ANAMNESE_DATA: Record<string, AnamneseTemplate>;
export declare function getTemplate(
  specialty: string,
  isFirstConsultation: boolean,
  hasPatientSelected?: boolean,
): string;
export declare function getSpecialties(): string[];
