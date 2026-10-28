import { DEFEND_CASE_ACTION_ID, FISCALIZE_CASE_ACTION_ID } from '../actions';
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
import { allRelations, shiftRelation } from './relations';

/**
 * Casos de escândalo graduais (PLANO_CAMPANHA.md Fase C6b; POLITICAL_RULES.md §9.1; PLANO_EXPANSAO EX-13/14). O
 * escândalo com alvo da Fase C6a abre um caso em `investigacao`; o caso pode virar `acusacao` e, só depois dela, ir
 * a julgamento (`condenacao`, `sancao` ou `absolvido`), ou ser `arquivado`. Nenhuma marca de investigação condena
 * ninguém automaticamente.
 *
 * Fato, prova e pressão são separados (POLITICAL_RULES.md §9.1.1):
 * - **Fato latente** (`irregular`): sorteado uma vez na abertura, por chave, com a mesma chance para qualquer
 *   ocupante. Nada no jogo o altera: nem defesa, nem auditoria, nem ideologia do bloco.
 * - **Prova** (`evidence`): anda a cada mês em direção a 1 se o fato existe, ou ao teto dos indícios
 *   (`caso_prova_teto_indicios`) se não existe. Inocente pode ser acusado, mas o teto fica abaixo do limiar de
 *   sanção: rumor sozinho nunca condena. A auditoria da CGU acelera a descoberta para os dois lados (aproxima a
 *   prova da verdade) e a defesa contesta a prova no mês, sem reescrever o fato.
 * - **Pressão** (exposição): E_t = δ·E_{t−1} + volume_t, com volume 1 enquanto o bloco do caso segue no cargo, e
 *   perigo h_t = min(h_max, 1 − e^(−λ·E_t)) (especificação da Fase C3). Decide **quando** a etapa anda, não o
 *   desfecho. É o único sorteio do caso no mês, **por chave** (`caso`, id, mês): não consome o PRNG principal.
 *
 * Marcas gravadas (`EventsState.flags`): `escandalo_investigacao`, `escandalo_acusacao` e `escandalo_condenacao`.
 * Elas entram na pressão de impeachment (prefixo `escandalo_`), e a acusação pode instalar a CPI existente. A sanção
 * administrativa e a absolvição não gravam marca de escândalo.
 */

/** Sal do sorteio por chave dos casos. Constante publicada: nunca muda. */
const CASE_SALT = 0x63617330;
const CPI_EVENT_ID = 'fase07_inst_cpi_instalada';
const ACCUSATION_MONTHS = 2;
const CONVICTION_MONTHS = 3;
const SANCTION_MONTHS = 1;

export const CASE_FLAGS = {
  investigacao: 'escandalo_investigacao',
  acusacao: 'escandalo_acusacao',
  condenacao: 'escandalo_condenacao',
} as const;

/** Desfechos que tiram o indicado do cargo; exigem irregularidade real (invariante em `checkInvariants`). */
export const SANCTION_STAGES: ReadonlySet<CaseStage> = new Set(['condenacao', 'sancao']);

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

/**
 * Faixa da prova obtida, como a imprensa e a defesa a leem (sem número do motor). Pode ser mostrada: é a prova
 * divulgada, não o fato latente.
 */
export function caseEvidenceBand(evidence: number, content: GameContent): 'fracos' | 'moderados' | 'fortes' {
  const c = content.calibration;
  return evidence < c.caso_prova_acusacao ? 'fracos' : evidence < c.caso_prova_sancao ? 'moderados' : 'fortes';
}

/**
 * Prova do mês seguinte (EX-13): a investigação obtém uma fração da distância até o que os fatos sustentam — 1 se
 * houve irregularidade, o teto dos indícios se não houve. Com auditoria, a fração é maior e, sem irregularidade, a
 * auditoria esclarece (alvo 0). Nunca sai de 0–1.
 */
