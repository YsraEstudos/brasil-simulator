import { DEFEND_CASE_ACTION_ID } from '../actions';
import { createRng, deriveSeed, seedRng } from '../rng';
import {
  TECHNICAL_OCCUPANT,
  type CaseStage,
  type GameContent,
  type GameState,
  type ScandalCase,
  type ScheduledEvent,
  type ScheduledImpulse,
  type StepContext,
} from '../types';

import { appointDirector, directorateOccupant, directoratesOf } from './directorates';

/**
 * Casos de escândalo graduais (PLANO_CAMPANHA.md Fase C6b; POLITICAL_RULES.md §9.1). O escândalo com alvo da Fase
 * C6a abre um caso em `investigacao`; o caso pode virar `acusacao` e, só depois dela, `condenacao`, ou ser
 * `arquivado`. Nenhuma marca de investigação condena ninguém automaticamente.
 *
 * Descoberta com a mesma especificação de perigo da Fase C3: exposição E_t = δ·E_{t−1} + volume_t, com volume 1
 * enquanto o bloco do caso segue no cargo (0 depois de afastado), e perigo h_t = min(h_max, 1 − e^(−λ·E_t)). É o
 * único sorteio do caso no mês, **por chave** (`caso`, id, mês): não consome o PRNG principal, então ligar o
 * sistema não muda os demais sorteios. A defesa (ação de agenda) reduz o perigo do mês; a exposição abaixo de
 * `caso_arquivamento` arquiva o caso.
 *
 * Marcas gravadas (`EventsState.flags`): `escandalo_investigacao`, `escandalo_acusacao` e `escandalo_condenacao`.
 * Elas entram na pressão de impeachment (prefixo `escandalo_`), e a acusação pode instalar a CPI existente.
 */

/** Sal do sorteio por chave dos casos. Constante publicada: nunca muda. */
const CASE_SALT = 0x63617330;
const CPI_EVENT_ID = 'fase07_inst_cpi_instalada';
const ACCUSATION_MONTHS = 2;
const CONVICTION_MONTHS = 3;

export const CASE_FLAGS = {
  investigacao: 'escandalo_investigacao',
  acusacao: 'escandalo_acusacao',
  condenacao: 'escandalo_condenacao',
} as const;

const OPEN_STAGES: ReadonlySet<CaseStage> = new Set(['investigacao', 'acusacao']);

export function casesEnabled(content: GameContent): boolean {
  return content.scenario.institutions?.scandalCases === true && directoratesOf(content).length > 0;
}

export function isOpenCase(c: Pick<ScandalCase, 'stage'>): boolean {
  return OPEN_STAGES.has(c.stage);
}

export function openCases(state: Readonly<GameState>): ScandalCase[] {
  return (state.cases ?? []).filter(isOpenCase);
}

/** FNV-1a de 32 bits (só `Math.imul`: idêntico no Hermes e no V8). */
function hashText(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return h;
}

/** Uniforme em [0, 1) pela chave, sem tocar no PRNG principal. */
export function caseDraw(seed: number, key: readonly (string | number)[]): number {
  return createRng(seedRng(deriveSeed(seed, CASE_SALT ^ hashText(key.join('|'))))).float();
}

/** Perigo do mês de o caso avançar de etapa, antes da defesa. */
export function caseHazard(exposure: number, content: GameContent): number {
  const c = content.calibration;
  return Math.min(c.caso_perigo_max, 1 - Math.exp(-c.caso_lambda * Math.max(0, exposure)));
}

/** Faixa de risco atual para o jogador, sem número do motor. */
export function caseRiskBand(exposure: number, content: GameContent): 'baixo' | 'médio' | 'alto' {
  const h = caseHazard(exposure, content) / content.calibration.caso_perigo_max;
  return h < 0.4 ? 'baixo' : h < 0.8 ? 'médio' : 'alto';
}

/** O bloco do caso ainda ocupa o cargo atingido (o volume que alimenta a exposição). */
export function caseSubjectHeld(state: Readonly<GameState>, content: GameContent, c: ScandalCase): boolean {
  const directorate = directoratesOf(content).find((d) => d.id === c.subjectId);
  return directorate !== undefined && directorateOccupant(state, directorate) === c.blocId;
}

/** Caso novo aberto pelo escândalo na diretoria `subjectId`, que chega à caixa de entrada no mês `month`. */
export function newCase(
  state: Readonly<GameState>,
  content: GameContent,
  subjectId: string,
  month: number,
): ScandalCase | null {
  const directorate = directoratesOf(content).find((d) => d.id === subjectId);
  if (!directorate) return null;
  const blocId = directorateOccupant(state, directorate);
  if (blocId === TECHNICAL_OCCUPANT) return null;
  return {
    id: `diretoria:${subjectId}#${month}`,
    source: 'diretoria',
    subjectId,
    blocId,
    stage: 'investigacao',
    openedMonth: month,
    stageMonth: month,
    exposure: content.calibration.caso_exposicao_inicial,
  };
}

