import { ADOPT_MEASURE_ACTION_ID, END_MEASURE_ACTION_ID, INVESTIGATE_ALERT_ACTION_ID } from '../actions';
import { monthKey, toCalendar } from '../calendar';
import { keyedRng } from '../career/draw';
import { inImpulseScope } from '../climate/effects';
import { activeImpulses } from '../impulses';
import { buildPublication, revisePublication, type JsonObject, type Publication } from '../information/publication';
import { moduleEnabled } from '../modules';
import { bulletinsArePublic, pressOf, rumorPressure } from '../press/effects';
import { regionsOf } from '../regions/regions';
import { currentNominalGdpMillions } from '../state';
import type { DecisionRejection, GameContent, GameState, MonthStep, ScheduledImpulse } from '../types';
import {
  HEALTH_LEVER_IDS,
  MEASURE_IDS,
  type Disease,
  type HealthCatalog,
  type HealthLeverId,
  type MacroRegion,
  type Measure,
  type MeasureId,
} from '../../types/health';
import type { ScenarioUf } from '../../types/scenario';
import { healthParam } from './calibration';
import { advanceEpidemic, aliveOf, effectiveR, type UfEpidemicInput } from './epidemic';
import {
  BED_CRITERIA,
  type BedCriterion,
  type CrisisReport,
  type HealthLevers,
  type HealthState,
  type HealthUf,
  type Outbreak,
  type OutbreakUf,
} from './types';

/**
 * Saúde regional, surtos e resposta pública (PLANO_EXPANSAO F08, EX-26 e EX-27).
 *
 * **Capacidade (EX-26).** Cada UF tem leitos, atenção básica, vigilância, vacinação e prevenção. A capacidade de partida
 * vem do catálogo; o que a muda são as alavancas `saude.<id>` emitidas pela **carteira existente** (rotina com dotação
 * liberada, obra em operação), como na educação: o gasto é o da própria rotina ou obra, nunca outra vez aqui.
 * Capacidade (leitos), demanda (rotina + surto) e utilização são grandezas separadas.
 *
 * **Surtos (EX-27).** Duas doenças com dinâmicas diferentes (respiratória que viaja entre UFs; vetorial que segue a
 * estação e a chuva) usam o mesmo modelo compartimental (`epidemic.ts`). A verdade de cada surto é sorteada por chave no
 * início e nunca mostrada; o governo vê boletins com atraso e ruído (publicações com revisão) e estimativas em faixa,
 * mais estreitas com vigilância, investigação e testagem.
 *
 * **Canais únicos.** Mortes: contadas aqui, retiradas da população só pela demografia (`monthDeaths`). Atividade:
 * afastamentos e restrições entram no hiato (`choque.hiato`, em nível). Custo da resposta: crédito extraordinário
 * (`gasto.extraordinario`, CF art. 167 §3º); investigação de campo: custeio. Aprovação: óbitos notificados, hospitais
 * acima da capacidade e desgaste das restrições, saturados. Governadores: pedidos atendidos ou ignorados mudam a relação.
 */

const MONTHS_PER_YEAR = 12;
const EPSILON = 1e-9;
export const HEALTH_IMPULSE_PREFIX = 'saude:';
const BULLETIN_LIMIT = 24;
const HISTORY_LIMIT = 6;

/** Fonte fictícia dos boletins (docs/AI_INSTRUCTIONS.md §8). */
export const BULLETIN_SOURCE = {
  id: 'vigilancia_federal',
  name: 'Vigilância Epidemiológica Federal (fictícia)',
  fictional: true,
} as const;
export const BULLETIN_METHOD_VERSION = 'boletim_v1';

export const EMPTY_HEALTH: HealthState = {
  ufs: [],
  outbreaks: [],
  bulletins: [],
  history: [],
  monthDeaths: [],
  activityGap: { illness: 0, restrictions: 0 },
  lastEnded: {},
};

export function healthOf(state: Pick<GameState, 'health'>): HealthState {
  return state.health ?? EMPTY_HEALTH;
}

export function diseaseOf(content: Pick<GameContent, 'health'>, id: unknown): Disease | undefined {
  return content.health?.diseases.find((d) => d.id === id);
}

export function measureOf(content: Pick<GameContent, 'health'>, id: unknown): Measure | undefined {
  return content.health?.measures.find((m) => m.id === id);
}

/** Leitos SUS de partida de uma UF (milhares) e a demanda habitual por eles. */
function baselineBeds(catalog: HealthCatalog, region: MacroRegion, population: number) {
  const base = catalog.regions[region];
  const beds = (population * base.bedsPerThousand) / 1000;
  return { beds, routine: beds * base.routineOccupancy };
}

export function initialHealth(
  catalog: HealthCatalog | undefined,
  ufs: readonly Pick<ScenarioUf, 'id' | 'region' | 'population'>[],
): HealthState {
  if (!catalog) return EMPTY_HEALTH;
  return {
    ...EMPTY_HEALTH,
    ufs: ufs.map((uf) => {
      const base = catalog.regions[uf.region];
      const { beds, routine } = baselineBeds(catalog, uf.region, uf.population);
      return {
        id: uf.id,
        region: uf.region,
        beds,
        emergencyBeds: 0,
        primary: base.primaryCoverage,
        surveillance: base.surveillance,
        vaccination: base.vaccinationPerMonth,
        prevention: 0,
        routineDemand: routine,
        outbreakDemand: 0,
      };
    }),
  };
}

/** Força somada de cada alavanca na UF (impulsos `saude.<id>` ativos no escopo). */
export function healthLevers(
  state: Pick<GameState, 'impulses' | 'monthIndex'>,
  uf: Pick<ScenarioUf, 'id' | 'region'>,
): HealthLevers {
  const active = activeImpulses(
    state.impulses,
    state.monthIndex,
    HEALTH_LEVER_IDS.map((id) => `saude.${id}` as const),
  ).filter((impulse) => inImpulseScope(uf, impulse));
  const levers = Object.fromEntries(HEALTH_LEVER_IDS.map((id) => [id, 0])) as HealthLevers;
  for (const impulse of active) levers[impulse.target.slice('saude.'.length) as HealthLeverId] += impulse.delta;
  return levers;
}

