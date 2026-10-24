import type { ConditionVariable, EventCondition, GameEvent } from '../../types/event';
import type { Character } from '../../types/scenario';
import { conditionValue } from '../events/events';
import { formatEventText } from '../events/location';
import { explainIndicator, proposalHeadlinePrefix } from '../report/explain';
import { pct, pp } from '../report/format';
import type {
  EventLocation,
  GameContent,
  GameState,
  IndicatorKey,
  MonthReport,
  NewsItem,
  NewsTone,
  ProposalTransition,
} from '../types';

import {
  NEWS_CAUSE_MARGIN_FLOOR,
  NEWS_EXCHANGE_MONTHLY_MOVE,
  NEWS_LEVELS,
  NEWS_LIMIT,
  NEWS_PER_MONTH_MAX,
} from './calibration';

/**
 * Notícias do mês (FASE_07.md, tarefa T2). Função pura e determinística: sem sorteio, sem data. Cada manchete
 * sai de uma causa rastreável (Copom, proposta, evento, indicador ou marca institucional) e traz a frase
 * `cause` obrigatória. Textos fictícios, em português do Brasil.
 */

/** Entrada de `generateNews`: estado antes e depois do mês, relatório do mês e conteúdo. */
export interface NewsArgs {
  previous: GameState;
  next: GameState;
  report: MonthReport;
  content: GameContent;
}

/** Manchete antes de receber `id` e `monthIndex`. */
type NewsCandidate = Omit<NewsItem, 'id' | 'monthIndex'>;

function formatNumber(value: number, decimals: number): string {
  return value.toFixed(decimals).replace('.', ',');
}

function brl(rate: number): string {
  return `R$ ${formatNumber(rate, 2)}`;
}

/** Tira o ponto final para encaixar o texto dentro de "Causa: ...". */
function withoutFinalPeriod(text: string): string {
  return text.replace(/\.$/, '');
}

function findEvent(content: GameContent, eventId: string): GameEvent | undefined {
  return content.events.find((e) => e.id === eventId);
}

function findCharacter(content: GameContent, characterId: string): Character | undefined {
  return content.scenario.characters?.find((c) => c.id === characterId);
}

function withCharacter(characterId: string | undefined): { characterId?: string } {
  return characterId ? { characterId } : {};
}

// ── Eventos: causa ─────────────────────────────────────────────────────────────────────────────────────────────

interface ConditionText {
  label: string;
  kind: 'pct' | 'num';
  decimals: number;
}

/** Como cada variável de condição aparece no texto da causa (decimais da exibição, não do motor). */
const CONDITION_TEXT: Record<ConditionVariable, ConditionText> = {
  approval: { label: 'Aprovação do governo', kind: 'pct', decimals: 1 },
  gdpGrowth12m: { label: 'Crescimento do PIB em 12 meses', kind: 'pct', decimals: 1 },
  inflation12m: { label: 'Inflação de 12 meses', kind: 'pct', decimals: 1 },
  unemployment: { label: 'Desemprego', kind: 'pct', decimals: 1 },
  primaryBalance12m: { label: 'Resultado primário em 12 meses', kind: 'pct', decimals: 1 },
  outputGap: { label: 'Hiato do produto', kind: 'num', decimals: 2 },
  selic: { label: 'Selic', kind: 'pct', decimals: 2 },
  credibility: { label: 'Credibilidade', kind: 'num', decimals: 2 },
  grossDebt: { label: 'Dívida bruta', kind: 'pct', decimals: 0 },
  politicalCapital: { label: 'Capital político', kind: 'num', decimals: 0 },
  congressRelation: { label: 'Relação com o Congresso', kind: 'num', decimals: 0 },
  proposalsInCongress: { label: 'Propostas em tramitação', kind: 'num', decimals: 0 },
  exchangeRate: { label: 'Câmbio (R$/US$)', kind: 'num', decimals: 2 },
  riskPremium: { label: 'Prêmio de risco', kind: 'pct', decimals: 1 },
  discretionarySpending: { label: 'Despesas discricionárias', kind: 'pct', decimals: 1 },
  limitExcess: { label: 'Despesa acima do limite', kind: 'pct', decimals: 1 },
  monthIndex: { label: 'Mês do mandato', kind: 'num', decimals: 0 },
  partisanMinistries: { label: 'Ministérios de indicação partidária', kind: 'num', decimals: 0 },
  cabinetScandalRisk: { label: 'Risco de escândalo no ministério', kind: 'pct', decimals: 1 },
  governorRelation: { label: 'Relação com os governadores', kind: 'num', decimals: 0 },
  impeachmentPressure: { label: 'Pressão de impeachment', kind: 'pct', decimals: 0 },
  characterStanding: { label: 'Prestígio', kind: 'num', decimals: 0 },
};

