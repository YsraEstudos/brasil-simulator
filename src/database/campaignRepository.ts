import {
  alignmentView,
  isPreInauguration,
  turnIndexOf,
  type CareerStage,
  type CareerStartPoint,
  type CareerTurnReport,
  populationShares,
  regionalVoteIntention,
  regionsOf,
  type GameContent,
  SaveTooNewError,
  upgradeGameState,
  type Decision,
  type DecisionRejection,
  type Difficulty,
  type ElectionResult,
  type GameState,
  type IdeologyPoint,
  type Indicators,
  type MonthReport,
  type MonthResult,
  type ProfileMove,
} from '../engine';
import type { SqlDatabase } from './types';

/**
 * Quantos turnos de decomposição causal (`MonthReport`) ficam no banco (ECONOMIC_MODEL.md §11). A retenção conta
 * turnos (`turn_index`, PLANO_CAMPANHA.md §2.3), que coincidem com meses na partida que começa na posse.
 */
export const REPORT_RETENTION_MONTHS = 12;

/**
 * Quantos snapshots completos do estado ficam no banco, contando o atual (ECONOMIC_MODEL.md §11). Os turnos mais
 * antigos ficam só em `indicator_history`. 13 = o turno atual e os 12 anteriores (comparações de 12 meses).
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

/**
 * Campos de cada UF na série regional, NA ORDEM em que são gravados em `regional_indicator_history` (a migração 5
 * usa a mesma ordem; campos novos só entram no fim). Escolhi um array por UF e uma linha por mês, em vez de uma
 * linha por UF: são 27 UFs × 5 números, ~1 KB por mês (≈ 250 KB numa campanha de 240 meses), e um mês inteiro
 * entra e sai numa só gravação, o que mantém a transação do `recordMonth` curta.
 */
export const REGIONAL_FIELDS = ['approval', 'unemployment', 'growthGap12m', 'share', 'governorRelation'] as const;

export type RegionalField = (typeof REGIONAL_FIELDS)[number];

/** Valores de uma UF num mês da série regional. */
export type RegionalUfValues = Record<RegionalField, number>;