/** Capacidade-alvo da UF: a de partida mais o que as alavancas entregam, saturado. */
export function capacityTarget(
  catalog: HealthCatalog,
  uf: Pick<ScenarioUf, 'region'>,
  population: number,
  levers: HealthLevers,
): Pick<HealthUf, 'beds' | 'primary' | 'surveillance' | 'vaccination' | 'prevention'> {
  const base = catalog.regions[uf.region];
  const s = (v: number) => Math.tanh(Math.max(0, v));
  const { beds } = baselineBeds(catalog, uf.region, population);
  return {
    beds: beds * (1 + healthParam('ganho_leitos') * s(levers.hospitalar)),
    primary:
      base.primaryCoverage + (healthParam('teto_atencao_basica') - base.primaryCoverage) * s(levers.atencao_basica),
    surveillance: base.surveillance + (healthParam('teto_vigilancia') - base.surveillance) * s(levers.vigilancia),
    vaccination: base.vaccinationPerMonth * (1 + healthParam('ganho_vacinacao') * s(levers.vacinacao)),
    prevention: healthParam('teto_prevencao') * s(levers.prevencao),
  };
}

export function vaccineAvailable(outbreak: Outbreak, month: number): boolean {
  return outbreak.phase === 'identificado' && outbreak.truth.vaccineMonth <= month;
}

function isMeasure(value: unknown): value is MeasureId {
  return typeof value === 'string' && (MEASURE_IDS as readonly string[]).includes(value);
}

function isCriterion(value: unknown): value is BedCriterion {
  return typeof value === 'string' && (BED_CRITERIA as readonly string[]).includes(value);
}

function visibleOutbreak(state: Pick<GameState, 'health'>, id: unknown): Outbreak | undefined {
  return healthOf(state).outbreaks.find((o) => o.id === id && o.phase !== 'silencioso');
}

/** Validação de `investigar_alerta` (`outbreakId`): só um alerta ainda sem agente e sem investigação. */
export function validateInvestigateAlert(
  params: Readonly<Record<string, unknown>>,
  state: Readonly<GameState>,
): DecisionRejection | null {
  const outbreak = visibleOutbreak(state, params.outbreakId);
  return outbreak && outbreak.phase === 'alerta' && outbreak.investigatedMonth === undefined ? null : 'alvo_invalido';
}

/** Por que uma medida não pode ser adotada agora (texto para a interface), ou `null`. */
export function measureBlock(outbreak: Outbreak, measureId: MeasureId, month: number): string | null {
  if (outbreak.measures.some((m) => m.id === measureId)) return 'já em vigor';
  if (measureId === 'vacinacao_em_massa' && outbreak.phase !== 'identificado') return 'agente ainda não identificado';
  if (measureId === 'vacinacao_em_massa' && !vaccineAvailable(outbreak, month)) return 'ainda não há vacina';
  return null;
}

/** `adotar_medida` (`outbreakId`, `measureId`; `criterion` nos leitos de emergência). */
export function validateAdoptMeasure(
  params: Readonly<Record<string, unknown>>,
  state: Readonly<GameState>,
  content: GameContent,
): DecisionRejection | null {
  const outbreak = visibleOutbreak(state, params.outbreakId);
  if (!outbreak || !isMeasure(params.measureId) || !measureOf(content, params.measureId)) return 'alvo_invalido';
  if (params.measureId === 'leitos_emergencia' && !isCriterion(params.criterion)) return 'alvo_invalido';
  const block = measureBlock(outbreak, params.measureId, state.monthIndex);
  if (block === 'já em vigor') return 'ja_em_andamento';
  return block ? 'alvo_invalido' : null;
}

/** `encerrar_medida` (`outbreakId`, `measureId`): só uma medida em vigor. */
export function validateEndMeasure(
  params: Readonly<Record<string, unknown>>,
  state: Readonly<GameState>,
): DecisionRejection | null {
  const outbreak = visibleOutbreak(state, params.outbreakId);
  return outbreak?.measures.some((m) => m.id === params.measureId) ? null : 'alvo_invalido';
}

/** Fração do efeito pleno de uma medida no mês (rampa de implantação). */
export function measureRamp(measure: Measure, startMonth: number, month: number): number {
  if (measure.rampMonths === 0) return 1;
  return Math.min(1, (month - startMonth + 1) / (measure.rampMonths + 1));
}

function lerp([lo, hi]: readonly [number, number], u: number): number {
  return lo + (hi - lo) * u;
}

function ufAges(state: Pick<GameState, 'demography'>, id: string) {
  return state.demography.ufs.find((u) => u.id === id)?.ages;
}

function populationOf(state: Pick<GameState, 'demography'>, uf: Pick<ScenarioUf, 'id' | 'population'>): number {
  const ages = ufAges(state, uf.id);
  return ages ? ages.young + ages.working + ages.older : uf.population;
}

/** Risco etário relativo da UF em relação ao do país (internação e morte). */
function ageFactor(state: Pick<GameState, 'demography'>, id: string, disease: Disease): number {
  const risk = (a: { young: number; working: number; older: number }) =>
    a.young * disease.ageRisk.young + a.working * disease.ageRisk.working + a.older * disease.ageRisk.older;
  const ages = ufAges(state, id);
  let n = 0;
  let r = 0;
  for (const u of state.demography.ufs) {
    n += u.ages.young + u.ages.working + u.ages.older;
    r += risk(u.ages);
  }
  if (!ages || n <= 0 || r <= 0) return 1;
  const local = ages.young + ages.working + ages.older;
  return local > 0 ? risk(ages) / local / (r / n) : 1;
}

/** Adesão às medidas na UF (0–1): confiança, governador, auxílio, tom, cansaço e boatos. Sem sorteio. */
export function adherenceOf(
  state: Pick<GameState, 'press' | 'regions' | 'monthIndex'>,
  content: Pick<GameContent, 'press'>,
  outbreak: Outbreak | undefined,
  uf: Pick<HealthUf, 'id' | 'region'>,
): number {
  const press = pressOf(state);
  const relation = state.regions.ufs.find((u) => u.id === uf.id)?.governorRelation ?? 0;
  const restriction = outbreak?.measures.find((m) => m.id === 'restricoes_circulacao');
  const months = restriction ? state.monthIndex - restriction.startMonth : 0;
  const toneAdj =
    press.tone === 'alerta'
      ? healthParam('adesao_tom_alerta')
      : press.tone === 'tranquilizador'
        ? -healthParam('adesao_tom_tranquilizador')
        : 0;
  const value =
    healthParam('adesao_base') +
    healthParam('peso_confianca') * (press.trust - 0.5) +
    healthParam('peso_governador') * (relation / 100) +
    (outbreak?.measures.some((m) => m.id === 'auxilio_emergencial') ? healthParam('ganho_auxilio') : 0) +
    toneAdj -
    healthParam('cansaco_adesao') * Math.max(0, months - 1) -
    rumorPressure(press, content.press, uf.region).adherence;
  return Math.min(healthParam('adesao_max'), Math.max(healthParam('adesao_min'), value));
}

