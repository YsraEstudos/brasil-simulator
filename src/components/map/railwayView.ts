import type { GameContent, GameState } from '@/engine';
import type { GlobeRailLine } from '@/globe/railGeometry';
import type {
  RailwayConfidence,
  RailwayCorridor,
  RailwayGauge,
  RailwayNetwork,
  RailwaySegment,
  RailwayStatus,
  RailwayUsage,
} from '@/types/railways';
import { RAILWAY_STATUSES, RAILWAY_USAGES } from '@/types/railways';

/**
 * Camada Ferrovias do mapa (PLANO_EXPANSAO F10/EX-30). Lógica pura, sem React: o globo 3D e o mapa 2D recebem as
 * mesmas linhas, os mesmos estilos e a mesma legenda, e a folha de lista usa os mesmos filtros — a lista é a
 * alternativa acessível ao desenho.
 *
 * Regra de leitura: **rede existente e proposta do governo nunca se confundem**. As obras da carteira com `railway`
 * ganham uma família de cor própria (verde) e substituem o desenho "planejado" do trecho enquanto existem; só quando
 * a obra entra em operação o trecho é desenhado como ativo.
 */

export type LonLat = readonly [number, number];

/** Situação da obra do governo sobre um trecho. */
export type GovernmentStage = 'proposta' | 'obra' | 'operacao';

export type RailwayStyleId = RailwayStatus | 'governo_feito' | 'governo_falta' | 'governo_proposta';

export interface RailwayStyle {
  label: string;
  color: string;
  /** Contorno escuro por baixo da linha: separa a ferrovia de qualquer mapa de calor. */
  casing: string;
  /** Largura do miolo em px lógicos (o contorno soma `CASING_PX` de cada lado). */
  widthPx: number;
  /** Traço e vão em px lógicos; `null` = linha contínua. Cor e padrão juntos: a situação não depende só da cor. */
  dash: readonly [number, number] | null;
}

export const CASING_PX = 1.5;
const CASING = '#0a0d16';

/** Ordem de desenho: o que está mais embaixo primeiro (desativada) e a obra do governo por cima de tudo. */
export const RAILWAY_STYLE_ORDER: readonly RailwayStyleId[] = [
  'desativada',
  'planejada',
  'em_construcao',
  'parcial',
  'ativa',
  'governo_proposta',
  'governo_falta',
  'governo_feito',
];

export const RAILWAY_STYLES: Readonly<Record<RailwayStyleId, RailwayStyle>> = {
  ativa: { label: 'Ativa', color: '#ffc94d', casing: CASING, widthPx: 3, dash: null },
  parcial: { label: 'Parcialmente ativa', color: '#ffc94d', casing: CASING, widthPx: 3, dash: [9, 5] },
  em_construcao: { label: 'Em construção', color: '#5cc8ff', casing: CASING, widthPx: 2.6, dash: [5, 4] },
  planejada: { label: 'Planejada', color: '#c4cde0', casing: CASING, widthPx: 2, dash: [2, 4] },
  desativada: { label: 'Desativada', color: '#7a8296', casing: CASING, widthPx: 1.6, dash: null },
  governo_feito: { label: 'Obra do governo · executado', color: '#5ef08f', casing: CASING, widthPx: 3.4, dash: null },
  governo_falta: {
    label: 'Obra do governo · a executar',
    color: '#5ef08f',
    casing: CASING,
    widthPx: 3.4,
    dash: [6, 4],
  },
  governo_proposta: {
    label: 'Proposta do governo (em tramitação)',
    color: '#5ef08f',
    casing: CASING,
    // A obra do jogador precisa saltar aos olhos mesmo antes de existir: mais grossa que a rede planejada.
    widthPx: 3.2,
    dash: [3, 3],
  },
};

export const STATUS_LABEL: Readonly<Record<RailwayStatus, string>> = {
  ativa: 'Ativa',
  parcial: 'Parcialmente ativa',
  em_construcao: 'Em construção',
  planejada: 'Planejada',
  desativada: 'Desativada',
};

export const USAGE_LABEL: Readonly<Record<RailwayUsage, string>> = {
  carga: 'Carga',
  passageiros: 'Passageiros',
  misto: 'Carga e passageiros',
};

export const GAUGE_LABEL: Readonly<Record<RailwayGauge, string>> = {
  larga: 'Larga (1,60 m)',
  metrica: 'Métrica (1,00 m)',
  mista: 'Mista (larga e métrica)',
};

export const CONFIDENCE_LABEL: Readonly<Record<RailwayConfidence, string>> = {
  alta: 'Situação confirmada na fonte',
  media: 'Situação provável',
  baixa: 'Situação a confirmar',
};