function caseLabel(content: GameContent, c: ScandalCase): string {
  const directorate = directoratesOf(content).find((d) => d.id === c.subjectId)?.name ?? c.subjectId;
  const bloc = content.scenario.blocs.find((b) => b.id === c.blocId)?.name ?? c.blocId;
  return `${directorate} (indicação do bloco ${bloc})`;
}

export const CASE_STAGE_LABEL: Record<CaseStage, string> = {
  investigacao: 'Investigação',
  acusacao: 'Acusação formal',
  condenacao: 'Condenação',
  arquivado: 'Arquivado',
};

/**
 * Etapa mensal dos casos, chamada pelo gabinete depois das nomeações (a troca do mês já conta no volume):
 * defesas decididas no mês, exposição, arquivamento e avanço de etapa. Sem casos, devolve o mesmo estado.
 */
export function advanceCases(state: GameState, ctx: StepContext): GameState {
  const content = ctx.content;
  const t = state.monthIndex;
  const c = content.calibration;
  const defended = new Set(
    ctx.decisions.filter((d) => d.policyId === DEFEND_CASE_ACTION_ID).map((d) => String(d.params?.caseId)),
  );
  if (!state.cases || state.cases.length === 0) return state;

  let current: GameState = state;
  let capital = state.resources.politicalCapital;
  const impulses: ScheduledImpulse[] = [...state.impulses];
  const flags = { ...state.events.flags };
  const scheduled: ScheduledEvent[] = [...state.events.scheduled];
  const cases: ScandalCase[] = [];

  for (const original of state.cases) {
    if (!isOpenCase(original) || original.openedMonth > t) {
      cases.push(original);
      continue;
    }
    let item: ScandalCase = { ...original };
    if (defended.has(item.id)) {
      item = { ...item, defendedMonth: t };
      capital += c.capital_defesa_caso;
      ctx.draft.notes.push(`Defesa do governo no caso da ${caseLabel(content, item)}.`);
    }
    // O mês da abertura só registra o caso; a exposição anda a partir do mês seguinte.
    if (t > item.openedMonth) {
      const volume = caseSubjectHeld(current, content, item) ? 1 : 0;
      item = { ...item, exposure: c.caso_decaimento * item.exposure + volume };
    }

    if (t > item.openedMonth && item.exposure < c.caso_arquivamento) {
      item = { ...item, stage: 'arquivado', stageMonth: t };
      ctx.draft.notes.push(`Caso arquivado por falta de novos fatos: ${caseLabel(content, item)}.`);
      cases.push(item);
      continue;
    }

    const ready = t - item.stageMonth >= c.caso_meses_min;
    const hazard = caseHazard(item.exposure, content) * (item.defendedMonth === t ? 1 - c.caso_defesa : 1);
    if (!ready || caseDraw(state.seed, ['caso', item.id, t]) >= hazard) {
      cases.push(item);
      continue;
    }

    if (item.stage === 'investigacao') {
      item = { ...item, stage: 'acusacao', stageMonth: t, accusedMonth: t };
      flags[CASE_FLAGS.acusacao] = t;
      impulses.push({
        sourceId: `caso:${item.id}:acusacao`,
        label: 'Acusação formal em caso de escândalo',
        target: 'aprovacao',
        delta: c.caso_aprovacao_acusacao,
        startMonth: t,
        endMonth: t + ACCUSATION_MONTHS - 1,
      });
      ctx.draft.notes.push(`A investigação virou acusação formal: ${caseLabel(content, item)}.`);
      if (caseDraw(state.seed, ['caso', item.id, t, 'cpi']) < c.caso_prob_cpi) {
        scheduled.push({
          eventId: CPI_EVENT_ID,
          monthIndex: t + 1,
          causeEventId: 'escandalo_diretoria',
          causeChoiceId: 'acusacao',
        });
      }
    } else {
      item = { ...item, stage: 'condenacao', stageMonth: t };
      flags[CASE_FLAGS.condenacao] = t;
      impulses.push({
        sourceId: `caso:${item.id}:condenacao`,
        label: 'Condenação de indicado em caso de escândalo',
        target: 'aprovacao',
        delta: c.caso_aprovacao_condenacao,
        startMonth: t,
        endMonth: t + CONVICTION_MONTHS - 1,
      });
      ctx.draft.notes.push(`Indicado condenado: ${caseLabel(content, item)}. O cargo volta ao quadro técnico.`);
      const directorate = directoratesOf(content).find((d) => d.id === item.subjectId);
      if (directorate && caseSubjectHeld(current, content, item)) {
        // A condenação tira o condenado do cargo: o bloco perde a diretoria, sem custo de capital para o governo.
        const appointment = appointDirector(current, content, directorate, TECHNICAL_OCCUPANT);
        current = { ...current, congress: appointment.congress };
      }
    }
    cases.push(item);
  }

  return {
    ...current,
    cases,
    impulses,
    resources: { ...current.resources, politicalCapital: Math.min(100, Math.max(0, capital)) },
    events: { ...current.events, flags, scheduled },
  };
}
