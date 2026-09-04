import { EMERGENCY_DRUGS } from './emergencyDrugs';

export const EMERGENCY_INTERACTIONS = [
  {
    drugs: ['amiodarone', 'lidocaine'],
    severity: 'severe',
    descriptionKey: 'plantao.interactions.amiodaroneLidocaine',
  },
  {
    drugs: ['magnesium_sulfate', 'succinylcholine'],
    severity: 'moderate',
    descriptionKey: 'plantao.interactions.magnesiumSuccinylcholine',
  },
  {
    drugs: ['epinephrine_iv', 'amiodarone'],
    severity: 'moderate',
    descriptionKey: 'plantao.interactions.epinephrineAmiodarone',
  },
  {
    drugs: ['adenosine', 'atropine'],
    severity: 'moderate',
    descriptionKey: 'plantao.interactions.adenosineAtropine',
  },
  {
    drugs: ['ketamine', 'epinephrine_iv'],
    severity: 'mild',
    descriptionKey: 'plantao.interactions.ketamineEpinephrine',
  },
  {
    drugs: ['calcium_gluconate', 'sodium_bicarbonate'],
    severity: 'severe',
    descriptionKey: 'plantao.interactions.calciumBicarbonate',
  },
  {
    drugs: ['succinylcholine', 'rocuronium_rsi'],
    severity: 'moderate',
    descriptionKey: 'plantao.interactions.succinylcholineRocuronium',
  },
];

export function getInteractionsForDrug(drugId) {
  return EMERGENCY_INTERACTIONS
    .filter(i => i.drugs.includes(drugId))
    .map(i => ({
      ...i,
      otherDrugId: i.drugs.find(d => d !== drugId),
    }));
}