export const GOVERNMENT_STAGE_LABEL: Readonly<Record<GovernmentStage, string>> = {
  proposta: 'Proposta do governo em tramitação',
  obra: 'Obra do governo em andamento',
  operacao: 'Inaugurada pelo governo',
};

export interface RailwayFilter {
  statuses: readonly RailwayStatus[];
  usages: readonly RailwayUsage[];
  /** Mostra as obras e propostas do governo (carteira). */
  government: boolean;
}

export const ALL_RAILWAYS: RailwayFilter = Object.freeze({
  statuses: RAILWAY_STATUSES,
  usages: RAILWAY_USAGES,
  government: true,
});

/** Propostas que ainda podem virar obra (em tramitação ou à espera de sanção). */
const PROPOSED: readonly string[] = ['em_tramitacao', 'parada', 'aprovada', 'aguardando_sancao', 'apreciacao_veto'];

/** Obra do governo sobre um trecho da rede. */
export interface GovernmentWork {
  segmentId: string;
  proposalId: string;
  policyName: string;
  stage: GovernmentStage;
  /** Avanço físico 0–1 (0 na proposta). */
  progress: number;
  kind: 'construcao' | 'recuperacao';
}

/**
 * Obras ferroviárias do governo, por trecho. Uma proposta em tramitação vira `proposta`; uma obra da carteira, `obra`
 * (ou `operacao` quando pronta). Obra cancelada e proposta rejeitada não aparecem. Mais de uma proposta para o mesmo
 * trecho: vale a mais avançada.
 */
export function governmentWorks(state: Readonly<GameState>, content: GameContent): ReadonlyMap<string, GovernmentWork> {
  const works = new Map<string, GovernmentWork>();
  const rank: Record<GovernmentStage, number> = { proposta: 0, obra: 1, operacao: 2 };
  const put = (work: GovernmentWork) => {
    const current = works.get(work.segmentId);
    if (
      !current ||
      rank[work.stage] > rank[current.stage] ||
      (rank[work.stage] === rank[current.stage] && work.progress > current.progress)
    )
      works.set(work.segmentId, work);
  };
  const projects = new Map(state.publicPolicies.projects.map((p) => [p.proposalId, p]));
  for (const proposal of state.proposals) {
    const policy = content.policies[proposal.policyId];
    if (!policy?.railway) continue;
    const project = projects.get(proposal.id);
    const base = {
      segmentId: policy.railway.segmentId,
      proposalId: proposal.id,
      policyName: policy.name,
      kind: policy.railway.kind,
    };
    if (project) {
      if (project.phase === 'cancelado') continue;
      put({ ...base, stage: project.phase === 'operacao' ? 'operacao' : 'obra', progress: project.progress });
    } else if (proposal.status === 'em_execucao' || proposal.status === 'suspensa') {
      // Autorizada, mas a carteira ainda não processou o primeiro mês: obra sem avanço.
      put({ ...base, stage: 'obra', progress: 0 });
    } else if (PROPOSED.includes(proposal.status)) {
      put({ ...base, stage: 'proposta', progress: 0 });
    }
  }
  return works;
}

export type LineEmphasis = 'normal' | 'selected' | 'dimmed';

export interface RailwayLine {
  /** Único na camada (o trecho pode virar duas linhas: executado e a executar). */
  key: string;
  segmentId: string;
  corridorId: string;
  styleId: RailwayStyleId;
  emphasis: LineEmphasis;
  path: readonly LonLat[];
}

export interface RailwayLegendEntry {
  styleId: RailwayStyleId;
  label: string;
  color: string;
  dash: RailwayStyle['dash'];
}

export interface RailwayOverlay {
  lines: readonly RailwayLine[];
  /** Só os estilos que estão no mapa, na ordem de `RAILWAY_STYLE_ORDER` invertida (o mais forte primeiro). */
  legend: readonly RailwayLegendEntry[];
  /** Aviso fixo da legenda: traçado esquemático, versão e data. */
  caption: string;
  selectedCorridorId: string | null;
}

/** Distância plana em graus (com a longitude encolhida pela latitude): suficiente para repartir um traçado esquemático. */
function stepLength(a: LonLat, b: LonLat): number {
  const k = Math.cos((((a[1] + b[1]) / 2) * Math.PI) / 180);
  return Math.hypot((b[0] - a[0]) * k, b[1] - a[1]);
}

