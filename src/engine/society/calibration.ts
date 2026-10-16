import type { SocietyQuintileId, SocietySectorId } from './types';

/**
 * Calibração PROVISÓRIA da forma reduzida social. Os valores têm faixas explícitas para balanceamento do jogo;
 * não são séries oficiais e não pretendem estimar a distribuição real brasileira.
 */
export interface SocietyCalibration {
  sectorShares: Record<SocietySectorId, number>;
  quintileIncomes: Record<SocietyQuintileId, number>;
  /** Sensibilidade setorial ao desvio dos termos de troca, por unidade de log. */
  termsOfTradeSensitivity: Record<SocietySectorId, number>;
  /** Limite da resposta setorial relativa antes da normalização nacional. */
  sectorGrowthSaturation: number;
  /** Fração de um impulso econômico que altera a composição setorial. */
  sectorImpulsePassThrough: number;
  /** Vazamento relativo para setores não atingidos por um impulso com incidência explícita. */
  unaffectedSectorSpillover: number;
  /** Fração do crescimento nacional que chega à renda no mês, representando defasagem. */
  outputIncomePassThrough: number;
  /** Efeito da melhora mensal do desemprego sobre a renda, com defasagem. */
  employmentIncomePassThrough: number;
  /** Efeito da variação do salário real médio sobre a renda dos quintis. */
  wageIncomePassThrough: number;
  /** Fração do caminho do salário mínimo corrente incorporada no mês. */
  minimumWageLag: number;
  /** Fração do impulso de transferência que chega à renda disponível no mês. */
  transferIncomePassThrough: number;
  /** Incidência relativa da transferência sobre os cinco quintis. */
  lowIncomeTransferIncidence: Record<SocietyQuintileId, number>;
  highIncomeTransferIncidence: Record<SocietyQuintileId, number>;
  /** Incidência regressiva de tributos sobre consumo/outros tributos. */
  regressiveTaxIncidence: Record<SocietyQuintileId, number>;
  /** Incidência progressiva de tributos sobre renda. */
  incomeTaxIncidence: Record<SocietyQuintileId, number>;
  /** Incidência do salário mínimo sobre a renda dos quintis. */
  minimumWageIncidence: Record<SocietyQuintileId, number>;
  /** Fração mensal do caminho até a incidência dos impulsos ativos. */
  policyAdjustmentLag: number;
  /** Saturação do componente transitório de políticas na renda disponível. */
  policyAdjustmentLimit: number;
  /** Distância mínima entre quintis consecutivos; zero preserva só a ordem. */
  minimumQuintileGap: number;
  /** Linha de pobreza em relação à renda média e suavização logística. */
  povertyThreshold: number;
  povertySmoothness: number;
  quintilePopulationShare: number;
  /** Limites numéricos que evitam renda, produção ou taxa inválidas. */
  minimumPositiveLevel: number;
  maximumUnemployment: number;
  /** Níveis de referência do cenário quando o bloco ainda não existe no save. */
  initialNationalOutput: number;
  initialUnemployment: number;
  initialRealWage: number;
  initialMinimumWage: number;
}

export const DEFAULT_SOCIETY_CALIBRATION: SocietyCalibration = {
  // PROVISORIO: composição arredondada para um cenário nacional de 2027; soma = 1.
  sectorShares: {
    agropecuaria: 0.08,
    extrativa: 0.09,
    industria: 0.12,
    construcao: 0.06,
    energia: 0.04,
    servicos: 0.61,
  },
  // PROVISORIO: índices relativos com média populacional igual a 1.
  quintileIncomes: { q1: 0.28, q2: 0.56, q3: 0.84, q4: 1.16, q5: 2.16 },
  termsOfTradeSensitivity: {
    agropecuaria: 0.4,
    extrativa: 0.7,
    industria: 0.15,
    construcao: 0.03,
    energia: 0.2,
    servicos: 0.02,
  },
  sectorGrowthSaturation: 0.08,
  sectorImpulsePassThrough: 0.75,
  unaffectedSectorSpillover: 0.2,
  outputIncomePassThrough: 0.2,
  employmentIncomePassThrough: 0.35,
  wageIncomePassThrough: 0.45,
  minimumWageLag: 0.25,
  transferIncomePassThrough: 0.9,
  lowIncomeTransferIncidence: { q1: 1, q2: 0.7, q3: 0.2, q4: 0.05, q5: 0 },
  highIncomeTransferIncidence: { q1: 0, q2: 0.05, q3: 0.2, q4: 0.7, q5: 1 },
  regressiveTaxIncidence: { q1: 1, q2: 0.75, q3: 0.5, q4: 0.3, q5: 0.15 },
  incomeTaxIncidence: { q1: 0.1, q2: 0.25, q3: 0.5, q4: 0.75, q5: 1 },
  minimumWageIncidence: { q1: 1, q2: 0.7, q3: 0.3, q4: 0.08, q5: 0 },
  policyAdjustmentLag: 0.25,
  policyAdjustmentLimit: 0.25,
  minimumQuintileGap: 0,
  povertyThreshold: 0.5,
  povertySmoothness: 0.08,
  quintilePopulationShare: 0.2,
  minimumPositiveLevel: 1e-9,
  maximumUnemployment: 1,
  initialNationalOutput: 1,
  initialUnemployment: 0.08,
  initialRealWage: 1,
  initialMinimumWage: 1,
};
