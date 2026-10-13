/**
 * Ações de agenda: decisões que não viram proposta (não têm tramitação nem execução), mas custam pontos de
 * agenda e produzem efeito no mesmo mês (GAME_DESIGN.md §4.3). O id é usado em `Decision.policyId`.
 */
export interface AgendaAction {
  id: string;
  name: string;
  summary: string;
  agendaCost: number;
}

export const PRESSURE_ACTION_ID = 'pressionar_banco_central';

export const AGENDA_ACTIONS: Readonly<Record<string, AgendaAction>> = {
  [PRESSURE_ACTION_ID]: {
    id: PRESSURE_ACTION_ID,
    name: 'Pressionar o Banco Central',
    summary:
      'Cobra publicamente juros menores. O efeito na próxima reunião do Copom depende de quantos diretores este ' +
      'governo já indicou; a credibilidade cai e o mercado cobra prêmio maior, mais ainda se a pressão se repetir.',
    agendaCost: 1,
  },
};

export function isAgendaAction(id: string): boolean {
  return Object.hasOwn(AGENDA_ACTIONS, id);
}
