import type { ScenarioUf } from '../../types/scenario';
import type { IdeologyPoint } from '../types';

import { PROFILE_MAX_DISTANCE, profileParam } from './calibration';

/**
 * Geometria do perfil ideológico e do alinhamento por UF (PLANO_GLOBO.md §5.1; POLITICAL_RULES.md §11.2).
 * Funções puras sobre pontos dos eixos (econômico −1 estado … 1 mercado; social −1 progressista … 1
 * conservador); sem estado, sem sorteio. Os efeitos mensais usam estas funções em `opinionStep` (termo nacional)
 * e em `regionsStep` (desvio regional); a interface e a prévia também.
 */

/** Alinhamento é `1 − distância normalizada`: 1 = a UF pensa como o governo; 0 = cantos opostos dos eixos. */
export type Alignment = number;

/** Distância euclidiana entre dois pontos dos eixos, normalizada para [0, 1] pela diagonal do quadrado. */
export function normalizedDistance(a: IdeologyPoint, b: IdeologyPoint): number {
  return Math.hypot(a.economic - b.economic, a.social - b.social) / PROFILE_MAX_DISTANCE;
}

/** Alinhamento do perfil do governo com uma inclinação (UF ou eleitor mediano), em [0, 1]. */
export function profileAlignment(profile: IdeologyPoint, lean: IdeologyPoint): Alignment {
  return 1 - normalizedDistance(profile, lean);
}

/** Todas as UFs do cenário têm inclinação (a série existe); sem ela o alinhamento não age. */
export function hasLean(ufs: readonly ScenarioUf[]): boolean {
  return ufs.length > 0 && ufs.every((u) => u.lean !== undefined);
}

/**
 * Eleitor mediano: média das inclinações das UFs ponderada pela população (PLANO_GLOBO.md §5.1; `pop` soma 1).
 * `null` sem inclinações no cenário.
 */
export function medianVoterOf(ufs: readonly ScenarioUf[], pop: readonly number[]): IdeologyPoint | null {
  if (!hasLean(ufs)) return null;
  return ufs.reduce<IdeologyPoint>(
    (m, u, i) => ({
      economic: m.economic + pop[i] * (u.lean?.economic ?? 0),
      social: m.social + pop[i] * (u.lean?.social ?? 0),
    }),
    { economic: 0, social: 0 },
  );
}

/**
 * Termo nacional (D-G10): efeito, em fração da aprovação (estado estacionário), da distância do perfil ao
 * eleitor mediano. `teto · tanh((d_neutra − d) / escala)` com `d` normalizada: ímpar em torno da distância
 * neutra (a mesma distância a mais vale o oposto da mesma distância a menos), saturado em ±teto e igual para
 * qualquer posição à mesma distância do mediano — nenhum lado dos eixos é premiado em si.
 */
export function nationalTermOf(profile: IdeologyPoint, median: IdeologyPoint | null): number {
  if (!median) return 0;
  const d = normalizedDistance(profile, median);
  return (
    profileParam('eleitor_mediano_teto') *
    Math.tanh((profileParam('eleitor_mediano_distancia_neutra') - d) / profileParam('eleitor_mediano_escala'))
  );
}

export interface RegionalAlignment {
  /** Alinhamento de cada UF com o perfil (ordem do cenário). */
  alignments: number[];
  /** Média do alinhamento ponderada pela população. */
  mean: number;
  /**
   * Desvio bruto de aprovação de cada UF, `k · tanh((alinhamento − média)/s)`. A média ponderada **não** é zero
   * (a tanh não é linear): quem usa precisa centrar (o `regionsStep` já centra, ver D7).
   */
  raw: number[];
}

/**
 * Alinhamento de cada UF com o perfil e o desvio regional bruto (PLANO_GLOBO.md §5.1). `null` sem inclinações.
 * `pop` = participação de cada UF na população (soma 1), na ordem de `ufs`.
 */
export function regionalAlignmentOf(
  profile: IdeologyPoint,
  ufs: readonly ScenarioUf[],
  pop: readonly number[],
): RegionalAlignment | null {
  if (!hasLean(ufs)) return null;
  const alignments = ufs.map((u) => profileAlignment(profile, u.lean as IdeologyPoint));
  const mean = alignments.reduce((s, a, i) => s + pop[i] * a, 0);
  const k = profileParam('alinhamento_regional_max');
  const scale = profileParam('alinhamento_regional_escala');
  return { alignments, mean, raw: alignments.map((a) => k * Math.tanh((a - mean) / scale)) };
}

/** Subtrai a média ponderada pela população: o desvio relativo à média nacional (soma ponderada zero). */
export function centerByPopulation(values: readonly number[], pop: readonly number[]): number[] {
  const mean = values.reduce((s, v, i) => s + pop[i] * v, 0);
  return values.map((v) => v - mean);
}

/** Direção de um eixo em palavras: o lado, ou "centro" dentro da faixa central. */
export type AxisSide = 'estado' | 'centro' | 'mercado' | 'progressista' | 'conservador';

export interface ProfileDescription {
  economic: Extract<AxisSide, 'estado' | 'centro' | 'mercado'>;
  social: Extract<AxisSide, 'progressista' | 'centro' | 'conservador'>;
  /** Ex.: "Mercado · Conservador", "Centro · Progressista", "Centro". */
  label: string;
}

/** Descreve um perfil em palavras para a interface (limiar `faixa_central`; não entra em nenhuma conta). */
export function describeProfile(profile: IdeologyPoint): ProfileDescription {
  const band = profileParam('faixa_central');
  const economic = profile.economic > band ? 'mercado' : profile.economic < -band ? 'estado' : 'centro';
  const social = profile.social > band ? 'conservador' : profile.social < -band ? 'progressista' : 'centro';
  const word = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const label = economic === 'centro' && social === 'centro' ? 'Centro' : `${word(economic)} · ${word(social)}`;
  return { economic, social, label };
}
