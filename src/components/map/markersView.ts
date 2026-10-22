import {
  formatEventText,
  projectUfs,
  VISIT_ACTION_ID,
  type GameContent,
  type GameState,
  type ProjectPhase,
} from '@/engine';
import { MARKER_KIND_ORDER, type GlobeMarker, type MarkerKind } from '@/globe/markers';
import { UF_IDS } from '@/types/regions';

/**
 * Marcadores no mapa (PLANO_GLOBO.md §3.4 e §7, PR 11 e PR 13): o que o globo 3D e o mapa 2D desenham, a partir do
 * estado da partida. Funções puras (sem React, sem RNG, sem data): o `RegionalMapViewModel` carrega o
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
 *  - **Visita presidencial (PR 13).** A ação de agenda "Visitar o estado" fica no `decisionLog`; a UF visitada ganha um
 *    item enquanto o efeito local da visita dura (`meses_visita` meses contados do mês da visita, o mesmo prazo da
 *    aprovação local), sem pulso e nunca crítico. Tocar abre o cartão da UF.
 *  - **Obra (PR 13).** Projeto da carteira ainda em andamento (planejamento, licenciamento, licitação ou obra) vira um item
 *    em cada UF que a **política cita no escopo regional** (`projectUfs`); obra nacional ou de macrorregião não tem pin, e
 *    nunca há coordenadas — o pin fica na âncora da UF. Obra pronta (em operação) sai do mapa e fica só no cartão da
 *    UF. Sem pulso e nunca crítica; tocar abre o cartão da UF.
 *  - **Novo crítico.** Evento crítico cuja instância (`evento#mês`) ainda não pulsou nesta sessão da campanha: só ele
 *    ganha o pulso breve (`globe/markerPulse.ts`); depois fica estático, e voltar à tela não repete.
 */

/** Severidade (0–1) a partir da qual o evento é crítico. Os eventos de seca disparam a partir de 0,70 e os de cheia a partir de 0,25. */
export const MARKER_CRITICAL_SEVERITY = 0.6;

