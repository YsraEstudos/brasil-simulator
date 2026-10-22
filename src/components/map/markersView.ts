import { formatEventText, type GameContent, type GameState } from '@/engine';
import type { GlobeMarker, MarkerKind } from '@/globe/markers';
import { UF_IDS } from '@/types/regions';

/**
 * Marcadores de eventos e notícias no mapa (PLANO_GLOBO.md §3.4 e §7, PR 11): o que o globo 3D e o mapa 2D desenham, a
 * partir do estado da partida. Funções puras (sem React, sem RNG, sem data): o `RegionalMapViewModel` carrega o
 * resultado para os dois renderizadores.
 *
 * Regras:
 *  - **Local.** Só quem tem local congelado no disparo (`location`, PR 9) vira marcador; fica na UF principal
 *    (`primaryUf`, ou a primeira atingida). Evento ou notícia **nacional** (sem local) **não tem marcador**: continua
 *    na caixa de entrada (Alertas) e nas Notícias — uma bolinha sobre o Brasil inteiro não diz onde olhar.
 *  - **Itens.** Evento pendente (responde-se na folha Alertas) e notícia do último mês processado (lê-se no jornal).
 *    Notícia de um evento que ainda está pendente é omitida: o marcador do evento já leva ao mesmo assunto.
 *  - **Crítico.** Evento cuja severidade na UF do marcador (`severityByUf`, 0–1, gravada no disparo) chega a
 *    `MARKER_CRITICAL_SEVERITY`. Evento sem severidade gravada e notícia nunca são críticos.
 *  - **Grupo.** Um marcador por UF, com o número de itens quando há mais de um; o crítico manda na cor, no glifo e na
 *    prioridade da colisão (`globe/markers.ts`).
 *  - **Novo crítico.** Evento crítico cuja instância (`evento#mês`) ainda não pulsou nesta sessão da campanha: só ele
 *    ganha o pulso breve (`globe/markerPulse.ts`); depois fica estático, e voltar à tela não repete.
 */

/** Severidade (0–1) a partir da qual o evento é crítico. Os eventos de seca disparam a partir de 0,70 e os de cheia a partir de 0,25. */
export const MARKER_CRITICAL_SEVERITY = 0.6;

/** Um evento ou uma notícia no mapa, antes de agrupar. */
export interface MarkerItem {
  /** `evento:${instanceId}` ou `noticia:${newsId}`: estável e único. */
  id: string;
  kind: MarkerKind;
  sigla: string;
  critical: boolean;
  /** Severidade da UF no local congelado (0 sem severidade gravada). */
  severity: number;
  title: string;
  /** Evento pendente: a instância (`evento#mês`) que a folha Alertas abre. */
  instanceId?: string;
  /** Notícia: o id que o jornal abre. */
  newsId?: string;
}

/** O marcador de uma UF: o que o desenho precisa (`GlobeMarker`) mais os itens e o texto de acessibilidade. */
export interface MapMarker extends GlobeMarker {
  /** `marker:${sigla}`. */
  id: string;
  /** Os itens do grupo, o mais importante primeiro (ver `compareItems`). */
  items: readonly MarkerItem[];
  /** Rótulo de acessibilidade (pt-BR) do ícone no mapa 2D. */
  label: string;
}

const UF_ORDER: readonly string[] = UF_IDS;

/** A UF do marcador: a principal do local, ou a primeira atingida; `undefined` se o local não tem UF conhecida. */
function markerUf(location: { affectedUfs: readonly string[]; primaryUf?: string }): string | undefined {
  const uf = location.primaryUf ?? location.affectedUfs[0];
  return uf !== undefined && UF_ORDER.includes(uf) ? uf : undefined;
}

type MarkerState = Pick<GameState, 'monthIndex'> & { events: Pick<GameState['events'], 'pending' | 'news'> };

/**
 * Eventos pendentes e notícias do último mês processado que têm local, um item cada. Eventos pendentes cujo conteúdo
 * sumiu do cenário caem fora (como na caixa de entrada). Ordem: a do estado (pendentes, depois notícias).
 */
