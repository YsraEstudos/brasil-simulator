import { CAREER_STAGE_LABEL } from '@/components/campaign/labels';
import type { CampaignSummary } from '@/database/campaignRepository';
import type { CareerStage, PreInaugurationStage } from '@/engine';

/**
 * O que o CONTINUAR precisa de uma partida aberta em memória. A `ActiveCampaign` da store satisfaz este formato;
 * a forma mínima deixa os testes montarem o caso sem o estado inteiro do motor.
 */
export interface OpenCampaignRef {
  id: string;
  name: string;
  finished: boolean;
  state: { monthIndex: number; career?: { stage: CareerStage } };
}

/** A partida que o botão CONTINUAR abre. */
export interface ContinueTarget {
  id: string;
  name: string;
  /** Mês do mandato do turno atual (0 antes da posse), como `CampaignSummary.currentMonth`. */
  currentMonth: number;
  /** Estágio antes da posse; `null` = governo (inclusive quando a partida começa na posse). */
  stage: PreInaugurationStage | null;
  finished: boolean;
}

const careerStageOf = (stage: CareerStage | null | undefined): PreInaugurationStage | null =>
  stage && stage !== 'governo' ? stage : null;

/**
 * Escolha do CONTINUAR (AI_INSTRUCTIONS.md §3: função pura, sem banco). Com uma partida já aberta em memória, é ela:
 * recarregar do banco descartaria a agenda do mês em montagem. Senão, a campanha salva mais recentemente.
 */
export function pickContinueTarget(
  active: OpenCampaignRef | null,
  campaigns: readonly CampaignSummary[],
): ContinueTarget | null {
  if (active) {
    return {
      id: active.id,
      name: active.name,
      currentMonth: active.state.monthIndex,
      stage: careerStageOf(active.state.career?.stage),
      finished: active.finished,
    };
  }
  const last = campaigns.reduce<CampaignSummary | null>(
    (best, c) => (!best || c.updatedAt > best.updatedAt ? c : best),
    null,
  );
  if (!last) return null;
  return {
    id: last.id,
    name: last.name,
    currentMonth: last.currentMonth,
    stage: careerStageOf(last.stage),
    finished: last.status === 'encerrada',
  };
}

/**
 * Rótulo do botão CONTINUAR: `CONTINUAR — <nome> • Mês <n>` no governo; antes da posse, `• <estágio>` (sem mês, que
 * ainda não anda). Partida encerrada mostra só o nome: o mês do mandato já não diz onde ela parou. Sem alvo, `CONTINUAR`.
 */
export function continueLabel(target: ContinueTarget | null): string {
  if (!target) return 'CONTINUAR';
  if (target.finished) return `CONTINUAR — ${target.name}`;
  if (target.stage) return `CONTINUAR — ${target.name} • ${CAREER_STAGE_LABEL[target.stage]}`;
  return `CONTINUAR — ${target.name} • Mês ${target.currentMonth + 1}`;
}
