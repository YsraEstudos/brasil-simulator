import { Colors } from '@/constants/theme';

import type { HudTone } from './hudData';

/**
 * Estilo da mesa do Painel (GAME_DESIGN.md §4.2): o HUD é escuro com moldura dourada nos dois esquemas de cor,
 * como o globo — a mesa é a "arte" do jogo. Cores semânticas vêm de `Colors.dark` (o painel é sempre escuro);
 * nada aqui depende do tema claro/escuro do sistema.
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

/** Cor de um estado do HUD (barras, setas e selos). */
export function toneColor(tone: HudTone): string {
  switch (tone) {
    case 'positive':
      return Hud.positive;
    case 'warning':
      return Hud.warning;
    case 'negative':
      return Hud.negative;
    case 'neutral':
      return Hud.neutral;
  }
}