/** Corta a polilinha na fração `t` (0–1) do comprimento: [parte inicial, resto]. Cada parte tem ≥ 2 pontos ou é vazia. */
export function splitPath(path: readonly LonLat[], t: number): [LonLat[], LonLat[]] {
  const f = Math.max(0, Math.min(1, t));
  if (f <= 0) return [[], [...path]];
  if (f >= 1) return [[...path], []];
  const lengths = path.slice(1).map((p, i) => stepLength(path[i]!, p));
  const total = lengths.reduce((s, l) => s + l, 0);
  let target = total * f;
  for (let i = 0; i < lengths.length; i++) {
    const l = lengths[i]!;
    if (target <= l || i === lengths.length - 1) {
      const u = l > 0 ? Math.min(1, target / l) : 0;
      const a = path[i]!;
      const b = path[i + 1]!;
      const cut: LonLat = [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
      return [
        [...path.slice(0, i + 1), cut],
        [cut, ...path.slice(i + 1)],
      ];
    }
    target -= l;
  }
  return [[...path], []];
}

function segmentVisible(corridor: RailwayCorridor, segment: RailwaySegment, filter: RailwayFilter): boolean {
  return filter.statuses.includes(segment.status) && filter.usages.includes(corridor.usage);
}

/**
 * Linhas, legenda e aviso da camada. A obra do governo substitui o desenho do trecho (planejado ou desativado) e
 * respeita só o filtro de uso e o interruptor `government`; um corredor selecionado fica em destaque e os demais,
 * apagados.
 */
export function buildRailwayOverlay(input: {
  network: RailwayNetwork;
  filter?: RailwayFilter;
  works?: ReadonlyMap<string, GovernmentWork>;
  selectedCorridorId?: string | null;
}): RailwayOverlay {
  const { network, filter = ALL_RAILWAYS, works = new Map(), selectedCorridorId = null } = input;
  const lines: RailwayLine[] = [];
  const selected =
    selectedCorridorId && network.corridors.some((c) => c.id === selectedCorridorId) ? selectedCorridorId : null;
  for (const corridor of network.corridors) {
    const emphasis: LineEmphasis = !selected ? 'normal' : corridor.id === selected ? 'selected' : 'dimmed';
    for (const segment of corridor.segments) {
      const base = { segmentId: segment.id, corridorId: corridor.id, emphasis };
      const work = works.get(segment.id);
      if (work && work.stage !== 'operacao') {
        if (!filter.government || !filter.usages.includes(corridor.usage)) continue;
        if (work.stage === 'proposta') {
          lines.push({ ...base, key: `${segment.id}:proposta`, styleId: 'governo_proposta', path: segment.path });
          continue;
        }
        const [done, rest] = splitPath(segment.path, work.progress);
        if (done.length > 1) lines.push({ ...base, key: `${segment.id}:feito`, styleId: 'governo_feito', path: done });
        if (rest.length > 1) lines.push({ ...base, key: `${segment.id}:falta`, styleId: 'governo_falta', path: rest });
        continue;
      }
      const status: RailwayStatus = work?.stage === 'operacao' ? 'ativa' : segment.status;
      if (!filter.statuses.includes(status) || !filter.usages.includes(corridor.usage)) continue;
      lines.push({ ...base, key: segment.id, styleId: status, path: segment.path });
    }
  }
  const order = new Map(RAILWAY_STYLE_ORDER.map((id, i) => [id, i]));
  lines.sort((a, b) => order.get(a.styleId)! - order.get(b.styleId)! || (a.key < b.key ? -1 : 1));
  const present = new Set(lines.map((l) => l.styleId));
  const legend = [...RAILWAY_STYLE_ORDER]
    .reverse()
    .filter((id) => present.has(id))
    .map((id) => ({
      styleId: id,
      label: RAILWAY_STYLES[id].label,
      color: RAILWAY_STYLES[id].color,
      dash: RAILWAY_STYLES[id].dash,
    }));
  return { lines, legend, caption: railwayCaption(network), selectedCorridorId: selected };
}

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** "Traçado esquemático · dados de dez/2025 · v2026.10.1 · PROVISORIO". */
export function railwayCaption(network: RailwayNetwork): string {
  const [year, month] = network.referenceDate.split('-');
  return `Traçado esquemático · situação de ${MONTHS[Number(month) - 1]}/${year} · v${network.version} · ${network.status}`;
}

/** Extensão do corredor: soma quando todos os trechos têm dado; "≥" quando só parte tem; `null` sem dado algum. */
export function corridorLength(corridor: RailwayCorridor): { km: number; partial: boolean } | null {
  const known = corridor.segments.filter((s) => s.lengthKm !== null);
  if (known.length === 0) return null;
  return { km: known.reduce((s, x) => s + (x.lengthKm ?? 0), 0), partial: known.length < corridor.segments.length };
}

export function lengthText(length: { km: number; partial: boolean } | null): string {
  if (!length) return 'Extensão sem dado consolidado';
  const km = Math.round(length.km).toLocaleString('pt-BR');
  return length.partial ? `≥ ${km} km (só trechos com dado)` : `${km} km`;
}

export interface RailwayListRow {
  corridor: RailwayCorridor;
  /** Trechos que passam no filtro, com a obra do governo se houver. */
  segments: readonly { segment: RailwaySegment; work: GovernmentWork | null; status: RailwayStatus }[];
  /** A situação mais operacional entre os trechos do corredor (para o selo da linha). */
  headline: RailwayStatus;
  hasGovernmentWork: boolean;
}

const OPERATIONAL_RANK: Readonly<Record<RailwayStatus, number>> = {
  ativa: 0,
  parcial: 1,
  em_construcao: 2,
  planejada: 3,
  desativada: 4,
};

/**
 * Linhas da lista (folha Ferrovias): o mesmo filtro do mapa. Corredores com obra do governo primeiro; depois pela
 * situação mais operacional e pelo nome.
 */
export function railwayListRows(
  network: RailwayNetwork,
  filter: RailwayFilter = ALL_RAILWAYS,
  works: ReadonlyMap<string, GovernmentWork> = new Map(),
): RailwayListRow[] {
  const rows: RailwayListRow[] = [];
  for (const corridor of network.corridors) {
    if (!filter.usages.includes(corridor.usage)) continue;
    const segments = corridor.segments
      .map((segment) => {
        const work = works.get(segment.id) ?? null;
        const status: RailwayStatus = work?.stage === 'operacao' ? 'ativa' : segment.status;
        return { segment, work, status };
      })
      .filter(({ work, status, segment }) =>
        work && work.stage !== 'operacao'
          ? filter.government
          : segmentVisible(corridor, { ...segment, status }, filter),
      );
    if (segments.length === 0) continue;
    const headline = segments.reduce<RailwayStatus>(
      (best, s) => (OPERATIONAL_RANK[s.status] < OPERATIONAL_RANK[best] ? s.status : best),
      'desativada',
    );
    rows.push({ corridor, segments, headline, hasGovernmentWork: segments.some((s) => s.work) });
  }
  return rows.sort(
    (a, b) =>
      Number(b.hasGovernmentWork) - Number(a.hasGovernmentWork) ||
      OPERATIONAL_RANK[a.headline] - OPERATIONAL_RANK[b.headline] ||
      a.corridor.name.localeCompare(b.corridor.name, 'pt-BR'),
  );
}

/** Contagem de trechos por situação na rede (com o filtro de uso), para os chips de filtro. */
export function statusCounts(network: RailwayNetwork, usages: readonly RailwayUsage[] = RAILWAY_USAGES) {
  const counts = Object.fromEntries(RAILWAY_STATUSES.map((s) => [s, 0])) as Record<RailwayStatus, number>;
  for (const c of network.corridors) {
    if (!usages.includes(c.usage)) continue;
    for (const s of c.segments) counts[s.status] += 1;
  }
  return counts;
}

/** Frase para leitor de tela de um trecho: nome, situação, confiança, extensão e obra do governo. */
export function segmentDescription(
  corridor: RailwayCorridor,
  segment: RailwaySegment,
  status: RailwayStatus,
  work: GovernmentWork | null,
): string {
  return [
    `${corridor.shortName}, ${segment.name}`,
    work
      ? `${GOVERNMENT_STAGE_LABEL[work.stage]}${work.stage === 'obra' ? `, ${Math.round(work.progress * 100)}% executado` : ''}`
      : STATUS_LABEL[status],
    CONFIDENCE_LABEL[segment.confidence],
    segment.lengthKm !== null ? `${segment.lengthKm.toLocaleString('pt-BR')} km` : 'extensão sem dado',
  ].join(', ');
}

/** Toggle de um item numa lista de filtro, mantendo a ordem canônica e nunca deixando a lista vazia. */
export function toggleFilter<T extends string>(list: readonly T[], item: T, canonical: readonly T[]): readonly T[] {
  const next = list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
  if (next.length === 0) return list;
  return canonical.filter((x) => next.includes(x));
}

/** Opacidade das linhas dos outros corredores quando um está selecionado (mesma do 2D). */
export const DIMMED_RAIL_OPACITY = 0.4;
/** Fator do miolo do corredor selecionado (mesmo do 2D). */
export const SELECTED_RAIL_WIDTH = 1.6;

/** Linhas no formato do globo: estilo resolvido, ênfase em largura e opacidade. */
export function globeRailLines(overlay: RailwayOverlay): GlobeRailLine[] {
  return overlay.lines.map((line) => {
    const style = RAILWAY_STYLES[line.styleId];
    return {
      key: line.key,
      path: line.path,
      color: style.color,
      casing: style.casing,
      widthPx: style.widthPx * (line.emphasis === 'selected' ? SELECTED_RAIL_WIDTH : 1),
      dash: style.dash,
      opacity: line.emphasis === 'dimmed' ? DIMMED_RAIL_OPACITY : 1,
    };
  });
}
