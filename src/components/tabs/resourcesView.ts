import type { Energy } from '@/engine/energy/energy';
import { ENERGY_CALIBRATION } from '@/engine/energy/calibration';

/** Diagnóstico derivado do balanço do último mês, sem alterar o estado ou sortear resultados. */
export function energyAdvice(energy: Energy, processed: boolean): string {
  if (!processed) return 'O diagnóstico fica disponível depois do primeiro mês de governo.';
  if (energy.shortage <= 1e-9) return 'A demanda foi atendida neste mês; seca e crescimento podem mudar essa situação.';
  // O estoque final mais geração e vertimento reconstitui a água disponível no início do despacho.
  const water = energy.reservoir + energy.hydro + energy.spill;
  const hydroAvailable = Math.min(ENERGY_CALIBRATION.hydroCapacity, water);
  const otherCapacity = Math.max(0, energy.generationCapacity - ENERGY_CALIBRATION.hydroCapacity);
  const availableGeneration = otherCapacity + hydroAvailable;
  if (energy.transmissionCapacity <= availableGeneration) {
    return 'A transmissão limita a entrega neste mês. A expansão da rede só aumenta a capacidade depois de concluída; eficiência reduz a demanda após maturação.';
  }
  if (hydroAvailable < ENERGY_CALIBRATION.hydroCapacity) {
    const additional =
      energy.generationCapacity < energy.demand ? ' A capacidade total de geração também é insuficiente.' : '';
    return `A água disponível limita a geração neste mês.${additional} Eficiência pode reduzir a demanda; geração adicional e reservatórios dependem de obras concluídas e recursos.`;
  }
  return 'A capacidade de geração limita a entrega neste mês. Eficiência reduz a demanda após maturação; ampliar a geração exige obra e financiamento.';
}
