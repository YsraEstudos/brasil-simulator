import { Colors, paletteFor } from '@/constants/theme';
import type { Sentiment } from '@/components/ui/format';

import type { HudTone } from './hudData';

/**
 * Estilo da mesa do Painel (GAME_DESIGN.md §4.2): o HUD é escuro com moldura dourada nos dois esquemas de cor,
 * como o globo — a mesa é a "arte" do jogo. Cores semânticas vêm de `Colors.dark` (o painel é sempre escuro);
 * nada aqui depende do tema claro/escuro do sistema.
 *
 * O modo para daltônicos (`colorBlind`) é um parâmetro das funções de cor abaixo: quem lê a preferência é o componente.
 * Por isso `Hud.positive` e `Hud.negative` seguem verde e vermelho; use `toneColor` ou `hudSentimentColor` quando o
 * sentido for bom/ruim.
 */

const dark = Colors.dark;

export const Hud = {
  /** Fundo da mesa (visível ao redor do globo). */
  board: '#070d09',
  /** Fundo translúcido dos painéis. */
  panel: '#0c1510f2',
  /** Peças dentro dos painéis (tiles, linhas destacadas). */
  tile: '#162117cc',
  tileBorder: '#2a3620',
  /** Moldura dourada dos painéis. */
  border: '#63521f',
  /** Separadores internos. */
  divider: '#2c3322',
  /** Faixa do cabeçalho do painel. */
  header: '#1b281766',
  title: '#e8c96a',
  titleBright: '#ffe27a',
  text: '#f2eedd',
  textDim: '#adb5a0',
  textMuted: '#7e8775',
  /** Trilho das barras de progresso. */
  track: '#25302a',
  /** Superfícies translúcidas sobre o globo (células do topo, botões redondos). */
  glass: '#0d1712d9',
  glassBorder: '#63521fa6',
  positive: dark.positive,
  negative: dark.negative,
  warning: dark.warning,
  info: dark.info,
  neutral: '#9aa894',
  positiveSoft: dark.positiveSoft,
  negativeSoft: dark.negativeSoft,
  warningSoft: dark.warningSoft,
  infoSoft: dark.infoSoft,
  spectrumLeft: dark.spectrumLeft,
  spectrumCenter: dark.spectrumCenter,
  spectrumRight: dark.spectrumRight,
} as const;

/** Cor de um estado do HUD (barras, setas e selos). Com `colorBlind`, bom é azul e ruim é laranja. */
export function toneColor(tone: HudTone, colorBlind = false): string {
  const semantic = paletteFor('dark', colorBlind);
  switch (tone) {
    case 'positive':
      return semantic.positive;
    case 'warning':
      return Hud.warning;
    case 'negative':
      return semantic.negative;
    case 'neutral':
      return Hud.neutral;
  }
}

/** Cor de uma variação do HUD pelo sentido (bom, ruim ou neutro). Com `colorBlind`, bom é azul e ruim é laranja. */
export function hudSentimentColor(sentiment: Sentiment, colorBlind = false): string {
  const semantic = paletteFor('dark', colorBlind);
  switch (sentiment) {
    case 'positive':
      return semantic.positive;
    case 'negative':
      return semantic.negative;
    case 'neutral':
      return Hud.textDim;
  }
}

/**
 * Seta da variação para o modo para daltônicos: ▲ quando o número sobe, ▼ quando cai, vazio se não há variação
 * (o texto "±0,0 p.p." já diz isso). Lê o sinal do próprio texto já formatado (`+`, `−` ou `-`).
 */
export function deltaArrow(delta: string | undefined): '▲' | '▼' | '' {
  if (!delta) return '';
  const first = delta.trimStart().charAt(0);
  if (first === '+') return '▲';
  if (first === '−' || first === '-') return '▼';
  return '';
}
