import { termOf } from '../calendar';
import { PLAYER_CANDIDATE_ID } from '../career/opponents';
import type { AdministrationIdentity, GameContent, GameState } from '../types';

/**
 * Identidades de administração (PLANO_EXPANSAO §2.1, EX-15). Uma administração é **quem ocupa a Presidência** num
 * mandato; o país (economia, sociedade, Congresso, obras, leis) continua no `GameState` e não é copiado para cá.
 *
 * Funções puras e derivadas: nada aqui sorteia nem move indicador. Sem histórico (`state.administrations` ausente,
 * cenário sem eleições ou save anterior à revisão), a leitura cai na primeira administração e a elegibilidade usa a
 * regra antiga do primeiro mandato, para o comportamento não mudar onde não há eleições.
 */

/** Id do personagem que assume como sucessor de um bloco. */
export function successorId(blocId: string): string {
  return `sucessor:${blocId}`;
}

/** Bloco do perfil de candidato (ou do primeiro perfil do cenário). */
export function playerBlocId(content: Pick<GameContent, 'scenario'>, profileId?: string): string {
  const profiles = content.scenario.career?.profiles ?? [];
  const profile = profileId ? profiles.find((p) => p.id === profileId) : profiles[0];
  return profile?.blocId ?? content.scenario.blocs[0]?.id ?? '';
}

/** Primeira administração: o jogador assume no mandato 0. */
export function initialAdministration(
  content: Pick<GameContent, 'scenario'>,
  profileId?: string,
): AdministrationIdentity {
  return {
    id: 'mandato#0',
    presidentId: PLAYER_CANDIDATE_ID,
    blocId: playerBlocId(content, profileId),
    startedAtMonth: 0,
    termIndex: 0,
    consecutiveTerm: 1,
    origin: 'eleicao',
  };
}

/** Administração que governa agora: a última do histórico ou, sem histórico, a inicial. */
export function currentAdministration(
  state: Readonly<GameState>,
  content: Pick<GameContent, 'scenario'>,
): AdministrationIdentity {
  const history = state.administrations;
  if (history?.length) return history[history.length - 1]!;
  return initialAdministration(content, state.career?.profileId);
}

/** Histórico completo, com a administração inicial quando o estado ainda não tem o campo. */
export function administrationHistory(
  state: Readonly<GameState>,
  content: Pick<GameContent, 'scenario'>,
): AdministrationIdentity[] {
  return state.administrations?.length
    ? state.administrations
    : [initialAdministration(content, state.career?.profileId)];
}

/**
 * Mandatos consecutivos do presidente atual (1 ou 2). Sem histórico, vale a regra antiga: só o primeiro mandato
 * conta como elegível (`termOf === 0`), o que mantém cenários sem eleições e testes antigos idênticos.
 */
export function consecutiveTermsOf(state: Readonly<GameState>): number {
  const history = state.administrations;
  if (!history?.length) return termOf(state.monthIndex) + 1;
  return history[history.length - 1]!.consecutiveTerm;
}

/** O presidente atual pode concorrer à reeleição (CF art. 14 §5º: uma reeleição subsequente). */
export function canRunForReelection(state: Readonly<GameState>): boolean {
  const history = state.administrations;
  if (!history?.length) return termOf(state.monthIndex) === 0;
  return history[history.length - 1]!.consecutiveTerm < 2;
}

/** Nome fictício exibível do ocupante: "Você" para o jogador, o candidato do bloco para o sucessor. */
export function presidentName(
  administration: Pick<AdministrationIdentity, 'presidentId' | 'blocId'>,
  content: Pick<GameContent, 'scenario'>,
): string {
  if (administration.presidentId === PLAYER_CANDIDATE_ID) return 'Você';
  return (
    content.scenario.elections?.candidatos?.find((c) => c.blocId === administration.blocId)?.name ??
    content.scenario.blocs.find((b) => b.id === administration.blocId)?.name ??
    administration.blocId
  );
}

/**
 * Invariante das identidades (EX-15/EX-16): o histórico é contíguo, tem um único mandato aberto no fim e o controle
 * segue quem governa. Mais importante: **dados herdados não são reescritos** — uma administração já registrada só
 * pode ganhar `endedAtMonth`; nenhum campo de identidade muda e nenhuma entrada some.
 */
export function checkAdministrations(prev: Readonly<GameState>, next: Readonly<GameState>): string[] {
  const errors: string[] = [];
  const history = next.administrations;
  if (!history) return errors;
  if (history.length === 0) return ['administrações: histórico vazio'];
  const ids = new Set<string>();
  for (const [index, admin] of history.entries()) {
    if (admin.termIndex !== index) errors.push(`administrações: mandato ${admin.termIndex} na posição ${index}`);
    if (admin.id !== `mandato#${admin.termIndex}`) {
      errors.push(`administrações: id ${admin.id} ≠ mandato#${admin.termIndex}`);
    }
    if (ids.has(admin.id)) errors.push(`administrações: id repetido ${admin.id}`);
    ids.add(admin.id);
    if (admin.consecutiveTerm !== 1 && admin.consecutiveTerm !== 2) {
      errors.push(`administrações: ${admin.consecutiveTerm} mandatos consecutivos em ${admin.id}`);
    }
    if (admin.endedAtMonth !== undefined && admin.endedAtMonth <= admin.startedAtMonth) {
      errors.push(`administrações: ${admin.id} termina antes de começar`);
    }
    const open = admin.endedAtMonth === undefined;
    if (open && index !== history.length - 1) {
      errors.push(`administrações: ${admin.id} segue aberto antes do fim do histórico`);
    }
    const following = history[index + 1];
    if (following && admin.endedAtMonth !== following.startedAtMonth) {
      errors.push(`administrações: ${admin.id} não termina quando ${following.id} começa`);
    }
  }
  const current = history[history.length - 1]!;
  if (next.control && next.control.controlledCharacterId !== current.presidentId) {
    errors.push(`controle em ${next.control.controlledCharacterId}, mas governa ${current.presidentId}`);
  }
  for (const before of prev.administrations ?? []) {
    const after = history.find((admin) => admin.id === before.id);
    if (!after) {
      errors.push(`administrações: ${before.id} desapareceu do histórico`);
      continue;
    }
    for (const field of [
      'presidentId',
      'blocId',
      'startedAtMonth',
      'termIndex',
      'consecutiveTerm',
      'origin',
    ] as const) {
      if (after[field] !== before[field]) errors.push(`administrações: ${before.id} reescreveu ${field}`);
    }
    if (before.endedAtMonth !== undefined && after.endedAtMonth !== before.endedAtMonth) {
      errors.push(`administrações: ${before.id} reescreveu endedAtMonth`);
    }
  }
  return errors;
}
