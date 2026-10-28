import { monthOfTerm, termOf } from '../calendar';
import { appendNews } from '../news';
import type { AdministrationIdentity, MonthStep, NewsItem } from '../types';

import { initialAdministration, presidentName, successorId } from './identity';

/**
 * Transição presidencial sem reset (PLANO_EXPANSAO EX-16). No primeiro mês de um novo mandato (48, 96, ...), abre a
 * administração seguinte e fecha a anterior. **Nada do país é recriado**: economia, sociedade, regiões, Congresso,
 * propostas, dívida, PPA/LDO/LOA e a carteira de obras continuam os mesmos objetos; só muda quem ocupa a Presidência.
 *
 * A eleição que decide o mandato é a do mês 45 do mandato anterior (`PresidentialElection`). Reeleito: o mesmo
 * personagem segue e `consecutiveTerm` sobe; sucessão: assume o vencedor registrado na eleição e o controle passa
 * para ele (EX-17). Sem vitória não há transição — a derrota encerra a campanha em `campaignOutcome` — e um mandato
 * pulado também não abre administração: o histórico é sempre contíguo.
 */
export const presidentialTransitionStep: MonthStep = (state, ctx) => {
  if (state.monthIndex === 0 || monthOfTerm(state.monthIndex) !== 0) return { state, contributions: [] };
  if (!ctx.content.scenario.elections) return { state, contributions: [] };
  const geral = state.politics?.eleicao_geral;
  if (!geral?.venceu) return { state, contributions: [] };

  const termIndex = termOf(state.monthIndex);
  // A eleição que decide este mandato é a do mandato anterior; registro de outro pleito não abre administração.
  if (termOf(geral.monthIndex) !== termIndex - 1) return { state, contributions: [] };

  const history = state.administrations ?? [];
  const current = history.at(-1) ?? initialAdministration(ctx.content, state.career?.profileId);
  // Só o mandato imediatamente seguinte abre administração: se um mandato foi pulado (o governo anterior terminou
  // sem sucessor legítimo), a eleição seguinte não pode ressuscitar a partida nem deixar buraco no histórico. Também
  // cobre a idempotência: depois da transição, `current.termIndex` já é este mandato.
  if (current.termIndex !== termIndex - 1) return { state, contributions: [] };

  const reelected = geral.candidatura;
  const presidentId = reelected
    ? current.presidentId
    : (geral.winnerId ?? successorId(geral.winnerBlocId ?? current.blocId));
  const blocId = reelected ? current.blocId : (geral.winnerBlocId ?? current.blocId);

  const next: AdministrationIdentity = {
    id: `mandato#${termIndex}`,
    presidentId,
    blocId,
    startedAtMonth: state.monthIndex,
    termIndex,
    consecutiveTerm: reelected ? current.consecutiveTerm + 1 : 1,
    origin: reelected ? 'reeleicao' : 'sucessao',
  };
  const closed: AdministrationIdentity = { ...current, endedAtMonth: state.monthIndex };
  const administrations = [...(history.length > 0 ? history.slice(0, -1) : []), closed, next];
  const nome = presidentName(next, ctx.content);

  const news: NewsItem = {
    id: `posse_${termIndex}`,
    monthIndex: state.monthIndex,
    kind: 'institucional',
    tone: 'neutra',
    headline: reelected ? `${nome} inicia o ${next.consecutiveTerm}º mandato` : `${nome} assume a Presidência`,
    cause: reelected
      ? 'Causa: a eleição geral confirmou a reeleição.'
      : 'Causa: a eleição geral elegeu o sucessor e a transição de governo terminou.',
    sourceId: 'posse_presidencial',
  };
  ctx.draft.notes.push(
    reelected
      ? `Posse: ${nome} inicia o ${next.consecutiveTerm}º mandato; o país continua o mesmo.`
      : `Posse: ${nome} assume a Presidência; o país, as obras e as leis continuam os mesmos.`,
  );

  return {
    state: appendNews(
      {
        ...state,
        administrations,
        control: { controlledCharacterId: presidentId, careerMode: 'presidencial' },
      },
      [news],
    ),
    contributions: [],
  };
};
