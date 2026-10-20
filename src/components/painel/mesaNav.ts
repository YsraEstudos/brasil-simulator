import { inVedacaoWindow, monthOfTerm, type GameState, type Proposal } from '@/engine';
import type { ScenarioElections } from '@/types/scenario';

/**
 * Navegação da mesa do Painel (PLANO_PAINEL_UNICO.md §2.4): quais botões ficam em cada trilho, o estado do botão
 * "Encerrar o mês" da doca, os selos da doca e a regra de abertura do relatório. Lógica pura — sem React —, para
 * ser testada à parte.
 */

/** Folhas que um botão de trilho abre (as demais — estado, menu — abrem por outros caminhos). */
export type RailSheetId =
  'alertas' | 'meta' | 'relatorio' | 'eleicoes' | 'camadas' | 'regioes' | 'indicadores' | 'ministerios';

export interface RailEntry {
  id: RailSheetId;
  /** Rótulo de acessibilidade do botão redondo. */
  label: string;
}

/** Trilho esquerdo — "o mês": o que pede resposta e o que aconteceu. */
export const LEFT_RAIL: readonly RailEntry[] = [
  { id: 'alertas', label: 'Alertas e eventos' },
  { id: 'meta', label: 'Meta atual' },
  { id: 'relatorio', label: 'Relatório do mês' },
];

/** Botão de Eleições: entra no trilho esquerdo, depois do relatório, só na janela eleitoral (`electionsRelevant`). */
export const ELECTIONS_ENTRY: RailEntry = { id: 'eleicoes', label: 'Eleições' };

/** Trilho esquerdo com ou sem o botão de Eleições. */
export function leftRail(showElections: boolean): readonly RailEntry[] {
  return showElections ? [...LEFT_RAIL, ELECTIONS_ENTRY] : LEFT_RAIL;
}

/** Trilho direito — "o país": o mapa e os números. O Congresso fica na doca, não aqui. */
export const RIGHT_RAIL: readonly RailEntry[] = [
  { id: 'camadas', label: 'Camadas do mapa' },
  { id: 'regioes', label: 'Visão regional' },
  { id: 'indicadores', label: 'Indicadores' },
  { id: 'ministerios', label: 'Ministérios' },
];

/**
 * `encerrar`: avança o mês; `legado`: campanha terminou, o botão leva ao relatório de legado; `indisponivel`: sem
 * partida (modo demonstração).
 */
export type EndMonthMode = 'encerrar' | 'legado' | 'indisponivel';

export interface EndMonthControl {
  mode: EndMonthMode;
  label: string;
  /** Linha de baixo do botão (ações usadas, aviso ou situação da campanha). */
  caption: string;
  disabled: boolean;
}

/** "2 de 3 ações usadas" (singular quando o limite do mês é 1). */
export function actionsCaption(used: number, max: number): string {
  return `${used} de ${max} ${max === 1 ? 'ação usada' : 'ações usadas'}`;
}

/** Rótulo, legenda e estado do botão dourado da doca. `busy` é o da store (o mês está sendo processado). */
export function endMonthControl(input: {
  hasCampaign: boolean;
  finished: boolean;
  busy: boolean;
  actionsUsed: number;
  actionsMax: number;
}): EndMonthControl {
  if (!input.hasCampaign) {
    return { mode: 'indisponivel', label: 'Encerrar o mês', caption: 'Inicie uma campanha', disabled: true };
  }
  if (input.finished) {
    return { mode: 'legado', label: 'Ver legado', caption: 'Campanha encerrada', disabled: false };
  }
  return {
    mode: 'encerrar',
    label: input.busy ? 'Encerrando…' : 'Encerrar o mês',
    caption: actionsCaption(input.actionsUsed, input.actionsMax),
    disabled: input.busy,
  };
}

/** O mês avançou entre duas leituras da store? (abre o relatório sozinho; recusa de encerramento não abre nada). */
export function monthAdvanced(before: number | undefined, after: number | undefined): boolean {
  return before !== undefined && after !== undefined && after > before;
}

/** Meses depois de cada pleito em que o resultado ainda é notícia da mesa (a folha mostra a eleição apurada). */
export const ELECTION_RESULT_MONTHS = 2;

/**
 * A folha Eleições merece um botão no mês? Só em cenário com `elections` e dentro de uma janela do calendário
 * eleitoral (meses do mandato, que se repetem a cada mandato):
 * - janela de declaração (`janelaDeclaracao`): declarar a reeleição e apoiar um bloco na sucessão;
 * - vedação (`VEDACAO_MESES` antes de cada pleito): o ElectionsCard acompanha a intenção de voto no auge da campanha;
 * - do mês do pleito até `ELECTION_RESULT_MONTHS` depois: o resultado apurado.
 * Fora dessas janelas o cartão só repetiria a pesquisa mensal, que não pede decisão — o botão fica escondido.
 */
export function electionsRelevant(elections: ScenarioElections | undefined, monthIndex: number): boolean {
  if (!elections) return false;
  const month = monthOfTerm(monthIndex);
  const { inicio, fim } = elections.janelaDeclaracao;
  if (month >= inicio && month <= fim) return true;
  if (inVedacaoWindow(elections, month)) return true;
  return [elections.mesEleicaoMunicipal, elections.mesEleicaoGeral].some(
    (pleito) => month >= pleito && month <= pleito + ELECTION_RESULT_MONTHS,
  );
}

/** Etapas da proposta em que o Congresso vota no mês marcado (`voteMonth`): tramitação e veto em apreciação. */
const VOTING_STATUSES: ReadonlySet<string> = new Set(['em_tramitacao', 'apreciacao_veto']);

/** Lei em execução com veto parcial (acréscimos) ainda por apreciar: também vai a voto (a mesma regra do Congresso). */
const pendingPartialVeto = (p: Proposal) => p.status === 'em_execucao' && p.veto !== null && p.veto.overridden === null;

/**
 * Selo do Congresso: propostas com votação marcada para este mês (ou atrasada — a mesma regra do motor, que vota
 * tudo o que tem `voteMonth` ≤ mês). A sanção aguardando fica de fora: ela é decidida em Alertas.
 */
export function congressBadge(state: Readonly<GameState>): number {
  return state.proposals.filter(
    (p) =>
      (VOTING_STATUSES.has(p.status) || pendingPartialVeto(p)) &&
      p.voteMonth !== null &&
      p.voteMonth <= state.monthIndex,
  ).length;
}

/**
 * Selo das Notícias: manchetes do último mês processado, até o jogador abrir a subtela (`seenMonth` é o último mês
 * de notícias que ele viu; `null` = nunca abriu). Sem mês processado ainda, ou depois de visto, não há selo.
 */
export function newsBadge(state: Readonly<GameState>, seenMonth: number | null): number {
  const latest = state.monthIndex - 1;
  if (latest < 0 || (seenMonth !== null && seenMonth >= latest)) return 0;
  return state.events.news.filter((n) => n.monthIndex === latest).length;
}

/**
 * O que a mesa faz depois de "Encerrar o mês": `relatorio` abre a folha do relatório, `legado` leva à subtela do
 * legado (a campanha terminou neste mês) e `nada` deixa tudo como está (recusa de encerramento).
 */
export type EndMonthOutcome = 'nada' | 'relatorio' | 'legado';

export function endMonthOutcome(
  before: number | undefined,
  after: number | undefined,
  finished: boolean,
): EndMonthOutcome {
  if (!monthAdvanced(before, after)) return 'nada';
  return finished ? 'legado' : 'relatorio';
}