/** Um mês da série regional: as UFs por sigla. */
export interface RegionalPoint {
  monthIndex: number;
  ufs: Record<string, RegionalUfValues>;
  /** Valores absolutos do PR 14; ausentes em meses antigos. */
  observations?: Record<
    string,
    Partial<
      Record<
        'crescimento' | 'desemprego' | 'aprovacao' | 'renda' | 'chuva' | 'seca' | 'alinhamento' | 'intencao',
        number
      >
    >
  >;
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
  /** Mês do mandato do turno atual (0 antes da posse). */
  currentMonth: number;
  /** Turno atual (PLANO_CAMPANHA.md §2.3); igual a `currentMonth` na partida que começa na posse. */
  currentTurn: number;
  /** Estágio da carreira no turno atual; `null` = governo (inclusive na partida que começa na posse). */
  stage: CareerStage | null;
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

/**
 * Resumo compacto da pré-campanha (PLANO_CAMPANHA.md §2.3, item 3): fica fora da retenção, a partida inteira. Cresce
 * um item por turno pré-posse; os relatórios detalhados desses turnos seguem a retenção normal.
 */
export interface CareerSummary {
  startPoint: CareerStartPoint;
  profileId: string;
  turns: CareerSummaryTurn[];
}

export interface CareerSummaryTurn extends CareerTurnReport {
  turnIndex: number;
  /** Ids das decisões aceitas no turno, na ordem. */
  accepted: string[];
  /** Quantas decisões foram recusadas. */
  rejected: number;
}

/** Estágio gravado na linha da campanha: `null` para governo. */
const stageColumn = (state: GameState): CareerStage | null =>
  state.career && state.career.stage !== 'governo' ? state.career.stage : null;

/** Cria a campanha e grava o estado inicial (turno 0) e, se a partida começa antes da posse, o resumo vazio. */
export async function createCampaign(
  db: SqlDatabase,
  c: { id: string; name: string; scenarioVersion: string; state: GameState; content?: GameContent },
): Promise<void> {
  const s = c.state;
  await db.transaction(async () => {
    await db.run(
      `INSERT INTO campaigns
         (id, name, scenario_id, scenario_version, difficulty, seed, engine_version, current_month, current_turn, stage)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        c.id,
        c.name,
        s.scenarioId,
        c.scenarioVersion,
        s.difficulty,
        s.seed,
        s.engineVersion,
        s.monthIndex,
        turnIndexOf(s),
        stageColumn(s),
      ],
    );
    if (s.career) {
      const summary: CareerSummary = { startPoint: s.career.startPoint, profileId: s.career.profileId, turns: [] };
      await db.run('INSERT INTO career_summaries (campaign_id, summary_json) VALUES (?, ?)', [
        c.id,
        JSON.stringify(summary),
      ]);
    }
    await insertSnapshot(db, c.id, s, c.content);
  });
}

/**
 * Grava o resultado de um turno (um mês do mandato ou um turno pré-posse), identificado pelo índice do turno
 * (PLANO_CAMPANHA.md §2.3): decisões enviadas (aceitas primeiro, depois recusadas, cada grupo na ordem
 * de envio), o relatório do mês, os eventos disparados e resolvidos, o novo estado e, se `finish`, o
 * encerramento da campanha. Descarta relatórios além de `REPORT_RETENTION_MONTHS`. Tudo numa transação: fechar
 * o app no meio não deixa o save pela metade (nem um último mês gravado com a campanha ainda "ativa").
 */
export async function recordMonth(
  db: SqlDatabase,
  campaignId: string,
  result: MonthResult,
  options: { finish?: boolean; content?: GameContent } = {},
): Promise<void> {
  const { report, state } = result;
  // Turno processado e turno seguinte: na partida que começa na posse, os próprios meses.
  const turn = report.turnIndex ?? report.monthIndex;
  const nextTurn = turnIndexOf(state);
  const rows: { decision: Decision; accepted: boolean; reason: string | null }[] = [
    ...report.accepted.map((decision) => ({ decision, accepted: true, reason: null })),
    ...report.rejected.map((r) => ({ decision: r.decision, accepted: false, reason: r.reason })),
  ];
  await db.transaction(async () => {
    const updated = await db.run(
      `UPDATE campaigns SET current_month = ?, current_turn = ?, stage = ?, engine_version = ?,
         status = CASE WHEN ? THEN 'encerrada' ELSE status END,
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE id = ? AND current_turn = ?`,
      [state.monthIndex, nextTurn, stageColumn(state), state.engineVersion, options.finish ? 1 : 0, campaignId, turn],
    );
    if (updated.changes !== 1) {
      throw new Error(`campanha ${campaignId} não está no turno ${turn}`);
    }
    for (const [position, row] of rows.entries()) {
      await db.run(
        `INSERT INTO decisions
           (campaign_id, turn_index, position, policy_id, agenda_cost, params_json, accepted, rejection_reason)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          campaignId,
          turn,
          position,
          row.decision.policyId,
          row.decision.agendaCost,
          row.decision.params ? JSON.stringify(row.decision.params) : null,
          row.accepted ? 1 : 0,
          row.reason,
        ],
      );
    }
    await db.run('INSERT INTO month_reports (campaign_id, turn_index, report_json) VALUES (?, ?, ?)', [
      campaignId,
      turn,
      JSON.stringify(report),
    ]);
    // Evento disparado neste mês aguarda resposta: linha no mês seguinte, sem escolha ainda. O payload guarda a
    // identidade da ocorrência e o local congelado no disparo (PLANO_GLOBO.md §6.3); relatórios antigos não têm.
    for (const eventId of report.eventsFired) {
      const instance = report.eventInstances?.find((i) => i.eventId === eventId);
      await db.run(
        'INSERT INTO events (campaign_id, turn_index, event_id, choice_id, payload_json) VALUES (?, ?, ?, NULL, ?)',
        [
          campaignId,
          turn + 1,
          eventId,
          instance ? JSON.stringify({ instanceId: instance.instanceId, location: instance.location }) : null,
        ],
      );
    }
    // Escolha aplicada neste mês (do jogador ou automática, quando o prazo venceu).
    for (const resolved of report.eventsResolved) {
      await db.run(
        'INSERT INTO events (campaign_id, turn_index, event_id, choice_id, payload_json) VALUES (?, ?, ?, ?, ?)',
        [
          campaignId,
          turn,
          resolved.eventId,
          resolved.choiceId,
          JSON.stringify({ automatic: resolved.automatic, instanceId: resolved.instanceId }),
        ],
      );
    }
    // Fotografia da eleição geral por UF (só no mês do pleito): na mesma transação do mês, como a série regional.
    if (report.electionResult) {
      await db.run('INSERT INTO election_results (campaign_id, month_index, result_json) VALUES (?, ?, ?)', [
        campaignId,
        report.electionResult.monthIndex,
        JSON.stringify(report.electionResult),
      ]);
    }
    if (report.career) await appendCareerSummary(db, campaignId, turn, report);
    await db.run('DELETE FROM month_reports WHERE campaign_id = ? AND turn_index < ?', [
      campaignId,
      turn - (REPORT_RETENTION_MONTHS - 1),
    ]);
    await insertSnapshot(db, campaignId, state, options.content);
    await db.run('DELETE FROM snapshots WHERE campaign_id = ? AND turn_index < ?', [
      campaignId,
      nextTurn - (SNAPSHOT_RETENTION_MONTHS - 1),
    ]);
  });
}