function describeCondition(condition: EventCondition, content: GameContent): string {
  const text = CONDITION_TEXT[condition.variable];
  const who = condition.characterId
    ? ` de ${findCharacter(content, condition.characterId)?.name ?? condition.characterId}`
    : '';
  const level =
    text.kind === 'pct' ? pct(condition.value, text.decimals) : formatNumber(condition.value, text.decimals);
  return `${text.label}${who} ${condition.op === 'gt' ? 'acima de' : 'abaixo de'} ${level}`;
}

/** A condição cuja variável mais se moveu no mês, medida em relação ao próprio limiar. */
function mostMovedCondition(
  event: GameEvent,
  previous: GameState,
  next: GameState,
  content: GameContent,
): EventCondition | undefined {
  let chosen: EventCondition | undefined;
  let best = Number.NEGATIVE_INFINITY;
  for (const condition of event.trigger.conditions) {
    // O mês do mandato muda todo mês: é calendário, não explica o evento.
    if (condition.variable === 'monthIndex') continue;
    const { variable, characterId } = condition;
    const moved = Math.abs(
      conditionValue(next, variable, content, characterId) - conditionValue(previous, variable, content, characterId),
    );
    const score = moved / Math.max(Math.abs(condition.value), NEWS_CAUSE_MARGIN_FLOOR);
    if (score > best) {
      best = score;
      chosen = condition;
    }
  }
  return chosen;
}

/**
 * Causa de um evento que chegou à caixa de entrada no mês. Se ele estava agendado como consequência de uma escolha
 * (`scheduled` do estado anterior, com a mesma chegada), a causa é essa escolha. Senão, a condição que mais se
 * moveu no mês. Só como último recurso, uma causa genérica.
 */
function eventCause(eventId: string, args: NewsArgs): string {
  const { previous, next, report, content } = args;
  const arrival = report.monthIndex + 1;
  let origin = (previous.events.scheduled ?? []).find((s) => s.eventId === eventId && s.monthIndex === arrival);
  // Encadeado com atraso de 1 mês: a escolha foi aplicada e o evento chegou no mesmo mês, então a origem está no
  // relatório (escolhas resolvidas) e não na fila do estado anterior.
  if (!origin) {
    for (const resolved of report.eventsResolved) {
      const source = findEvent(content, resolved.eventId);
      const choice = source?.choices.find((c) => c.id === resolved.choiceId);
      const link = choice?.followUps?.find((f) => f.eventId === eventId && f.delayMonths === 1);
      if (link) {
        origin = { eventId, monthIndex: arrival, causeEventId: resolved.eventId, causeChoiceId: resolved.choiceId };
        break;
      }
    }
  }
  if (origin) {
    const originEvent = findEvent(content, origin.causeEventId);
    if (!originEvent) return 'Causa: consequência de decisão anterior';
    const choice = originEvent.choices.find((c) => c.id === origin.causeChoiceId);
    const choiceText = choice ? ` (escolha "${choice.label}")` : '';
    return `Causa: consequência de "${originEvent.title}"${choiceText}`;
  }
  const event = findEvent(content, eventId);
  const moved = event ? mostMovedCondition(event, previous, next, content) : undefined;
  if (moved) return `Causa: ${describeCondition(moved, content)}`;
  // Sem condição de estado que explique: gatilho de calendário (mês do ano ou data do mandato) ou acaso do mês.
  const calendar =
    (event?.trigger.monthsOfYear.length ?? 0) > 0 || event?.trigger.conditions.some((c) => c.variable === 'monthIndex');
  return calendar ? 'Causa: calendário do mandato' : 'Causa: acontecimento do mês';
}

/** Ocorrência e local congelado de um evento que chegou à caixa de entrada neste mês (relatório v12 em diante). */
function firedInstance(args: NewsArgs, eventId: string): { instanceId?: string; location?: EventLocation } {
  const hit = args.report.eventInstances?.find((i) => i.eventId === eventId);
  return hit ? { instanceId: hit.instanceId, ...(hit.location ? { location: hit.location } : {}) } : {};
}

