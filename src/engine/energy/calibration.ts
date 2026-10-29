/** Hipóteses de jogo PROVISÓRIAS; valores mensais em TWh, estoque em TWh. */
export const ENERGY_CALIBRATION = {
  demand: 60,
  otherGeneration: 25,
  hydroCapacity: 40,
  reservoirCapacity: 140,
  initialReservoir: 100,
  normalInflow: 35,
  droughtInflowReduction: 0.65,
  transmissionCapacity: 62,
  transmissionTwhPerMillion: 0.0001,
  generationTwhPerMillion: 0.0001,
  storageTwhPerMillion: 0.001,
  efficiencyMaxReduction: 0.2,
  shortageGapMax: 0.04,
} as const;