/** Um evento, uma notícia, uma visita ou uma obra no mapa, antes de agrupar. */
export interface MarkerItem {
  /** `evento:${instanceId}`, `noticia:${newsId}`, `visita:${uf}:${mês}` ou `obra:${proposta}:${uf}`: estável e único. */
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

/** O item leva ao cartão da UF (visita presidencial e obra), e não a um alerta ou a uma notícia. */
export function opensStateCard(item: Pick<MarkerItem, 'kind'>): boolean {
  return item.kind === 'visit' || item.kind === 'work';
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

export type MarkerState = Pick<GameState, 'monthIndex'> & {
  events: Pick<GameState['events'], 'pending' | 'news'>;
  /** Visitas presidenciais (PR 13); ausente = nenhuma. */
  decisionLog?: GameState['decisionLog'];
  /** Carteira de projetos (PR 13); ausente = nenhuma obra. */
  publicPolicies?: Pick<GameState['publicPolicies'], 'projects'>;
};

/** Conteúdo que os marcadores leem (política e calibração são opcionais: sem elas não há obra nem visita). */
export type MarkerContent = Pick<GameContent, 'events' | 'scenario'> &
  Partial<Pick<GameContent, 'policies' | 'calibration'>>;

/** Fases da carteira em que a obra ainda não está pronta (as que ganham pin). */
const WORK_PHASES: ReadonlySet<ProjectPhase> = new Set<ProjectPhase>([
  'planejamento',
  'licenciamento',
  'licitacao',
  'obra',
]);

const PHASE_LABEL: Record<string, string> = {
  planejamento: 'em planejamento',
  licenciamento: 'em licenciamento',
  licitacao: 'em licitação',
  obra: 'em obra',
  operacao: 'em operação',
  cancelado: 'cancelada',
};

/** "em obra, 45%" — a fase e, na obra, o avanço físico. */
export function workStatus(project: { phase: ProjectPhase; progress: number }): string {
  const phase = PHASE_LABEL[project.phase] ?? project.phase;
  return project.phase === 'obra' ? `${phase}, ${Math.round(project.progress * 100)}%` : phase;
}

/** "no mês passado" / "há 2 meses": quanto faz que a visita aconteceu (mês do jogo atual menos o mês da visita). */
export function visitAgo(months: number): string {
  return months <= 1 ? 'no mês passado' : `há ${months} meses`;
}

/**
 * Visitas presidenciais ainda valendo: a mais recente por UF cujo efeito local (`meses_visita` meses contados do mês da
 * visita) ainda dura no mês a jogar. A visita do mês corrente só entra depois que o mês é encerrado (vem do
 * `decisionLog`, não do rascunho).
 */
function visitItems(state: MarkerState, content: MarkerContent): MarkerItem[] {
  const window = content.calibration?.meses_visita;
  const ufs = content.scenario.regions?.ufs;
  if (!state.decisionLog || window === undefined || !ufs) return [];
  const latest = new Map<string, number>();
  for (const { monthIndex, decision } of state.decisionLog) {
    if (decision.policyId !== VISIT_ACTION_ID) continue;
    const uf = decision.params?.uf;
    const elapsed = state.monthIndex - monthIndex;
    if (typeof uf !== 'string' || elapsed < 1 || elapsed >= window) continue;
    latest.set(uf, Math.max(latest.get(uf) ?? -1, monthIndex));
  }
  return UF_ORDER.flatMap((sigla): MarkerItem[] => {
    const month = latest.get(sigla);
    const name = ufs.find((u) => u.id === sigla)?.name;
    if (month === undefined || !name) return [];
    return [
      {
        id: `visita:${sigla}:${month}`,
        kind: 'visit',
        sigla,
        critical: false,
        severity: 0,
        title: `Visita presidencial a ${name}, ${visitAgo(state.monthIndex - month)}`,
      },
    ];
  });
}

/** Obras em andamento nas UFs que o conteúdo da política cita (`projectUfs`); nunca coordenadas. */
function workItems(state: MarkerState, content: MarkerContent): MarkerItem[] {
  const ufs = content.scenario.regions?.ufs;
  const projects = state.publicPolicies?.projects;
  if (!projects || !content.policies || !ufs) return [];
  const ids = ufs.map((u) => u.id);
  return projects.flatMap((project) => {
    const policy = content.policies?.[project.policyId];
    if (!policy || !WORK_PHASES.has(project.phase)) return [];
    return projectUfs(policy, ids).map((sigla): MarkerItem => ({
      id: `obra:${project.proposalId}:${sigla}`,
      kind: 'work',
      sigla,
      critical: false,
      severity: 0,
      title: `${policy.name}, ${workStatus(project)}`,
    }));
  });
}

/**
 * Eventos pendentes e notícias do último mês processado que têm local, um item cada, mais as visitas presidenciais
 * recentes e as obras em andamento com UF (PR 13). Eventos pendentes cujo conteúdo sumiu do cenário caem fora (como na
 * caixa de entrada). Ordem: a do estado (pendentes, notícias), depois visitas e obras.
 */
export function buildMarkerItems(state: MarkerState, content: MarkerContent): MarkerItem[] {
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
  items.push(...visitItems(state, content), ...workItems(state, content));
  return items;
}

/**
 * Crítico primeiro, depois a ordem dos tipos (evento, notícia, obra, visita: `MARKER_KIND_ORDER`), depois a maior
 * severidade e, por fim, o id (ordem total e estável).
 */
export function compareItems(a: MarkerItem, b: MarkerItem): number {
  return (
    Number(b.critical) - Number(a.critical) ||
    MARKER_KIND_ORDER.indexOf(a.kind) - MARKER_KIND_ORDER.indexOf(b.kind) ||
    b.severity - a.severity ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

const KIND_LABEL = {
  critical: 'Evento crítico',
  event: 'Evento',
  news: 'Notícia',
  visit: 'Visita',
  work: 'Obra',
} as const;

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
        // O tipo de maior ordem do grupo; `sorted` já vem pela ordem dos tipos, e o crítico (sempre evento) vai primeiro.
        kind: sorted[0].kind,
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