/** Ocorrência e local de um evento resolvido no mês: o local está na pendência do estado anterior. */
function resolvedInstance(args: NewsArgs, eventId: string, instanceId?: string): ReturnType<typeof firedInstance> {
  if (!instanceId) return {};
  const pending = args.previous.events.pending.find((p) => p.eventId === eventId && p.instanceId === instanceId);
  return { instanceId, ...(pending?.location ? { location: pending.location } : {}) };
}

function eventCandidates(args: NewsArgs): NewsCandidate[] {
  const { report, content } = args;
  const fired = report.eventsFired.map((eventId): NewsCandidate => {
    const event = findEvent(content, eventId);
    const where = firedInstance(args, eventId);
    return {
      kind: 'evento',
      tone: 'neutra',
      headline: event ? formatEventText(event.title, where.location, content) : eventId,
      cause: eventCause(eventId, args),
      sourceId: eventId,
      ...where,
      ...withCharacter(event?.characterId),
    };
  });
  const automatic = report.eventsResolved
    .filter((resolved) => resolved.automatic)
    .map((resolved): NewsCandidate => {
      const event = findEvent(content, resolved.eventId);
      const choice = event?.choices.find((c) => c.id === resolved.choiceId);
      const choiceText = choice ? ` ("${choice.label}")` : '';
      const where = resolvedInstance(args, resolved.eventId, resolved.instanceId);
      const title = event ? formatEventText(event.title, where.location, content) : resolved.eventId;
      return {
        kind: 'evento',
        tone: 'negativa',
        headline: `Sem resposta do governo: ${title}`,
        cause: `Causa: prazo venceu; escolha padrão aplicada${choiceText}`,
        sourceId: resolved.eventId,
        ...where,
      };
    });
  return [...fired, ...automatic];
}

/** No máximo uma manchete de personagem por mês: o primeiro evento disparado que tem personagem em destaque. */
function personagemCandidate(args: NewsArgs): NewsCandidate | undefined {
  const { report, content } = args;
  for (const eventId of report.eventsFired) {
    const event = findEvent(content, eventId);
    if (!event?.characterId) continue;
    const character = findCharacter(content, event.characterId);
    const who = character ? `${character.name} (${character.role})` : event.characterId;
    const where = firedInstance(args, eventId);
    return {
      kind: 'personagem',
      tone: 'neutra',
      headline: `${who}: ${formatEventText(event.title, where.location, content)}`,
      cause: eventCause(eventId, args),
      sourceId: eventId,
      characterId: event.characterId,
      ...where,
    };
  }
  return undefined;
}

// ── Institucional ──────────────────────────────────────────────────────────────────────────────────────────────

/** Marcas institucionais (FASE_07.md): manchete quando a marca aparece pela primeira vez no mês. */
const INSTITUTIONAL_NEWS: Record<string, { headline: string; tone: NewsTone }> = {
  cpi_instalada: { headline: 'CPI instalada no Congresso', tone: 'negativa' },
  tcu_parecer_rejeicao: { headline: 'TCU recomenda rejeição das contas', tone: 'negativa' },
  impeachment_denuncia_aceita: { headline: 'Pedido de impeachment é aceito', tone: 'negativa' },
  impeachment_autorizado: { headline: 'Câmara autoriza processo de impeachment', tone: 'negativa' },
  impeachment_condenado: { headline: 'Senado condena e encerra o mandato', tone: 'negativa' },
};

/** Evento que gravou a marca: primeiro pela escolha resolvida no mês, depois pela chegada à caixa de entrada. */
function flagSource(flag: string, report: MonthReport, content: GameContent): { cause: string; sourceId?: string } {
  for (const resolved of report.eventsResolved) {
    const event = findEvent(content, resolved.eventId);
    const choice = event?.choices.find((c) => c.id === resolved.choiceId);
    if (event && choice?.setFlags?.includes(flag)) {
      return { cause: `Causa: "${event.title}", escolha "${choice.label}"`, sourceId: event.id };
    }
  }
  for (const eventId of report.eventsFired) {
    const event = findEvent(content, eventId);
    if (event?.onFireFlags?.includes(flag)) {
      return { cause: `Causa: "${event.title}" chegou à caixa de entrada`, sourceId: event.id };
    }
  }
  return { cause: 'Causa: marca institucional gravada no mês' };
}

