import { activeImpulses } from '../impulses';
import type { ImpulseTarget, MonthStep, ScheduledImpulse } from '../types';
import { educationParam } from './calibration';
import {
  ATTAINMENT_IDS,
  EDUCATION_LEVER_IDS,
  EDUCATION_STAGE_IDS,
  type AttainmentId,
  type AttainmentState,
  type EducationFlows,
  type EducationLeverId,
  type EducationLeverState,
  type EducationStageId,
  type EducationStageState,
  type EducationState,
} from './types';

/**
 * Educação agregada por coorte (PLANO_EXPANSAO EX-19; F09). Três etapas (fundamental, médio, superior) com matrícula,
 * conclusão, evasão e aprendizagem; quem sai da escola entra na força de trabalho com a maior etapa concluída e a
 * aprendizagem da coorte. Regras que o plano exige e que este módulo garante por construção:
 *
 * - **Coortes conservadas:** a cada mês, matriculados + força de trabalho = mês anterior + ingressantes − saídas.
 *   Concluintes e evadidos saem do estoque do início do mês: não há formando sem matriculado.
 * - **Efeito defasado:** as políticas mudam taxas de fluxo e o alvo da aprendizagem; a aprendizagem anda devagar e a
 *   força de trabalho só muda com as coortes que saem da escola. Gasto não vira produtividade no mesmo mês.
 * - **Um único canal produtivo, sem bônus duplicado:** a variação do capital humano da força de trabalho vira um
 *   impulso `oferta.potencial` (`educacao:capital_humano:<mês>`). O estado começa no estacionário das taxas de base,
 *   então sem política o canal é zero e o potencial calibrado (que já contém a tendência) não ganha nada. O prédio
 *   escolar entra no capital público pela carteira; aqui só entra a escolaridade. Não há módulo de pesquisa; quando
 *   houver (F07), ele não pode ler formandos para somar produtividade outra vez.
 * - **Gasto no lugar de sempre:** este módulo não cria despesa. A rotina e a obra pagam pela carteira
 *   (`publicPolicies`), que emite os alvos `educacao.<alavanca>` com a força × a capacidade entregue.
 */

const MONTHS_PER_YEAR = 12;
const EPSILON = 1e-12;
export const HUMAN_CAPITAL_CAUSE_PREFIX = 'educacao:capital_humano:';

/** Alvo de impulso de cada alavanca. */
export const EDUCATION_LEVER_TARGET: Readonly<Record<EducationLeverId, ImpulseTarget>> = {
  alfabetizacao: 'educacao.alfabetizacao',
  permanencia: 'educacao.permanencia',
  docentes: 'educacao.docentes',
};

const YEARS: Readonly<Record<AttainmentId, () => number>> = {
  sem_fundamental: () => educationParam('anos_sem_fundamental'),
  fundamental: () => educationParam('anos_fundamental'),
  medio: () => educationParam('anos_medio'),
  superior: () => educationParam('anos_superior'),
};

/** Taxas mensais do fluxo escolar e alvos de aprendizagem de um mês. */
interface Rates {
  completion: Record<EducationStageId, number>;
  dropout: Record<EducationStageId, number>;
  transitionMedio: number;
  transitionSuperior: number;
  learningTarget: Record<EducationStageId, number>;
}

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

