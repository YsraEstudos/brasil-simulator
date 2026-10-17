import {
  SaveTooNewError,
  upgradeGameState,
  type Decision,
  type Difficulty,
  type GameState,
  type Indicators,
  type MonthReport,
  type MonthResult,
} from '../engine';
import type { SqlDatabase } from './types';

/** Quantos meses de decomposição causal (`MonthReport`) ficam no banco (ECONOMIC_MODEL.md §11). */
export const REPORT_RETENTION_MONTHS = 12;

/**
 * Quantos snapshots completos do estado ficam no banco, contando o atual (ECONOMIC_MODEL.md §11). Os meses mais
 * antigos ficam só em `indicator_history`. 13 = o mês atual e os 12 anteriores (comparações de 12 meses).
 */
export const SNAPSHOT_RETENTION_MONTHS = 13;

/** Um mês da série de longo prazo: indicadores e as principais variáveis econômicas (null em saves antigos). */
export interface IndicatorPoint {
  monthIndex: number;
  indicators: Indicators;
  selic: number | null;
  grossDebt: number | null;
  credibility: number | null;
  exchangeRate: number | null;
  riskPremium: number | null;
}

export interface CampaignSummary {
  id: string;
  name: string;
  scenarioId: string;
  scenarioVersion: string;
  difficulty: Difficulty;
  /** Semente da simulação usada na criação (para reproduzir a partida). */
  seed: number;
  status: 'ativa' | 'encerrada';
  currentMonth: number;
  createdAt: string;
  updatedAt: string;
}

export { SaveTooNewError };

export class CampaignNotFoundError extends Error {
  constructor(readonly campaignId: string) {
    super(`campanha não encontrada: ${campaignId}`);
    this.name = 'CampaignNotFoundError';
  }
}

/** Cria a campanha e grava o estado inicial (mês 0). */
export async function createCampaign(
  db: SqlDatabase,
  c: { id: string; name: string; scenarioVersion: string; state: GameState },
): Promise<void> {
  const s = c.state;
  await db.transaction(async () => {
    await db.run(
      `INSERT INTO campaigns (id, name, scenario_id, scenario_version, difficulty, seed, engine_version, current_month)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [c.id, c.name, s.scenarioId, c.scenarioVersion, s.difficulty, s.seed, s.engineVersion, s.monthIndex],
    );
    await insertSnapshot(db, c.id, s);
  });
}

/**
 * Grava o resultado de um mês: decisões enviadas (aceitas primeiro, depois recusadas, cada grupo na ordem
 * de envio), o relatório do mês, os eventos disparados e resolvidos, o novo estado e, se `finish`, o
 * encerramento da campanha. Descarta relatórios além de `REPORT_RETENTION_MONTHS`. Tudo numa transação: fechar
 * o app no meio não deixa o save pela metade (nem um último mês gravado com a campanha ainda "ativa").
 */
export async function recordMonth(
  db: SqlDatabase,
  campaignId: string,
  result: MonthResult,
  options: { finish?: boolean } = {},
): Promise<void> {
  const { report, state } = result;
  const rows: { decision: Decision; accepted: boolean; reason: string | null }[] = [
    ...report.accepted.map((decision) => ({ decision, accepted: true, reason: null })),
    ...report.rejected.map((r) => ({ decision: r.decision, accepted: false, reason: r.reason })),
  ];
  await db.transaction(async () => {
    const updated = await db.run(
      `UPDATE campaigns SET current_month = ?, engine_version = ?,
         status = CASE WHEN ? THEN 'encerrada' ELSE status END,
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE id = ? AND current_month = ?`,
      [state.monthIndex, state.engineVersion, options.finish ? 1 : 0, campaignId, report.monthIndex],
    );
    if (updated.changes !== 1) {
      throw new Error(`campanha ${campaignId} não está no mês ${report.monthIndex}`);
    }
    for (const [position, row] of rows.entries()) {
      await db.run(
        `INSERT INTO decisions
           (campaign_id, month_index, position, policy_id, agenda_cost, params_json, accepted, rejection_reason)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          campaignId,
          report.monthIndex,
          position,
          row.decision.policyId,
          row.decision.agendaCost,
          row.decision.params ? JSON.stringify(row.decision.params) : null,
          row.accepted ? 1 : 0,
          row.reason,
        ],
      );
    }
    await db.run('INSERT INTO month_reports (campaign_id, month_index, report_json) VALUES (?, ?, ?)', [
      campaignId,
      report.monthIndex,
      JSON.stringify(report),
    ]);
    // Evento disparado neste mês aguarda resposta: linha no mês seguinte, sem escolha ainda.
    for (const eventId of report.eventsFired) {
      await db.run(
        'INSERT INTO events (campaign_id, month_index, event_id, choice_id, payload_json) VALUES (?, ?, ?, NULL, NULL)',
        [campaignId, report.monthIndex + 1, eventId],
      );
    }
    // Escolha aplicada neste mês (do jogador ou automática, quando o prazo venceu).
    for (const resolved of report.eventsResolved) {
      await db.run(
        'INSERT INTO events (campaign_id, month_index, event_id, choice_id, payload_json) VALUES (?, ?, ?, ?, ?)',
        [
          campaignId,
          report.monthIndex,
          resolved.eventId,
          resolved.choiceId,
          JSON.stringify({ automatic: resolved.automatic }),
        ],
      );
    }
    await db.run('DELETE FROM month_reports WHERE campaign_id = ? AND month_index < ?', [
      campaignId,
      report.monthIndex - (REPORT_RETENTION_MONTHS - 1),
    ]);
    await insertSnapshot(db, campaignId, state);
    await db.run('DELETE FROM snapshots WHERE campaign_id = ? AND month_index < ?', [
      campaignId,
      state.monthIndex - (SNAPSHOT_RETENTION_MONTHS - 1),
    ]);
  });
}