function institutionalCandidates(args: NewsArgs): NewsCandidate[] {
  const { previous, next, report, content } = args;
  const before = previous.events.flags ?? {};
  const after = next.events.flags ?? {};
  const out: NewsCandidate[] = [];
  for (const flag of Object.keys(INSTITUTIONAL_NEWS)) {
    if (!Object.hasOwn(after, flag) || Object.hasOwn(before, flag)) continue;
    const news = INSTITUTIONAL_NEWS[flag];
    const source = flagSource(flag, report, content);
    out.push({
      kind: 'institucional',
      tone: news.tone,
      headline: news.headline,
      cause: source.cause,
      ...(source.sourceId ? { sourceId: source.sourceId } : {}),
    });
  }
  return out;
}

// ── Eleições ───────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Manchetes eleitorais (FASE_08.md): declaração de candidatura, eleição municipal e eleição geral acontecem no
 * mês gravado no estado (`politics`), então a manchete sai quando o mês do pleito é o mês do relatório. Sem
 * `politics` ou sem bloco `elections` no cenário, não há manchete.
 */
function electionCandidates(args: NewsArgs): NewsCandidate[] {
  const { report, next, content } = args;
  const politics = next.politics;
  if (!politics || !content.scenario.elections) return [];
  const out: NewsCandidate[] = [];

  if (politics.declaracao === report.monthIndex) {
    out.push({
      kind: 'institucional',
      tone: 'neutra',
      headline: 'Presidente declara candidatura à reeleição',
      cause: 'Causa: agenda "Declarar candidatura à reeleição" na janela do calendário eleitoral',
      sourceId: 'declaracao_reeleicao',
    });
  }

  if (politics.eleicao_municipal?.monthIndex === report.monthIndex) {
    const efeito = report.contributions.find((c) => c.indicator === 'approval' && c.cause === 'municipais');
    const positiva = (efeito?.delta ?? 0) >= 0;
    out.push({
      kind: 'institucional',
      tone: positiva ? 'positiva' : 'negativa',
      headline: positiva
        ? 'Eleições municipais: governo sai fortalecido das urnas'
        : 'Eleições municipais: governo sai desgastado das urnas',
      cause: `Causa: eleições municipais; memória do eleitor mexeu ${pp(efeito?.delta ?? 0)} na aprovação`,
      sourceId: 'eleicao_municipal',
    });
  }

  const geral = politics.eleicao_geral;
  if (geral?.monthIndex === report.monthIndex) {
    const turno = geral.turno2 ? 'no segundo turno' : 'no primeiro turno';
    const headline = geral.venceu
      ? geral.candidatura
        ? `Presidente é reeleito ${turno}`
        : `Governo faz o sucessor ${turno}`
      : geral.candidatura
        ? `Presidente perde a disputa pela reeleição ${turno}`
        : `Governo perde a eleição geral ${turno}`;
    out.push({
      kind: 'institucional',
      tone: geral.venceu ? 'positiva' : 'negativa',
      headline,
      cause: geral.candidatura
        ? 'Causa: apuração da eleição geral; candidatura declarada na janela eleitoral'
        : 'Causa: apuração da eleição geral; sucessor herda a intenção de voto do governo',
      sourceId: 'eleicao_geral',
    });
  }

  return out;
}

// ── Congresso ──────────────────────────────────────────────────────────────────────────────────────────────────

/** Tom da manchete por causa da transição (o governo ganha ou perde). Causas fora da lista saem neutras. */
const PROPOSAL_TONE: Readonly<Partial<Record<string, NewsTone>>> = {
  enviada: 'neutra',
  capacidade_pauta: 'negativa',
  parecer_relator: 'neutra',
  pedagio_emendas: 'negativa',
  presidente_nao_pautou: 'negativa',
  pauta_trancada_mp: 'negativa',
  veto_total: 'negativa',
  veto_parcial: 'negativa',
  veto_derrubado: 'negativa',
  veto_mantido: 'positiva',
  caducidade: 'negativa',
  liminar_stf: 'negativa',
  inconstitucional: 'negativa',
  escandalo_execucao: 'negativa',
  execucao_concluida: 'positiva',
};

/** Tom da votação pelo status final da proposta. */
const VOTE_TONE: Readonly<Partial<Record<string, NewsTone>>> = {
  aprovada: 'positiva',
  rejeitada: 'negativa',
  em_tramitacao: 'neutra',
  parada: 'neutra',
};

