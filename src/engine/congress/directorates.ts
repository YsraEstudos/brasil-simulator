import type { Directorate } from '../../types/scenario';
import type { Calibration } from '../economy/calibration';
import { TECHNICAL_OCCUPANT, type GameContent, type GameState, type MinistryState } from '../types';

import type { Appointment } from './cabinet';
import { allRelations, shiftRelation } from './relations';

/**
 * Diretorias de estatais e bancos públicos (PLANO_CAMPANHA.md Fase C6a; POLITICAL_RULES.md §6.3.2). Cargos
 * limitados, um por diretoria do cenário, vinculados a um ministério. A indicação de bloco rende apoio nas votações
 * (somado ao das pastas, sob o mesmo teto) e acumula risco de escândalo com o tempo no cargo, maior quando o mesmo
 * bloco ocupa o ministério ("porteira fechada"). Tirar a diretoria de um bloco custa capital e a relação com ele.
 * Sem `institutions.directorates` no cenário, o sistema fica desligado: nada aqui muda o jogo.
 */

const MESES_POR_ANO = 12;

// Leituras do gabinete sem importar `cabinet.ts`, que importa este módulo (evita ciclo de dependência).
const isPartisan = (occupant: string) => occupant !== TECHNICAL_OCCUPANT;
function ministryOccupantOf(state: Readonly<GameState>, content: GameContent, ministryId: string): string | null {
  const ministry = content.scenario.institutions?.ministries.find((m) => m.id === ministryId);
  if (!ministry) return null;
  return state.congress.cabinet.find((m) => m.id === ministryId)?.occupant ?? ministry.occupant;
}

export function directoratesOf(content: GameContent): readonly Directorate[] {
  return content.scenario.institutions?.directorates ?? [];
}

function stateOf(state: Readonly<GameState>, directorate: Directorate): MinistryState {
  return (
    state.congress.directorates?.find((d) => d.id === directorate.id) ?? {
      id: directorate.id,
      occupant: directorate.occupant,
      since: 0,
    }
  );
}

/** Ocupante atual: `tecnico` ou id do bloco. */
export function directorateOccupant(state: Readonly<GameState>, directorate: Directorate): string {
  return stateOf(state, directorate).occupant;
}

/** Mês da nomeação do ocupante atual (0 para o ocupante do cenário). */
export function directorateSince(state: Readonly<GameState>, directorate: Directorate): number {
  return stateOf(state, directorate).since;
}

/** Diretorias ocupadas por indicação de bloco. */
export function partisanDirectorates(state: Readonly<GameState>, content: GameContent): Directorate[] {
  return directoratesOf(content).filter((d) => isPartisan(directorateOccupant(state, d)));
}

/** O mesmo bloco ocupa a diretoria e o ministério ao qual ela se vincula. */
export function isClosedGate(state: Readonly<GameState>, content: GameContent, directorate: Directorate): boolean {
  const occupant = directorateOccupant(state, directorate);
  return isPartisan(occupant) && ministryOccupantOf(state, content, directorate.ministryId) === occupant;
}

/** Apoio bruto do bloco pelas diretorias que ocupa (o teto é aplicado com o dos ministérios em `cabinetSupport`). */
export function directorateSupport(state: Readonly<GameState>, blocId: string, content: GameContent): number {
  const c = content.calibration;
  return directoratesOf(content)
    .filter((d) => directorateOccupant(state, d) === blocId)
    .reduce((s, d) => s + c.apoio_diretoria * d.weight, 0);
}

/**
 * Chance mensal de escândalo numa diretoria (0 se técnica): a mesma regra das pastas (cresce com os anos no cargo,
 * × peso), × `fator_porteira_fechada` quando o bloco também ocupa o ministério, saturada em `escandalo_max_mes`.
 */
export function directorateScandalChance(
  state: Readonly<GameState>,
  content: GameContent,
  directorate: Directorate,
  c: Calibration = content.calibration,
): number {
  const own = stateOf(state, directorate);
  if (!isPartisan(own.occupant)) return 0;
  const years = Math.max(0, state.monthIndex - own.since) / MESES_POR_ANO;
  const gate = isClosedGate(state, content, directorate) ? c.fator_porteira_fechada : 1;
  return Math.min(
    c.escandalo_max_mes,
    (c.escandalo_base_mes + c.escandalo_por_ano * years) * directorate.weight * gate,
  );
}

