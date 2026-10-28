import type { CareerTurn } from '../../types/scenario';
import type { CareerState, GameContent, GameState, NewsItem } from '../types';

import { closeCampaignFinance, closeExpandedFinance } from './finance';
import { electedOutcome, isElectionTurn } from './election';

/**
 * Transição e posse com continuidade (PLANO_CAMPANHA.md Fase C5, tarefa C5.3). O estado do governo já nasce com a
 * partida (D-C12: congelado até a posse), então a posse **não** chama `createInitialState`: a semente e o estado do
 * PRNG principal continuam os da criação (nenhuma etapa antes da posse os toca; os sorteios da carreira são por
 * chave), e a linha de base é o ponto da posse na série (§2.3). Na passagem para o governo:
 * - as contas da campanha são encerradas (Fase C3): a dívida vira compromisso com prazo no calendário do mandato;
 * - o caixa 2 é zerado, com o saldo e as entradas canceladas registrados;
 * - o feed do governo começa com a notícia da posse.
 *
 * O que fica para a expansão: relações políticas ajustadas por coligação, vice e concessões; compromissos de campanha.
 */

/** Nota do relatório no turno em que a campanha termina e o próximo é a posse. */
export const INAUGURATION_NOTE = 'Fim da campanha: o próximo turno é a posse, em janeiro de 2027.';

/**
 * A carreira pode chegar à posse: sem turno de eleição no calendário (cenários de teste da transição mínima) ou com
 * a eleição ganha. Derrota encerra a partida antes (`campaignOutcome`).
 */
export function canReachInauguration(career: Pick<CareerState, 'election'>, schedule: readonly CareerTurn[]): boolean {
  if (!schedule.some(isElectionTurn)) return true;
  return career.election !== undefined && electedOutcome(career.election.outcome);
}

/** Encerramento contábil da campanha na passagem para o governo. Função pura. */
export function closeCampaignAccounts(
  career: CareerState,
  difficulty: GameState['difficulty'],
  content: Pick<GameContent, 'scenario'>,
  formalRules = difficulty !== 'casual',
): Pick<CareerState, 'finance' | 'expandedFinance' | 'commitments' | 'illicit'> {
  const finance = career.finance ? closeCampaignFinance(career.finance) : undefined;
  let expandedFinance = career.expandedFinance;
  let commitments = career.commitments;
  if (expandedFinance) {
    const deadline = content.scenario.career?.finance?.expanded?.debtDeadline;
    if (deadline === undefined) throw new RangeError('prazo de dívida ausente');
    const closed = closeExpandedFinance(expandedFinance, difficulty, deadline, formalRules);
    expandedFinance = closed.finance;
    if (closed.commitment) commitments = [...(commitments ?? []), closed.commitment];
  }
  const illicit = career.illicit
    ? {
        ...career.illicit,
        closedBalance: career.illicit.balance,
        balance: 0,
        cancelledPending: career.illicit.pending.reduce((sum, item) => sum + item.amount, 0),
        pending: [],
      }
    : undefined;
  return {
    ...(finance ? { finance } : {}),
    ...(expandedFinance ? { expandedFinance } : {}),
    ...(commitments ? { commitments } : {}),
    ...(illicit ? { illicit } : {}),
  };
}

/** Primeira notícia do governo: a posse (gravada no último turno da campanha, com o período dele). */
export function inaugurationNews(career: Pick<CareerState, 'turnIndex'>, turn: CareerTurn): NewsItem {
  return {
    id: `career_${career.turnIndex}_posse`,
    monthIndex: 0,
    turnIndex: career.turnIndex,
    careerPeriod: turn.to ?? turn.from,
    kind: 'institucional',
    tone: 'neutra',
    headline: 'Equipe eleita conclui a transição e prepara a posse',
    cause: 'Causa: a transição de governo terminou.',
    sourceId: 'posse',
  };
}
