import { shortMonthLabel } from '@/components/campaign/labels';
import { formatNumber, formatPercent, formatPointsDelta } from '@/components/ui/format';
import {
  alignmentView,
  describeProfile,
  profileParam,
  type GameContent,
  type GameState,
  type IdeologyPoint,
  type ProfileMove,
  type ProfileMoveKind,
} from '@/engine';

import { bin, binColor, indicatorSpec } from './regionalMetrics';

/**
 * Folha "Perfil do governo" (PLANO_GLOBO.md §5.2): o plano de dois eixos com o governo, o rastro dos últimos meses,
 * as 27 UFs e o eleitor mediano, mais o termo nacional e as decisões que mais moveram o perfil. Funções puras sobre
 * `alignmentView` (motor) e o histórico gravado no banco; `ProfileSheet` só desenha o que sai daqui. Tudo que
 * projeta efeito na aprovação é estimativa, nunca garantia.
 */

/** Lado do plano (quadrado) e margem interna, em dp. */
export const PLANE_SIZE = 260;
export const PLANE_PAD = 18;
/** Quantas decisões a lista mostra. */
export const MAX_MOVES_SHOWN = 6;
/** Deslocamento (nos eixos, −1…1) abaixo do qual um eixo não conta como "andou" no texto. */
export const MOVE_EPSILON = 0.005;
/** Deslocamento do rastro (primeiro → último mês) abaixo do qual o perfil "quase não mudou". */
export const TRAIL_EPSILON = 0.02;
/** Pontos do rastro (mesma janela do banco). */
export const TRAIL_MAX_POINTS = 12;

export const NO_LEAN_NOTE =
  'Este cenário não traz a inclinação política dos estados: o perfil do governo existe, mas o alinhamento por estado não é calculado.';
export const NO_TRAIL_NOTE = 'O rastro aparece depois do primeiro mês encerrado.';
export const NO_MOVES_NOTE =
  'Nenhuma decisão moveu o perfil nos últimos meses (ou o relatório já saiu da memória do jogo).';
export const ESTIMATE_NOTE =
  'Estimativa: o efeito na aprovação aparece aos poucos e depende também do resto do governo.';

export const AXIS_LABELS = {
  economic: { low: 'Estado', high: 'Mercado' },
  social: { low: 'Progressista', high: 'Conservador' },
} as const;

export const KIND_TEXT: Readonly<Record<ProfileMoveKind, string>> = {
  sancao: 'sancionada',
  proposta: 'enviada ao Congresso',
  veto: 'vetada',
  evento: 'escolha em evento',
};

export interface PlanePoint {
  x: number;
  y: number;
}

/** Ponto do plano: econômico no eixo x (Estado à esquerda), social no y (Conservador em cima). */
export function planePoint(p: IdeologyPoint, size = PLANE_SIZE, pad = PLANE_PAD): PlanePoint {
  const inner = size - 2 * pad;
  return { x: pad + ((p.economic + 1) / 2) * inner, y: pad + ((1 - p.social) / 2) * inner };
}

export interface PlaneUf extends PlanePoint {
  id: string;
  color: string;
}

export interface TrailPoint extends PlanePoint {
  monthIndex: number;
}

export interface MoveRow {
  key: string;
  label: string;
  /** "sancionada · mar/2027" */
  detail: string;
  /** "Mercado · Progressista" */
  direction: string;
  /** 0–1, relativo à maior decisão da lista (largura da barrinha). */
  weight: number;
}

export interface ProfileView {
  /** "Mercado · Conservador" */
  label: string;
  /** `null` quando o cenário não traz inclinação das UFs: só o rótulo e o aviso aparecem. */
  plane: {
    government: PlanePoint;
    median: PlanePoint;
    medianLabel: string;
    trail: TrailPoint[];
    ufs: PlaneUf[];
    /** Leitura do plano em texto (leitor de tela). */
    description: string;
  } | null;
  trailCaption: string;
  /** "Distância do eleitor médio: +0,4 p.p." (efeito esperado na aprovação nacional). */
  nationalLine: string;
  nationalNote: string;
  /** "Mais alinhados: SC, PR, RS · mais distantes: MA, PI, BA" */
  extremesLine: string;
  moves: MoveRow[];
  movesNote: string | null;
  noLeanNote: string | null;
}

/** "Mercado · Progressista" para um deslocamento; eixos que quase não andaram ficam de fora. */
export function directionText(delta: IdeologyPoint): string {
  const parts: string[] = [];
  if (Math.abs(delta.economic) >= MOVE_EPSILON) {
    parts.push(delta.economic > 0 ? AXIS_LABELS.economic.high : AXIS_LABELS.economic.low);
  }
  if (Math.abs(delta.social) >= MOVE_EPSILON) {
    parts.push(delta.social > 0 ? AXIS_LABELS.social.high : AXIS_LABELS.social.low);
  }
  return parts.length > 0 ? parts.join(' · ') : 'quase nada';
}

const magnitude = (d: IdeologyPoint) => Math.hypot(d.economic, d.social);