export function nextEvidence(
  item: Pick<ScandalCase, 'irregular' | 'evidence'>,
  audited: boolean,
  content: GameContent,
): number {
  const c = content.calibration;
  const target = item.irregular ? 1 : audited ? 0 : c.caso_prova_teto_indicios;
  const rate = audited ? c.caso_descoberta_auditoria : c.caso_descoberta;
  return Math.min(1, Math.max(0, item.evidence + rate * (target - item.evidence)));
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
  const id = `diretoria:${subjectId}#${month}`;
  return {
    id,
    source: 'diretoria',
    subjectId,
    blocId,
    stage: 'investigacao',
    openedMonth: month,
    stageMonth: month,
    exposure: content.calibration.caso_exposicao_inicial,
    // Fato latente: mesma chance para qualquer ocupante, por chave (não depende do bloco nem consome o PRNG).
    irregular: caseDraw(state.seed, ['caso', id, 'fato']) < content.calibration.caso_prob_irregular,
    evidence: content.calibration.caso_prova_inicial,
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
  condenacao: 'Condenação judicial',
  sancao: 'Sanção administrativa',
  absolvido: 'Absolvido por falta de provas',
  arquivado: 'Arquivado',
};

/**
 * Etapa mensal dos casos, chamada pelo gabinete depois das nomeações (a troca do mês já conta no volume):
 * defesas e auditorias decididas no mês, prova, exposição, arquivamento e avanço de etapa. Sem casos, devolve o
 * mesmo estado.
 */
export function advanceCases(state: GameState, ctx: StepContext): GameState {
  const content = ctx.content;
  const t = state.monthIndex;
  const c = content.calibration;
  const targeted = (actionId: string) =>
    new Set(ctx.decisions.filter((d) => d.policyId === actionId).map((d) => String(d.params?.caseId)));
  const defended = targeted(DEFEND_CASE_ACTION_ID);
  const audited = targeted(FISCALIZE_CASE_ACTION_ID);
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
      ctx.draft.notes.push(`Defesa do governo no caso da ${caseLabel(content, item)}: contesta a prova obtida.`);
    }
    const auditNow = audited.has(item.id);
    if (auditNow) {
      item = { ...item, auditedMonth: t };
      // O bloco investigado reage à auditoria pedida pelo governo.
      const blocs = shiftRelation(allRelations(current, content), item.blocId, c.relacao_auditoria_caso);
      current = { ...current, congress: { ...current.congress, blocs } };
      ctx.draft.notes.push(
        `Auditoria da CGU no caso da ${caseLabel(content, item)}: a investigação anda mais rápido, para afastar ou para inocentar.`,
      );
    }
    // O mês da abertura só registra o caso; prova e exposição andam a partir do mês seguinte.
    if (t > item.openedMonth) {
      const volume = caseSubjectHeld(current, content, item) ? 1 : 0;
      item = {
        ...item,
        exposure: c.caso_decaimento * item.exposure + volume,
        evidence: nextEvidence(item, auditNow, content),
      };
    }

    // Investigação inconclusiva: pouca pressão e indícios fracos arquivam. Uma acusação sempre vai a julgamento.
    if (
      item.stage === 'investigacao' &&
      t > item.openedMonth &&
      item.exposure < c.caso_arquivamento &&
      item.evidence < c.caso_prova_acusacao
    ) {
      item = { ...item, stage: 'arquivado', stageMonth: t };
      ctx.draft.notes.push(`Caso arquivado por falta de novos fatos: ${caseLabel(content, item)}.`);
      cases.push(item);
      continue;
    }

    // A defesa contesta a prova no mês da decisão; o fato e a prova acumulada não mudam.
    const shown = item.evidence * (item.defendedMonth === t ? 1 - c.caso_defesa : 1);
    const ready = t - item.stageMonth >= c.caso_meses_min;
    const hazard =
      item.stage === 'acusacao'
        ? Math.max(caseHazard(item.exposure, content), c.caso_perigo_julgamento)
        : caseHazard(item.exposure, content);
    // A acusação exige indícios; o julgamento acontece com qualquer prova (e absolve se ela não bastar).
    const enough = item.stage === 'acusacao' || shown >= c.caso_prova_acusacao;
    if (!ready || !enough || caseDraw(state.seed, ['caso', item.id, t]) >= hazard) {
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
      ctx.draft.notes.push(
        `A investigação virou acusação formal: ${caseLabel(content, item)}. Acusação não é condenação.`,
      );
      if (caseDraw(state.seed, ['caso', item.id, t, 'cpi']) < c.caso_prob_cpi) {
        scheduled.push({
          eventId: CPI_EVENT_ID,
          monthIndex: t + 1,
          causeEventId: 'escandalo_diretoria',
          causeChoiceId: 'acusacao',
        });
      }
    } else if (shown >= c.caso_prova_sancao) {
      // Prova suficiente: o Judiciário condena; abaixo do limiar judicial, a CGU só aplica sanção administrativa.
      const judicial = shown >= c.caso_prova_condenacao;
      item = { ...item, stage: judicial ? 'condenacao' : 'sancao', stageMonth: t };
      if (judicial) flags[CASE_FLAGS.condenacao] = t;
      impulses.push({
        sourceId: `caso:${item.id}:${item.stage}`,
        label: judicial ? 'Condenação de indicado em caso de escândalo' : 'Sanção administrativa a indicado',
        target: 'aprovacao',
        delta: judicial ? c.caso_aprovacao_condenacao : c.caso_aprovacao_sancao,
        startMonth: t,
        endMonth: t + (judicial ? CONVICTION_MONTHS : SANCTION_MONTHS) - 1,
      });
      ctx.draft.notes.push(
        judicial
          ? `Indicado condenado pela Justiça: ${caseLabel(content, item)}. O cargo volta ao quadro técnico.`
          : `Processo administrativo da CGU afasta o indicado: ${caseLabel(content, item)}. Não é condenação criminal.`,
      );
      const directorate = directoratesOf(content).find((d) => d.id === item.subjectId);
      if (directorate && caseSubjectHeld(current, content, item)) {
        // O desfecho tira o indicado do cargo: o bloco perde a diretoria, sem custo de capital para o governo.
        const appointment = appointDirector(current, content, directorate, TECHNICAL_OCCUPANT);
        current = { ...current, congress: appointment.congress };
      }
    } else {
      item = { ...item, stage: 'absolvido', stageMonth: t };
      ctx.draft.notes.push(`Absolvido por falta de provas: ${caseLabel(content, item)}.`);
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
