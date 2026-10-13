import { toCalendar, type Difficulty } from '@/engine';

const MONTHS = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

/** 0 → "Janeiro de 2027" */
export function monthLabel(monthIndex: number): string {
  const { year, month } = toCalendar(monthIndex);
  return `${MONTHS[month - 1]} de ${year}`;
}

/** 0 → "jan/2027" */
export function shortMonthLabel(monthIndex: number): string {
  const { year, month } = toCalendar(monthIndex);
  return `${MONTHS[month - 1].slice(0, 3).toLowerCase()}/${year}`;
}

export const DIFFICULTY: Record<Difficulty, { name: string; description: string }> = {
  casual: { name: 'Casual', description: 'Regras simplificadas, 4 pontos de agenda, menos imprevistos.' },
  estrategica: { name: 'Estratégica', description: 'Regras completas e 3 pontos de agenda. O modo padrão.' },
  realismo: { name: 'Realismo Extremo', description: 'Regras detalhadas, dados com atraso e mais incerteza.' },
};
