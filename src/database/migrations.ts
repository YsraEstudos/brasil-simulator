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
  {
    version: 2,
    name: 'configuracoes',
    sql: `
      -- Preferências do jogador (ex.: tamanho do texto). Valor em JSON.
      CREATE TABLE settings (
        key        TEXT PRIMARY KEY,
        value_json TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
    `,
  },
  {
    version: 3,
    name: 'relatorios_mensais',
    sql: `
      -- Decomposição causal completa dos últimos 12 meses (MonthReport em JSON), alimenta o "Por que mudou?".
      -- Meses mais antigos são descartados ao gravar um novo mês (ECONOMIC_MODEL.md §11).
      CREATE TABLE month_reports (
        campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        month_index INTEGER NOT NULL CHECK (month_index >= 0),
        report_json TEXT NOT NULL,
        PRIMARY KEY (campaign_id, month_index)
      );
    `,
  },
  {
    version: 4,
    name: 'historico_de_indicadores',
    sql: `
      -- Vetor de indicadores por mês para os gráficos de longo prazo (ECONOMIC_MODEL.md §11). Os snapshots completos
      -- do estado passam a ficar só nos últimos meses; esta série fica para a campanha inteira.
      CREATE TABLE indicator_history (
        campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        month_index INTEGER NOT NULL CHECK (month_index >= 0),
        point_json  TEXT NOT NULL,
        PRIMARY KEY (campaign_id, month_index)
      );

      -- Preenche a série com os snapshots que já existem (saves v1 não têm bloco econômico: campos nulos).
      INSERT INTO indicator_history (campaign_id, month_index, point_json)
      SELECT campaign_id, month_index, json_object(
        'indicators', json(json_extract(state_json, '$.indicators')),
        'selic', json_extract(state_json, '$.economy.selic'),
        'grossDebt', json_extract(state_json, '$.economy.grossDebt'),
        'credibility', json_extract(state_json, '$.economy.credibility'),
        'exchangeRate', json_extract(state_json, '$.economy.exchangeRate'),
        'riskPremium', json_extract(state_json, '$.economy.riskPremium')
      )
      FROM snapshots;
    `,
  },
];

export const LATEST_DB_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;
