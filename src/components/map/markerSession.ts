import { PULSE_TOTAL_MS } from '@/globe/markerPulse';

import { newCriticalInstances, type MarkerItem } from './markersView';

/**
 * Memória da sessão para o pulso dos marcadores (PLANO_GLOBO.md §7, PR 11): quais eventos críticos já pulsaram e quais
 * pulsam agora, por partida. Fica fora do React de propósito — sair do Painel (menu, subtelas) e voltar não repete o
 * pulso; fechar o aplicativo zera ("primeira vez nesta sessão"). A tela lê por `useSyncExternalStore`.
 */

const NONE: readonly string[] = [];

const seenByCampaign = new Map<string, Set<string>>();
const pulsingByCampaign = new Map<string, readonly string[]>();
const listeners = new Set<() => void>();
/** Fim do pulso de cada instância nova, por `partida|instância`: depois do anel, ela para mesmo seguindo no mapa. */
const endTimers = new Map<string, ReturnType<typeof setTimeout>>();

/** Instâncias (`evento#mês`) que pulsam agora na partida; a mesma referência enquanto nada muda. */
export function pulsingInstances(campaignId: string): readonly string[] {
  return pulsingByCampaign.get(campaignId) ?? NONE;
}

export function subscribeMarkerSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function setPulsing(campaignId: string, next: readonly string[]): void {
  const prev = pulsingInstances(campaignId);
  if (next.length === prev.length && next.every((id, k) => id === prev[k])) return;
  pulsingByCampaign.set(campaignId, next.length === 0 ? NONE : next);
  for (const listener of [...listeners]) listener();
}

function endPulse(campaignId: string, instanceId: string): void {
  endTimers.delete(`${campaignId}|${instanceId}`);
  setPulsing(
    campaignId,
    pulsingInstances(campaignId).filter((id) => id !== instanceId),
  );
}

/**
 * Registra o que a partida mostra agora: os eventos críticos que a sessão ainda não viu passam a pulsar (e ficam
 * vistos). Cada pulso dura o anel inteiro (`PULSE_TOTAL_MS`) e para sozinho, mesmo que o evento siga no mapa; sair do
 * mapa (outro mês, evento respondido) também tira o pulso. Chamar de novo com os mesmos itens não muda nada — o efeito
 * do React pode rodar duas vezes seguidas.
 */
export function claimNewCritical(campaignId: string, items: readonly MarkerItem[]): void {
  let seen = seenByCampaign.get(campaignId);
  if (!seen) {
    seen = new Set();
    seenByCampaign.set(campaignId, seen);
  }
  const fresh = newCriticalInstances(items, seen);
  for (const id of fresh) {
    seen.add(id);
    const key = `${campaignId}|${id}`;
    endTimers.set(
      key,
      setTimeout(() => endPulse(campaignId, id), PULSE_TOTAL_MS),
    );
  }
  const present = new Set(items.flatMap((i) => (i.instanceId === undefined ? [] : [i.instanceId])));
  const prev = pulsingInstances(campaignId);
  setPulsing(campaignId, [...prev.filter((id) => present.has(id)), ...fresh]);
}

/** Zera a memória (testes e troca de usuário). */
export function resetMarkerSession(): void {
  seenByCampaign.clear();
  pulsingByCampaign.clear();
  for (const timer of endTimers.values()) clearTimeout(timer);
  endTimers.clear();
  for (const listener of [...listeners]) listener();
}
