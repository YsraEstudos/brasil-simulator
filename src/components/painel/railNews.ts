import type { RailSheetId } from './mesaNav';

/**
 * Pontos de novidade nos trilhos (PLANO_SAVES_HISTORICO.md, Fase H7, B24): o relatório do mês que o jogador ainda
 * não abriu e a troca de ocupante de algum ministério desde a última vez que ele olhou a gaveta. O "visto" fica na
 * memória do app, por partida. Puro.
 */

export interface RailSeen {
  /** Último mês de relatório aberto; −1 = nenhum. */
  report: number;
  /** Ocupantes dos ministérios da última vez que a gaveta foi aberta (ou quando a partida foi aberta). */
  ministries: string;
}

/** Assinatura dos ocupantes: muda quando qualquer pasta troca de mãos. */
export function ministrySignature(ministries: readonly { id: string; occupant: string }[]): string {
  return ministries.map((m) => `${m.id}=${m.occupant}`).join(';');
}

/** O que está novo em cada botão de trilho, com o texto para o leitor de tela. */
export function railNews(input: {
  reportMonth: number | null;
  ministries: string;
  seen: RailSeen;
}): Partial<Record<RailSheetId, string>> {
  const news: Partial<Record<RailSheetId, string>> = {};
  if (input.reportMonth !== null && input.reportMonth > input.seen.report) news.relatorio = 'relatório novo';
  if (input.ministries !== input.seen.ministries) news.ministerios = 'ministério com novo ocupante';
  return news;
}
