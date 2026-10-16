import type { ImpulseTarget } from '../types';

import type { ParamName } from './calibration';

/** Multiplicador e sinal de um impulso de demanda sobre o hiato (ECONOMIC_MODEL.md §5.2). */
export interface DemandGain {
  mult: ParamName;
  sign: 1 | -1;
}

export const DEMAND_GAIN: Partial<Record<ImpulseTarget, DemandGain>> = {
  'gasto.investimento': { mult: 'mult_investimento', sign: 1 },
  'gasto.custeio': { mult: 'mult_custeio', sign: 1 },
  'gasto.transferencia_baixa_renda': { mult: 'mult_transf_baixa_renda', sign: 1 },
  'gasto.transferencia_alta_renda': { mult: 'mult_transf_alta_renda', sign: 1 },
  'gasto.obrigatoria': { mult: 'mult_obrigatoria', sign: 1 },
  'gasto.extraordinario': { mult: 'mult_custeio', sign: 1 },
  'receita.desoneracao_consumo': { mult: 'mult_desoneracao_consumo', sign: 1 },
  'receita.desoneracao_renda': { mult: 'mult_desoneracao_renda', sign: 1 },
  'receita.tributaria': { mult: 'mult_receita', sign: -1 },
  'receita.renda': { mult: 'mult_receita', sign: -1 },
  'receita.consumo': { mult: 'mult_receita', sign: -1 },
  'demanda.credito': { mult: 'mult_credito', sign: 1 },
};
