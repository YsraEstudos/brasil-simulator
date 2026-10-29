import { ENERGY_CALIBRATION as p } from './calibration';
import type { MonthStep } from '../types';
import { sumActive } from '../impulses';
import { researchEnergyEffects } from '../research/effects';

/** Estoque em TWh; fluxos do último mês em TWh. */
export interface Energy {
  reservoir: number;
  reservoirCapacity: number;
  inflow: number;
  hydro: number;
  spill: number;
  otherGeneration: number;
  delivered: number;
  curtailment: number;
  demand: number;
  shortage: number;
  generationCapacity: number;
  transmissionCapacity: number;
  efficiency: number;
}
export function initialEnergy(): Energy {
  return {
    reservoir: p.initialReservoir,
    reservoirCapacity: p.reservoirCapacity,
    inflow: 0,
    hydro: 0,
    spill: 0,
    otherGeneration: 0,
    delivered: 0,
    curtailment: 0,
    // Ainda não há fluxo observado: a demanda é calculada ao fechar o primeiro mês.
    demand: 0,
    shortage: 0,
    generationCapacity: p.hydroCapacity + p.otherGeneration,
    transmissionCapacity: p.transmissionCapacity,
    efficiency: 0,
  };
}
export function advanceEnergy(
  state: Energy,
  input: {
    dryness: number;
    transmissionAssetMillions: number;
    generationAssetMillions?: number;
    storageAssetMillions?: number;
    efficiency: number;
    demand?: number;
    /** Tecnologias adotadas (R7), já em TWh: somam às capacidades e à demanda. */
    technology?: { generation: number; transmission: number; storage: number; demand: number };
  },
): Energy {
  const tech = input.technology ?? { generation: 0, transmission: 0, storage: 0, demand: 0 };
  const dryness = Math.max(0, Math.min(1, input.dryness));
  const efficiency = Math.max(0, Math.min(1, input.efficiency));
  const inflow = p.normalInflow * (1 - p.droughtInflowReduction * dryness);
  const available = state.reservoir + inflow;
  const reservoirCapacity =
    p.reservoirCapacity +
    Math.max(0, input.storageAssetMillions ?? 0) * p.storageTwhPerMillion +
    Math.max(0, tech.storage);
  const demand =
    (Math.max(0, input.demand ?? p.demand) + Math.max(0, tech.demand)) * (1 - p.efficiencyMaxReduction * efficiency);
  const transmission =
    p.transmissionCapacity +
    Math.max(0, input.transmissionAssetMillions) * p.transmissionTwhPerMillion +
    Math.max(0, tech.transmission);
  const otherCapacity =
    p.otherGeneration +
    Math.max(0, input.generationAssetMillions ?? 0) * p.generationTwhPerMillion +
    Math.max(0, tech.generation);
  const otherGeneration = Math.min(Math.min(demand, transmission), otherCapacity);
  const hydro = Math.min(p.hydroCapacity, available, Math.max(0, Math.min(demand, transmission) - otherGeneration));
  const spill = Math.max(0, available - hydro - reservoirCapacity);
  const reservoir = available - hydro - spill;
  const generation = otherGeneration + hydro;
  const delivered = Math.min(demand, transmission, generation);
  return {
    reservoir,
    reservoirCapacity,
    inflow,
    hydro,
    spill,
    otherGeneration,
    demand,
    delivered,
    curtailment: generation - delivered,
    shortage: demand - delivered,
    generationCapacity: p.hydroCapacity + otherCapacity,
    transmissionCapacity: transmission,
    efficiency,
  };
}

export const energyStep: MonthStep = (state, ctx) => {
  const ufs = ctx.content.scenario.regions?.ufs ?? [];
  const relevant = ufs.filter((uf) => uf.region === 'sudeste' || uf.region === 'centro_oeste');
  const totalWeight = relevant.reduce((sum, uf) => sum + uf.gdpShare, 0);
  const dryness =
    totalWeight > 0
      ? relevant.reduce(
          (sum, uf) => sum + uf.gdpShare * (state.climate.ufs.find((climate) => climate.id === uf.id)?.dryness ?? 0),
          0,
        ) / totalWeight
      : 0;
  const transmissionAssetMillions = state.publicPolicies.projects
    .filter((project) => project.policyId === 'projeto_transmissao_energia' && project.phase === 'operacao')
    .reduce((sum, project) => sum + project.assetMillions, 0);
  const generationAssetMillions = state.publicPolicies.projects
    .filter((project) => project.policyId === 'projeto_geracao_energia' && project.phase === 'operacao')
    .reduce((sum, project) => sum + project.assetMillions, 0);
  const storageAssetMillions = state.publicPolicies.projects
    .filter((project) => project.policyId === 'projeto_reservatorio_energia' && project.phase === 'operacao')
    .reduce((sum, project) => sum + project.assetMillions, 0);
  const efficiency = Math.tanh(Math.max(0, sumActive(state.impulses, state.monthIndex, 'energia.eficiencia')));
  const energy = advanceEnergy(state.energy, {
    dryness,
    transmissionAssetMillions,
    generationAssetMillions,
    storageAssetMillions,
    efficiency,
    demand: p.demand * state.economy.potentialIndex,
    technology: researchEnergyEffects(state, ctx.content),
  });
  const loss = p.shortageGapMax * (energy.demand > 0 ? energy.shortage / energy.demand : 0);
  const previousLoss = p.shortageGapMax * (state.energy.demand > 0 ? state.energy.shortage / state.energy.demand : 0);
  const delta = -(loss - ctx.content.calibration.rho_h * previousLoss);
  const impulses =
    delta === 0
      ? state.impulses
      : [
          ...state.impulses,
          {
            sourceId: 'energia:escassez',
            label: 'Restrição física de eletricidade',
            target: 'choque.hiato' as const,
            delta,
            startMonth: state.monthIndex,
            endMonth: state.monthIndex,
          },
        ];
  return { state: { ...state, energy, impulses }, contributions: [] };
};
