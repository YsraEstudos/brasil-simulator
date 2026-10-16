import { CHAMBER_SEATS, SENATE_SEATS, type Bloc } from '@/types/scenario';

/**
 * Resumo e geometria do hemiciclo do Congresso (GAME_DESIGN.md aba Congresso, POLITICAL_RULES.md §6).
 * Funções puras — grupos ideológicos, posição das cadeiras da Câmara, índice de apoio ao governo e resumo da
 * base aliada exibidos no topo do painel. Sem React para poderem ser testadas no Node (hemicycle.test.ts).
 */

/** Relação bloco–governo acima da qual o bloco conta como base aliada no painel (aproximação de interface). */
export const ALLY_RELATION = 20;

/** Maioria de 3/5 para PEC, em cada Casa (CF art. 60 §2º). */
export const PEC_CHAMBER = Math.ceil((CHAMBER_SEATS * 3) / 5);
export const PEC_SENATE = Math.ceil((SENATE_SEATS * 3) / 5);

/** Escala da relação bloco–governo (POLITICAL_RULES.md §6.1: −100 … 100). */
const RELATION_SCALE = 100;

export type IdeologyGroup = 'esquerda' | 'centro' | 'direita';

/** Corte no eixo econômico que separa esquerda e direita do centro (aproximação de interface). */
export const GROUP_ECONOMIC_THRESHOLD = 0.2;

/** Grupo ideológico de exibição do bloco, pelo eixo econômico da ideologia. */
export function ideologyGroup(economic: number): IdeologyGroup {
  if (economic < -GROUP_ECONOMIC_THRESHOLD) return 'esquerda';
  if (economic > GROUP_ECONOMIC_THRESHOLD) return 'direita';
  return 'centro';
}

/** Posição normalizada de uma cadeira: x ∈ [−1, 1] (esquerda negativa), y ∈ [0, 1] (base em 0, raio externo 1). */
export interface Seat {
  x: number;
  y: number;
  group: IdeologyGroup;
}

/** Número de fileiras concêntricas do hemiciclo. */
const ROWS = 10;
/** Raio da fileira interna em fração do raio externo: deixa o vão central para o número de cadeiras. */
const INNER_RADIUS = 0.5;

/** Cadeiras da Câmara, da esquerda para a direita, com cada bloco ocupando um setor contíguo. */
export function hemicycleSeats(blocs: readonly Bloc[]): Seat[] {
  const total = blocs.reduce((n, b) => n + b.chamberSeats, 0);
  if (total === 0) return [];

  // Fileiras com a mesma folga linear entre cadeiras (cadeiras por fileira ∝ raio); a de baixo nunca tem menos
  // de duas cadeiras, para o arco não degenerar em um ponto.
  const rows = Math.max(1, Math.min(ROWS, Math.floor(total / 2)));
  const radii = Array.from({ length: rows }, (_, i) =>
    rows === 1 ? 1 : INNER_RADIUS + ((1 - INNER_RADIUS) * i) / (rows - 1),
  );
  const rowCounts = apportion(radii, total);

  // Todas as cadeiras em ordem angular (180° na esquerda → 0° na direita); a atribuição em sequência dá a cada
  // bloco um setor angular contíguo, como no plenário real.
  const positions: { x: number; y: number }[] = [];
  radii.forEach((radius, row) => {
    const n = rowCounts[row];
    for (let i = 0; i < n; i++) {
      const angle = n === 1 ? Math.PI / 2 : Math.PI - (Math.PI * i) / (n - 1);
      // max: nas pontas o seno sai ±ε do arredondamento; a linha de base é exatamente y = 0.
      positions.push({ x: radius * Math.cos(angle), y: Math.max(0, radius * Math.sin(angle)) });
    }
  });
  positions.sort((a, b) => Math.atan2(b.y, b.x) - Math.atan2(a.y, a.x));

  const seats: Seat[] = [];
  const ordered = [...blocs].sort((a, b) => a.ideology.economic - b.ideology.economic);
  let next = 0;
  for (const bloc of ordered) {
    const group = ideologyGroup(bloc.ideology.economic);
    for (let i = 0; i < bloc.chamberSeats; i++) {
      const p = positions[next++];
      seats.push({ x: p.x, y: p.y, group });
    }
  }
  return seats;
}

/** Reparte `total` em partes proporcionais a `weights` pelo método do maior resto (soma exata, sem viés). */
function apportion(weights: readonly number[], total: number): number[] {
  const sum = weights.reduce((n, w) => n + w, 0);
  const exact = weights.map((w) => (total * w) / sum);
  const counts = exact.map((v) => Math.floor(v));
  let rest = total - counts.reduce((n, c) => n + c, 0);
  const byRemainder = exact
    .map((v, i) => ({ i, remainder: v - Math.floor(v) }))
    .sort((a, b) => b.remainder - a.remainder);
  for (let k = 0; k < byRemainder.length && rest > 0; k++, rest--) counts[byRemainder[k].i] += 1;
  return counts;
}

/** Cadeiras por grupo ideológico. */
export function groupCounts(blocs: readonly Bloc[]): Record<IdeologyGroup, number> {
  const counts: Record<IdeologyGroup, number> = { esquerda: 0, centro: 0, direita: 0 };
  for (const bloc of blocs) counts[ideologyGroup(bloc.ideology.economic)] += bloc.chamberSeats;
  return counts;
}

/**
 * Índice de apoio ao governo (0–1): média da relação dos blocos com o governo (−100 … 100), ponderada pelas
 * cadeiras da Câmara. Aproximação de interface: 0 = todos os blocos em −100, 1 = todos em +100.
 */
export function governmentSupport(blocs: readonly Bloc[], relationOf: (bloc: Bloc) => number): number {
  const total = blocs.reduce((n, b) => n + b.chamberSeats, 0);
  if (total === 0) return 0;
  const weighted = blocs.reduce((n, bloc) => {
    const relation = Math.max(-RELATION_SCALE, Math.min(RELATION_SCALE, relationOf(bloc)));
    return n + bloc.chamberSeats * ((relation + RELATION_SCALE) / (2 * RELATION_SCALE));
  }, 0);
  return weighted / total;
}

/** Cadeiras da base aliada (relação estritamente acima de `ALLY_RELATION`) na Câmara e no Senado. */
export function allySeats(
  blocs: readonly Bloc[],
  relationOf: (bloc: Bloc) => number,
): { chamber: number; senate: number } {
  let chamber = 0;
  let senate = 0;
  for (const bloc of blocs) {
    if (relationOf(bloc) > ALLY_RELATION) {
      chamber += bloc.chamberSeats;
      senate += bloc.senateSeats;
    }
  }
  return { chamber, senate };
}

/** Segmento do arco de apoio: `t` é o centro do segmento, de 0 (esquerda) a 1 (direita). */
export interface ArcSegment {
  t: number;
  filled: boolean;
}

/** Divide o arco em `count` segmentos; acendem os segmentos dentro da fração de apoio (0–1). */
export function arcSegments(fraction: number, count: number): readonly ArcSegment[] {
  const f = Math.max(0, Math.min(1, fraction));
  return Array.from({ length: count }, (_, i) => {
    const t = (i + 0.5) / count;
    return { t, filled: t <= f };
  });
}
