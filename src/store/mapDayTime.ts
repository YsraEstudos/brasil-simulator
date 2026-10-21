import {
  DAY_MODES,
  DEFAULT_DAY_TIME,
  FIXED_HOURS,
  type DayMode,
  type DayTimeSetting,
  type FixedHour,
} from '@/globe/visualClock';

/**
 * Hora do dia do mapa (PLANO_GLOBO.md §4.1, D-G7). Fica na tabela `settings`, fora do `GameState`: é escolha do
 * aparelho, só visual. Três modos: hora fixa (com a hora escolhida), sempre dia e hora real do aparelho.
 */

/** Chave em `settings` (JSON: `{ "mode": "fixa", "hour": "tarde" }`). */
export const MAP_DAY_TIME_KEY = 'mapa_hora';

/** Valor lido do banco → escolha válida; qualquer coisa fora do formato volta ao padrão (nunca impede abrir o jogo). */
export function resolveDayTime(saved: unknown): DayTimeSetting {
  if (typeof saved !== 'object' || saved === null) return DEFAULT_DAY_TIME;
  const { mode, hour } = saved as { mode?: unknown; hour?: unknown };
  return {
    mode: (DAY_MODES as readonly unknown[]).includes(mode) ? (mode as DayMode) : DEFAULT_DAY_TIME.mode,
    hour: (FIXED_HOURS as readonly unknown[]).includes(hour) ? (hour as FixedHour) : DEFAULT_DAY_TIME.hour,
  };
}

/** Rótulo e explicação de cada modo (Configurações → Hora do dia), na ordem de exibição. */
export const DAY_MODE_OPTIONS: readonly { id: DayMode; label: string; description: string }[] = [
  {
    id: 'fixa',
    label: 'Hora fixa',
    description: 'O Sol fica parado na hora escolhida; só a estação muda com o mês do jogo. Não pede quadros extras.',
  },
  {
    id: 'sempre-dia',
    label: 'Sempre dia',
    description: 'Sem sombra de noite e sem luzes das cidades: o mapa inteiro iluminado.',
  },
  {
    id: 'real',
    label: 'Hora real',
    description: 'Segue o relógio do aparelho. O Sol só se move quando o mapa já está sendo desenhado (ao mexer nele).',
  },
];

/** Nome de cada hora fixa (horário de Brasília). */
export const FIXED_HOUR_LABELS: Readonly<Record<FixedHour, string>> = {
  manha: 'Manhã',
  tarde: 'Tarde',
  entardecer: 'Entardecer',
  noite: 'Noite',
};
