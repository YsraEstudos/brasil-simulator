import type { ProposalStatus } from '@/engine';
import { LEGISLATIVE_INSTRUMENTS, type Instrument, type Policy } from '@/types/policy';

/**
 * Catálogo de decisões do Gabinete (PLANO_QUICK_WINS.md, Fase Q6): busca, filtros, ordem, selo de tipo, contador
 * por área, "cabe agora" e aviso de teto ou piso. Tudo aqui é puro (sem React, sem motor): a tela monta as entradas
 * com `buildCatalog`, aplica a consulta com `queryCatalog` e só desenha o resultado.
 */

// ---------------------------------------------------------------------------------------------------------------
// Tipo de decisão (B27)
// ---------------------------------------------------------------------------------------------------------------

/** Tipo da decisão como o jogador o lê: ato do Executivo ou um dos caminhos pelo Congresso. */
export type PolicyKind = 'decreto' | 'mp' | 'pl' | 'pec';

export const POLICY_KINDS: readonly PolicyKind[] = ['decreto', 'mp', 'pl', 'pec'];

export const POLICY_KIND_LABEL: Readonly<Record<PolicyKind, { short: string; long: string }>> = {
  decreto: { short: 'Decreto', long: 'Decreto ou ato do Executivo: vale ao encerrar o mês' },
  mp: { short: 'MP', long: 'Medida provisória: vale já, mas o Congresso precisa aprovar depois' },
  pl: { short: 'Projeto de lei', long: 'Projeto de lei: só vale depois de aprovado no Congresso' },
  pec: { short: 'PEC', long: 'Emenda à Constituição: exige 3/5 nas duas Casas, em dois turnos' },
};

