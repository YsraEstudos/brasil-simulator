import type { CampaignSummary } from '@/database/campaignRepository';
import type { Difficulty } from '@/engine';

/**
 * Regras da partida (PLANO_SAVES_HISTORICO.md H3): o que o Modo sem volta (Ironman, B53) e a dificuldade bloqueiam.
 * Cada função devolve o motivo, em texto para o jogador, ou `null` quando a ação vale. A tela mostra o motivo no lugar
 * do botão; a store e o banco conferem de novo.
 */

/** Dificuldades em que dá para voltar ao mês anterior (D34): no Realismo, não. */
export const REWIND_DIFFICULTIES: readonly Difficulty[] = ['casual', 'estrategica'];

export const RULE_REASONS = {
  ironmanDuplicate: 'Modo sem volta (Ironman): esta partida não pode ser duplicada.',
  ironmanSaveAs: 'Modo sem volta (Ironman): sem "Salvar como" nesta partida.',
  ironmanRewind: 'Modo sem volta (Ironman): não dá para voltar o mês.',
  realismRewind: 'No Realismo não dá para voltar o mês.',
  finishedRewind: 'Uma campanha encerrada não volta o mês.',
  firstTurn: 'Ainda não há mês jogado para desfazer.',
  alreadyRewound: 'Este mês já foi desfeito uma vez. Jogue mais um mês para poder voltar de novo.',
} as const;

type RuleCampaign = Pick<CampaignSummary, 'ironman'>;

/** Duplicar no cartão do save. */
export function duplicateBlock(c: RuleCampaign): string | null {
  return c.ironman ? RULE_REASONS.ironmanDuplicate : null;
}

/** "Salvar como…" no ☰ do Painel. */
export function saveAsBlock(c: RuleCampaign): string | null {
  return c.ironman ? RULE_REASONS.ironmanSaveAs : null;
}

/**
 * "Voltar ao mês anterior" (D34, decisão D-H2): só Casual e Estratégica, fora do Ironman, com a campanha ativa, com um
 * turno anterior e sem já ter voltado para ele (uma vez por mês jogado).
 */
export function rewindBlock(c: {
  ironman: boolean;
  difficulty: Difficulty;
  finished: boolean;
  currentTurn: number;
  rewoundTurn: number | null;
}): string | null {
  if (c.ironman) return RULE_REASONS.ironmanRewind;
  if (!REWIND_DIFFICULTIES.includes(c.difficulty)) return RULE_REASONS.realismRewind;
  if (c.finished) return RULE_REASONS.finishedRewind;
  if (c.currentTurn < 1) return RULE_REASONS.firstTurn;
  if (c.rewoundTurn !== null && c.currentTurn - 1 <= c.rewoundTurn) return RULE_REASONS.alreadyRewound;
  return null;
}

/** Pergunta de confirmação do "Voltar ao mês anterior", com o aviso de que os sorteios se repetem. */
export function rewindConfirmMessage(hasDraft: boolean): string {
  const draft = hasDraft ? ' As escolhas ainda não confirmadas deste mês também somem.' : '';
  return (
    'O último mês jogado é desfeito: decisões, eventos, notícias e resultados dele somem do save. A semente é a mesma, ' +
    'então os mesmos sorteios voltam a acontecer. Só dá para voltar um mês, e cada mês só pode ser desfeito uma vez.' +
    draft
  );
}