function proposalTone(transition: ProposalTransition): NewsTone {
  const tone = transition.cause === 'votacao' ? VOTE_TONE[transition.status] : PROPOSAL_TONE[transition.cause];
  return tone ?? 'neutra';
}

function congressCandidates(args: NewsArgs): NewsCandidate[] {
  const { report, content } = args;
  const out: NewsCandidate[] = [];
  for (const change of report.proposalChanges) {
    const prefix = proposalHeadlinePrefix(change.transition);
    if (!prefix) continue;
    const name = content.policies[change.policyId]?.name ?? change.policyId;
    const { detail, cause } = change.transition;
    out.push({
      kind: 'congresso',
      tone: proposalTone(change.transition),
      headline: `${prefix}: ${name}`,
      cause: detail
        ? `Causa: ${withoutFinalPeriod(detail)}`
        : `Causa: etapa de tramitação (${cause.replace(/_/g, ' ')})`,
      sourceId: change.policyId,
    });
  }
  return out;
}

// ── Economia ───────────────────────────────────────────────────────────────────────────────────────────────────

/** Cruzamento de nível de um indicador ou variável econômica (limiares em `calibration.ts`). */
interface LevelWatch {
  label: string;
  /** Indicador do relatório, para a causa vir da decomposição "Por que mudou?". */
  indicator?: IndicatorKey;
  /** Selic: a causa é a decisão do Copom, quando houve reunião no mês. */
  ruledByCopom?: boolean;
  read: (state: GameState) => number;
  levels: readonly number[];
  /** Subir é ruim (inflação, dívida)? Define o tom da manchete. */
  badWhenHigh: boolean;
  decimals: number;
}

const LEVEL_WATCHES: readonly LevelWatch[] = [
  {
    label: 'Inflação de 12 meses',
    indicator: 'inflation12m',
    read: (s) => s.indicators.inflation12m,
    levels: NEWS_LEVELS.inflation12m,
    badWhenHigh: true,
    decimals: 1,
  },
  {
    label: 'Desemprego',
    indicator: 'unemployment',
    read: (s) => s.indicators.unemployment,
    levels: NEWS_LEVELS.unemployment,
    badWhenHigh: true,
    decimals: 1,
  },
  {
    label: 'Aprovação do governo',
    indicator: 'approval',
    read: (s) => s.indicators.approval,
    levels: NEWS_LEVELS.approval,
    badWhenHigh: false,
    decimals: 1,
  },
  {
    label: 'Dívida bruta',
    read: (s) => s.economy.grossDebt,
    levels: NEWS_LEVELS.grossDebt,
    badWhenHigh: true,
    decimals: 0,
  },
  {
    label: 'Prêmio de risco',
    read: (s) => s.economy.riskPremium,
    levels: NEWS_LEVELS.riskPremium,
    badWhenHigh: true,
    decimals: 1,
  },
  {
    label: 'Selic',
    ruledByCopom: true,
    read: (s) => s.economy.selic,
    levels: NEWS_LEVELS.selic,
    badWhenHigh: true,
    decimals: 2,
  },
];

/** Nível cruzado (para cima ou para baixo) que foi percorrido mais longe; `undefined` se nenhum foi cruzado. */
function crossedLevel(before: number, after: number, levels: readonly number[]): number | undefined {
  let chosen: number | undefined;
  let travel = Number.NEGATIVE_INFINITY;
  for (const level of levels) {
    const crossed = (before < level && after >= level) || (before >= level && after < level);
    if (!crossed) continue;
    const distance = Math.abs(level - before);
    if (distance > travel) {
      travel = distance;
      chosen = level;
    }
  }
  return chosen;
}

function levelCandidate(watch: LevelWatch, args: NewsArgs): NewsCandidate | undefined {
  const { previous, next, report } = args;
  const before = watch.read(previous);
  const after = watch.read(next);
  const level = crossedLevel(before, after, watch.levels);
  if (level === undefined) return undefined;
  const up = after > before;
  // A maior causa que empurrou no mesmo sentido do movimento (a maior em valor absoluto pode ter segurado a mudança).
  const topCause = watch.indicator
    ? explainIndicator(report, watch.indicator).find((c) => (up ? c.delta > 0 : c.delta < 0))
    : undefined;
  // Duas casas na causa: com uma só, uma passagem pequena apareceria como "de 3,0% para 3,0%".
  let cause = `Causa: ${watch.label.toLowerCase()} passou de ${pct(before, 2)} para ${pct(after, 2)} no mês`;
  if (topCause) {
    cause = `Causa: ${topCause.label} (${pp(topCause.delta)} no mês)`;
  } else if (watch.ruledByCopom && report.copom) {
    cause = `Causa: decisão do Copom (de ${pct(report.copom.previous, 2)} para ${pct(report.copom.next, 2)})`;
  }
  return {
    kind: 'economia',
    tone: up === watch.badWhenHigh ? 'negativa' : 'positiva',
    headline: `${watch.label} ${up ? 'sobe acima de' : 'cai abaixo de'} ${pct(level, watch.decimals)}`,
    cause,
  };
}

