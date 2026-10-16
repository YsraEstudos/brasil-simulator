import type { SqlDatabase } from '@/database/types';
import type { GameState } from '@/engine/types';

/**
 * Grava uma campanha como um app antigo gravava (só `campaigns` e `snapshots`, que existem desde a migração 1).
 * Para testes de migração: o repositório atual escreve em tabelas que um banco antigo ainda não tem.
 */
export async function insertLegacyCampaign(
  db: SqlDatabase,
  c: { id: string; name: string; scenarioVersion: string; state: GameState },
): Promise<void> {
  const s = c.state;
  await db.run(
    `INSERT INTO campaigns (id, name, scenario_id, scenario_version, difficulty, seed, engine_version, current_month)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [c.id, c.name, s.scenarioId, c.scenarioVersion, s.difficulty, s.seed, s.engineVersion, s.monthIndex],
  );
  await db.run(
    'INSERT INTO snapshots (campaign_id, month_index, state_schema_version, state_json) VALUES (?, ?, ?, ?)',
    [c.id, s.monthIndex, s.schemaVersion, JSON.stringify(s)],
  );
}
