import type { Bloc } from '../../types/scenario';
import { NOMINATE_JUSTICE_ACTION_ID } from '../actions';
import type { CourtNomineeProfile, CourtState, CourtVacancy, GameContent, GameState, StepContext } from '../types';

import { cabinetSupport } from './cabinet';
import { expectedBlocYes, SENATE_ABSOLUTE_MAJORITY, seatsOf, voteWithSupport } from './congress';
import { blocRelation, RELACAO_ESCALA } from './relations';

/**
 * STF: vagas, indicação e aprovação no Senado (PLANO_CAMPANHA.md Fase C6d; POLITICAL_RULES.md §8.1). Três coisas
 * separadas:
 * - **vaga**: abre no mês do calendário do cenário (aposentadoria compulsória ou saída antecipada). O estado não
 *   guarda idade de ninguém: a data da vaga é dado do cenário;
 * - **indicação**: ação de agenda do presidente, com o perfil do indicado (jurista de carreira ou aliado do governo);
 * - **aprovação**: sabatina e votação no plenário do Senado no mês seguinte, com maioria absoluta (CF art. 101). O
 *   apoio de cada bloco segue o das votações (relação, pastas, popularidade), mais um termo do perfil. Rejeitada, a
 *   vaga volta a ficar aberta.
 *
 * A decisão judicial (ADI e liminar, §8) **não muda**: quem o governo indicou não altera a liminar nesta fase.
 * Sem `institutions.supremeCourt` no cenário, o sistema fica desligado.
 */

const MESES_SABATINA = 1;
const APROVACAO_NEUTRA = 0.5;
const DISTANCIA_IDEOLOGICA_MAXIMA = 4;

export const NOMINEE_LABEL: Record<CourtNomineeProfile, string> = {
  jurista: 'jurista de carreira',
  aliado: 'aliado do governo',
};

export function courtCalendar(content: GameContent) {
  return content.scenario.institutions?.supremeCourt?.vacancies ?? [];
}

export function courtVacancies(state: Readonly<GameState>): CourtVacancy[] {
  return state.court?.vacancies ?? [];
}

/** Quantas vagas o governo já preencheu no mandato. */
export function appointedJustices(state: Readonly<GameState>): number {
  return courtVacancies(state).filter((v) => v.status === 'preenchida').length;
}

/** Afinidade do bloco com o perfil ideológico do governo (−1 … 1). */
function governmentAffinity(state: Readonly<GameState>, bloc: Bloc): number {
  const p = state.government.profile;
  const distance = Math.abs(bloc.ideology.economic - p.economic) + Math.abs(bloc.ideology.social - p.social);
  return 1 - (2 * distance) / DISTANCIA_IDEOLOGICA_MAXIMA;
}

/**
 * Apoio do bloco à indicação: lealdade ao governo (relação e pastas), popularidade do presidente e o perfil. O
 * jurista de carreira tem apoio próprio (`stf_apoio_jurista`); o aliado depende da afinidade ideológica do bloco
 * com o governo (`w_ideo`), mais `stf_apoio_aliado`.
 */
export function nomineeSupport(
  state: Readonly<GameState>,
  bloc: Bloc,
  profile: CourtNomineeProfile,
  content: GameContent,
): number {
  const c = content.calibration;
  const loyalty = c.w_rel * (blocRelation(state, bloc) / RELACAO_ESCALA) + cabinetSupport(state, bloc.id, content);
  const opinion = c.w_opiniao * (state.indicators.approval - APROVACAO_NEUTRA);
  const casual = state.difficulty === 'casual' ? c.bonus_casual : 0;
  const profileTerm =
    profile === 'jurista' ? c.stf_apoio_jurista : c.stf_apoio_aliado + c.w_ideo * governmentAffinity(state, bloc);
  return loyalty + opinion + casual + profileTerm;
}

