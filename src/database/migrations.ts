/**
 * Migrações do banco, em ordem. **Nunca altere uma migração publicada**: crie uma nova com a próxima
 * versão e um teste que parta de um banco na versão anterior (AI_INSTRUCTIONS.md §2.10).
 */
export interface Migration {
  version: number;
  name: string;
  sql: string;
}

export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    name: 'estrutura_inicial',
    sql: `
      CREATE TABLE campaigns (
        id               TEXT PRIMARY KEY,
        name             TEXT NOT NULL,
        scenario_id      TEXT NOT NULL,
        scenario_version TEXT NOT NULL,
        difficulty       TEXT NOT NULL CHECK (difficulty IN ('casual', 'estrategica', 'realismo')),
        seed             INTEGER NOT NULL,
        engine_version   TEXT NOT NULL,
        status           TEXT NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa', 'encerrada')),
        current_month    INTEGER NOT NULL DEFAULT 0,
        created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );

      -- Estado completo do motor no início de cada mês (GameState serializado).
      CREATE TABLE snapshots (
        campaign_id          TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        month_index          INTEGER NOT NULL CHECK (month_index >= 0),
        state_schema_version INTEGER NOT NULL,
        state_json           TEXT NOT NULL,
        PRIMARY KEY (campaign_id, month_index)
      );

      -- Decisões enviadas em cada mês, aceitas ou recusadas (trilha de auditoria).
      CREATE TABLE decisions (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        campaign_id      TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        month_index      INTEGER NOT NULL,
        position         INTEGER NOT NULL,
        policy_id        TEXT NOT NULL,
        agenda_cost      REAL NOT NULL,
        params_json      TEXT,
        accepted         INTEGER NOT NULL CHECK (accepted IN (0, 1)),
        rejection_reason TEXT
      );
      CREATE INDEX decisions_by_month ON decisions (campaign_id, month_index);

      -- Eventos ocorridos e a escolha do jogador (preenchido a partir da Fase 02).
      CREATE TABLE events (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        campaign_id  TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        month_index  INTEGER NOT NULL,
        event_id     TEXT NOT NULL,
        choice_id    TEXT,
        payload_json TEXT
      );
      CREATE INDEX events_by_month ON events (campaign_id, month_index);
    `,
  },
];

export const LATEST_DB_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;