/** Decisões de todos os meses lidos, da que mais moveu o perfil para a que menos moveu (empate: a mais recente). */
export function topMoveRows(
  months: readonly { monthIndex: number; moves: readonly ProfileMove[] }[],
  limit = MAX_MOVES_SHOWN,
): MoveRow[] {
  const all = months.flatMap((m) => m.moves.map((move, i) => ({ move, monthIndex: m.monthIndex, i })));
  all.sort((a, b) => magnitude(b.move.delta) - magnitude(a.move.delta) || b.monthIndex - a.monthIndex || a.i - b.i);
  const top = all.slice(0, limit);
  const biggest = top.length > 0 ? magnitude(top[0].move.delta) : 0;
  return top.map(({ move, monthIndex, i }) => ({
    key: `${monthIndex}-${move.kind}-${move.sourceId}-${i}`,
    label: move.label,
    detail: `${KIND_TEXT[move.kind]} · ${shortMonthLabel(monthIndex)}`,
    direction: directionText(move.delta),
    weight: biggest > 0 ? magnitude(move.delta) / biggest : 0,
  }));
}

/** Resumo do rastro: para onde o perfil andou do primeiro ao último ponto. */
export function trailCaption(trail: readonly { monthIndex: number; profile: IdeologyPoint }[]): string {
  if (trail.length < 2) return NO_TRAIL_NOTE;
  const first = trail[0];
  const last = trail[trail.length - 1];
  const dx = last.profile.economic - first.profile.economic;
  const dy = last.profile.social - first.profile.social;
  const parts: string[] = [];
  if (Math.abs(dx) >= TRAIL_EPSILON)
    parts.push(`rumo ao ${dx > 0 ? AXIS_LABELS.economic.high : AXIS_LABELS.economic.low}`);
  if (Math.abs(dy) >= TRAIL_EPSILON) parts.push(`rumo ao ${dy > 0 ? AXIS_LABELS.social.high : AXIS_LABELS.social.low}`);
  const span = `${shortMonthLabel(first.monthIndex)} a ${shortMonthLabel(last.monthIndex)}`;
  return parts.length > 0
    ? `De ${span}, o perfil andou ${parts.join(' e ')}.`
    : `De ${span}, o perfil quase não mudou.`;
}

/** "Mais alinhados: SC, PR, RS · mais distantes: MA, PI, BA" (pelo desvio de aprovação que o alinhamento dá). */
export function extremesLine(ufs: readonly { id: string; approvalDeviation: number }[], count = 3): string {
  const sorted = [...ufs].sort((a, b) => b.approvalDeviation - a.approvalDeviation || a.id.localeCompare(b.id));
  const ids = (list: readonly { id: string }[]) => list.map((u) => u.id).join(', ');
  return `Mais alinhados: ${ids(sorted.slice(0, count))} · mais distantes: ${ids(sorted.slice(-count).reverse())}`;
}

/**
 * Tudo o que a folha mostra. `trail` vem do banco (do mais antigo ao mais recente) e pode ser curto ou vazio; `moves`,
 * dos relatórios retidos. Sem inclinação das UFs no cenário o plano some e fica o aviso.
 */
export function buildProfileView(
  state: Pick<GameState, 'government'>,
  content: Pick<GameContent, 'scenario'>,
  history: {
    trail: readonly { monthIndex: number; profile: IdeologyPoint }[];
    moves: readonly { monthIndex: number; moves: readonly ProfileMove[] }[];
  },
): ProfileView {
  const view = alignmentView(state, content);
  const label = describeProfile(state.government.profile).label;
  const moves = topMoveRows(history.moves);
  const movesNote = moves.length === 0 ? NO_MOVES_NOTE : null;
  if (!view) {
    return {
      label,
      plane: null,
      trailCaption: trailCaption([]),
      nationalLine: '',
      nationalNote: '',
      extremesLine: '',
      moves,
      movesNote,
      noLeanNote: NO_LEAN_NOTE,
    };
  }

  const spec = indicatorSpec('alinhamento');
  const trail = history.trail.slice(-TRAIL_MAX_POINTS);
  const medianLabel = describeProfile(view.median).label;
  const teto = profileParam('eleitor_mediano_teto');
  return {
    label,
    plane: {
      government: planePoint(view.profile),
      median: planePoint(view.median),
      medianLabel,
      trail: trail.map((t) => ({ monthIndex: t.monthIndex, ...planePoint(t.profile) })),
      ufs: view.ufs.map((u) => ({
        id: u.id,
        ...planePoint(u.lean),
        color: binColor(spec, bin(spec, u.approvalDeviation)),
      })),
      description: `Governo em ${label}; eleitor mediano em ${medianLabel}; ${view.ufs.length} estados pela inclinação política.`,
    },
    trailCaption: trailCaption(trail),
    nationalLine: `Distância do eleitor médio: ${formatPointsDelta(view.nationalTerm)}`,
    nationalNote: `Perfil a ${formatPercent(view.distanceToMedian, 0)} da distância máxima do eleitor mediano. Efeito esperado na aprovação nacional, quando se firma, de no máximo ±${formatNumber(teto * 100, 1)} p.p. ${ESTIMATE_NOTE}`,
    extremesLine: extremesLine(view.ufs),
    moves,
    movesNote,
    noLeanNote: null,
  };
}