function copomCandidate(copom: NonNullable<MonthReport['copom']>): NewsCandidate {
  const pressure =
    copom.pressureCut !== undefined && copom.pressureCut > 0
      ? `; pressão do governo tirou ${pct(copom.pressureCut, 2)} da decisão`
      : '';
  if (copom.next === copom.previous) {
    return {
      kind: 'economia',
      tone: 'neutra',
      headline: `Copom mantém a Selic em ${pct(copom.next, 2)}`,
      cause: `Causa: o Copom manteve a Selic em ${pct(copom.next, 2)}${pressure}`,
    };
  }
  const cut = copom.next < copom.previous;
  return {
    kind: 'economia',
    tone: cut ? 'positiva' : 'negativa',
    headline: `Copom ${cut ? 'corta' : 'eleva'} a Selic para ${pct(copom.next, 2)}`,
    cause: `Causa: o Copom ${cut ? 'cortou' : 'elevou'} a Selic (de ${pct(copom.previous, 2)} para ${pct(copom.next, 2)})${pressure}`,
  };
}

function exchangeCandidate(previous: GameState, next: GameState): NewsCandidate | undefined {
  const before = previous.economy.exchangeRate;
  const after = next.economy.exchangeRate;
  if (!(before > 0)) return undefined;
  const move = after / before - 1;
  if (Math.abs(move) <= NEWS_EXCHANGE_MONTHLY_MOVE) return undefined;
  const up = move > 0;
  return {
    kind: 'economia',
    tone: up ? 'negativa' : 'positiva',
    headline: `Dólar ${up ? 'sobe' : 'cai'} mais de ${pct(NEWS_EXCHANGE_MONTHLY_MOVE, 0)} no mês`,
    cause: `Causa: câmbio passou de ${brl(before)} para ${brl(after)} (${pct(move, 1)})`,
  };
}

function economyCandidates(args: NewsArgs): NewsCandidate[] {
  const out: NewsCandidate[] = [];
  if (args.report.copom) out.push(copomCandidate(args.report.copom));
  const exchange = exchangeCandidate(args.previous, args.next);
  if (exchange) out.push(exchange);
  for (const watch of LEVEL_WATCHES) {
    const candidate = levelCandidate(watch, args);
    if (candidate) out.push(candidate);
  }
  return out;
}

// ── Geração e persistência ─────────────────────────────────────────────────────────────────────────────────────

/**
 * Manchetes do mês, até `NEWS_PER_MONTH_MAX`, na ordem de prioridade: eleições, institucional, evento, personagem,
 * congresso e economia. Id `${monthIndex}_${ordem}`. Função pura: mesma entrada, mesma saída.
 */
export function generateNews(args: NewsArgs): NewsItem[] {
  const personagem = personagemCandidate(args);
  const candidates: NewsCandidate[] = [
    ...electionCandidates(args),
    ...institutionalCandidates(args),
    ...eventCandidates(args),
    ...(personagem ? [personagem] : []),
    ...congressCandidates(args),
    ...economyCandidates(args),
  ];
  return candidates.slice(0, NEWS_PER_MONTH_MAX).map((candidate, ordem): NewsItem => ({
    id: `${args.report.monthIndex}_${ordem}`,
    monthIndex: args.report.monthIndex,
    ...candidate,
  }));
}

/**
 * Acrescenta as notícias ao feed do estado e mantém só as `NEWS_LIMIT` mais recentes. Estados sem o campo
 * (saves antigos) começam com feed vazio.
 */
export function appendNews(state: GameState, items: readonly NewsItem[]): GameState {
  const feed = [...(state.events.news ?? []), ...items];
  return { ...state, events: { ...state.events, news: feed.slice(-NEWS_LIMIT) } };
}