/** Tipo a partir do primeiro instrumento que passa pelo Congresso (`null` = ato do Executivo). */
export function policyKind(instrument: Instrument | null): PolicyKind {
  switch (instrument) {
    case null:
      return 'decreto';
    case 'medida_provisoria':
      return 'mp';
    case 'pec':
      return 'pec';
    default:
      return LEGISLATIVE_INSTRUMENTS.includes(instrument) ? 'pl' : 'decreto';
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Teto ou piso (D7)
// ---------------------------------------------------------------------------------------------------------------

export interface Bounded {
  value: number;
  min: number;
  max: number;
}

/** Os números que têm limite e que uma política mexe diretamente: aprovação e credibilidade fiscal. */
export interface SaturationLimits {
  approval: Bounded;
  credibility: Bounded;
}

const EPSILON = 1e-6;

function atLimit(bound: Bounded, magnitude: number): boolean {
  if (magnitude > 0) return bound.value >= bound.max - EPSILON;
  if (magnitude < 0) return bound.value <= bound.min + EPSILON;
  return true;
}

/**
 * A política só mexe em números que já estão no teto ou no piso, na direção em que ela empurra. Canais sem limite
 * (gasto, receita, crédito) nunca saturam: basta um deles para o aviso não aparecer (decisão D-Q3).
 */
export function isSaturated(policy: Pick<Policy, 'impacts'>, limits: SaturationLimits): boolean {
  if (policy.impacts.length === 0) return false;
  return policy.impacts.every((impact) => {
    if (impact.channel === 'aprovacao') return atLimit(limits.approval, impact.magnitude);
    if (impact.channel === 'credibilidade_fiscal') return atLimit(limits.credibility, impact.magnitude);
    return false;
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Entradas do catálogo
// ---------------------------------------------------------------------------------------------------------------

export interface CatalogEntry {
  policy: Policy;
  kind: PolicyKind;
  areaName: string;
  /** Custo em ações de agenda neste mês. */
  cost: number;
  /** Situação da proposta mais recente da política, se já foi enviada alguma vez. */
  status: ProposalStatus | undefined;
  /** Já está em andamento: não pode ser enviada de novo. */
  inProgress: boolean;
  /** MP rejeitada ou caducada: só no ano que vem. */
  barred: boolean;
  locked: boolean;
  selected: boolean;
  /** Ações que faltam para caber na agenda (0 = cabe, ou já está nela). */
  shortBy: number;
  saturated: boolean;
}

export interface CatalogInput {
  policies: readonly Policy[];
  /** Situação mais recente de cada política já enviada. */
  latestStatus: (policyId: string) => ProposalStatus | undefined;
  inProgressStatuses: ReadonlySet<ProposalStatus>;
  barred: ReadonlySet<string>;
  selected: readonly string[];
  actionsLeft: number;
  costOf: (policy: Policy) => number;
  instrumentOf: (policy: Policy) => Instrument | null;
  areaName: (area: string) => string;
  limits: SaturationLimits;
}

export function buildCatalog(input: CatalogInput): CatalogEntry[] {
  return input.policies.map((policy) => {
    const status = input.latestStatus(policy.id);
    const inProgress = status !== undefined && input.inProgressStatuses.has(status);
    const barred = input.barred.has(policy.id);
    const selected = input.selected.includes(policy.id);
    const cost = input.costOf(policy);
    return {
      policy,
      kind: policyKind(input.instrumentOf(policy)),
      areaName: input.areaName(policy.area),
      cost,
      status,
      inProgress,
      barred,
      locked: inProgress || barred,
      selected,
      shortBy: selected ? 0 : Math.max(0, cost - input.actionsLeft),
      saturated: isSaturated(policy, input.limits),
    };
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Consulta: busca, filtros e ordem (A32, A33, B29, D35)
// ---------------------------------------------------------------------------------------------------------------

export type CatalogSort = 'nome' | 'custo' | 'area';

export const CATALOG_SORTS: readonly { id: CatalogSort; label: string }[] = [
  { id: 'nome', label: 'Nome' },
  { id: 'custo', label: 'Custo' },
  { id: 'area', label: 'Área' },
];

/** Filtros de custo em ações de agenda (o catálogo vai de 0 a 3). */
export const CATALOG_COSTS: readonly number[] = [1, 2, 3];

export interface CatalogQuery {
  search: string;
  area: string | null;
  kind: PolicyKind | null;
  /** Custo exato em ações de agenda. */
  cost: number | null;
  /** Esconde o que não cabe nas ações livres ou está travado. */
  onlyAffordable: boolean;
  sort: CatalogSort;
}

export const DEFAULT_CATALOG_QUERY: CatalogQuery = {
  search: '',
  area: null,
  kind: null,
  cost: null,
  onlyAffordable: false,
  sort: 'nome',
};

/** Quantos filtros do painel "Filtros" estão ligados (tipo, custo, cabe agora). Busca e área ficam à vista. */
export function panelFilterCount(query: CatalogQuery): number {
  return (query.kind ? 1 : 0) + (query.cost !== null ? 1 : 0) + (query.onlyAffordable ? 1 : 0);
}

/** Há algo diferente do padrão que esconda decisões (a ordem não esconde nada). */
export function isFiltering(query: CatalogQuery): boolean {
  return foldSearch(query.search) !== '' || query.area !== null || panelFilterCount(query) > 0;
}

/** Texto para comparar: sem acento, sem maiúscula, sem espaço nas pontas. */
export function foldSearch(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('pt-BR').trim();
}

function matchesSearch(entry: CatalogEntry, folded: string): boolean {
  if (folded === '') return true;
  const haystack = [entry.policy.name, entry.areaName, POLICY_KIND_LABEL[entry.kind].short].map(foldSearch);
  return folded.split(/\s+/).every((word) => haystack.some((text) => text.includes(word)));
}

const byName = (a: CatalogEntry, b: CatalogEntry) => a.policy.name.localeCompare(b.policy.name, 'pt-BR');

const COMPARATORS: Readonly<Record<CatalogSort, (a: CatalogEntry, b: CatalogEntry) => number>> = {
  nome: byName,
  custo: (a, b) => a.cost - b.cost || a.policy.cost.annualMillions - b.policy.cost.annualMillions || byName(a, b),
  area: (a, b) => a.areaName.localeCompare(b.areaName, 'pt-BR') || byName(a, b),
};

export function queryCatalog(entries: readonly CatalogEntry[], query: CatalogQuery): CatalogEntry[] {
  const folded = foldSearch(query.search);
  return entries
    .filter(
      (entry) =>
        (query.area === null || entry.policy.area === query.area) &&
        (query.kind === null || entry.kind === query.kind) &&
        (query.cost === null || entry.cost === query.cost) &&
        (!query.onlyAffordable || (!entry.locked && entry.shortBy === 0)) &&
        matchesSearch(entry, folded),
    )
    .sort(COMPARATORS[query.sort]);
}

// ---------------------------------------------------------------------------------------------------------------
// Áreas com contador (B30)
// ---------------------------------------------------------------------------------------------------------------

export interface AreaFilter {
  id: string;
  name: string;
  /** Decisões da área no catálogo. */
  total: number;
  /** Decisões da área em andamento (no Congresso ou em execução). */
  active: number;
}

/** Uma entrada por área, em ordem alfabética, com quantas decisões estão em andamento. */
export function areaFilters(entries: readonly CatalogEntry[]): AreaFilter[] {
  const byArea = new Map<string, AreaFilter>();
  for (const entry of entries) {
    const area = byArea.get(entry.policy.area) ?? {
      id: entry.policy.area,
      name: entry.areaName,
      total: 0,
      active: 0,
    };
    area.total += 1;
    if (entry.inProgress) area.active += 1;
    byArea.set(area.id, area);
  }
  return [...byArea.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

/** "Saúde, 3 em andamento" / "Saúde, nenhuma em andamento", para leitores de tela. */
export function areaFilterLabel(area: AreaFilter): string {
  if (area.active === 0) return `${area.name}, nenhuma em andamento`;
  return `${area.name}, ${area.active} em andamento`;
}

/** "8 de 24 decisões" ou "24 decisões". */
export function resultsLabel(shown: number, total: number): string {
  const noun = total === 1 ? 'decisão' : 'decisões';
  return shown === total ? `${total} ${noun}` : `${shown} de ${total} ${noun}`;
}

/** "Falta 1 ação" / "Faltam 2 ações". */
export function shortByLabel(shortBy: number): string {
  return shortBy === 1 ? 'Falta 1 ação' : `Faltam ${shortBy} ações`;
}