/** Fração das infecções que vira notificação na UF (vigilância e testagem). */
function ascertainmentOf(disease: Disease, uf: HealthUf, testing: boolean): number {
  return Math.min(
    1,
    disease.ascertainment *
      (0.5 + 0.5 * uf.surveillance) *
      (testing ? 1 + healthParam('ganho_testagem_notificacao') : 1),
  );
}

/** Multiplicador da transmissão no mês: estação, chuva e prevenção (vetorial) e medidas × adesão. */
function transmissionOf(
  disease: Disease,
  outbreak: Outbreak,
  uf: HealthUf,
  rain: number,
  adherence: number,
  content: Pick<GameContent, 'health'>,
  month: number,
): number {
  let factor = disease.seasonality[toCalendar(month).month - 1];
  if (disease.transmission === 'vetorial')
    factor *= (1 + disease.rainSensitivity * Math.max(0, rain)) * (1 - uf.prevention);
  for (const active of outbreak.measures) {
    const measure = measureOf(content, active.id);
    if (!measure) continue;
    const cut = measure.transmissionCut[disease.transmission];
    if (cut <= 0) continue;
    const execution =
      active.id === 'testagem_rastreamento'
        ? Math.min(1, uf.primary / healthParam('atencao_basica_referencia'))
        : adherence;
    factor *= 1 - cut * execution * measureRamp(measure, active.startMonth, month);
  }
  return factor;
}

function newOutbreakUf(id: string, population: number): OutbreakUf {
  return {
    id,
    c: { s: population, e: 0, i: 0, h: 0, r: 0 },
    population,
    monthInfections: 0,
    monthHospital: 0,
    monthDeaths: 0,
    monthVaccinated: 0,
    vaccinated: 0,
    infections: 0,
    deaths: 0,
    overCapacityMonths: 0,
  };
}

/** Sorteia (por chave) se uma doença começa um surto no mês e onde. */
function maybeStartOutbreak(
  state: GameState,
  content: GameContent,
  disease: Disease,
  ufs: readonly ScenarioUf[],
  health: HealthState,
): Outbreak | null {
  const t = state.monthIndex;
  const last = health.lastEnded[disease.id];
  if (last !== undefined && t - last < healthParam('intervalo_surto')) return null;
  const rainOf = (id: string) => state.climate.ufs.find((u) => u.id === id)?.rain ?? 0;
  const pops = ufs.map((uf) => populationOf(state, uf));
  const total = pops.reduce((s, v) => s + v, 0);
  if (total <= 0) return null;
  let probability = disease.monthlyProbability * disease.seasonality[toCalendar(t).month - 1];
  if (disease.transmission === 'vetorial') {
    const rain = ufs.reduce((s, uf, i) => s + (pops[i] / total) * Math.max(0, rainOf(uf.id)), 0);
    const prevention = health.ufs.reduce((s, uf, i) => s + ((pops[i] ?? 0) / total) * uf.prevention, 0);
    probability *= (1 + disease.rainSensitivity * rain) * (1 - prevention);
  }
  if (!keyedRng(state.seed, ['saude', 'surto', disease.id, t]).chance(Math.min(1, probability))) return null;

  const draw = keyedRng(state.seed, ['saude', 'verdade', disease.id, t]);
  const weights = ufs.map((uf, i) =>
    disease.transmission === 'vetorial'
      ? pops[i] * (1 + disease.rainSensitivity * Math.max(0, rainOf(uf.id)))
      : pops[i],
  );
  const sum = weights.reduce((s, w) => s + w, 0);
  let pick = draw.float() * sum;
  let origin = ufs[ufs.length - 1];
  for (let i = 0; i < ufs.length; i++) {
    pick -= weights[i];
    if (pick < 0) {
      origin = ufs[i];
      break;
    }
  }
  const r0 = lerp(disease.r0, draw.float());
  const hospitalRate = lerp(disease.hospitalRate, draw.float());
  const vaccineMonth = t + Math.round(lerp(disease.vaccine.monthsUntilAvailable, draw.float()));
  return createOutbreak(state, disease, ufs, origin.id, { r0, hospitalRate, vaccineMonth });
}

/**
 * Cria um surto com verdade dada, semeado na UF de origem (e, na doença vetorial, na macrorregião). Usado pelo sorteio
 * do mês e pelos cenários de teste (múltiplos surtos, parâmetros extremos).
 */
export function createOutbreak(
  state: Pick<GameState, 'demography' | 'monthIndex'>,
  disease: Disease,
  ufs: readonly ScenarioUf[],
  originId: string,
  truth: Outbreak['truth'],
): Outbreak {
  const t = state.monthIndex;
  const origin = ufs.find((uf) => uf.id === originId) ?? ufs[0];
  const pops = ufs.map((uf) => populationOf(state, uf));
  const outbreakUfs = ufs.map((uf, i) => {
    const u = newOutbreakUf(uf.id, pops[i]);
    // A vetorial nasce espalhada pela macrorregião (o mosquito já está lá); a respiratória, num só lugar.
    const seed =
      uf.id === origin.id
        ? disease.seedThousands
        : disease.transmission === 'vetorial' && uf.region === origin.region
          ? disease.seedThousands / 4
          : 0;
    const immune = u.c.s * disease.priorImmunity;
    u.c.s -= immune;
    u.c.r += immune;
    const seeded = Math.min(seed, u.c.s);
    u.c.s -= seeded;
    u.c.i += seeded;
    return u;
  });
  return {
    id: `${disease.id}#${t}`,
    diseaseId: disease.id,
    originUf: origin.id,
    startMonth: t,
    phase: 'silencioso',
    truth: { ...truth },
    ufs: outbreakUfs,
    measures: [],
    requests: [],
    ledger: {
      fiscalMillions: 0,
      activityLoss: 0,
      approval: 0,
      measureMonths: {},
      observedCases: 0,
      observedDeaths: 0,
      peakObservedOccupancy: 0,
      peakUf: null,
      peakInfections: 0,
      trustAtDetection: null,
    },
    quietMonths: 0,
    observedOccupancy: {},
  };
}