/** Acrescenta o turno pré-posse ao resumo compacto (na transação de quem chama). */
async function appendCareerSummary(db: SqlDatabase, campaignId: string, turn: number, report: MonthReport) {
  const row = await db.first<{ summary_json: string }>(
    'SELECT summary_json FROM career_summaries WHERE campaign_id = ?',
    [campaignId],
  );
  if (!row || !report.career) throw new Error(`campanha ${campaignId} sem resumo da pré-campanha`);
  const summary = JSON.parse(row.summary_json) as CareerSummary;
  summary.turns.push({
    turnIndex: turn,
    ...report.career,
    accepted: report.accepted.map((d) => d.policyId),
    rejected: report.rejected.length,
  });
  await db.run('UPDATE career_summaries SET summary_json = ? WHERE campaign_id = ?', [
    JSON.stringify(summary),
    campaignId,
  ]);
}

/** Resumo compacto da pré-campanha; `null` na partida que começa na posse. */
export async function loadCareerSummary(db: SqlDatabase, campaignId: string): Promise<CareerSummary | null> {
  const row = await db.first<{ summary_json: string }>(
    'SELECT summary_json FROM career_summaries WHERE campaign_id = ?',
    [campaignId],
  );
  return row ? (JSON.parse(row.summary_json) as CareerSummary) : null;
}

/** Série de longo prazo da campanha, mês do mandato a mês (inclui a posse, mês 0; nenhum turno pré-posse). */
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
 * Série regional da campanha, mês a mês, a começar pela posse (mês 0). Pode ter lacunas: um save anterior à
 * série só tem os meses cujos snapshots ainda existiam quando ela foi criada (migração 5); nada é reconstruído.
 */
export async function loadRegionalHistory(db: SqlDatabase, campaignId: string): Promise<RegionalPoint[]> {
  const rows = await db.all<{ month_index: number; point_json: string }>(
    'SELECT month_index, point_json FROM regional_indicator_history WHERE campaign_id = ? ORDER BY month_index',
    [campaignId],
  );
  return rows.map((r) => {
    const raw = JSON.parse(r.point_json) as Record<string, readonly (number | null)[]>;
    const ufs: Record<string, RegionalUfValues> = {};
    const observations: NonNullable<RegionalPoint['observations']> = {};
    for (const [id, values] of Object.entries(raw)) {
      ufs[id] = Object.fromEntries(REGIONAL_FIELDS.map((f, i) => [f, values[i]])) as RegionalUfValues;
      observations[id] = Object.fromEntries(
        OBSERVATION_FIELDS.flatMap((f, i) => {
          const v = values[REGIONAL_FIELDS.length + i];
          return typeof v === 'number' && Number.isFinite(v) ? [[f, v]] : [];
        }),
      );
    }
    return { monthIndex: r.month_index, ufs, observations };
  });
}

/**
 * Fotografias das eleições gerais da campanha (resultado simulado por UF), da mais antiga para a mais recente. Vazio
 * até a primeira eleição geral; nada é reconstruído para saves anteriores (PLANO_GLOBO.md §5.3).
 */
