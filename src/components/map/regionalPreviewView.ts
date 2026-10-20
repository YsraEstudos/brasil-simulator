import { SEQUENTIAL } from '@/components/painel/regionalMetrics';
import { formatNumber, formatPercent } from '@/components/ui/format';
import type { RegionalDecisionPreview, RegionalUncertainty } from '@/engine';

import { buildRegionalMapViewModel, type MapLegend, type RegionalMapViewModel } from './regionalMapViewModel';

/**
 * Montagem da prévia regional de uma decisão para a tela (PLANO_GLOBO.md §5.2 e §7 PR 1): cores do mini-mapa, legenda,
 * as UFs de destaque e os textos em português. Funções puras sobre `RegionalDecisionPreview`; o componente
 * `RegionalPreviewCard` só desenha o que sai daqui. Tudo é estimativa, nunca garantia.
 */

/** `impact`: onde pesa mais por habitante. `adhesion`: chance de cada governador aderir. */
export type PreviewMode = 'impact' | 'adhesion';

/** Nomes das UFs por sigla (o motor só entrega a sigla). */
export type UfNames = Readonly<Record<string, string>>;

export const DISCLAIMER = 'Estimativa — não é garantia';
export const IMPACT_LEGEND_TITLE = 'Onde pesa mais por habitante (estimativa)';
export const ADHESION_LEGEND_TITLE = 'Chance de o governador aderir (estimativa)';
export const NO_DIFFERENTIAL_TEXT = 'Sem efeito regional diferente (segue o PIB de cada estado)';
export const TOP_COUNT = 3;

/** Limites das faixas (razão por habitante, 1 = média nacional) e da chance de adesão (0–1). */
export const RATIO_EDGES = [0.6, 0.9, 1.25, 2] as const;
export const ADHESION_EDGES = [0.2, 0.4, 0.6, 0.8] as const;

export const UNCERTAINTY_TEXT: Readonly<Record<RegionalUncertainty, string>> = {
  votacao_congresso: 'Depende de votação no Congresso',
  adesao_sorteada: 'Adesão dos governadores é sorteada',
  efeito_defasado: 'Efeito com atraso',
};

export const BARRED_TEXT = {
  reedicao_vedada: 'Medida provisória rejeitada ou caducada: só pode ser reeditada no ano que vem.',
  vedacao_eleitoral: 'Vedação eleitoral: criar ou ampliar benefício neste período exige quebra declarada.',
} as const;

/** Índice da faixa (0 … edges.length): quantos limites o valor alcança. */
function binIndex(value: number, edges: readonly number[]): number {
  return edges.filter((e) => value >= e).length;
}

/** "0,60" → "0,6"; "2,00" → "2"; "1,25" fica. */
function trimmed(value: number): string {
  return formatNumber(value, 2)
    .replace(/(,\d*?)0+$/, '$1')
    .replace(/,$/, '');
}

/** Rótulos das cinco faixas: `fmt` põe a unidade; o começo de cada intervalo vai sem ela (`bare`): "0,6–0,9×". */
function rangeLabels(edges: readonly number[], fmt: (v: number) => string, bare: (v: number) => string): string[] {
  const last = edges[edges.length - 1];
  return [`< ${fmt(edges[0])}`, ...edges.slice(1).map((e, i) => `${bare(edges[i])}–${fmt(e)}`), `> ${fmt(last)}`];
}

const ratioLabel = (r: number) => `${trimmed(r)}×`;
const percentLabel = (p: number) => formatPercent(p, 0);

/** "2,1× a média" */
export function ratioText(ratio: number): string {
  return `${formatNumber(ratio, 1)}× a média`;
}

/** Os modos que a prévia sabe mostrar, na ordem do botão: impacto (só com perfil regional) e adesão (só com convênio). */
export function previewModes(preview: RegionalDecisionPreview): PreviewMode[] {
  const modes: PreviewMode[] = [];
  if (preview.differential) modes.push('impact');
  if (preview.ufs.some((u) => u.adhesionProbability !== null)) modes.push('adhesion');
  return modes;
}

/** Cor de cada UF no modo escolhido (sigla → hex). Modo sem dado: vazio (o mapa fica na cor neutra). */
export function previewFills(preview: RegionalDecisionPreview, mode: PreviewMode): Record<string, string> {
  const fills: Record<string, string> = {};
  for (const u of preview.ufs) {
    if (mode === 'impact') {
      if (preview.differential) fills[u.id] = SEQUENTIAL[binIndex(u.perCapitaRatio, RATIO_EDGES)];
    } else if (u.adhesionProbability !== null) {
      fills[u.id] = SEQUENTIAL[binIndex(u.adhesionProbability, ADHESION_EDGES)];
    }
  }
  return fills;
}

