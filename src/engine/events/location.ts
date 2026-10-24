import type { ClimateTrigger, GameEvent } from '../../types/event';
import { UF_IDS } from '../../types/regions';
import { climateParam } from '../climate/calibration';
import { climateByScenarioUf, floodRisk, floodVulnerabilities, scenarioUfs } from '../climate/effects';
import { REGION_NAMES } from '../regions/regions';
import type { EventLocation, GameContent, GameState } from '../types';

import { GEO_EVENT_PARAMS } from './calibration';

/**
 * Local dos eventos geográficos (PLANO_GLOBO.md §6.3; PR 9). Funções puras do estado climático e do cenário: sem
 * sorteio, sem data. O local é calculado **uma vez, no disparo**, e congelado na `PendingEvent`; depois disso nada
 * aqui lê o clima de novo.
 */

const UF_ORDER: readonly string[] = UF_IDS;

/** Uma UF e a severidade (0–1) do fenômeno climático nela. */
export interface UfSeverity {
  id: string;
  severity: number;
}

/**
 * Severidade do fenômeno em cada UF do cenário, na ordem do cenário (0–1):
 *  - `drought`: o índice de seca (`dryness`), a memória hídrica da UF;
 *  - `flood`: o risco de cheia (`floodRisk`, com a vulnerabilidade da UF) ÷ `cheia_risco_max`.
 * Lista vazia sem dados regionais no cenário.
 */
export function climateSeverities(
  kind: ClimateTrigger['kind'],
  climate: GameState['climate'],
  content: Pick<GameContent, 'scenario'>,
): UfSeverity[] {
  const ufs = scenarioUfs(content);
  const clima = climateByScenarioUf(climate, ufs);
  if (kind === 'drought') return ufs.map((u, i) => ({ id: u.id, severity: clima[i].dryness }));
  const vulnerability = floodVulnerabilities(ufs);
  const max = climateParam('cheia_risco_max');
  return ufs.map((u, i) => ({ id: u.id, severity: floodRisk(clima[i], vulnerability[i]) / max }));
}

/**
 * UFs atingidas pelo gatilho climático, da mais para a menos severa (empate: ordem de `UF_IDS`), limitadas a
 * `GEO_EVENT_PARAMS.ufs_max`. `undefined` se nenhuma UF chega ao limiar: o evento não pode disparar. A severidade de
 * cada UF fica gravada para as escolhas e para a interface.
 */
export function climateLocation(
  state: Pick<GameState, 'climate'>,
  content: Pick<GameContent, 'scenario'>,
  trigger: ClimateTrigger,
): EventLocation | undefined {
  const hit = climateSeverities(trigger.kind, state.climate, content)
    .filter((u) => u.severity >= trigger.threshold)
    .sort((a, b) => b.severity - a.severity || UF_ORDER.indexOf(a.id) - UF_ORDER.indexOf(b.id))
    .slice(0, GEO_EVENT_PARAMS.ufs_max.value);
  if (hit.length === 0) return undefined;
  return {
    affectedUfs: hit.map((u) => u.id),
    primaryUf: hit[0].id,
    severityByUf: Object.fromEntries(hit.map((u) => [u.id, u.severity])),
  };
}

/** A maior severidade do local (0 sem severidades gravadas): é ela que escala a probabilidade do gatilho climático. */
export function worstSeverity(location: Readonly<EventLocation>): number {
  return Math.max(0, ...Object.values(location.severityByUf ?? {}));
}

/** Instância de um evento: `${eventId}#${monthIndex}` (mês de chegada à caixa de entrada). */
export function eventInstanceId(eventId: string, monthIndex: number): string {
  return `${eventId}#${monthIndex}`;
}

// ── Texto ──────────────────────────────────────────────────────────────────────────────────────────────────────

/** "A, B e C" (português do Brasil). */
function joinList(items: readonly string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} e ${items[items.length - 1]}`;
}

/** Texto dos marcadores quando o evento não tem local (evento nacional ou save antigo). */
const NATIONWIDE = 'o país';

/** Marcadores aceitos nos textos de evento: `{uf}`, `{uf_principal}`, `{siglas}` e `{regiao}`. */
export const EVENT_PLACEHOLDERS = ['uf', 'uf_principal', 'siglas', 'regiao'] as const;

/** Siglas do local, na ordem do local ("CE, PI, RN"); vazio sem local. Usado no "Atinge: ..." da interface. */
export function locationAcronyms(location: Readonly<EventLocation> | undefined): string {
  return location ? location.affectedUfs.join(', ') : '';
}

/**
 * Troca os marcadores de um texto de evento pelo local congelado: `{uf}` = nomes das UFs atingidas ("Ceará, Piauí e
 * Rio Grande do Norte"), `{uf_principal}` = a mais atingida, `{siglas}` = siglas ("CE, PI e RN") e `{regiao}` = as
 * grandes regiões das UFs atingidas. Sem local (evento nacional, save antigo), todos viram "o país". Marcadores
 * desconhecidos ficam como estão. Função pura.
 */
export function formatEventText(
  text: string,
  location: Readonly<EventLocation> | undefined,
  content: Pick<GameContent, 'scenario'>,
): string {
  if (!text.includes('{')) return text;
  const ufs = scenarioUfs(content);
  const find = (id: string) => ufs.find((u) => u.id === id);
  const names = (location?.affectedUfs ?? []).map((id) => find(id)?.name ?? id);
  const regions = [...new Set((location?.affectedUfs ?? []).map((id) => find(id)?.region).filter(Boolean))].map(
    (r) => REGION_NAMES[r as string] ?? String(r),
  );
  const primary = location?.primaryUf ?? location?.affectedUfs[0];
  const values: Record<(typeof EVENT_PLACEHOLDERS)[number], string> = {
    uf: location && names.length > 0 ? joinList(names) : NATIONWIDE,
    uf_principal: location && primary ? (find(primary)?.name ?? primary) : NATIONWIDE,
    siglas: location && location.affectedUfs.length > 0 ? joinList(location.affectedUfs) : NATIONWIDE,
    regiao: regions.length > 0 ? joinList(regions) : NATIONWIDE,
  };
  return text.replace(/\{(\w+)\}/g, (whole, key: string) =>
    Object.hasOwn(values, key) ? values[key as keyof typeof values] : whole,
  );
}

/**
 * Cópia do evento com os textos do jogador (título, briefing, rótulo e descrição das escolhas) já preenchidos com o
 * local congelado. Só texto: ids e efeitos ficam idênticos.
 */
export function localizeEvent(
  event: GameEvent,
  location: Readonly<EventLocation> | undefined,
  content: Pick<GameContent, 'scenario'>,
): GameEvent {
  const fill = (text: string) => formatEventText(text, location, content);
  return {
    ...event,
    title: fill(event.title),
    description: fill(event.description),
    choices: event.choices.map((c) => ({ ...c, label: fill(c.label), description: fill(c.description) })),
  };
}