/** Votos "sim" esperados no Senado, sem sorteio (previsão mostrada antes de indicar). */
export function expectedNominationYes(
  state: Readonly<GameState>,
  profile: CourtNomineeProfile,
  content: GameContent,
): number {
  const c = content.calibration;
  return content.scenario.blocs.reduce(
    (n, bloc) =>
      n + expectedBlocYes(nomineeSupport(state, bloc, profile, content), seatsOf(bloc, 'senado'), bloc.cohesion, c),
    0,
  );
}

function reasonText(reason: string): string {
  return reason === 'aposentadoria_compulsoria' ? 'aposentadoria compulsória' : 'saída antecipada';
}

/**
 * Etapa mensal do STF, chamada pelo gabinete: abre as vagas do calendário, faz as sabatinas marcadas para o mês e
 * registra as indicações decididas no mês (a votação delas é no mês seguinte). Sem calendário, devolve o mesmo estado.
 */
export function advanceCourt(state: GameState, ctx: StepContext): GameState {
  const calendar = courtCalendar(ctx.content);
  if (calendar.length === 0) return state;
  const t = state.monthIndex;
  const c = ctx.content.calibration;
  const vacancies: CourtVacancy[] = courtVacancies(state).map((v) => ({ ...v }));
  let capital = state.resources.politicalCapital;

  for (const entry of calendar) {
    if (entry.monthIndex > t || vacancies.some((v) => v.id === entry.id)) continue;
    vacancies.push({ id: entry.id, openedMonth: t, status: 'aberta', rejections: 0 });
    ctx.draft.notes.push(
      `Abriu uma vaga no STF por ${reasonText(entry.reason)}. A indicação é do presidente e exige maioria absoluta do Senado.`,
    );
  }

  for (const v of vacancies) {
    if (v.status !== 'em_sabatina' || v.hearingMonth === undefined || v.hearingMonth > t || !v.nominee) continue;
    const profile = v.nominee;
    const vote = voteWithSupport(
      state,
      { house: 'senado', round: 1, required: SENATE_ABSOLUTE_MAJORITY },
      (bloc) => nomineeSupport(state, bloc, profile, ctx.content),
      ctx.content,
      ctx.rng,
    );
    v.lastVote = { monthIndex: t, yes: vote.yes, required: vote.required, approved: vote.approved };
    delete v.hearingMonth;
    if (vote.approved) {
      v.status = 'preenchida';
      capital += c.stf_capital_aprovada;
      ctx.draft.notes.push(
        `Senado aprovou a indicação ao STF (${NOMINEE_LABEL[profile]}): ${vote.yes} votos, eram necessários ${vote.required}.`,
      );
    } else {
      v.status = 'aberta';
      v.rejections += 1;
      delete v.nominee;
      capital += c.stf_capital_rejeitada;
      ctx.draft.notes.push(
        `Senado rejeitou a indicação ao STF (${NOMINEE_LABEL[profile]}): ${vote.yes} votos, eram necessários ${vote.required}. A vaga segue aberta.`,
      );
    }
  }

  for (const d of ctx.decisions) {
    if (d.policyId !== NOMINATE_JUSTICE_ACTION_ID) continue;
    const v = vacancies.find((x) => x.id === d.params?.vacancyId);
    const profile = d.params?.profile;
    if (!v || v.status !== 'aberta' || (profile !== 'jurista' && profile !== 'aliado')) continue;
    v.status = 'em_sabatina';
    v.nominee = profile;
    v.hearingMonth = t + MESES_SABATINA;
    ctx.draft.notes.push(`Indicação ao STF enviada ao Senado (${NOMINEE_LABEL[profile]}); sabatina no mês seguinte.`);
  }

  if (vacancies.length === 0) return state;
  const court: CourtState = { vacancies };
  return {
    ...state,
    court,
    resources: { ...state.resources, politicalCapital: Math.min(100, Math.max(0, capital)) },
  };
}