function rates(effect: Readonly<Record<EducationLeverId, number>>): Rates {
  const p = educationParam;
  return {
    completion: {
      fundamental: 1 / (MONTHS_PER_YEAR * p('duracao_fundamental')),
      medio: 1 / (MONTHS_PER_YEAR * p('duracao_medio')),
      superior: 1 / (MONTHS_PER_YEAR * p('duracao_superior')),
    },
    dropout: {
      fundamental: (p('evasao_fundamental') * (1 - p('alfabetizacao_evasao') * effect.alfabetizacao)) / MONTHS_PER_YEAR,
      medio: (p('evasao_medio') * (1 - p('permanencia_evasao') * effect.permanencia)) / MONTHS_PER_YEAR,
      superior: p('evasao_superior') / MONTHS_PER_YEAR,
    },
    transitionMedio: Math.min(
      p('transicao_max'),
      p('transicao_medio') + p('permanencia_transicao') * effect.permanencia,
    ),
    transitionSuperior: p('transicao_superior'),
    learningTarget: {
      fundamental: clamp01(
        p('aprendizagem_fundamental') +
          p('alfabetizacao_aprendizagem') * effect.alfabetizacao +
          p('docentes_aprendizagem') * effect.docentes,
      ),
      medio: clamp01(p('aprendizagem_medio') + p('docentes_aprendizagem') * effect.docentes),
      superior: clamp01(p('aprendizagem_superior')),
    },
  };
}

const NO_EFFECT: Readonly<Record<EducationLeverId, number>> = { alfabetizacao: 0, permanencia: 0, docentes: 0 };

/** Entrada mensal de cada escolaridade na força de trabalho, com a aprendizagem que carrega. */
interface WorkforceInflow {
  people: number;
  learningMass: number;
}

/**
 * Fluxos de um mês a partir dos estoques do início do mês. Concluintes e evadidos são frações do estoque (nunca mais
 * que ele); parte dos concluintes segue para a etapa seguinte e o resto, com os evadidos, vai à força de trabalho.
 */
function schoolFlows(stages: readonly EducationStageState[], r: Rates, entrants: number) {
  const stage = (id: EducationStageId) => stages.find((s) => s.id === id)!;
  const graduates = {} as Record<EducationStageId, number>;
  const dropouts = {} as Record<EducationStageId, number>;
  for (const id of EDUCATION_STAGE_IDS) {
    const enrolled = Math.max(0, stage(id).enrolled);
    const leave = Math.min(1, r.completion[id] + r.dropout[id]);
    const total = enrolled * leave;
    const completionShare = leave > 0 ? r.completion[id] / (r.completion[id] + r.dropout[id]) : 0;
    graduates[id] = total * completionShare;
    dropouts[id] = total - graduates[id];
  }
  const inflow: Record<EducationStageId, number> = {
    fundamental: entrants,
    medio: r.transitionMedio * graduates.fundamental,
    superior: r.transitionSuperior * graduates.medio,
  };
  const L = (id: EducationStageId) => stage(id).learning;
  const into = (parts: readonly [number, number][]): WorkforceInflow => ({
    people: parts.reduce((s, [n]) => s + n, 0),
    learningMass: parts.reduce((s, [n, l]) => s + n * l, 0),
  });
  const workforceInflow: Record<AttainmentId, WorkforceInflow> = {
    sem_fundamental: into([[dropouts.fundamental, L('fundamental')]]),
    fundamental: into([
      [(1 - r.transitionMedio) * graduates.fundamental, L('fundamental')],
      [dropouts.medio, L('medio')],
    ]),
    medio: into([
      [(1 - r.transitionSuperior) * graduates.medio, L('medio')],
      [dropouts.superior, L('superior')],
    ]),
    superior: into([[graduates.superior, L('superior')]]),
  };
  return { graduates, dropouts, inflow, workforceInflow };
}

/**
 * Estado estacionário das taxas de base (sem política): estoque = entrada ÷ taxa de saída em cada etapa e em cada
 * escolaridade; aprendizagem do estoque = média das entradas. É o ponto de partida de toda campanha.
 */