export async function loadElectionResults(db: SqlDatabase, campaignId: string): Promise<ElectionResult[]> {
  const rows = await db.all<{ result_json: string }>(
    'SELECT result_json FROM election_results WHERE campaign_id = ? ORDER BY month_index',
    [campaignId],
  );
  return rows.map((r) => JSON.parse(r.result_json) as ElectionResult);
}

/** Quantos meses o rastro do perfil ideológico e a lista de decisões da folha "Perfil do governo" mostram. */
export const PROFILE_HISTORY_MONTHS = 12;

/** Perfil ideológico do governo ao fim de um mês (o estado já com o mês aplicado). */
export interface ProfileTrailPoint {
  monthIndex: number;
  profile: IdeologyPoint;
}

/** Decisões que mais moveram o perfil num mês, como o relatório gravou. */
export interface ProfileMovesMonth {
  /** Mês jogado (o do relatório). */
  monthIndex: number;
  moves: ProfileMove[];
}

export interface ProfileHistory {
  /** Do mais antigo ao mais recente. */
  trail: ProfileTrailPoint[];
  /** Do mais recente ao mais antigo; só meses em que alguma decisão moveu o perfil. */
  moves: ProfileMovesMonth[];
}

/**
 * Rastro do perfil do governo e decisões que o moveram nos últimos `PROFILE_HISTORY_MONTHS` meses, lidos direto dos
 * snapshots e relatórios (nenhuma tabela nova). Snapshots anteriores à v10 não têm perfil e ficam de fora: nada é
 * reconstruído (o `upgradeGameState` os leria como neutros e inventaria um rastro). Só lê o trecho `government` do
 * JSON, sem atualizar o estado inteiro.
 */
export async function loadProfileHistory(
  db: SqlDatabase,
  campaignId: string,
  months = PROFILE_HISTORY_MONTHS,
): Promise<ProfileHistory> {
  // Só turnos de governo: antes da posse o perfil não anda e o mês do mandato fica parado em 0.
  const states = await db.all<{ state_json: string }>(
    `SELECT state_json FROM snapshots
     WHERE campaign_id = ? AND state_schema_version >= 10 ORDER BY turn_index DESC LIMIT ?`,
    [campaignId, months],
  );
  const trail: ProfileTrailPoint[] = [];
  for (const row of states) {
    const saved = JSON.parse(row.state_json) as Pick<GameState, 'monthIndex' | 'career'> & {
      government?: { profile?: IdeologyPoint };
    };
    const profile = saved.government?.profile;
    if (profile && !isPreInauguration(saved)) trail.push({ monthIndex: saved.monthIndex, profile });
  }
  trail.reverse();

  const reports = await db.all<{ report_json: string }>(
    'SELECT report_json FROM month_reports WHERE campaign_id = ? ORDER BY turn_index DESC LIMIT ?',
    [campaignId, months],
  );
  const moves: ProfileMovesMonth[] = [];
  for (const row of reports) {
    const report = JSON.parse(row.report_json) as Partial<MonthReport>;
    const found = report.profileMoves ?? [];
    if (found.length > 0 && report.monthIndex !== undefined)
      moves.push({ monthIndex: report.monthIndex, moves: found });
  }
  return { trail, moves };
}

/** Motivo de recusa como gravado antes da v9. */
const LEGACY_REJECTION_REASONS: Record<string, DecisionRejection> = {
  sem_pontos_de_agenda: 'sem_acoes_de_agenda',
};

/**
 * Relatório salvo de um turno (decomposição causal); `null` se o turno saiu da retenção ou não existe. Relatórios
 * gravados antes da Fase 05 não têm a explicação por UF: ela vem como `null`; os anteriores à v10 não têm as
 * decisões que moveram o perfil ideológico (`profileMoves` vem vazio). A v9 renomeou um motivo de
 * recusa ("pontos" → "ações"): relatórios antigos são traduzidos na leitura para o rótulo continuar aparecendo.
 */
