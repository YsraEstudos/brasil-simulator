import { COMMUNICATE_ACTION_ID, PRESS_RESPONSE_ACTION_ID } from '../actions';
import { monthKey } from '../calendar';
import { keyedRng } from '../career/draw';
import { bulletinNumber, bulletinsOf, diseaseOf, healthOf, trueOccupancy } from '../health/health';
import type { Outbreak } from '../health/types';
import { currentRevisionOf, type Publication } from '../information/publication';
import type { DecisionRejection, GameContent, GameState, MonthStep } from '../types';
import type { PressCatalog, RumorSpec } from '../../types/press';
import { pressParam } from './calibration';
import { pressOf } from './effects';
import {
  CRISIS_TONES,
  PRESS_RESPONSES,
  type CrisisTone,
  type PressItem,
  type PressResponse,
  type PressState,
} from './types';

/**
 * Imprensa interpretativa e confiança (PLANO_EXPANSAO F15, EX-28). Duas etapas:
 *
 * - `pressDecisionsStep` (antes da saúde): o tom da comunicação e as respostas a rumores valem já no mês.
 * - `pressStep` (depois da saúde): checagem dos rumores vencidos, deriva e mudanças da confiança com causa, e os itens
 *   do mês — fatos (boletins públicos e revisões), estimativas (faixas do governo), interpretações (viés do veículo
 *   sobre fatos publicados) e rumores (sorteados por chave, com verdade decidida pelo motor).
 *
 * Nada aqui mexe em indicador: comunicar não dá aprovação. A confiança muda a adesão às medidas e a procura por vacina
 * (lidas pela saúde); os rumores em circulação também. Ler a imprensa na interface não sorteia nada.
 */

const EPSILON = 1e-9;

function isTone(value: unknown): value is CrisisTone {
  return typeof value === 'string' && (CRISIS_TONES as readonly string[]).includes(value);
}

function isResponse(value: unknown): value is PressResponse {
  return typeof value === 'string' && (PRESS_RESPONSES as readonly string[]).includes(value);
}

/** `comunicar_crise` (`tone`): troca o tom; repetir o tom atual não é decisão. */
export function validateCommunicate(
  params: Readonly<Record<string, unknown>>,
  state: Readonly<GameState>,
  content: GameContent,
): DecisionRejection | null {
  if (!content.press || !isTone(params.tone)) return 'alvo_invalido';
  return pressOf(state).tone === params.tone ? 'ja_em_andamento' : null;
}

