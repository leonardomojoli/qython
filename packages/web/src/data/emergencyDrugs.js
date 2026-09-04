// Emergency drugs data — static embedded for offline support

export const DRUG_CATEGORIES = [
  { key: 'cardiac_arrest', labelKey: 'plantao.categories.cardiacArrest', emoji: '❤️' },
  { key: 'bradycardia', labelKey: 'plantao.categories.bradycardia', emoji: '🐢' },
  { key: 'hypotension', labelKey: 'plantao.categories.hypotension', emoji: '📉' },
  { key: 'anaphylaxis', labelKey: 'plantao.categories.anaphylaxis', emoji: '🫁' },
  { key: 'arrhythmia', labelKey: 'plantao.categories.arrhythmia', emoji: '⚡' },
  { key: 'electrolytes', labelKey: 'plantao.categories.electrolytes', emoji: '🧪' },
  { key: 'reversal', labelKey: 'plantao.categories.reversal', emoji: '↩️' },
  { key: 'sedation', labelKey: 'plantao.categories.sedation', emoji: '💉' },
];

export const EMERGENCY_DRUGS = [
  // Cardiac Arrest
  { id: 'epinephrine_iv', nameKey: 'plantao.drugs.epinephrineIV', category: 'cardiac_arrest', emoji: '❤️', dosePerKg: 0.01, fixedDose: 1, unit: 'mg', route: 'IV/IO', concentration: '1:10.000 (0,1 mg/mL)', maxDose: 1, repeatInfoKey: 'plantao.drugs.epinephrineIVRepeat', notesKey: 'plantao.drugs.epinephrineIVNotes', pediatric: true },
  { id: 'amiodarone', nameKey: 'plantao.drugs.amiodarone', category: 'cardiac_arrest', emoji: '❤️', dosePerKg: 5, fixedDose: 300, unit: 'mg', route: 'IV/IO', concentration: '50 mg/mL', maxDose: 300, repeatInfoKey: 'plantao.drugs.amiodaroneRepeat', notesKey: 'plantao.drugs.amiodaroneNotes', pediatric: true },
  { id: 'lidocaine', nameKey: 'plantao.drugs.lidocaine', category: 'cardiac_arrest', emoji: '❤️', dosePerKg: 1, fixedDose: null, unit: 'mg', route: 'IV/IO', concentration: '20 mg/mL', maxDose: 100, repeatInfoKey: 'plantao.drugs.lidocaineRepeat', notesKey: 'plantao.drugs.lidocaineNotes', pediatric: true },

  // Bradycardia
  { id: 'atropine', nameKey: 'plantao.drugs.atropine', category: 'bradycardia', emoji: '🐢', dosePerKg: 0.02, fixedDose: 0.5, unit: 'mg', route: 'IV', concentration: '0,25 mg/mL', maxDose: 3, repeatInfoKey: 'plantao.drugs.atropineRepeat', notesKey: 'plantao.drugs.atropineNotes', pediatric: true },

  // Hypotension
  { id: 'ephedrine', nameKey: 'plantao.drugs.ephedrine', category: 'hypotension', emoji: '📉', dosePerKg: null, fixedDose: 10, unit: 'mg', route: 'IV', concentration: '50 mg/mL', maxDose: 50, repeatInfoKey: 'plantao.drugs.ephedrineRepeat', notesKey: 'plantao.drugs.ephedrineNotes', pediatric: false },
  { id: 'norepinephrine', nameKey: 'plantao.drugs.norepinephrine', category: 'hypotension', emoji: '📉', dosePerKg: null, fixedDose: null, unit: 'mcg/min', route: 'IV infusão', concentration: '4 mg/4mL', maxDose: null, repeatInfoKey: null, notesKey: 'plantao.drugs.norepinephrineNotes', pediatric: false },

  // Anaphylaxis
  { id: 'epinephrine_im', nameKey: 'plantao.drugs.epinephrineIM', category: 'anaphylaxis', emoji: '🫁', dosePerKg: 0.01, fixedDose: 0.5, unit: 'mg', route: 'IM', concentration: '1:1.000 (1 mg/mL)', maxDose: 0.5, repeatInfoKey: 'plantao.drugs.epinephrineIMRepeat', notesKey: 'plantao.drugs.epinephrineIMNotes', pediatric: true },
  { id: 'hydrocortisone', nameKey: 'plantao.drugs.hydrocortisone', category: 'anaphylaxis', emoji: '🫁', dosePerKg: 4, fixedDose: 200, unit: 'mg', route: 'IV', concentration: '100 mg/frasco', maxDose: 500, repeatInfoKey: null, notesKey: 'plantao.drugs.hydrocortisoneNotes', pediatric: true },
  { id: 'diphenhydramine', nameKey: 'plantao.drugs.diphenhydramine', category: 'anaphylaxis', emoji: '🫁', dosePerKg: 1, fixedDose: 50, unit: 'mg', route: 'IV/IM', concentration: '50 mg/mL', maxDose: 50, repeatInfoKey: null, notesKey: 'plantao.drugs.diphenhydramineNotes', pediatric: true },

  // Arrhythmia
  { id: 'adenosine', nameKey: 'plantao.drugs.adenosine', category: 'arrhythmia', emoji: '⚡', dosePerKg: 0.1, fixedDose: 6, unit: 'mg', route: 'IV rápido', concentration: '3 mg/mL', maxDose: 12, repeatInfoKey: 'plantao.drugs.adenosineRepeat', notesKey: 'plantao.drugs.adenosineNotes', pediatric: true },

  // Electrolytes
  { id: 'calcium_gluconate', nameKey: 'plantao.drugs.calciumGluconate', category: 'electrolytes', emoji: '🧪', dosePerKg: 0.5, fixedDose: null, unit: 'mL', route: 'IV lento', concentration: '10% (100 mg/mL)', maxDose: 30, repeatInfoKey: null, notesKey: 'plantao.drugs.calciumGluconateNotes', pediatric: true },
  { id: 'sodium_bicarbonate', nameKey: 'plantao.drugs.sodiumBicarbonate', category: 'electrolytes', emoji: '🧪', dosePerKg: 1, fixedDose: null, unit: 'mEq', route: 'IV', concentration: '8,4% (1 mEq/mL)', maxDose: null, repeatInfoKey: 'plantao.drugs.sodiumBicarbonateRepeat', notesKey: 'plantao.drugs.sodiumBicarbonateNotes', pediatric: true },
  { id: 'magnesium_sulfate', nameKey: 'plantao.drugs.magnesiumSulfate', category: 'electrolytes', emoji: '🧪', dosePerKg: 25, fixedDose: 2000, unit: 'mg', route: 'IV', concentration: '50% (500 mg/mL)', maxDose: 2000, repeatInfoKey: null, notesKey: 'plantao.drugs.magnesiumSulfateNotes', pediatric: true },

  // Reversal
  { id: 'naloxone', nameKey: 'plantao.drugs.naloxone', category: 'reversal', emoji: '↩️', dosePerKg: 0.01, fixedDose: 0.4, unit: 'mg', route: 'IV/IM/IN', concentration: '0,4 mg/mL', maxDose: 2, repeatInfoKey: 'plantao.drugs.naloxoneRepeat', notesKey: 'plantao.drugs.naloxoneNotes', pediatric: true },
  { id: 'flumazenil', nameKey: 'plantao.drugs.flumazenil', category: 'reversal', emoji: '↩️', dosePerKg: 0.01, fixedDose: 0.2, unit: 'mg', route: 'IV', concentration: '0,1 mg/mL', maxDose: 1, repeatInfoKey: 'plantao.drugs.flumazenilRepeat', notesKey: 'plantao.drugs.flumazenilNotes', pediatric: true },
  { id: 'sugammadex', nameKey: 'plantao.drugs.sugammadex', category: 'reversal', emoji: '↩️', dosePerKg: 16, fixedDose: null, unit: 'mg', route: 'IV', concentration: '100 mg/mL', maxDose: null, repeatInfoKey: null, notesKey: 'plantao.drugs.sugammadexNotes', pediatric: true },

  // Sedation / RSI
  { id: 'ketamine', nameKey: 'plantao.drugs.ketamine', category: 'sedation', emoji: '💉', dosePerKg: 2, fixedDose: null, unit: 'mg', route: 'IV', concentration: '50 mg/mL', maxDose: null, repeatInfoKey: null, notesKey: 'plantao.drugs.ketamineNotes', pediatric: true },
  { id: 'succinylcholine', nameKey: 'plantao.drugs.succinylcholine', category: 'sedation', emoji: '💉', dosePerKg: 1.5, fixedDose: null, unit: 'mg', route: 'IV', concentration: '100 mg/frasco', maxDose: null, repeatInfoKey: null, notesKey: 'plantao.drugs.succinylcholineNotes', pediatric: true },
  { id: 'rocuronium_rsi', nameKey: 'plantao.drugs.rocuroniumRSI', category: 'sedation', emoji: '💉', dosePerKg: 1.2, fixedDose: null, unit: 'mg', route: 'IV', concentration: '10 mg/mL', maxDose: null, repeatInfoKey: null, notesKey: 'plantao.drugs.rocuroniumRSINotes', pediatric: true },
];

export function calculateEmergencyDose(drug, weightKg, isPediatric) {
  let dose;

  if (drug.dosePerKg && weightKg > 0) {
    dose = drug.dosePerKg * weightKg;
  } else if (drug.fixedDose) {
    dose = drug.fixedDose;
  } else {
    return { dose: 0, unit: drug.unit, route: drug.route, isMaxed: false, volume: null };
  }

  if (isPediatric && drug.dosePerKg && weightKg > 0) {
    dose = drug.dosePerKg * weightKg;
  }

  const isMaxed = drug.maxDose !== null && dose > drug.maxDose;
  if (isMaxed) {
    dose = drug.maxDose;
  }

  let volume = null;
  const concMatch = drug.concentration.match(/([\d.,]+)\s*(mg|mcg|mEq)\/(?:m[Ll]|frasco)/);
  if (concMatch) {
    const concValue = parseFloat(concMatch[1].replace(',', '.'));
    if (concValue > 0 && drug.unit === concMatch[2]) {
      volume = dose / concValue;
    }
  }

  dose = Math.round(dose * 100) / 100;
  if (volume !== null) {
    volume = Math.round(volume * 10) / 10;
  }

  return { dose, unit: drug.unit, route: drug.route, isMaxed, volume };
}