export async function loadReport(db: SqlDatabase, campaignId: string, turnIndex: number): Promise<MonthReport | null> {
  const row = await db.first<{ report_json: string }>(
    'SELECT report_json FROM month_reports WHERE campaign_id = ? AND turn_index = ?',
    [campaignId, turnIndex],
  );
  if (!row) return null;
  const report = JSON.parse(row.report_json) as Partial<MonthReport>;
  const rejected = (report.rejected ?? []).map((r) => ({
    ...r,
    reason: LEGACY_REJECTION_REASONS[r.reason] ?? r.reason,
  }));
  return {
    ...report,
    rejected,
    regional: report.regional ?? null,
    profileMoves: report.profileMoves ?? [],
  } as MonthReport;
}

/** Estado mais recente da campanha, pronto para continuar jogando. */
export async function loadLatestState(db: SqlDatabase, campaignId: string): Promise<GameState> {
  const row = await db.first<{ state_schema_version: number; state_json: string }>(
    `SELECT state_schema_version, state_json FROM snapshots
     WHERE campaign_id = ? ORDER BY turn_index DESC LIMIT 1`,
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
    current_turn: number;
    stage: CareerStage | null;
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
    currentTurn: r.current_turn,
    stage: r.stage,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

/** Estado salvo no início de um turno (ex.: o anterior, para mostrar variações). `null` se não existir. */
export async function loadStateAt(db: SqlDatabase, campaignId: string, turnIndex: number): Promise<GameState | null> {
  const row = await db.first<{ state_schema_version: number; state_json: string }>(
    'SELECT state_schema_version, state_json FROM snapshots WHERE campaign_id = ? AND turn_index = ?',
    [campaignId, turnIndex],
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

/** Apaga a campanha e, em cascata, snapshots, decisões, eventos, relatórios e o resumo da pré-campanha. */
export async function deleteCampaign(db: SqlDatabase, campaignId: string): Promise<void> {
  await db.run('DELETE FROM campaigns WHERE id = ?', [campaignId]);
}

/** Grava o estado completo do mês e os pontos das séries de longo prazo, nacional e regional (na transação de quem chama). */
const OBSERVATION_FIELDS = [
  'crescimento',
  'desemprego',
  'aprovacao',
  'renda',
  'chuva',
  'seca',
  'alinhamento',
  'intencao',
] as const;

async function insertSnapshot(db: SqlDatabase, campaignId: string, state: GameState, content?: GameContent) {
  await db.run(
    'INSERT INTO snapshots (campaign_id, turn_index, state_schema_version, state_json) VALUES (?, ?, ?, ?)',
    [campaignId, turnIndexOf(state), state.schemaVersion, JSON.stringify(state)],
  );
  // As séries de governo são por mês do mandato e começam na posse (PLANO_CAMPANHA.md §2.3): antes dela, nada.
  if (isPreInauguration(state)) return;
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
  // Estado sem UFs processadas (save antigo ainda no mês da atualização) não gera linha: lacuna honesta.
  if (state.regions.ufs.length > 0) {
    const regional: Record<string, (number | null)[]> = {};
    const pop = content ? populationShares(regionsOf(content)) : [];
    const alignment = new Map(
      content ? alignmentView(state, content)?.ufs.map((u) => [u.id, u.approvalDeviation]) : [],
    );
    const intention = content ? regionalVoteIntention(state, content)?.ufs : undefined;
    for (const [i, uf] of state.regions.ufs.entries()) {
      const climate = state.climate.ufs.find((c) => c.id === uf.id);
      regional[uf.id] = [
        ...REGIONAL_FIELDS.map((f) => uf[f]),
        state.indicators.gdpGrowth12m + uf.growthGap12m,
        uf.unemployment,
        uf.approval,
        pop[i] ? uf.share / pop[i] : null,
        climate?.rain ?? null,
        climate?.dryness ?? null,
        alignment.get(uf.id) ?? null,
        intention?.[uf.id] ?? null,
      ];
    }
    await db.run('INSERT INTO regional_indicator_history (campaign_id, month_index, point_json) VALUES (?, ?, ?)', [
      campaignId,
      state.monthIndex,
      JSON.stringify(regional),
    ]);
  }
}

/** Converte um estado salvo para a estrutura atual (passos v1 → v2… em `src/engine/upgrade.ts`). */
function upgradeState(version: number, json: string): GameState {
  return upgradeGameState(version, JSON.parse(json));
}