/** `responder_imprensa` (`itemId`, `response`): só rumor em circulação e ainda sem resposta. */
export function validatePressResponse(
  params: Readonly<Record<string, unknown>>,
  state: Readonly<GameState>,
): DecisionRejection | null {
  const item = pressOf(state).items.find((i) => i.id === params.itemId);
  return item &&
    item.category === 'rumor' &&
    item.status === 'circulando' &&
    !item.response &&
    isResponse(params.response)
    ? null
    : 'alvo_invalido';
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

function changeTrust(press: PressState, delta: number, cause: string, t: number) {
  if (Math.abs(delta) <= EPSILON) return;
  const before = press.trust;
  press.trust = clamp01(press.trust + delta);
  press.trustLog = [...press.trustLog, { month: t, delta: press.trust - before, cause }].slice(
    -pressParam('registro_confianca'),
  );
}

function clonePress(press: PressState): PressState {
  return {
    ...press,
    outlets: press.outlets.map((o) => ({ ...o })),
    items: press.items.map((i) => ({ ...i })),
    trustLog: [...press.trustLog],
  };
}

export const TONE_LABEL: Readonly<Record<CrisisTone, string>> = {
  rotina: 'Rotina técnica',
  transparente: 'Transparência total',
  tranquilizador: 'Tranquilizar',
  alerta: 'Alerta à população',
};

/** Decisões de comunicação do mês (antes da saúde: o tom vale para a adesão e os boletins do mês). */
export const pressDecisionsStep: MonthStep = (state, ctx) => {
  if (!ctx.content.press) return { state, contributions: [] };
  const relevant = ctx.decisions.filter(
    (d) => d.policyId === COMMUNICATE_ACTION_ID || d.policyId === PRESS_RESPONSE_ACTION_ID,
  );
  if (relevant.length === 0) return { state, contributions: [] };
  const t = state.monthIndex;
  const press = clonePress(pressOf(state));
  for (const decision of relevant) {
    const params = decision.params ?? {};
    if (decision.policyId === COMMUNICATE_ACTION_ID && isTone(params.tone) && params.tone !== press.tone) {
      press.tone = params.tone;
      press.toneMonth = t;
      ctx.draft.notes.push(`Comunicação de crise: ${TONE_LABEL[params.tone].toLowerCase()}.`);
    } else if (decision.policyId === PRESS_RESPONSE_ACTION_ID && isResponse(params.response)) {
      const item = press.items.find((i) => i.id === params.itemId);
      if (!item || item.category !== 'rumor' || item.status !== 'circulando' || item.response) continue;
      item.response = params.response;
      item.responseMonth = t;
      if (params.response === 'desmentir') {
        // O desmentido corta o boato na proporção da credibilidade de quem desmente; a checagem dirá se foi certo.
        item.circulation = (item.circulation ?? 1) * (1 - Math.min(1, pressParam('corte_desmentir') * press.trust * 2));
        ctx.draft.notes.push(`Governo desmente: “${item.headline}”.`);
      } else {
        item.circulation = (item.circulation ?? 1) * (1 - pressParam('corte_esclarecer'));
        changeTrust(press, pressParam('ganho_esclarecer'), 'Resposta com dados oficiais', t);
        if (item.truthful) {
          // Os dados oficiais confirmam o que era verdade: o rumor vira fato reconhecido.
          item.status = 'confirmado';
          item.resolveMonth = t;
        }
        ctx.draft.notes.push(`Governo responde com dados: “${item.headline}”.`);
      }
    }
  }
  return { state: { ...state, press }, contributions: [] };
};

/** Escolha ponderada por chave (estável: depende só da semente, do mês e do propósito). */
function weightedPick<T>(items: readonly T[], weight: (item: T) => number, u: number): T | undefined {
  const total = items.reduce((s, item) => s + Math.max(0, weight(item)), 0);
  if (total <= 0) return undefined;
  let left = u * total;
  for (const item of items) {
    left -= Math.max(0, weight(item));
    if (left < 0) return item;
  }
  return items[items.length - 1];
}

/** Número com vírgula decimal e ponto de milhar, sem `Intl` (o texto vai para o save: igual em todo aparelho). */
function decimal(value: number, digits: number): string {
  const [int, frac] = Math.abs(value).toFixed(digits).split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${value < 0 ? '−' : ''}${grouped}${frac ? `,${frac}` : ''}`;
}

/** Primeira letra maiúscula (o modelo pode começar pelo nome da doença). */
function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Pessoas (milhares no motor) em texto curto. */
function format(value: number): string {
  const people = value * 1000;
  if (people >= 1_000_000) return `${decimal(people / 1_000_000, 1)} ${people >= 2_000_000 ? 'milhões' : 'milhão'}`;
  if (people >= 1000) return `${decimal(Math.round(people / 1000), 0)} mil`;
  return decimal(Math.round(people), 0);
}

function headlineOf(publication: Publication): string {
  const p = currentRevisionOf(publication).payload;
  return String(p.disease ?? 'surto');
}

/** Tendência das notificações entre os dois últimos boletins do surto: >0 subindo. */
function trendOf(bulletins: readonly Publication[]): number | null {
  if (bulletins.length < 2) return null;
  const last = bulletinNumber(bulletins[bulletins.length - 1], 'cases');
  const previous = bulletinNumber(bulletins[bulletins.length - 2], 'cases');
  return previous > 0 ? last / previous - 1 : null;
}

function isTruthful(
  spec: RumorSpec,
  outbreak: Outbreak,
  uf: string | undefined,
  state: GameState,
  press: PressState,
): boolean {
  if (spec.veracity === 'falso') return false;
  if (spec.veracity === 'ocupacao') {
    const health = healthOf(state);
    const u = health.ufs.find((h) => h.id === uf);
    return u ? trueOccupancy(u) > 1 : false;
  }
  const trueDeaths = outbreak.ufs.reduce((s, u) => s + u.deaths, 0);
  return press.tone === 'tranquilizador' && outbreak.ledger.observedDeaths < pressParam('subnotificacao') * trueDeaths;
}

/** Etapa do mês (depois da saúde): checagem, confiança e itens de imprensa. */
export const pressStep: MonthStep = (state, ctx) => {
  const catalog = ctx.content.press;
  if (!catalog) return { state, contributions: [] };
  const t = state.monthIndex;
  const press = clonePress(pressOf(state));
  const health = healthOf(state);
  const visible = health.outbreaks.filter((o) => o.phase !== 'silencioso');
  let order = 0;
  const add = (item: Omit<PressItem, 'id' | 'month'>) => {
    press.items.push({ id: `imprensa:${t}:${order++}`, month: t, ...item });
  };

  // 1. Checagem independente dos rumores vencidos: a verdade do motor vira pública e julga veículos e governo.
  for (const item of press.items) {
    if (item.category !== 'rumor' || item.status !== 'circulando' || (item.resolveMonth ?? Infinity) > t) continue;
    item.status = item.truthful ? 'confirmado' : 'desmentido';
    const outlet = press.outlets.find((o) => o.id === item.outletId);
    if (outlet) {
      const step = pressParam('ajuste_credibilidade');
      outlet.reliability = clamp01(outlet.reliability + (item.truthful ? step : -step));
      if (item.truthful) outlet.confirmed += 1;
      else outlet.refuted += 1;
    }
    if (item.response === 'desmentir' && item.truthful)
      changeTrust(press, -pressParam('perda_negar_verdade'), 'Governo desmentiu o que a checagem confirmou', t);
    else if (item.response === 'desmentir' && !item.truthful)
      changeTrust(press, pressParam('ganho_desmentido'), 'Desmentido do governo confirmado pela checagem', t);
    ctx.draft.notes.push(`Checagem: “${item.headline}” — ${item.truthful ? 'confirmado' : 'falso (desinformação)'}.`);
  }

  // 2. Confiança: volta devagar ao nível de partida e responde ao tom diante dos números publicados.
  changeTrust(
    press,
    (pressParam('confianca_inicial') - press.trust) * pressParam('retorno_confianca'),
    'Memória do público se apaga devagar',
    t,
  );
  for (const outbreak of visible) {
    const trend = trendOf(bulletinsOf(health, outbreak.id));
    if (press.tone === 'transparente')
      changeTrust(press, pressParam('ganho_transparencia') * (1 - press.trust), 'Transparência durante a crise', t);
    if (press.tone === 'tranquilizador' && trend !== null && trend > pressParam('alta_contradicao'))
      changeTrust(press, -pressParam('perda_contradicao'), 'Discurso tranquilizador contra casos em alta', t);
    if (press.tone === 'alerta' && outbreak.phase === 'identificado' && (outbreak.estimate?.r[1] ?? 2) < 1)
      changeTrust(press, -pressParam('perda_alarmismo'), 'Alerta mantido com a epidemia em queda', t);
  }
  if (press.tone === 'alerta' && visible.length === 0)
    changeTrust(press, -pressParam('perda_alarmismo'), 'Alerta sem crise em curso', t);

  // 3. Fatos: boletins públicos do mês e revisões relevantes.
  const reliable = [...catalog.outlets]
    .filter((o) => o.reach === 'nacional' && o.kind !== 'rede')
    .sort((a, b) => b.reliability - a.reliability || (a.id < b.id ? -1 : 1));
  const factOutlet = reliable[0];
  const key = monthKey(t);
  for (const bulletin of health.bulletins) {
    const current = currentRevisionOf(bulletin);
    if (current.publishedAt !== key || current.payload.public !== true || !factOutlet) continue;
    const cases = bulletinNumber(bulletin, 'cases');
    const deaths = bulletinNumber(bulletin, 'deaths');
    if (bulletin.revisions.length === 1) {
      add({
        outletId: factOutlet.id,
        category: 'fato',
        headline: `Boletim sobre ${headlineOf(bulletin).toLowerCase()}: ${format(cases)} casos e ${format(deaths)} ${Math.round(deaths * 1000) === 1 ? 'óbito notificado' : 'óbitos notificados'} no mês (preliminar)`,
        stance: 0,
        sourceId: bulletin.id,
      });
    } else {
      const first = bulletin.revisions[0].payload;
      const before = typeof first.cases === 'number' ? first.cases : 0;
      if (before > 0 && cases / before - 1 > 0.2)
        add({
          outletId: factOutlet.id,
          category: 'fato',
          headline: `Dados revisados sobre ${headlineOf(bulletin).toLowerCase()}: os casos do mês passado foram ${Math.round((cases / before - 1) * 100)}% acima do primeiro boletim`,
          stance: 0,
          sourceId: bulletin.id,
        });
    }
  }

  // 4. Estimativas e interpretações sobre cada crise visível.
  for (const outbreak of visible) {
    const disease = diseaseOf(ctx.content, outbreak.diseaseId);
    const name = outbreak.phase === 'identificado' ? disease?.name : disease?.alertName;
    if (!name) continue;
    if (
      outbreak.estimate &&
      factOutlet &&
      (outbreak.identifiedMonth === t || (t - (outbreak.identifiedMonth ?? t)) % 3 === 0)
    ) {
      const [lo, hi] = outbreak.estimate.r;
      const fmt = (v: number) => decimal(v, 1);
      add({
        outletId: factOutlet.id,
        category: 'estimativa',
        headline: `${name}: especialistas estimam que cada pessoa infectada transmite a ${fmt(lo)}–${fmt(hi)} outras; ${hi < 1 ? 'tendência de queda' : lo > 1 ? 'tendência de alta' : 'tendência incerta'}`,
        stance: 0,
        sourceId: outbreak.id,
      });
    }
    const draw = keyedRng(state.seed, ['imprensa', 'interpretacao', outbreak.id, t]);
    const outlet = weightedPick(
      catalog.outlets.filter((o) => o.kind !== 'rede'),
      (o) => o.audience,
      draw.float(),
    );
    if (!outlet) continue;
    const trend = trendOf(bulletinsOf(health, outbreak.id));
    const expired = outbreak.requests.filter((r) => r.status === 'expirado' && r.closedMonth === t).length;
    const quality =
      (trend === null ? 0 : trend > 0.2 ? -0.6 : trend < -0.1 ? 0.5 : 0) -
      0.4 * Math.min(1, expired) -
      (press.tone === 'tranquilizador' ? 0.3 : 0);
    const stance = Math.max(-1, Math.min(1, outlet.bias + quality));
    const topic = name.toLowerCase();
    const headline =
      press.tone === 'tranquilizador' && stance < 0
        ? `${outlet.name} sobre ${topic}: governo minimiza a crise enquanto as notificações sobem`
        : expired > 0 && stance < 0
          ? `${outlet.name} sobre ${topic}: estados pedem leitos e esperam; resposta federal é lenta`
          : stance <= -0.3
            ? `${outlet.name} sobre ${topic}: resposta federal chega tarde, avaliam especialistas`
            : stance >= 0.3
              ? `${outlet.name} sobre ${topic}: medidas começam a dar resultado`
              : `${outlet.name} sobre ${topic}: efeito das medidas depende da adesão`;
    add({ outletId: outlet.id, category: 'interpretacao', headline, stance, sourceId: outbreak.id });
  }

  // 5. Rumores: mais prováveis com pouca confiança e sem boletins públicos. Um por mês, no máximo.
  if (visible.length > 0) {
    const draw = keyedRng(state.seed, ['imprensa', 'rumor', t]);
    const chance =
      pressParam('chance_rumor') *
      (1.5 - press.trust) *
      (press.tone === 'tranquilizador' ? pressParam('rumor_sem_boletim') : 1);
    if (draw.chance(Math.min(1, chance))) {
      const outbreak = visible[Math.floor(draw.float() * visible.length)];
      const disease = diseaseOf(ctx.content, outbreak.diseaseId);
      const vaccine = outbreak.phase === 'identificado' && outbreak.truth.vaccineMonth <= t;
      const hotUf = Object.entries(outbreak.observedOccupancy)
        .filter(([, v]) => v > 0.7)
        .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0]?.[0];
      const eligible = catalog.rumors.filter(
        (r) => (!r.needsVaccine || vaccine) && (r.veracity !== 'ocupacao' || hotUf !== undefined),
      );
      const spec = weightedPick(eligible, () => 1, draw.float());
      const outlet = weightedPick(catalog.outlets, (o) => o.sensationalism * o.audience, draw.float());
      const already = press.items.some(
        (i) => i.category === 'rumor' && i.status === 'circulando' && i.rumorId === spec?.id,
      );
      if (spec && outlet && disease && !already) {
        const uf = spec.veracity === 'ocupacao' ? hotUf : undefined;
        const ufName = ctx.content.scenario.regions?.ufs.find((u) => u.id === uf)?.name ?? uf ?? '';
        const name = outbreak.phase === 'identificado' ? disease.name : 'a nova doença';
        add({
          outletId: outlet.id,
          category: 'rumor',
          headline: capitalize(spec.headline.replace('{uf}', ufName).replace('{doenca}', name.toLowerCase())),
          stance: -0.5,
          sourceId: outbreak.id,
          rumorId: spec.id,
          ...(uf ? { uf } : {}),
          truthful: isTruthful(spec, outbreak, uf, state, press),
          status: 'circulando',
          resolveMonth: t + pressParam('meses_rumor'),
          circulation: 1,
        });
      }
    }
  }

  press.items = press.items.slice(-pressParam('itens_max'));
  return { state: { ...state, press }, contributions: [] };
};

/** Invariantes (plano §6.1, "Informação"). */
export function checkPress(
  previous: Readonly<PressState>,
  next: Readonly<PressState>,
  catalog?: PressCatalog,
): string[] {
  const issues: string[] = [];
  if (next.trust < 0 || next.trust > 1) issues.push('imprensa: confiança fora de 0–1');
  const ids = new Set<string>();
  for (const item of next.items) {
    if (ids.has(item.id)) issues.push(`imprensa: item repetido ${item.id}`);
    ids.add(item.id);
    if (catalog && !catalog.outlets.some((o) => o.id === item.outletId))
      issues.push(`imprensa: veículo desconhecido ${item.outletId}`);
    if (item.category === 'rumor' && item.truthful === undefined) issues.push(`imprensa: rumor sem verdade ${item.id}`);
    if (item.category !== 'rumor' && (item.truthful !== undefined || item.status !== undefined))
      issues.push(`imprensa: só rumor tem checagem ${item.id}`);
    const old = previous.items.find((i) => i.id === item.id);
    // Publicação estável: manchete, veículo, categoria e verdade não mudam depois de publicados.
    if (
      old &&
      (old.headline !== item.headline ||
        old.outletId !== item.outletId ||
        old.category !== item.category ||
        old.truthful !== item.truthful)
    )
      issues.push(`imprensa: item reescrito ${item.id}`);
    if (old?.status && old.status !== 'circulando' && old.status !== item.status)
      issues.push(`imprensa: checagem revertida ${item.id}`);
  }
  if (next.outlets.some((o) => o.reliability < 0 || o.reliability > 1))
    issues.push('imprensa: confiabilidade fora de 0–1');
  return issues;
}