/** Pesos do lote de leitos de emergência por UF, conforme o critério escolhido. */
function bedWeights(
  criterion: BedCriterion,
  outbreak: Outbreak,
  ufs: readonly HealthUf[],
  state: Pick<GameState, 'regions'>,
): number[] {
  return ufs.map((uf) => {
    const occupancy = outbreak.observedOccupancy[uf.id] ?? 0;
    const affected = (outbreak.ufs.find((u) => u.id === uf.id)?.monthInfections ?? 0) > 0;
    const need = Math.max(0, occupancy - 0.8) * uf.beds;
    switch (criterion) {
      case 'ocupacao':
        return need;
      case 'populacao':
        return affected ? (outbreak.ufs.find((u) => u.id === uf.id)?.population ?? 0) : 0;
      case 'pedidos':
        return outbreak.requests
          .filter((r) => r.uf === uf.id && r.status === 'pendente')
          .reduce((s, r) => s + r.bedsNeeded, 0);
      case 'aliados': {
        const relation = state.regions.ufs.find((u) => u.id === uf.id)?.governorRelation ?? 0;
        return need * (relation > 0 ? 1 : healthParam('peso_aliado'));
      }
    }
  });
}

interface Notified {
  cases: number;
  deaths: number;
  hospital: number;
  ufs: { uf: string; cases: number; occupancy: number }[];
}

function payloadOf(outbreak: Outbreak, label: string, notified: Notified, isPublic: boolean): JsonObject {
  const round = (v: number) => Math.round(v * 1000) / 1000;
  return {
    outbreakId: outbreak.id,
    disease: label,
    cases: round(notified.cases),
    hospitalizations: round(notified.hospital),
    deaths: round(notified.deaths),
    public: isPublic,
    ufs: notified.ufs
      .filter((u) => u.cases > 0.0005 || u.occupancy > 0.85)
      .map((u) => ({ uf: u.uf, cases: round(u.cases), occupancy: round(u.occupancy) })),
  };
}

/** Número do boletim (preliminar ou revisado) lido de uma publicação. Só leitura. */
export function bulletinNumber(publication: Publication, key: 'cases' | 'deaths' | 'hospitalizations'): number {
  const payload = publication.revisions[publication.revisions.length - 1]?.payload;
  const value = payload?.[key];
  return typeof value === 'number' ? value : 0;
}

/** Boletins de um surto, do mais antigo ao mais novo. */
export function bulletinsOf(health: Pick<HealthState, 'bulletins'>, outbreakId: string): Publication[] {
  return health.bulletins.filter((b) => b.revisions[0]?.payload.outbreakId === outbreakId);
}

function crisisReport(
  outbreak: Outbreak,
  disease: Disease,
  health: HealthState,
  t: number,
  trust: number,
): CrisisReport {
  const bulletins = bulletinsOf(health, outbreak.id);
  const cases = bulletins.reduce((s, b) => s + bulletinNumber(b, 'cases'), 0);
  const deaths = bulletins.reduce((s, b) => s + bulletinNumber(b, 'deaths'), 0);
  const asc = disease.ascertainment;
  return {
    outbreakId: outbreak.id,
    diseaseId: disease.id,
    diseaseName: outbreak.phase === 'identificado' ? disease.name : disease.alertName,
    detectedMonth: outbreak.detectedMonth ?? null,
    identifiedMonth: outbreak.identifiedMonth ?? null,
    endMonth: t,
    observed: {
      cases,
      deaths,
      peakOccupancy: outbreak.ledger.peakObservedOccupancy,
      peakUf: outbreak.ledger.peakUf,
      ufsOverCapacity: outbreak.ufs.filter((u) => u.overCapacityMonths > 0).map((u) => u.id),
      fiscalMillions: outbreak.ledger.fiscalMillions,
      requestsServed: outbreak.requests.filter((r) => r.status === 'atendido').length,
      requestsExpired: outbreak.requests.filter((r) => r.status === 'expirado').length,
      measures: Object.entries(outbreak.ledger.measureMonths).map(([id, months]) => ({
        id: id as MeasureId,
        months: months ?? 0,
      })),
    },
    // Estimativas a partir do que foi notificado e da faixa conhecida de subnotificação, nunca da verdade.
    estimated: {
      infections: [cases / Math.min(1, asc * 1.5), cases / Math.max(EPSILON, asc * 0.5)],
      deaths: [deaths, deaths / 0.6],
      activityLossPp: outbreak.ledger.activityLoss * 100,
      approvalPp: outbreak.ledger.approval * 100,
    },
    trustChange: outbreak.ledger.trustAtDetection === null ? null : trust - outbreak.ledger.trustAtDetection,
  };
}

/**
 * Etapa do mês (antes da demografia): capacidade, decisões, surtos ativos, notificação, pedidos, efeitos, balanço e
 * novos surtos. Sem catálogo, módulo inerte.
 */
