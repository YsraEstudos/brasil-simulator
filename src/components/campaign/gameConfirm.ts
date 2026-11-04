import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';

import type { Decision, GameContent } from '@/engine';
import { gameStore } from '@/store';

import { irreversibleWarning, type IrreversibleWarning } from './agendaModel';

/**
 * Pergunta de confirmação das telas do jogo (PLANO_QUICK_WINS.md, Fase Q7). Uma só pergunta por vez, desenhada por
 * `GameConfirmHost` sobre a tela inteira: assim qualquer aba (Painel, Gabinete, Congresso) pede confirmação do mesmo
 * jeito, sem o diálogo ficar preso dentro de uma lista com rolagem.
 */
export interface ConfirmRequest extends IrreversibleWarning {
  /** Vermelho: a ação apaga ou não tem volta. */
  danger: boolean;
  onConfirm: () => void;
}

const confirmStore = createStore<{ pending: ConfirmRequest | null }>(() => ({ pending: null }));

export function askConfirm(request: ConfirmRequest): void {
  confirmStore.setState({ pending: request });
}

export function confirmPending(): void {
  const pending = confirmStore.getState().pending;
  confirmStore.setState({ pending: null });
  pending?.onConfirm();
}

export function cancelPending(): void {
  confirmStore.setState({ pending: null });
}

export function usePendingConfirm(): ConfirmRequest | null {
  return useStore(confirmStore, (s) => s.pending);
}

/**
 * Marca ou desmarca a decisão no rascunho; se ela está na lista fechada de irreversíveis (veto total, troca de
 * ministro, PEC) e está entrando na agenda, pergunta antes (B96).
 */
export function requestDecision(decision: Decision, content: GameContent): void {
  const { draft, toggleDecision } = gameStore.getState();
  const warning = irreversibleWarning(decision, draft, content);
  if (!warning) {
    toggleDecision(decision);
    return;
  }
  askConfirm({ ...warning, danger: true, onConfirm: () => gameStore.getState().toggleDecision(decision) });
}