/** Chance mensal de escândalo em alguma diretoria de bloco: 1 − Π(1 − p). Fator do evento `escandalo_diretoria`. */
export function directorateScandalRisk(state: Readonly<GameState>, content: GameContent): number {
  const none = directoratesOf(content).reduce((q, d) => q * (1 - directorateScandalChance(state, content, d)), 1);
  return 1 - none;
}

/**
 * Diretoria de bloco com o maior risco de escândalo (empate: a há mais tempo no cargo, depois a primeira do cenário),
 * ou `null`. É o alvo congelado no disparo do evento de escândalo: a causa que o relatório mostra.
 */
export function riskiestDirectorate(state: Readonly<GameState>, content: GameContent): Directorate | null {
  let found: Directorate | null = null;
  let best = 0;
  for (const d of partisanDirectorates(state, content)) {
    const chance = directorateScandalChance(state, content, d);
    const better =
      found === null ||
      chance > best ||
      (chance === best && directorateSince(state, d) < directorateSince(state, found));
    if (better) {
      found = d;
      best = chance;
    }
  }
  return found;
}

/**
 * Troca o ocupante da diretoria: o bloco que perde o cargo piora a relação e a troca custa capital; o bloco que
 * recebe melhora a relação. Pesos proporcionais ao peso da diretoria.
 */
export function appointDirector(
  state: Readonly<GameState>,
  content: GameContent,
  directorate: Directorate,
  occupant: string,
): Appointment {
  const c = content.calibration;
  const previous = directorateOccupant(state, directorate);
  let blocs = allRelations(state, content);
  let capitalDelta = 0;
  const names = new Map(content.scenario.blocs.map((b) => [b.id, b.name]));
  const who = (o: string) => (isPartisan(o) ? `indicação do bloco ${names.get(o) ?? o}` : 'quadro técnico');

  if (isPartisan(previous)) {
    blocs = shiftRelation(blocs, previous, c.relacao_demissao_diretoria * directorate.weight);
    capitalDelta += c.capital_demissao_diretoria;
  }
  if (isPartisan(occupant)) blocs = shiftRelation(blocs, occupant, c.relacao_nomeacao_diretoria * directorate.weight);

  const directorates = [
    ...(state.congress.directorates ?? []).filter((d) => d.id !== directorate.id),
    { id: directorate.id, occupant, since: state.monthIndex },
  ];
  return {
    congress: { ...state.congress, blocs, directorates },
    capitalDelta,
    note: `${directorate.name}: sai ${who(previous)}, entra ${who(occupant)}.`,
  };
}

/** Devolve ao quadro técnico a diretoria do escândalo, se ela ainda for de bloco. */
export function dismissDirector(
  state: Readonly<GameState>,
  content: GameContent,
  directorateId: string | undefined,
): Appointment | null {
  const directorate = directoratesOf(content).find((d) => d.id === directorateId);
  if (!directorate || !isPartisan(directorateOccupant(state, directorate))) return null;
  return appointDirector(state, content, directorate, TECHNICAL_OCCUPANT);
}

/** Texto da causa do escândalo para o relatório: a diretoria, o bloco e o tempo no cargo. */
export function directorateScandalNote(
  state: Readonly<GameState>,
  content: GameContent,
  directorate: Directorate,
): string {
  const occupant = directorateOccupant(state, directorate);
  const bloc = content.scenario.blocs.find((b) => b.id === occupant)?.name ?? occupant;
  const months = Math.max(0, state.monthIndex - directorateSince(state, directorate));
  const tenure = months === 0 ? 'recém-nomeada' : months === 1 ? 'há 1 mês no cargo' : `há ${months} meses no cargo`;
  const gate = isClosedGate(state, content, directorate) ? ', com o ministério nas mãos do mesmo bloco' : '';
  return `Escândalo: ${directorate.name}, indicação do bloco ${bloc} ${tenure}${gate}.`;
}
