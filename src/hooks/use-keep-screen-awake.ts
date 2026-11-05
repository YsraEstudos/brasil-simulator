import { activateKeepAwakeAsync, deactivateKeepAwake, isAvailableAsync } from 'expo-keep-awake';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

const TAG = 'brasil-painel';

/**
 * Mantém a tela acesa enquanto `active` (PLANO_SAVES_HISTORICO.md H1, B11): no aparelho pelo `expo-keep-awake`, no
 * navegador pela Wake Lock API (o próprio módulo usa ela). O navegador solta a trava quando a aba some, então ela é
 * pedida de novo quando o app volta ao primeiro plano. Sem suporte, não faz nada.
 */
export function useKeepScreenAwake(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    // Fila: o desligar espera o ligar terminar, para não sobrar trava acesa depois de sair do Painel.
    let queue: Promise<unknown> = isAvailableAsync().catch(() => false);
    let available = false;
    const activate = () => {
      queue = queue
        .then((ok) => {
          if (typeof ok === 'boolean') available = ok;
          return !cancelled && available ? activateKeepAwakeAsync(TAG) : undefined;
        })
        .catch(() => undefined);
    };
    activate();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && !cancelled) activate();
    });
    return () => {
      cancelled = true;
      sub.remove();
      void queue.then(() => (available ? deactivateKeepAwake(TAG) : undefined)).catch(() => undefined);
    };
  }, [active]);
}

/** O aparelho deixa manter a tela acesa? `null` enquanto não respondeu (para a legenda das Configurações). */
export function useKeepAwakeAvailable(): boolean | null {
  const [available, setAvailable] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    isAvailableAsync()
      .then((ok) => alive && setAvailable(ok))
      .catch(() => alive && setAvailable(false));
    return () => {
      alive = false;
    };
  }, []);
  return available;
}
