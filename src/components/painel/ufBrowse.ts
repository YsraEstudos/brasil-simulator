import { bin, indicatorSpec, legendLabels, numericLegendLabels, type MapIndicatorSpec } from './regionalMetrics';

/**
 * Navegação pelas UFs no mapa (PLANO_QUICK_WINS.md, Fase Q11): ordem alfabética, UF anterior e próxima no cartão,
 * campo do governador (aliadas, neutras, oposição) e o texto da legenda fixa. Puro: só recebe as linhas do mapa.
 */

/** O mínimo de uma linha do mapa que a navegação usa. */
export interface BrowseRow {
  uf: { id: string; governorRelation: number };
  name: string;
}

// ---------------------------------------------------------------------------------------------------------------
// Ordem alfabética e UF anterior / próxima (B43, B44)
// ---------------------------------------------------------------------------------------------------------------

export type UfListOrder = 'ranking' | 'alfabetica';

export const UF_LIST_ORDER_LABEL: Record<UfListOrder, string> = { ranking: 'Ranking', alfabetica: 'A–Z' };

/** UFs pelo nome, como no português (Amapá antes de Amazonas, acentos não contam). */
export function alphabeticalUfs<T extends BrowseRow>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }));
}

export interface UfNeighbors {
  previous: { id: string; name: string };
  next: { id: string; name: string };
}

/**
 * Vizinhas em ordem alfabética, dando a volta (depois de Tocantins vem o Acre). `null` se a UF não estiver na
 * lista ou se a lista tiver menos de duas UFs.
 */
export function ufNeighbors(rows: readonly BrowseRow[], id: string): UfNeighbors | null {
  const sorted = alphabeticalUfs(rows);
  const i = sorted.findIndex((r) => r.uf.id === id);
  if (i < 0 || sorted.length < 2) return null;
  const at = (k: number) => {
    const r = sorted[(k + sorted.length) % sorted.length];
    return { id: r.uf.id, name: r.name };
  };
  return { previous: at(i - 1), next: at(i + 1) };
}

/** Tamanho dos blocos "5 melhores" e "5 piores" da lista de UFs. */
export const RANKING_GROUP_SIZE = 5;

/**
 * Os blocos de melhores e piores, já na ordem do ranking. Com até 10 UFs (um filtro de região ou de governador) os
 * dois blocos repetiriam as mesmas UFs, e a lista completa logo abaixo já mostra todas: então não há blocos.
 */
export function rankingGroups<T>(ranked: readonly T[], size = RANKING_GROUP_SIZE): [T[], T[]] | null {
  if (ranked.length <= 2 * size) return null;
  return [ranked.slice(0, size), ranked.slice(-size).reverse()];
}

// ---------------------------------------------------------------------------------------------------------------
// Aliadas × oposição pelo governador (D48)
// ---------------------------------------------------------------------------------------------------------------

export type GovernorCamp = 'aliada' | 'neutra' | 'oposicao';

export const GOVERNOR_CAMPS: readonly GovernorCamp[] = ['aliada', 'neutra', 'oposicao'];

export const GOVERNOR_CAMP_LABEL: Record<GovernorCamp, string> = {
  aliada: 'Aliadas',
  neutra: 'Neutras',
  oposicao: 'Oposição',
};

/**
 * Mesmas faixas da camada "Relação com o governador": próximo e aliado contam como aliadas; distante e hostil,
 * como oposição; neutro fica no meio. Assim o filtro nunca discorda da cor do mapa.
 */
export function governorCamp(relation: number): GovernorCamp {
  const index = bin(indicatorSpec('governador'), relation);
  return index >= 3 ? 'aliada' : index <= 1 ? 'oposicao' : 'neutra';
}

export function filterByCamp<T extends BrowseRow>(rows: readonly T[], camp: GovernorCamp | null): T[] {
  return camp === null ? [...rows] : rows.filter((r) => governorCamp(r.uf.governorRelation) === camp);
}

export function campCounts(rows: readonly BrowseRow[]): Record<GovernorCamp, number> {
  const counts: Record<GovernorCamp, number> = { aliada: 0, neutra: 0, oposicao: 0 };
  for (const r of rows) counts[governorCamp(r.uf.governorRelation)] += 1;
  return counts;
}

// ---------------------------------------------------------------------------------------------------------------
// Legenda fixa no mapa (B42)
// ---------------------------------------------------------------------------------------------------------------

export interface LegendStrip {
  title: string;
  /** Rótulo da primeira e da última cor (as pontas da escala). */
  low: string;
  high: string;
  /** Todas as faixas, para o leitor de tela. */
  accessibilityLabel: string;
}

/**
 * Faixa compacta da legenda: o nome da camada, as cinco cores e só as pontas escritas. O leitor de tela recebe
 * todas as faixas. As camadas sequenciais (seca, renda, intenção) usam os valores; as divergentes, as palavras.
 */
export function legendStrip(spec: MapIndicatorSpec): LegendStrip {
  const numeric = numericLegendLabels(spec);
  const labels = spec.scale === 'sequential' ? numeric : legendLabels(spec);
  const spoken = spec.scale === 'sequential' ? numeric : labels.map((word, i) => `${word} (${numeric[i]})`);
  return {
    title: spec.label,
    low: labels[0],
    high: labels[labels.length - 1],
    accessibilityLabel: `Legenda do mapa, ${spec.label}: ${spoken.join(', ')}.`,
  };
}
