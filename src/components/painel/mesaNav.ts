/**
 * Navegação da mesa do Painel (PLANO_PAINEL_UNICO.md §2.4): quais botões ficam em cada trilho, o estado do botão
 * "Encerrar o mês" da doca e a regra de abertura do relatório. Lógica pura — sem React —, para ser testada à parte.
 */

/** Folhas que um botão de trilho abre (as demais — estado, menu — abrem por outros caminhos). */
export type RailSheetId = 'alertas' | 'meta' | 'relatorio' | 'camadas' | 'regioes' | 'indicadores' | 'ministerios';

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
  return before !== undefined && after !== undefined && after !== before;
}