/** Legenda do modo: cinco faixas na mesma escala sequencial. `null` quando o modo não pinta nada. */
export function previewLegend(preview: RegionalDecisionPreview, mode: PreviewMode): MapLegend | null {
  if (!previewModes(preview).includes(mode)) return null;
  const adhesion = mode === 'adhesion';
  const labels = adhesion
    ? rangeLabels(ADHESION_EDGES, percentLabel, (p) => formatNumber(p * 100, 0))
    : rangeLabels(RATIO_EDGES, ratioLabel, trimmed);
  return {
    title: adhesion ? ADHESION_LEGEND_TITLE : IMPACT_LEGEND_TITLE,
    entries: labels.map((label, i) => ({ color: SEQUENTIAL[i], label })),
  };
}

/** Modelo do mini-mapa (modo `preview` do `RegionalMapViewModel`). */
export function previewMapModel(
  preview: RegionalDecisionPreview,
  mode: PreviewMode,
  selectedId: string | null,
): RegionalMapViewModel {
  return buildRegionalMapViewModel({
    mode: 'preview',
    fills: previewFills(preview, mode),
    selectedId,
    legend: previewLegend(preview, mode),
  });
}

export interface TopUf {
  id: string;
  name: string;
  ratio: number;
  /** "2,1× a média" */
  text: string;
}

/** As UFs onde a política pesa mais por habitante (vazio sem perfil regional: a razão seria só o PIB per capita). */
export function topUfs(preview: RegionalDecisionPreview, names: UfNames = {}, count = TOP_COUNT): TopUf[] {
  if (!preview.differential) return [];
  return [...preview.ufs]
    .sort((a, b) => b.perCapitaRatio - a.perCapitaRatio || a.id.localeCompare(b.id))
    .slice(0, count)
    .map((u) => ({ id: u.id, name: names[u.id] ?? u.id, ratio: u.perCapitaRatio, text: ratioText(u.perCapitaRatio) }));
}

/** Título da lista das UFs de destaque, conforme seja benefício ou custo. */
export function topHeading(preview: RegionalDecisionPreview): string {
  return preview.direction === 'cost' ? 'Pesa mais, por habitante, em' : 'Chega mais, por habitante, a';
}

/** "Adesão esperada: ~12 de 27 estados (cerca de 48% da população)"; `null` sem adesão. */
export function adhesionLine(preview: RegionalDecisionPreview): string | null {
  if (!preview.adhesion) return null;
  const states = Math.round(preview.adhesion.expectedStates);
  return `Adesão esperada: ~${states} de ${preview.ufs.length} estados (cerca de ${formatPercent(preview.adhesion.expectedPopulationShare, 0)} da população)`;
}

const months = (n: number) => `${n} ${n === 1 ? 'mês' : 'meses'}`;

/** Quando o efeito aparece; `null` se tudo é imediato ou nenhum impacto tem magnitude. */
export function lagLine(preview: RegionalDecisionPreview): string | null {
  const lag = preview.lagMonths;
  if (!lag || lag.longest === 0) return null;
  if (lag.earliest === 0) return `Parte do efeito começa já neste mês; o resto chega em até ${months(lag.longest)}`;
  if (lag.earliest === lag.longest) return `Efeito começa em ${months(lag.earliest)}`;
  return `Efeito começa em ${months(lag.earliest)} e chega por inteiro em até ${months(lag.longest)}`;
}

/** Fichas de incerteza em português, na ordem do motor. */
export function uncertaintyChips(preview: RegionalDecisionPreview): string[] {
  return preview.uncertain.map((u) => UNCERTAINTY_TEXT[u]);
}

export function barredNote(preview: RegionalDecisionPreview): string | null {
  return preview.barred ? BARRED_TEXT[preview.barred] : null;
}

/** Texto da UF tocada no mini-mapa: o valor do modo aberto (e a adesão, se houver). `null` se a sigla não existe. */
export function selectedUfText(
  preview: RegionalDecisionPreview,
  id: string,
  mode: PreviewMode,
  names: UfNames = {},
): string | null {
  const uf = preview.ufs.find((u) => u.id === id);
  if (!uf) return null;
  const name = `${names[id] ?? id} (${id})`;
  const adhesion =
    uf.adhesionProbability === null ? null : `chance de aderir ${formatPercent(uf.adhesionProbability, 0)}`;
  const impact = preview.differential ? ratioText(uf.perCapitaRatio) : null;
  const parts = mode === 'adhesion' ? [adhesion, impact] : [impact, adhesion];
  const shown = parts.filter((p): p is string => p !== null);
  return shown.length > 0 ? `${name}: ${shown.join(' · ')}` : `${name}: sem efeito regional diferente`;
}
