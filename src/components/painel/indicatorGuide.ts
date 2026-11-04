import type { IndicatorKey } from '@/engine';

import type { HudTone } from './hudData';

/**
 * Faixas, alertas e texto de ajuda dos indicadores do Painel (PLANO_QUICK_WINS.md, Fase Q2). Fonte única: o HUD do
 * topo, a gaveta de Indicadores e o botão "?" leem daqui, para que a cor, o alerta e a explicação nunca se contradigam.
 * Os limites são os de sempre (meta de inflação 3,0% com banda de 1,5 p.p.; aprovação 50% e 35%); só foram movidos
 * para cá. Função pura: sem React, sem motor.
 */

/** Indicadores com faixa. O resultado primário não entra: a meta dele depende do cenário e já aparece no cartão Meta. */
export type GuidedIndicator = 'approval' | 'inflation12m' | 'unemployment' | 'gdpGrowth12m' | 'politicalCapital';

export type IndicatorBand = 'boa' | 'atencao' | 'ruim';

/** Meta de inflação e banda de tolerância (GAME_DESIGN.md §8.1). */
export const INFLATION_TARGET = 0.03;
export const INFLATION_BAND = 0.015;
const INFLATION_CEILING = INFLATION_TARGET + INFLATION_BAND;

const APPROVAL_GOOD = 0.5;
const APPROVAL_WARNING = 0.35;
const UNEMPLOYMENT_GOOD = 0.06;
const UNEMPLOYMENT_WARNING = 0.09;
const GDP_GOOD = 0.015;
const CAPITAL_GOOD = 60;
const CAPITAL_WARNING = 35;

/** Banda de cada indicador para um valor (mesma escala do valor: fração, ou pontos de 0 a 100 no capital). */
export function indicatorBand(indicator: GuidedIndicator, value: number): IndicatorBand {
  switch (indicator) {
    case 'approval':
      return value >= APPROVAL_GOOD ? 'boa' : value >= APPROVAL_WARNING ? 'atencao' : 'ruim';
    case 'inflation12m':
      return value <= INFLATION_TARGET ? 'boa' : value <= INFLATION_CEILING ? 'atencao' : 'ruim';
    case 'unemployment':
      return value <= UNEMPLOYMENT_GOOD ? 'boa' : value <= UNEMPLOYMENT_WARNING ? 'atencao' : 'ruim';
    case 'gdpGrowth12m':
      return value >= GDP_GOOD ? 'boa' : value > 0 ? 'atencao' : 'ruim';
    case 'politicalCapital':
      return value >= CAPITAL_GOOD ? 'boa' : value >= CAPITAL_WARNING ? 'atencao' : 'ruim';
  }
}

export function bandTone(band: IndicatorBand): HudTone {
  return band === 'boa' ? 'positive' : band === 'atencao' ? 'warning' : 'negative';
}

/** Alerta só quando o indicador sai da faixa (banda ruim): ex.: inflação acima do teto da meta. */
export function outOfBandAlert(indicator: GuidedIndicator, value: number): string | undefined {
  if (indicatorBand(indicator, value) !== 'ruim') return undefined;
  switch (indicator) {
    case 'approval':
      return 'Aprovação abaixo de 35%';
    case 'inflation12m':
      return 'Inflação acima do teto da meta (4,5%)';
    case 'unemployment':
      return 'Desemprego acima de 9%';
    case 'gdpGrowth12m':
      return 'PIB em queda em 12 meses';
    case 'politicalCapital':
      return 'Capital político abaixo de 35';
  }
}

export interface IndicatorGuide {
  /** Nome na gaveta e no alerta. */
  name: string;
  /** O que o número mede, em uma frase. */
  what: string;
  /** Faixas em palavras (o número da faixa também aparece aqui, para quem não vê cor). */
  bands: string;
  /** Quando a seta aparece: a mudança em relação ao mês anterior. */
  arrows: string;
}

const ARROWS_TEXT =
  'A seta mostra se o número subiu ou caiu em relação ao mês anterior. Sem mês anterior, não há seta.';

export const INDICATOR_GUIDE: Readonly<Record<GuidedIndicator, IndicatorGuide>> = {
  approval: {
    name: 'Aprovação popular',
    what: 'Porcentagem da população que aprova o governo.',
    bands: 'Boa: 50% ou mais. Atenção: de 35% a 49%. Ruim: abaixo de 35%.',
    arrows: ARROWS_TEXT,
  },
  inflation12m: {
    name: 'Inflação (12 meses)',
    what: 'Quanto os preços subiram nos últimos 12 meses.',
    bands: 'Boa: até 3,0%, a meta. Atenção: de 3,1% a 4,5%, na banda de tolerância. Ruim: acima de 4,5%.',
    arrows: ARROWS_TEXT,
  },
  unemployment: {
    name: 'Desemprego',
    what: 'Porcentagem da força de trabalho sem emprego.',
    bands: 'Boa: até 6%. Atenção: de 6% a 9%. Ruim: acima de 9%.',
    arrows: ARROWS_TEXT,
  },
  gdpGrowth12m: {
    name: 'PIB (12 meses)',
    what: 'Crescimento da economia nos últimos 12 meses.',
    bands: 'Boa: 1,5% ou mais. Atenção: de 0% a 1,4%. Ruim: zero ou queda.',
    arrows: ARROWS_TEXT,
  },
  politicalCapital: {
    name: 'Capital político',
    what: 'Força do governo para negociar e agir. Vai de 0 a 100.',
    bands: 'Boa: 60 ou mais. Atenção: de 35 a 59. Ruim: abaixo de 35.',
    arrows: ARROWS_TEXT,
  },
};

/** Ligação entre a chave do indicador no motor e a faixa. O resultado primário fica de fora (ver `GuidedIndicator`). */
export const GUIDED_BY_INDICATOR: Partial<Record<IndicatorKey, GuidedIndicator>> = {
  approval: 'approval',
  inflation12m: 'inflation12m',
  unemployment: 'unemployment',
  gdpGrowth12m: 'gdpGrowth12m',
};
