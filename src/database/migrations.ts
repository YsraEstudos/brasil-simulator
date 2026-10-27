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
  {
    version: 5,
    name: 'historico_regional',
    sql: `
      -- Série por UF para o cartão do estado (PLANO_GLOBO.md, PR 3): uma linha por campanha e mês, com as 27 UFs num
      -- JSON compacto {"SP":[aprovação, desemprego, hiato de crescimento, participação no PIB, relação com o
      -- governador], ...}. A ORDEM dos campos é parte do formato (REGIONAL_FIELDS em campaignRepository.ts): campos
      -- novos só entram no fim. Fica a campanha inteira, como indicator_history, para a posse (mês 0) sobreviver à
      -- retenção dos snapshots.
      CREATE TABLE regional_indicator_history (
        campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        month_index INTEGER NOT NULL CHECK (month_index >= 0),
        point_json  TEXT NOT NULL,
        PRIMARY KEY (campaign_id, month_index)
      );

      -- Preenche com os snapshots que ainda existem. Meses que a retenção já apagou não voltam (a interface mostra
      -- "Sem dados anteriores"), e snapshots sem UFs processadas (saves antigos) não geram linha.
      INSERT INTO regional_indicator_history (campaign_id, month_index, point_json)
      SELECT s.campaign_id, s.month_index, (
        SELECT json_group_object(
          json_extract(u.value, '$.id'),
          json_array(
            json_extract(u.value, '$.approval'),
            json_extract(u.value, '$.unemployment'),
            json_extract(u.value, '$.growthGap12m'),
            json_extract(u.value, '$.share'),
            json_extract(u.value, '$.governorRelation')
          )
        )
        FROM json_each(s.state_json, '$.regions.ufs') u
      )
      FROM snapshots s
      WHERE COALESCE(json_array_length(s.state_json, '$.regions.ufs'), 0) > 0;
    `,
  },
  {
    version: 6,
    name: 'resultado_eleitoral',
    sql: `
      -- Fotografia da eleição geral por UF (PLANO_GLOBO.md §5.3, PR 12): uma linha por campanha e eleição, com o
      -- ElectionResult em JSON (votação nacional e por UF de cada turno, pesos do eleitorado, trocas de governador).
      -- Gravada na mesma transação do recordMonth do mês da eleição. Fica a campanha inteira (o relatório do mês é
      -- descartado depois de 12 meses). Não há preenchimento retroativo: o motor não guardava a votação sorteada, e
      -- uma fotografia reconstruída seria inventada — saves anteriores só ganham a linha na próxima eleição geral.
      CREATE TABLE election_results (
        campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        month_index INTEGER NOT NULL CHECK (month_index >= 0),
        result_json TEXT NOT NULL,
        PRIMARY KEY (campaign_id, month_index)
      );
    `,
  },
  {
    version: 7,
    name: 'identidade_do_turno',
    sql: `
      -- PLANO_CAMPANHA.md §2.3 (D-C1, índice sequencial): a partida pode começar antes da posse, quando o mês do mandato
      -- ainda não anda. O que identifica cada turno salvo passa a ser o índice sequencial do turno (turn_index). Numa
      -- partida que começa na posse ele é o próprio mês do mandato, então os dados existentes já estão certos.
      ALTER TABLE snapshots RENAME COLUMN month_index TO turn_index;
      ALTER TABLE month_reports RENAME COLUMN month_index TO turn_index;
      ALTER TABLE decisions RENAME COLUMN month_index TO turn_index;
      ALTER TABLE events RENAME COLUMN month_index TO turn_index;

      -- current_month continua sendo o mês do mandato (rótulos); current_turn é a trava do recordMonth. stage: estágio
      -- da carreira do turno atual (NULL = governo, inclusive nas partidas que começam na posse).
      ALTER TABLE campaigns ADD COLUMN current_turn INTEGER NOT NULL DEFAULT 0;
      UPDATE campaigns SET current_turn = current_month;
      ALTER TABLE campaigns ADD COLUMN stage TEXT;

      -- Resumo compacto da pré-campanha (PLANO_CAMPANHA.md §2.3, item 3): fora da retenção, a partida inteira. As séries
      -- de governo (indicator_history, regional_indicator_history, election_results) continuam por mês do mandato e
      -- não recebem turnos anteriores à posse.
      CREATE TABLE career_summaries (
        campaign_id  TEXT PRIMARY KEY REFERENCES campaigns(id) ON DELETE CASCADE,
        summary_json TEXT NOT NULL
      );
    `,
  },
];

export const LATEST_DB_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;