export function steadyStateEducation(): EducationState {
  const r = rates(NO_EFFECT);
  const entrants = educationParam('entrada_coorte') / MONTHS_PER_YEAR;
  const stages: EducationStageState[] = [];
  let inflow = entrants;
  for (const id of EDUCATION_STAGE_IDS) {
    const enrolled = inflow / (r.completion[id] + r.dropout[id]);
    stages.push({ id, enrolled, learning: r.learningTarget[id] });
    const graduates = enrolled * r.completion[id];
    inflow = id === 'fundamental' ? r.transitionMedio * graduates : r.transitionSuperior * graduates;
  }
  const flows = schoolFlows(stages, r, entrants);
  const exitRate = educationParam('saida_forca_trabalho') / MONTHS_PER_YEAR;
  const workforce: AttainmentState[] = ATTAINMENT_IDS.map((id) => {
    const into = flows.workforceInflow[id];
    return { id, workers: into.people / exitRate, learning: into.people > 0 ? into.learningMass / into.people : 0 };
  });
  const exits = workforce.reduce((s, w) => s + w.workers * exitRate, 0);
  return {
    stages,
    workforce,
    // No estacionário a aprendizagem de cada estoque é a de base: o ajuste de aprendizagem é zero.
    humanCapital: plainYears(workforce),
    flows: { entrants, graduates: flows.graduates, dropouts: flows.dropouts, exits },
    levers: EDUCATION_LEVER_IDS.map((id) => ({ id, strength: 0, effect: 0, sources: [] })),
  };
}

let baselineCache: EducationState | null = null;
function baseline(): EducationState {
  baselineCache ??= steadyStateEducation();
  return baselineCache;
}

/** Educação no início da campanha: o estacionário das taxas de base. */
export function initialEducation(): EducationState {
  return structuredClone(baseline());
}

/**
 * Anos efetivos de estudo por trabalhador: anos da escolaridade × (1 + peso × (aprendizagem do estoque − a de base
 * da mesma escolaridade)). Média ponderada pela força de trabalho.
 */
export function humanCapitalOf(workforce: readonly AttainmentState[]): number {
  const base = baseline().workforce;
  const weight = educationParam('retorno_aprendizagem');
  let workers = 0;
  let years = 0;
  for (const w of workforce) {
    const reference = base.find((b) => b.id === w.id)?.learning ?? w.learning;
    workers += w.workers;
    years += w.workers * YEARS[w.id]() * (1 + weight * (w.learning - reference));
  }
  return workers > 0 ? years / workers : 0;
}

/** Anos de estudo por trabalhador, sem o ajuste de aprendizagem. */
function plainYears(workforce: readonly AttainmentState[]): number {
  const workers = workforce.reduce((s, w) => s + w.workers, 0);
  return workers > 0 ? workforce.reduce((s, w) => s + w.workers * YEARS[w.id](), 0) / workers : 0;
}

/** Força e efeito saturado de cada alavanca no mês, com as fontes (para o "Por que mudou?"). */
export function educationLevers(impulses: readonly ScheduledImpulse[], month: number): EducationLeverState[] {
  const scale = educationParam('alavanca_escala');
  return EDUCATION_LEVER_IDS.map((id) => {
    const active = activeImpulses(impulses, month, [EDUCATION_LEVER_TARGET[id]]).filter((i) => i.delta > 0);
    const bySource = new Map<string, { label: string; strength: number }>();
    for (const impulse of active) {
      const current = bySource.get(impulse.label);
      if (current) current.strength += impulse.delta;
      else bySource.set(impulse.label, { label: impulse.label, strength: impulse.delta });
    }
    const strength = active.reduce((s, i) => s + i.delta, 0);
    return {
      id,
      strength,
      effect: Math.tanh(strength / scale),
      sources: [...bySource.values()].sort((a, b) => b.strength - a.strength || (a.label < b.label ? -1 : 1)),
    };
  });
}