/** Série de longo prazo da campanha, mês a mês (inclui o mês 0). */
export async function loadIndicatorHistory(db: SqlDatabase, campaignId: string): Promise<IndicatorPoint[]> {
  const rows = await db.all<{ month_index: number; point_json: string }>(
    'SELECT month_index, point_json FROM indicator_history WHERE campaign_id = ? ORDER BY month_index',
    [campaignId],
  );
  return rows.map((r) => {
    const p = JSON.parse(r.point_json) as Omit<IndicatorPoint, 'monthIndex'>;
    return {
      monthIndex: r.month_index,
      indicators: p.indicators,
      selic: p.selic ?? null,
      grossDebt: p.grossDebt ?? null,
      credibility: p.credibility ?? null,
      exchangeRate: p.exchangeRate ?? null,
      riskPremium: p.riskPremium ?? null,
    };
  });
}

/**
 * Relatório mensal salvo (decomposição causal); `null` se o mês saiu da retenção ou não existe. Relatórios
 * gravados antes da Fase 05 não têm a explicação por UF: ela vem como `null`.
 */
export async function loadReport(db: SqlDatabase, campaignId: string, monthIndex: number): Promise<MonthReport | null> {
  const row = await db.first<{ report_json: string }>(
    'SELECT report_json FROM month_reports WHERE campaign_id = ? AND month_index = ?',
    [campaignId, monthIndex],
  );
  if (!row) return null;
  const report = JSON.parse(row.report_json) as Partial<MonthReport>;
  return { ...report, regional: report.regional ?? null } as MonthReport;
}

/** Estado mais recente da campanha, pronto para continuar jogando. */
export async function loadLatestState(db: SqlDatabase, campaignId: string): Promise<GameState> {
  const row = await db.first<{ state_schema_version: number; state_json: string }>(
    `SELECT state_schema_version, state_json FROM snapshots
     WHERE campaign_id = ? ORDER BY month_index DESC LIMIT 1`,
    [campaignId],
  );
  if (!row) throw new CampaignNotFoundError(campaignId);
  return upgradeState(row.state_schema_version, row.state_json);
}

export async function listCampaigns(db: SqlDatabase): Promise<CampaignSummary[]> {
  const rows = await db.all<{
    id: string;
    name: string;
    scenario_id: string;
    scenario_version: string;
    difficulty: Difficulty;
    seed: number;
    status: 'ativa' | 'encerrada';
    current_month: number;
    created_at: string;
    updated_at: string;
  }>('SELECT * FROM campaigns ORDER BY updated_at DESC, id');
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    scenarioId: r.scenario_id,
    scenarioVersion: r.scenario_version,
    difficulty: r.difficulty,
    seed: r.seed,
    status: r.status,
    currentMonth: r.current_month,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

/** Estado salvo de um mês específico (ex.: o anterior, para mostrar variações). `null` se não existir. */
export async function loadStateAt(db: SqlDatabase, campaignId: string, monthIndex: number): Promise<GameState | null> {
  const row = await db.first<{ state_schema_version: number; state_json: string }>(
    'SELECT state_schema_version, state_json FROM snapshots WHERE campaign_id = ? AND month_index = ?',
    [campaignId, monthIndex],
  );
  return row ? upgradeState(row.state_schema_version, row.state_json) : null;
}

/** Marca a campanha como encerrada (fim do protótipo, do mandato, impeachment…). */
export async function finishCampaign(db: SqlDatabase, campaignId: string): Promise<void> {
  await db.run(
    `UPDATE campaigns SET status = 'encerrada', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`,
    [campaignId],
  );
}

/** Apaga a campanha e, em cascata, snapshots, decisões, eventos e relatórios. */
export async function deleteCampaign(db: SqlDatabase, campaignId: string): Promise<void> {
  await db.run('DELETE FROM campaigns WHERE id = ?', [campaignId]);
}

/** Grava o estado completo do mês e o ponto da série de longo prazo (na transação de quem chama). */
async function insertSnapshot(db: SqlDatabase, campaignId: string, state: GameState) {
  await db.run(
    'INSERT INTO snapshots (campaign_id, month_index, state_schema_version, state_json) VALUES (?, ?, ?, ?)',
    [campaignId, state.monthIndex, state.schemaVersion, JSON.stringify(state)],
  );
  const e = state.economy;
  const point: Omit<IndicatorPoint, 'monthIndex'> = {
    indicators: state.indicators,
    selic: e.selic,
    grossDebt: e.grossDebt,
    credibility: e.credibility,
    exchangeRate: e.exchangeRate,
    riskPremium: e.riskPremium,
  };
  await db.run('INSERT INTO indicator_history (campaign_id, month_index, point_json) VALUES (?, ?, ?)', [
    campaignId,
    state.monthIndex,
    JSON.stringify(point),
  ]);
}

/** Converte um estado salvo para a estrutura atual (passos v1 → v2… em `src/engine/upgrade.ts`). */
function upgradeState(version: number, json: string): GameState {
  return upgradeGameState(version, JSON.parse(json));
}