export function buildMarkerItems(state: MarkerState, content: Pick<GameContent, 'events' | 'scenario'>): MarkerItem[] {
  const items: MarkerItem[] = [];
  const pendingInstances = new Set<string>();
  for (const pending of state.events.pending) {
    const event = content.events.find((e) => e.id === pending.eventId);
    if (!event) continue;
    pendingInstances.add(pending.instanceId);
    const location = pending.location;
    const sigla = location && markerUf(location);
    if (!location || !sigla) continue;
    const severity = location.severityByUf?.[sigla] ?? 0;
    items.push({
      id: `evento:${pending.instanceId}`,
      kind: 'event',
      sigla,
      critical: severity >= MARKER_CRITICAL_SEVERITY,
      severity,
      title: formatEventText(event.title, location, content),
      instanceId: pending.instanceId,
    });
  }
  const latest = state.monthIndex - 1;
  for (const news of state.events.news) {
    if (news.monthIndex !== latest || !news.location) continue;
    if (news.instanceId !== undefined && pendingInstances.has(news.instanceId)) continue;
    const sigla = markerUf(news.location);
    if (!sigla) continue;
    items.push({
      id: `noticia:${news.id}`,
      kind: 'news',
      sigla,
      critical: false,
      severity: news.location.severityByUf?.[sigla] ?? 0,
      title: news.headline,
      newsId: news.id,
    });
  }
  return items;
}

/** Crítico primeiro, depois evento antes de notícia, depois a maior severidade e, por fim, o id (ordem total e estável). */
export function compareItems(a: MarkerItem, b: MarkerItem): number {
  return (
    Number(b.critical) - Number(a.critical) ||
    Number(b.kind === 'event') - Number(a.kind === 'event') ||
    b.severity - a.severity ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

const KIND_LABEL = { critical: 'Evento crítico', event: 'Evento', news: 'Notícia' } as const;

/** "Evento crítico: Seca no Nordeste, CE" — o rótulo de acessibilidade de um item. */
export function itemLabel(item: MarkerItem): string {
  const kind = item.critical ? KIND_LABEL.critical : KIND_LABEL[item.kind];
  return `${kind}: ${item.title}, ${item.sigla}`;
}

/** Rótulo de acessibilidade do marcador: o item, ou o número de itens da UF com o primeiro. */
export function markerLabel(items: readonly MarkerItem[]): string {
  const [first] = items;
  if (items.length <= 1) return itemLabel(first);
  return `${items.length} itens em ${first.sigla}, o primeiro: ${itemLabel(first)}`;
}

/** Instâncias de eventos críticos dos itens (o que pode pulsar). */
function criticalInstances(items: readonly MarkerItem[]): string[] {
  return items.flatMap((i) => (i.critical && i.instanceId !== undefined ? [i.instanceId] : []));
}

/**
 * Instâncias de eventos críticos ainda não vistas em `seen`: as que merecem o pulso. Não altera `seen` — quem consome
 * (a tela) registra depois.
 */
export function newCriticalInstances(items: readonly MarkerItem[], seen: ReadonlySet<string>): string[] {
  return criticalInstances(items).filter((id) => !seen.has(id));
}

/**
 * Um marcador por UF, na ordem de `UF_IDS` (determinístico). `pulsing` = instâncias de eventos críticos novos: o
 * marcador pulsa se algum dos itens dele está aí.
 */
export function groupMarkers(items: readonly MarkerItem[], pulsing: ReadonlySet<string> = new Set()): MapMarker[] {
  const byUf = new Map<string, MarkerItem[]>();
  for (const item of items) {
    const list = byUf.get(item.sigla);
    if (list) list.push(item);
    else byUf.set(item.sigla, [item]);
  }
  return UF_ORDER.flatMap((sigla) => {
    const group = byUf.get(sigla);
    if (!group) return [];
    const sorted = [...group].sort(compareItems);
    const critical = sorted.some((i) => i.critical);
    return [
      {
        id: `marker:${sigla}`,
        sigla,
        kind: sorted.some((i) => i.kind === 'event') ? 'event' : 'news',
        critical,
        count: sorted.length,
        pulse: criticalInstances(sorted).some((id) => pulsing.has(id)),
        items: sorted,
        label: markerLabel(sorted),
      },
    ];
  });
}

/**
 * Chave estável do que pulsa (vazia = nada): as instâncias dos eventos críticos dos marcadores que pulsam. Muda quando
 * entra um novo crítico, mesmo numa UF que já pulsava, e é o que dispara o pulso breve nos renderizadores.
 */
export function markerPulseKey(markers: readonly MapMarker[]): string {
  return markers
    .filter((m) => m.pulse)
    .flatMap((m) => criticalInstances(m.items))
    .sort()
    .join('|');
}

/**
 * O item a abrir no toque: o primeiro do grupo (crítico primeiro) ou, se o toque anterior abriu `lastOpenedId`, o
 * seguinte — tocar de novo percorre o grupo e volta ao primeiro. `lastOpenedId` fora do grupo vale como primeiro toque.
 */
export function nextMarkerItem(marker: MapMarker, lastOpenedId?: string): MarkerItem {
  const at = lastOpenedId === undefined ? -1 : marker.items.findIndex((i) => i.id === lastOpenedId);
  return marker.items[(at + 1) % marker.items.length];
}
