import type { Policy } from '../../types/policy';
import type { Ministry } from '../../types/scenario';
import { APPOINT_ACTION_ID } from '../actions';
import type { Calibration } from '../economy/calibration';
import {
  TECHNICAL_OCCUPANT,
  type CongressState,
  type GameContent,
  type GameState,
  type MinistryState,
  type MonthStep,
} from '../types';

import { allRelations, shiftRelation } from './relations';

/**
 * Ministérios técnicos ou de indicação partidária (POLITICAL_RULES.md §6.3.1). A pasta de bloco rende apoio
 * no Congresso, pode travar políticas contrárias ao bloco e tem risco de escândalo que cresce
 * com o tempo no cargo. Os ministérios vêm do cenário; o estado guarda só os que mudaram de ocupante.
 */

const MESES_POR_ANO = 12;
const CAPITAL_MIN = 0;
const CAPITAL_MAX = 100;

export function ministriesOf(content: GameContent): readonly Ministry[] {
  return content.scenario.institutions?.ministries ?? [];
}

function stateOf(state: Readonly<GameState>, ministry: Ministry): MinistryState {
  return (
    state.congress.cabinet.find((m) => m.id === ministry.id) ?? {
      id: ministry.id,
      occupant: ministry.occupant,
      since: 0,
    }
  );
}

/** Ocupante atual: `tecnico` ou id do bloco. */
export function ministryOccupant(state: Readonly<GameState>, ministry: Ministry): string {
  return stateOf(state, ministry).occupant;
}

/** Mês da nomeação do ocupante atual (0 para o ocupante do cenário). */
export function ministrySince(state: Readonly<GameState>, ministry: Ministry): number {
  return stateOf(state, ministry).since;
}

export function isPartisan(occupant: string): boolean {
  return occupant !== TECHNICAL_OCCUPANT;
}

/** Ministérios ocupados por indicação de bloco. */
export function partisanMinistries(state: Readonly<GameState>, content: GameContent): Ministry[] {
  return ministriesOf(content).filter((m) => isPartisan(ministryOccupant(state, m)));
}

/** Apoio do bloco em todas as votações pelas pastas que ocupa, saturado (§6.3.1). */
export function cabinetSupport(state: Readonly<GameState>, blocId: string, content: GameContent): number {
  const c = content.calibration;
  const total = ministriesOf(content)
    .filter((m) => ministryOccupant(state, m) === blocId)
    .reduce((s, m) => s + c.apoio_ministerio * m.weight, 0);
  return Math.min(c.apoio_ministerio_max, total);
}

/** Pasta que executa a política (a primeira cuja lista de áreas contém a área da política). */
export function policyMinistry(policy: Policy, content: GameContent): Ministry | null {
  return ministriesOf(content).find((m) => m.areas.includes(policy.area)) ?? null;
}

/** Chance mensal de escândalo numa pasta (0 se técnica): cresce com os anos no cargo, saturada. */
export function ministryScandalChance(state: Readonly<GameState>, ministry: Ministry, c: Calibration): number {
  const own = stateOf(state, ministry);
  if (!isPartisan(own.occupant)) return 0;
  const years = Math.max(0, state.monthIndex - own.since) / MESES_POR_ANO;
  return Math.min(c.escandalo_max_mes, (c.escandalo_base_mes + c.escandalo_por_ano * years) * ministry.weight);
}

/** Chance mensal de escândalo em alguma pasta de bloco: 1 − Π(1 − p). Condição do evento de escândalo. */
export function cabinetScandalRisk(state: Readonly<GameState>, content: GameContent): number {
  const c = content.calibration;
  const none = ministriesOf(content).reduce((q, m) => q * (1 - ministryScandalChance(state, m, c)), 1);
  return 1 - none;
}

export interface Appointment {
  congress: CongressState;
  /** Variação do capital político (demissão de ministro de bloco). */
  capitalDelta: number;
  /** Texto para o relatório do mês. */
  note: string;
}

/**
 * Troca o ocupante da pasta (§6.3.1): o bloco que perde a pasta piora a relação e a demissão custa capital;
 * o bloco que recebe melhora a relação. Pesos proporcionais ao peso da pasta.
 */
export function appointMinister(
  state: Readonly<GameState>,
  content: GameContent,
  ministry: Ministry,
  occupant: string,
): Appointment {
  const c = content.calibration;
  const previous = ministryOccupant(state, ministry);
  let blocs = allRelations(state, content);
  let capitalDelta = 0;
  const names = new Map(content.scenario.blocs.map((b) => [b.id, b.name]));
  const who = (o: string) => (isPartisan(o) ? `indicação do bloco ${names.get(o) ?? o}` : 'quadro técnico');

  if (isPartisan(previous)) {
    blocs = shiftRelation(blocs, previous, c.relacao_demissao * ministry.weight);
    capitalDelta += c.capital_demissao;
  }
  if (isPartisan(occupant)) blocs = shiftRelation(blocs, occupant, c.relacao_nomeacao * ministry.weight);

  const cabinet = [
    ...state.congress.cabinet.filter((m) => m.id !== ministry.id),
    { id: ministry.id, occupant, since: state.monthIndex },
  ];
  return {
    congress: { blocs, cabinet },
    capitalDelta,
    note: `${ministry.name}: sai ${who(previous)}, entra ${who(occupant)}.`,
  };
}

/** Pasta de bloco há mais tempo no cargo (empate: a primeira do cenário), ou `null`. */
export function longestServingPartisan(state: Readonly<GameState>, content: GameContent): Ministry | null {
  let found: Ministry | null = null;
  for (const m of partisanMinistries(state, content)) {
    if (found === null || ministrySince(state, m) < ministrySince(state, found)) found = m;
  }
  return found;
}

function clampCapital(value: number): number {
  return Math.min(CAPITAL_MAX, Math.max(CAPITAL_MIN, value));
}

/** Aplica uma nomeação ao estado (relações, gabinete e capital). */
export function applyAppointment(state: Readonly<GameState>, a: Appointment): GameState {
  return {
    ...state,
    congress: a.congress,
    resources: {
      ...state.resources,
      politicalCapital: clampCapital(state.resources.politicalCapital + a.capitalDelta),
    },
  };
}

/** Etapa mensal: nomeações decididas no mês (ação `nomear_ministro`, já validada pelo `advanceMonth`). */
export const cabinetStep: MonthStep = (state, ctx) => {
  let current: GameState = state;
  for (const d of ctx.decisions) {
    if (d.policyId !== APPOINT_ACTION_ID) continue;
    const ministry = ministriesOf(ctx.content).find((m) => m.id === d.params?.ministryId);
    const occupant = d.params?.occupant;
    if (!ministry || typeof occupant !== 'string') continue;
    const appointment = appointMinister(current, ctx.content, ministry, occupant);
    current = applyAppointment(current, appointment);
    ctx.draft.notes.push(appointment.note);
  }
  return { state: current, contributions: [] };
};
