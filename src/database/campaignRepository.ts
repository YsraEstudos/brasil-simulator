import { STATE_SCHEMA_VERSION, type Decision, type Difficulty, type GameState, type MonthResult } from '../engine';
import type { SqlDatabase } from './types';

export interface CampaignSummary {
  id: string;
  name: string;
  scenarioId: string;
  scenarioVersion: string;
  difficulty: Difficulty;
  status: 'ativa' | 'encerrada';
  currentMonth: number;
  createdAt: string;
  updatedAt: string;
}

/** O save foi gravado com uma estrutura de estado mais nova que a deste app. */
export class SaveTooNewError extends Error {
  constructor(readonly saveVersion: number) {
    super(`save com estado v${saveVersion}, app conhece até v${STATE_SCHEMA_VERSION}`);
    this.name = 'SaveTooNewError';
  }
}

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
 * de envio) e o novo estado. Tudo numa transação: fechar o app no meio não deixa o save pela metade.
 */
export async function recordMonth(db: SqlDatabase, campaignId: string, result: MonthResult): Promise<void> {
  const { report, state } = result;
  const rows: { decision: Decision; accepted: boolean; reason: string | null }[] = [
    ...report.accepted.map((decision) => ({ decision, accepted: true, reason: null })),
    ...report.rejected.map((r) => ({ decision: r.decision, accepted: false, reason: r.reason })),
  ];
  await db.transaction(async () => {
    const updated = await db.run(
      `UPDATE campaigns SET current_month = ?, engine_version = ?,
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE id = ? AND current_month = ?`,
      [state.monthIndex, state.engineVersion, campaignId, report.monthIndex],
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
    await insertSnapshot(db, campaignId, state);
  });
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
    status: r.status,
    currentMonth: r.current_month,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

/** Apaga a campanha e, em cascata, snapshots, decisões e eventos. */
export async function deleteCampaign(db: SqlDatabase, campaignId: string): Promise<void> {
  await db.run('DELETE FROM campaigns WHERE id = ?', [campaignId]);
}

async function insertSnapshot(db: SqlDatabase, campaignId: string, state: GameState) {
  await db.run(
    'INSERT INTO snapshots (campaign_id, month_index, state_schema_version, state_json) VALUES (?, ?, ?, ?)',
    [campaignId, state.monthIndex, state.schemaVersion, JSON.stringify(state)],
  );
}

/**
 * Converte um estado salvo para a estrutura atual. Quando `STATE_SCHEMA_VERSION` subir, cada passo
 * (v1 → v2, v2 → v3…) entra aqui, com teste partindo de um save antigo (AI_INSTRUCTIONS.md §5).
 */
function upgradeState(version: number, json: string): GameState {
  if (version > STATE_SCHEMA_VERSION) throw new SaveTooNewError(version);
  return JSON.parse(json) as GameState;
}
