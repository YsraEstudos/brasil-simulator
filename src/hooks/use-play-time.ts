import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { gameStore } from '@/store';
import { createPlayTimeTracker, type PlayTimeTracker } from '@/store/playTime';

/**
 * Tempo de jogo na interface (PLANO_MENU_SAVES_CONFIG.md, Fase M2): liga o contador puro (`store/playTime.ts`) ao
 * relógio, ao estado do app e ao foco das telas do jogo. Conta só com o app em primeiro plano **e** o grupo `(jogo)`
 * em foco: "Voltar ao menu principal" empilha o menu por cima sem desmontar o jogo, então só o foco diz que o
 * jogador saiu da partida. Grava o acumulado na partida a que ele pertence ao parar de contar, ao trocar de partida e
 * ao encerrar um mês.
 *
 * Use-o no layout do grupo `(jogo)` e `onActivity` no contêiner das telas (`onTouchStart`): registra toques sem
 * capturá-los.
 */
export function usePlayTime(): { onActivity: () => void } {
  const [tracker] = useState<PlayTimeTracker>(createPlayTimeTracker);
  const appActive = useRef(AppState.currentState === 'active');
  const focused = useRef(false);
  const running = useRef(false);
  // Partida a que o tempo acumulado pertence agora, e o mês dela (para ver quando um mês foi encerrado).
  const campaignId = useRef<string | null>(gameStore.getState().active?.id ?? null);
  const month = useRef<number | null>(gameStore.getState().active?.state.monthIndex ?? null);

  /** Soma o trecho até agora e grava o acumulado na partida atual (a anterior, quando a troca já aconteceu). */
  const settle = useCallback(() => {
    if (running.current) tracker.activity(Date.now());
    const ms = tracker.take();
    if (ms > 0 && campaignId.current) void gameStore.getState().recordPlayTime(ms, campaignId.current);
  }, [tracker]);

  /** Liga ou desliga a contagem conforme app ativo + jogo em foco; ao desligar, grava. */
  const sync = useCallback(() => {
    const shouldRun = appActive.current && focused.current;
    if (shouldRun === running.current) return;
    if (shouldRun) {
      running.current = true;
      tracker.resume(Date.now());
    } else {
      settle();
      running.current = false;
      tracker.pause(Date.now());
    }
  }, [settle, tracker]);

  const onActivity = useCallback(() => {
    if (running.current) tracker.activity(Date.now());
  }, [tracker]);

  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      sync();
      return () => {
        focused.current = false;
        sync();
      };
    }, [sync]),
  );

  useEffect(() => {
    // Troca de partida ou fim de mês: o que já foi jogado vai para a partida de antes, e a contagem segue.
    const unsubscribe = gameStore.subscribe((state) => {
      const id = state.active?.id ?? null;
      const current = state.active?.state.monthIndex ?? null;
      if (id === campaignId.current && current === month.current) return;
      settle();
      campaignId.current = id;
      month.current = current;
    });

    const appState = AppState.addEventListener('change', (next) => {
      appActive.current = next === 'active';
      sync();
    });

    return () => {
      unsubscribe();
      appState.remove();
      focused.current = false;
      sync();
    };
  }, [settle, sync]);

  return { onActivity };
}