export const healthStep: MonthStep = (state, ctx) => {
  const catalog = ctx.content.health;
  const ufsSpec = regionsOf(ctx.content);
  if (!catalog || ufsSpec.length === 0) return { state, contributions: [] };
  const t = state.monthIndex;
  const notes = ctx.draft.notes;
  const before = healthOf(state);
  const press = pressOf(state);
  const impulses: ScheduledImpulse[] = [];
  const price = state.economy.priceLevel;
  const gdpMillions = currentNominalGdpMillions(state, ctx.content);

  // 1. Capacidade: anda até o alvo das alavancas da carteira; a demanda de rotina acompanha a população.
  const health: HealthState = {
    ...before,
    ufs: ufsSpec.map((spec) => {
      const old = before.ufs.find((u) => u.id === spec.id);
      const population = populationOf(state, spec);
      const target = capacityTarget(catalog, spec, population, healthLevers(state, spec));
      const adjust = healthParam('ajuste_capacidade');
      const move = (from: number | undefined, to: number) => (from === undefined ? to : from + (to - from) * adjust);
      return {
        id: spec.id,
        region: spec.region,
        beds: move(old?.beds, target.beds),
        emergencyBeds: 0,
        primary: move(old?.primary, target.primary),
        surveillance: move(old?.surveillance, target.surveillance),
        vaccination: move(old?.vaccination, target.vaccination),
        prevention: move(old?.prevention, target.prevention),
        routineDemand: baselineBeds(catalog, spec.region, population).routine,
        outbreakDemand: 0,
      };
    }),
    outbreaks: before.outbreaks.map((o) => ({
      ...o,
      measures: [...o.measures],
      requests: o.requests.map((r) => ({ ...r })),
      ledger: { ...o.ledger, measureMonths: { ...o.ledger.measureMonths } },
    })),
    bulletins: [...before.bulletins],
    history: [...before.history],
    lastEnded: { ...before.lastEnded },
    monthDeaths: [],
  };

  // 2. Decisões do mês.
  let investigationMillions = 0;
  for (const decision of ctx.decisions) {
    const params = decision.params ?? {};
    const outbreak = health.outbreaks.find((o) => o.id === params.outbreakId && o.phase !== 'silencioso');
    if (!outbreak) continue;
    const disease = diseaseOf(ctx.content, outbreak.diseaseId);
    if (
      decision.policyId === INVESTIGATE_ALERT_ACTION_ID &&
      outbreak.phase === 'alerta' &&
      outbreak.investigatedMonth === undefined
    ) {
      outbreak.investigatedMonth = t;
      investigationMillions += healthParam('custo_investigacao') * price;
      notes.push(`Investigação de campo enviada: ${disease?.alertName ?? 'alerta'}; resultado no próximo mês.`);
    } else if (decision.policyId === ADOPT_MEASURE_ACTION_ID && isMeasure(params.measureId)) {
      if (measureBlock(outbreak, params.measureId, t)) continue;
      if (params.measureId === 'leitos_emergencia' && !isCriterion(params.criterion)) continue;
      outbreak.measures.push({
        id: params.measureId,
        startMonth: t,
        ...(params.measureId === 'leitos_emergencia' ? { criterion: params.criterion as BedCriterion } : {}),
      });
      notes.push(`Medida adotada: ${measureOf(ctx.content, params.measureId)?.name ?? params.measureId}.`);
    } else if (decision.policyId === END_MEASURE_ACTION_ID) {
      const ended = outbreak.measures.find((m) => m.id === params.measureId);
      if (!ended) continue;
      outbreak.measures = outbreak.measures.filter((m) => m.id !== params.measureId);
      notes.push(`Medida encerrada: ${measureOf(ctx.content, ended.id)?.name ?? ended.id}.`);
    }
  }

  // 3. Surtos ativos.
  const rainOf = (id: string) => state.climate.ufs.find((u) => u.id === id)?.rain ?? 0;
  const deathsByUf = new Map<string, { young: number; working: number; older: number }>();
  let illnessLevel = 0;
  let restrictionLevel = 0;
  let measureMillions = 0;
  let observedDeathsMonth = 0;
  let overCapacityPopulation = 0;
  let fatigue = 0;
  const totalPopulation = ufsSpec.reduce((s, uf) => s + populationOf(state, uf), 0);
  const totalWorking = state.demography.ufs.reduce((s, u) => s + u.ages.working, 0);
  const isPublic = bulletinsArePublic(press);
  const survivors: Outbreak[] = [];

  for (const outbreak of health.outbreaks) {
    const disease = diseaseOf(ctx.content, outbreak.diseaseId);
    if (!disease) continue;
    // População do mês vem da demografia; nascimentos, migração e mortes naturais ajustam os suscetíveis.
    outbreak.ufs = outbreak.ufs.map((u) => {
      const spec = ufsSpec.find((s) => s.id === u.id);
      const population = spec ? populationOf(state, spec) : aliveOf(u);
      const others = u.c.e + u.c.i + u.c.h + u.c.r;
      const scale = others > population && others > 0 ? population / others : 1;
      const c = { s: 0, e: u.c.e * scale, i: u.c.i * scale, h: u.c.h * scale, r: u.c.r * scale };
      c.s = Math.max(0, population - c.e - c.i - c.h - c.r);
      return { ...u, c, population };
    });

    const testing = outbreak.measures.some((m) => m.id === 'testagem_rastreamento');
    const adherence = new Map(health.ufs.map((uf) => [uf.id, adherenceOf(state, ctx.content, outbreak, uf)]));

    // Leitos de emergência: lote nacional repartido pelo critério escolhido, com rampa.
    const beds = outbreak.measures.find((m) => m.id === 'leitos_emergencia');
    if (beds) {
      const spec = measureOf(ctx.content, 'leitos_emergencia');
      const pool = healthParam('leitos_lote') * (spec ? measureRamp(spec, beds.startMonth, t) : 1);
      const weights = bedWeights(beds.criterion ?? 'ocupacao', outbreak, health.ufs, state);
      const sum = weights.reduce((s, w) => s + w, 0);
      health.ufs.forEach((uf, i) => {
        if (sum > 0) uf.emergencyBeds += (pool * weights[i]) / sum;
      });
    }

    // Vacinas: oferta nacional por população, limitada pela rede e pela procura.
    const vaccinating = outbreak.measures.some((m) => m.id === 'vacinacao_em_massa') && vaccineAvailable(outbreak, t);
    let doses = 0;
    const inputs = new Map<string, UfEpidemicInput>();
    for (const uf of health.ufs) {
      const ou = outbreak.ufs.find((u) => u.id === uf.id);
      if (!ou) continue;
      const a = adherence.get(uf.id) ?? healthParam('adesao_base');
      let ufDoses = 0;
      if (vaccinating) {
        const uptake = Math.min(
          0.98,
          Math.max(
            0.2,
            healthParam('procura_vacina') -
              healthParam('peso_confianca_vacina') * Math.max(0, 0.5 - press.trust) * 2 -
              rumorPressure(press, ctx.content.press, uf.region).vaccine,
          ),
        );
        const supply = disease.vaccine.supplyPerMonth * ou.population;
        const network = uf.vaccination * ou.population;
        ufDoses = Math.max(0, Math.min(supply, network, uptake * ou.population - ou.vaccinated));
        doses += ufDoses;
      }
      const reference = healthParam('atencao_basica_referencia');
      inputs.set(uf.id, {
        id: uf.id,
        transmission: transmissionOf(disease, outbreak, uf, rainOf(uf.id), a, ctx.content, t),
        hospitalRate:
          outbreak.truth.hospitalRate *
          ageFactor(state, uf.id, disease) *
          Math.max(0.5, 1 + healthParam('internacao_atencao_basica') * (reference - uf.primary)),
        freeBeds: uf.beds + uf.emergencyBeds - uf.routineDemand,
        doses: ufDoses,
        efficacy: disease.vaccine.efficacy,
      });
    }

    const previousInfections = outbreak.ufs.reduce((sum, u) => sum + u.monthInfections, 0);
    const results = advanceEpidemic(outbreak.ufs, inputs, disease, outbreak.truth.r0);
    outbreak.ufs = results.map((r) => r.uf);

    // Mortes por faixa etária (a demografia as retira da população) e demanda por leitos.
    let monthInfections = 0;
    let activeNow = 0;
    const notified: Notified = { cases: 0, deaths: 0, hospital: 0, ufs: [] };
    const noise = keyedRng(state.seed, ['saude', 'boletim', outbreak.id, t]);
    const jitter = () => 1 + (2 * noise.float() - 1) * healthParam('ruido_boletim');
    results.forEach((result, index) => {
      const u = result.uf;
      const uf = health.ufs[index];
      const ages = ufAges(state, u.id);
      if (ages && u.monthDeaths > 0) {
        const weighted = {
          young: ages.young * disease.ageRisk.young,
          working: ages.working * disease.ageRisk.working,
          older: ages.older * disease.ageRisk.older,
        };
        const sum = weighted.young + weighted.working + weighted.older;
        const acc = deathsByUf.get(u.id) ?? { young: 0, working: 0, older: 0 };
        for (const g of ['young', 'working', 'older'] as const)
          acc[g] += sum > 0 ? (u.monthDeaths * weighted[g]) / sum : 0;
        deathsByUf.set(u.id, acc);
      }
      monthInfections += u.monthInfections;
      activeNow += u.c.e + u.c.i + u.c.h;
      if (uf) {
        uf.outbreakDemand += result.averageHospital;
        const capacity = uf.beds + uf.emergencyBeds;
        const occupancy = capacity > 0 ? (uf.routineDemand + uf.outbreakDemand) / capacity : 0;
        if (occupancy > 1) u.overCapacityMonths += 1;
        const asc = ascertainmentOf(disease, uf, testing);
        const cases = u.monthInfections * asc * jitter();
        notified.cases += cases;
        notified.hospital += u.monthHospital * (0.6 + 0.4 * uf.surveillance) * jitter();
        notified.deaths += u.monthDeaths * (0.6 + 0.4 * uf.surveillance) * jitter();
        notified.ufs.push({ uf: u.id, cases, occupancy: occupancy * (1 + (noise.float() - 0.5) * 0.04) });
        const share = ages ? ages.working / Math.max(EPSILON, ages.young + ages.working + ages.older) : 0.6;
        illnessLevel -=
          totalWorking > 0
            ? (healthParam('mult_afastamento') * u.monthInfections * share * disease.workDaysLost) /
              healthParam('dias_mes') /
              totalWorking
            : 0;
      }
    });

    // Detecção, identificação e estimativa.
    if (outbreak.phase === 'silencioso') {
      const signal = notified.ufs.reduce(
        (s, u) => s + u.cases * (health.ufs.find((h) => h.id === u.uf)?.surveillance ?? 0),
        0,
      );
      const chance = 1 - Math.exp(-healthParam('deteccao') * signal);
      if (keyedRng(state.seed, ['saude', 'deteccao', outbreak.id, t]).chance(chance)) {
        outbreak.phase = 'alerta';
        outbreak.detectedMonth = t;
        outbreak.ledger.trustAtDetection = press.trust;
        notes.push(
          `Alerta da vigilância: ${disease.alertName}. Agente ainda desconhecido; dá para investigar antes de decidir.`,
        );
      }
    } else if (outbreak.phase === 'alerta') {
      const byInvestigation = outbreak.investigatedMonth !== undefined && t > outbreak.investigatedMonth;
      const byTime = t - (outbreak.detectedMonth ?? t) >= healthParam('meses_identificacao');
      if (byInvestigation || byTime) {
        outbreak.phase = 'identificado';
        outbreak.identifiedMonth = t;
        notes.push(
          `Agente identificado: ${disease.name}${byInvestigation ? ' (investigação de campo)' : ' (depois de meses de notificações)'}.`,
        );
      }
    }
    if (outbreak.phase === 'identificado') {
      const weight = outbreak.ufs.reduce((s, u) => s + u.monthInfections, 0);
      const rTrue =
        weight > 0
          ? outbreak.ufs.reduce(
              (s, u) => s + u.monthInfections * effectiveR(u, inputs.get(u.id), outbreak.truth.r0),
              0,
            ) / weight
          : 0;
      const surveillance = health.ufs.reduce((s, u) => s + u.surveillance, 0) / Math.max(1, health.ufs.length);
      const width =
        healthParam('largura_estimativa') /
        (1 +
          surveillance +
          (outbreak.investigatedMonth !== undefined ? 1 : 0) +
          (testing ? 0.5 : 0) +
          0.25 * (t - (outbreak.identifiedMonth ?? t)));
      const draw = keyedRng(state.seed, ['saude', 'estimativa', outbreak.id, t]);
      const band = (value: number): [number, number] => {
        const center = value * Math.exp((2 * draw.float() - 1) * width * 0.5);
        return [center * Math.exp(-width), center * Math.exp(width)];
      };
      outbreak.estimate = { month: t, r: band(rTrue), hospitalRate: band(outbreak.truth.hospitalRate) };
      if (outbreak.truth.vaccineMonth === t && disease.vaccine.monthsUntilAvailable[1] > 0)
        notes.push(`Vacina contra ${disease.name} aprovada: a campanha pode começar.`);
    }

    // Boletim (publicação): preliminar do mês e revisão do anterior, com as notificações atrasadas.
    if (outbreak.phase !== 'silencioso') {
      const label = outbreak.phase === 'identificado' ? disease.name : disease.alertName;
      const preliminary: Notified = {
        cases: notified.cases * healthParam('preliminar_casos'),
        deaths: notified.deaths * healthParam('preliminar_obitos'),
        hospital: notified.hospital * healthParam('preliminar_casos'),
        ufs: notified.ufs.map((u) => ({ ...u, cases: u.cases * healthParam('preliminar_casos') })),
      };
      const previousIndex = health.bulletins.findIndex(
        (b) => b.id === `boletim:${outbreak.id}:${t - 1}` && b.revisions.length === 1,
      );
      if (previousIndex >= 0 && outbreak.pendingRevision) {
        const previous = health.bulletins[previousIndex];
        health.bulletins[previousIndex] = revisePublication(previous, {
          publishedAt: monthKey(t),
          observedPeriod: { ...previous.revisions[0].observedPeriod },
          methodVersion: BULLETIN_METHOD_VERSION,
          precision: { margin: healthParam('ruido_boletim') },
          payload: { ...outbreak.pendingRevision, public: isPublic },
          reason: 'notificações e óbitos em investigação que chegaram depois do fechamento',
        });
      }
      // O boletim completo do mês só sai na revisão do mês seguinte; até lá fica com o governo.
      outbreak.pendingRevision = payloadOf(outbreak, label, notified, isPublic);
      health.bulletins.push(
        buildPublication({
          id: `boletim:${outbreak.id}:${t}`,
          kind: 'boletim',
          source: BULLETIN_SOURCE,
          publishedAt: monthKey(t),
          observedPeriod: { from: monthKey(t), to: monthKey(t) },
          methodVersion: BULLETIN_METHOD_VERSION,
          precision: { margin: healthParam('ruido_boletim') },
          payload: payloadOf(outbreak, label, preliminary, isPublic),
        }),
      );
      outbreak.ledger.observedCases += notified.cases;
      outbreak.ledger.observedDeaths += notified.deaths;
      observedDeathsMonth += preliminary.deaths;
      outbreak.observedOccupancy = Object.fromEntries(notified.ufs.map((u) => [u.uf, u.occupancy]));
      for (const u of notified.ufs) {
        if (u.occupancy > outbreak.ledger.peakObservedOccupancy) {
          outbreak.ledger.peakObservedOccupancy = u.occupancy;
          outbreak.ledger.peakUf = u.uf;
        }
        if (u.occupancy > 1) overCapacityPopulation += outbreak.ufs.find((o) => o.id === u.uf)?.population ?? 0;
      }

      // Pedidos dos governadores: atendidos com leitos, ou expiram e custam a relação. Uma nota por tipo no mês.
      const served: string[] = [];
      const expired: string[] = [];
      const asked: string[] = [];
      for (const request of outbreak.requests) {
        if (request.status !== 'pendente') continue;
        const uf = health.ufs.find((u) => u.id === request.uf);
        const name = ufsSpec.find((s) => s.id === request.uf)?.name ?? request.uf;
        if (uf && uf.emergencyBeds >= healthParam('pedido_atendido') * request.bedsNeeded) {
          request.status = 'atendido';
          request.closedMonth = t;
          impulses.push(relationImpulse(request.uf, healthParam('relacao_atendido'), `Apoio atendido: ${name}`, t));
          served.push(name);
        } else if (t - request.month >= healthParam('pedido_meses')) {
          request.status = 'expirado';
          request.closedMonth = t;
          impulses.push(
            relationImpulse(request.uf, healthParam('relacao_expirado'), `Pedido sem resposta: ${name}`, t),
          );
          expired.push(name);
        }
      }
      for (const u of notified.ufs) {
        if (u.occupancy < healthParam('pedido_ocupacao')) continue;
        const recent = outbreak.requests.some(
          (r) =>
            r.uf === u.uf &&
            (r.status === 'pendente' || t - (r.closedMonth ?? r.month) < healthParam('pedido_intervalo')),
        );
        if (recent) continue;
        const uf = health.ufs.find((h) => h.id === u.uf);
        if (!uf) continue;
        outbreak.requests.push({
          uf: u.uf,
          month: t,
          bedsNeeded: Math.max(0, u.occupancy - 0.85) * (uf.beds + uf.emergencyBeds),
          status: 'pendente',
        });
        asked.push(`${u.uf} (${Math.round(u.occupancy * 100)}%)`);
      }
      const list = (names: string[]) =>
        names.length > 4 ? `${names.slice(0, 4).join(', ')} e mais ${names.length - 4}` : names.join(', ');
      if (asked.length)
        notes.push(
          `Governadores pedem leitos (ocupação notificada): ${list(asked)}. Sem resposta em ${healthParam('pedido_meses')} meses, a relação piora.`,
        );
      if (served.length) notes.push(`Pedidos atendidos com leitos de emergência: ${list(served)}.`);
      if (expired.length) notes.push(`Pedidos sem resposta; governadores reclamam publicamente: ${list(expired)}.`);
    }

    // Medidas: custo (crédito extraordinário), perda de atividade e desgaste.
    const nationalAdherence =
      totalPopulation > 0
        ? outbreak.ufs.reduce((s, u) => s + (adherence.get(u.id) ?? 0) * u.population, 0) / totalPopulation
        : 0;
    const relief = outbreak.measures.some((m) => m.id === 'auxilio_emergencial') ? healthParam('alivio_auxilio') : 0;
    for (const active of outbreak.measures) {
      const measure = measureOf(ctx.content, active.id);
      if (!measure) continue;
      const ramp = measureRamp(measure, active.startMonth, t);
      let cost = measure.monthlyMillions * price * (active.id === 'leitos_emergencia' ? ramp : 1);
      if (active.id === 'vacinacao_em_massa') cost += doses * healthParam('custo_dose') * price;
      measureMillions += cost;
      outbreak.ledger.fiscalMillions += cost;
      outbreak.ledger.measureMonths[active.id] = (outbreak.ledger.measureMonths[active.id] ?? 0) + 1;
      if (measure.activityLoss > 0) restrictionLevel -= measure.activityLoss * ramp * nationalAdherence;
      if (measure.fatigue > 0) {
        const months = t - active.startMonth + 1;
        fatigue += measure.fatigue * Math.min(healthParam('cansaco_teto'), 1 + 0.25 * (months - 1)) * (1 - relief);
      }
    }

    // Fim da crise: quase ninguém infectado, ou (doença endêmica) infecções do mês num resto pequeno do pico, em queda.
    outbreak.ledger.peakInfections = Math.max(outbreak.ledger.peakInfections, monthInfections);
    const residual =
      monthInfections < healthParam('fim_fracao_pico') * outbreak.ledger.peakInfections &&
      monthInfections <= previousInfections;
    outbreak.quietMonths = activeNow < healthParam('fim_ativos') || residual ? outbreak.quietMonths + 1 : 0;
    if (outbreak.quietMonths >= healthParam('fim_meses')) {
      health.lastEnded[outbreak.diseaseId] = t;
      if (outbreak.phase !== 'silencioso') {
        const report = crisisReport(outbreak, disease, health, t, press.trust);
        health.history = [...health.history, report].slice(-HISTORY_LIMIT);
        notes.push(
          `Crise encerrada: ${report.diseaseName}. O balanço separa o que foi notificado do que é estimativa.`,
        );
      }
      continue;
    }
    survivors.push(outbreak);
  }
  health.outbreaks = survivors;

  // 4. Novos surtos (sorteio por chave; um por doença de cada vez).
  if (moduleEnabled(state, 'crises_sanitarias')) {
    for (const disease of catalog.diseases) {
      if (health.outbreaks.some((o) => o.diseaseId === disease.id)) continue;
      const started = maybeStartOutbreak(state, ctx.content, disease, ufsSpec, health);
      if (started) health.outbreaks.push(started);
    }
  }

  // 5. Efeitos: mortes para a demografia, atividade (hiato em nível), custo e aprovação.
  health.monthDeaths = [...deathsByUf.entries()]
    .map(([id, d]) => ({ id, ...d }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const rho = ctx.content.calibration.rho_h;
  const gapImpulse = (key: 'illness' | 'restrictions', level: number, label: string) => {
    const delta = level - rho * before.activityGap[key];
    if (Math.abs(delta) > EPSILON)
      impulses.push({
        sourceId: `${HEALTH_IMPULSE_PREFIX}${key}:${t}`,
        label,
        target: 'choque.hiato',
        delta,
        startMonth: t,
        endMonth: t,
      });
  };
  gapImpulse('illness', illnessLevel, 'Afastamentos por doença');
  gapImpulse('restrictions', restrictionLevel, 'Restrições de circulação');
  health.activityGap = { illness: illnessLevel, restrictions: restrictionLevel };

  if (measureMillions > EPSILON && gdpMillions > 0)
    impulses.push({
      sourceId: `${HEALTH_IMPULSE_PREFIX}resposta:${t}`,
      label: 'Resposta à crise sanitária (crédito extraordinário)',
      target: 'gasto.extraordinario',
      delta: (measureMillions * MONTHS_PER_YEAR) / gdpMillions,
      startMonth: t,
      endMonth: t,
    });
  if (investigationMillions > EPSILON && gdpMillions > 0)
    impulses.push({
      sourceId: `${HEALTH_IMPULSE_PREFIX}investigacao:${t}`,
      label: 'Investigação epidemiológica de campo',
      target: 'gasto.custeio',
      delta: (investigationMillions * MONTHS_PER_YEAR) / gdpMillions,
      startMonth: t,
      endMonth: t,
    });

  const per100k = totalPopulation > 0 ? (observedDeathsMonth / totalPopulation) * 100000 : 0;
  const raw = {
    deaths: healthParam('aprovacao_mortes') * per100k,
    collapse: totalPopulation > 0 ? (healthParam('aprovacao_colapso') * overCapacityPopulation) / totalPopulation : 0,
    fatigue,
  };
  const rawTotal = raw.deaths + raw.collapse + raw.fatigue;
  if (rawTotal > EPSILON) {
    const sat = healthParam('aprovacao_saturacao');
    const scale = (sat * Math.tanh(rawTotal / sat)) / rawTotal;
    const labels: Record<keyof typeof raw, string> = {
      deaths: 'Mortes notificadas na epidemia',
      collapse: 'Hospitais acima da capacidade',
      fatigue: 'Desgaste das restrições',
    };
    for (const key of Object.keys(raw) as (keyof typeof raw)[]) {
      const delta = -raw[key] * scale;
      if (Math.abs(delta) <= EPSILON) continue;
      impulses.push({
        sourceId: `${HEALTH_IMPULSE_PREFIX}aprovacao_${key}:${t}`,
        label: labels[key],
        target: 'aprovacao',
        delta,
        startMonth: t,
        endMonth: t,
      });
    }
    const visible = health.outbreaks.filter((o) => o.phase !== 'silencioso');
    for (const o of visible) o.ledger.approval -= (rawTotal * scale) / visible.length;
  }
  const activityShare = health.outbreaks.filter((o) => o.phase !== 'silencioso');
  for (const o of activityShare) o.ledger.activityLoss += (illnessLevel + restrictionLevel) / activityShare.length;

  health.bulletins = health.bulletins.slice(-BULLETIN_LIMIT);
  return { state: { ...state, health, impulses: [...state.impulses, ...impulses] }, contributions: [] };
};

function relationImpulse(uf: string, delta: number, label: string, t: number): ScheduledImpulse {
  return {
    sourceId: `${HEALTH_IMPULSE_PREFIX}pedido:${uf}:${t}`,
    label,
    target: 'governadores.relacao',
    delta,
    startMonth: t,
    endMonth: t,
    regional: { key: 'populacao', scope: [uf] },
  };
}

/** Ocupação real de uma UF (verdade do motor; só o próprio motor e os testes a leem). */
export function trueOccupancy(uf: HealthUf): number {
  const capacity = uf.beds + uf.emergencyBeds;
  return capacity > 0 ? (uf.routineDemand + uf.outbreakDemand) / capacity : 0;
}

/** Invariantes (plano §6.1, "Saúde e pandemia"). Lista vazia = tudo certo. */
export function checkHealth(next: Readonly<HealthState>, content: Pick<GameContent, 'health'>): string[] {
  const issues: string[] = [];
  const diseases = new Set<string>();
  for (const outbreak of next.outbreaks) {
    if (diseases.has(outbreak.diseaseId)) issues.push(`saúde: dois surtos ativos de ${outbreak.diseaseId}`);
    diseases.add(outbreak.diseaseId);
    if (!diseaseOf(content, outbreak.diseaseId)) issues.push(`saúde: doença desconhecida ${outbreak.diseaseId}`);
    for (const u of outbreak.ufs) {
      if (Object.values(u.c).some((v) => v < -EPSILON)) issues.push(`saúde: compartimento negativo em ${u.id}`);
      if (Math.abs(aliveOf(u) + u.monthDeaths - u.population) > 1e-6 * Math.max(1, u.population))
        issues.push(`saúde: pessoas não conservadas em ${u.id}`);
      if (u.monthDeaths < -EPSILON || u.deaths + EPSILON < u.monthDeaths)
        issues.push(`saúde: mortes inconsistentes em ${u.id}`);
    }
  }
  const counted = next.outbreaks.reduce((s, o) => s + o.ufs.reduce((x, u) => x + u.monthDeaths, 0), 0);
  const handed = next.monthDeaths.reduce((s, d) => s + d.young + d.working + d.older, 0);
  // Surtos encerrados no mês saem da lista; as mortes deles já foram entregues à demografia.
  if (handed + EPSILON < counted) issues.push('saúde: mortes do surto não entregues à demografia');
  for (const uf of next.ufs) {
    if ([uf.primary, uf.surveillance, uf.prevention].some((v) => v < -EPSILON || v > 1 + EPSILON))
      issues.push(`saúde: fração fora de 0–1 em ${uf.id}`);
    if (uf.beds <= 0 || uf.emergencyBeds < -EPSILON || uf.outbreakDemand < -EPSILON)
      issues.push(`saúde: leitos ou demanda inválidos em ${uf.id}`);
  }
  return issues;
}
