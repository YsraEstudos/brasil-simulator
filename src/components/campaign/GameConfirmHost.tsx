import { cancelPending, confirmPending, usePendingConfirm } from './gameConfirm';
import { ConfirmSheet } from './SetupBits';

/** Desenha a pergunta pendente de `gameConfirm` sobre as telas do jogo (montado uma vez, no layout do grupo). */
export function GameConfirmHost() {
  const pending = usePendingConfirm();
  if (!pending) return null;
  return (
    <ConfirmSheet
      title={pending.title}
      message={pending.message}
      confirmLabel={pending.confirmLabel}
      danger={pending.danger}
      onConfirm={confirmPending}
      onCancel={cancelPending}
    />
  );
}