/** Avança um mês das coortes (função pura, usada pela etapa e pelos testes). */
export function advanceEducation(
  previous: Readonly<EducationState>,
  levers: readonly EducationLeverState[],
): EducationState {
  const effect = { ...NO_EFFECT };
  for (const lever of levers) effect[lever.id] = lever.effect;
  const r = rates(effect);
  const entrants = educationParam('entrada_coorte') / MONTHS_PER_YEAR;
  const flows = schoolFlows(previous.stages, r, entrants);
  const adjust = educationParam('aprendizagem_ajuste');
  const stages = previous.stages.map((s) => ({
    id: s.id,
    enrolled: Math.max(0, s.enrolled + flows.inflow[s.id] - flows.graduates[s.id] - flows.dropouts[s.id]),
    learning: s.learning + adjust * (r.learningTarget[s.id] - s.learning),
  }));
  const exitRate = educationParam('saida_forca_trabalho') / MONTHS_PER_YEAR;
  let exits = 0;
  const workforce = previous.workforce.map((w) => {
    const stay = w.workers * (1 - exitRate);
    exits += w.workers - stay;
    const into = flows.workforceInflow[w.id];
    const workers = stay + into.people;
    const learning = workers > 0 ? (stay * w.learning + into.learningMass) / workers : w.learning;
    return { id: w.id, workers, learning };
  });
  const flowsOut: EducationFlows = { entrants, graduates: flows.graduates, dropouts: flows.dropouts, exits };
  return {
    stages,
    workforce,
    humanCapital: humanCapitalOf(workforce),
    flows: flowsOut,
    levers: levers.map((l) => ({ ...l, sources: l.sources.map((s) => ({ ...s })) })),
  };
}

/**
 * Etapa do mês (depois da carteira, antes da economia): lê as alavancas do mês, avança as coortes e transforma a
 * variação do capital humano num impulso de crescimento potencial de um mês (mesma forma do capital público da
 * carteira). Não sorteia nada e não cria despesa.
 */
export const educationStep: MonthStep = (state) => {
  const t = state.monthIndex;
  const previous = state.education ?? initialEducation();
  const next = advanceEducation(previous, educationLevers(state.impulses, t));
  const delta = educationParam('elast_capital_humano') * (next.humanCapital - previous.humanCapital) * MONTHS_PER_YEAR;
  const impulses =
    Math.abs(delta) > EPSILON
      ? [
          ...state.impulses,
          {
            sourceId: `${HUMAN_CAPITAL_CAUSE_PREFIX}${t}`,
            label: 'Escolaridade da força de trabalho',
            target: 'oferta.potencial' as const,
            delta,
            startMonth: t,
            endMonth: t,
          },
        ]
      : state.impulses;
  return { state: { ...state, education: next, impulses }, contributions: [] };
};

/** Pessoas acompanhadas (matriculados + força de trabalho), em milhões. */
export function educationPeople(education: Readonly<EducationState>): number {
  return education.stages.reduce((s, x) => s + x.enrolled, 0) + education.workforce.reduce((s, x) => s + x.workers, 0);
}

/**
 * Invariantes (plano §6.1, "Sociedade e educação"): estoques e aprendizagem válidos, concluintes e evadidos dentro do
 * estoque do mês anterior e conservação das coortes. Lista vazia = tudo certo.
 */
export function checkEducation(previous: Readonly<EducationState>, next: Readonly<EducationState>): string[] {
  const issues: string[] = [];
  for (const s of next.stages) {
    if (!(s.enrolled >= 0) || !Number.isFinite(s.enrolled)) issues.push(`matrícula inválida em ${s.id}`);
    if (!(s.learning >= 0 && s.learning <= 1)) issues.push(`aprendizagem fora de 0–1 em ${s.id}`);
    const before = previous.stages.find((p) => p.id === s.id)?.enrolled ?? 0;
    if (next.flows.graduates[s.id] + next.flows.dropouts[s.id] > before + 1e-9)
      issues.push(`saída de ${s.id} maior que os matriculados`);
  }
  for (const w of next.workforce) {
    if (!(w.workers >= 0) || !Number.isFinite(w.workers)) issues.push(`força de trabalho inválida em ${w.id}`);
    if (!(w.learning >= 0 && w.learning <= 1)) issues.push(`aprendizagem do estoque fora de 0–1 em ${w.id}`);
  }
  const expected = educationPeople(previous) + next.flows.entrants - next.flows.exits;
  if (Math.abs(educationPeople(next) - expected) > 1e-6) issues.push('coortes não conservadas');
  return issues;
}
