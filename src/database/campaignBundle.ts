import { z } from 'zod';

import { loadLatestState, parseSetupSnapshot } from './campaignRepository';
import { LATEST_DB_VERSION } from './migrations';
import type { SqlDatabase, SqlValue } from './types';

/**
 * Pacote de campanha (PLANO_MENU_SAVES_CONFIG.md, Fase M5): a linha de `campaigns` e todas as linhas filhas, em JSON.
 * É a base de três recursos: duplicar ("Salvar como"), exportar e importar um save como arquivo. O pacote guarda as
 * colunas como estão no banco; a importação nunca confia no arquivo:
 *
 * - o formato inteiro passa por um esquema Zod (tipos simples, nada além de texto, número ou nulo);
 * - os nomes de coluna precisam existir no esquema real do banco (`PRAGMA table_info`), e as tabelas vêm de uma lista
 *   fixa: nenhum nome vindo do arquivo vai para o SQL sem essa conferência;
 * - tudo entra numa transação com um id novo (nunca sobrescreve) e o estado mais recente é lido de volta antes do
 *   commit: um snapshot ilegível ou de versão mais nova desfaz a importação inteira.
 *
 * Antes do lançamento (AI_INSTRUCTIONS.md §2.1) só se aceita pacote da mesma versão do banco.
 */

export const BUNDLE_FORMAT = 'brasil-save';
export const BUNDLE_FORMAT_VERSION = 1;

/** Tabelas filhas de `campaigns`, todas com `campaign_id`. A ordem é a de inserção. */
export const BUNDLE_CHILD_TABLES = [
  'snapshots',
  'decisions',
  'events',
  'month_reports',
  'indicator_history',
  'regional_indicator_history',
  'election_results',
  'career_summaries',
] as const;
export type BundleChildTable = (typeof BUNDLE_CHILD_TABLES)[number];

/** Colunas de chave automática: não vão no pacote (o banco gera de novo). */
const AUTO_ID_TABLES: ReadonlySet<BundleChildTable> = new Set(['decisions', 'events']);

const sqlValue = z.union([z.string(), z.number(), z.null()]);
const row = z.record(z.string(), sqlValue);
export type BundleRow = z.infer<typeof row>;

const bundleSchema = z.object({
  format: z.literal(BUNDLE_FORMAT),
  formatVersion: z.literal(BUNDLE_FORMAT_VERSION),
  dbVersion: z.number().int(),
  engineVersion: z.string(),
  campaign: row,
  tables: z.object(
    Object.fromEntries(BUNDLE_CHILD_TABLES.map((t) => [t, z.array(row)])) as Record<
      BundleChildTable,
      z.ZodArray<typeof row>
    >,
  ),
});

export type CampaignBundle = z.infer<typeof bundleSchema>;

/** Arquivo recusado na importação, com mensagem para o jogador. */
export class BundleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BundleError';
  }
}

/** Monta o pacote de uma campanha. */
export async function exportBundle(db: SqlDatabase, campaignId: string): Promise<CampaignBundle> {
  const campaign = await db.first<BundleRow>('SELECT * FROM campaigns WHERE id = ?', [campaignId]);
  if (!campaign) throw new BundleError('Campanha não encontrada.');
  const tables = {} as Record<BundleChildTable, BundleRow[]>;
  for (const table of BUNDLE_CHILD_TABLES) {
    const rows = await db.all<BundleRow>(`SELECT * FROM ${table} WHERE campaign_id = ?`, [campaignId]);
    tables[table] = rows.map((r) => {
      const copy: BundleRow = { ...r };
      delete copy.campaign_id;
      if (AUTO_ID_TABLES.has(table)) delete copy.id;
      return copy;
    });
  }
  return {
    format: BUNDLE_FORMAT,
    formatVersion: BUNDLE_FORMAT_VERSION,
    dbVersion: LATEST_DB_VERSION,
    engineVersion: String(campaign.engine_version ?? ''),
    campaign,
    tables,
  };
}

/**
 * Valida um valor desconhecido (o JSON lido de um arquivo) como pacote. Lança `BundleError` com mensagem clara.
 */
export function parseBundle(raw: unknown): CampaignBundle {
  const result = bundleSchema.safeParse(raw);
  if (!result.success) {
    const format = raw && typeof raw === 'object' ? (raw as Record<string, unknown>).format : undefined;
    throw new BundleError(
      format === BUNDLE_FORMAT
        ? 'O arquivo de save está incompleto ou corrompido.'
        : 'Este arquivo não é um save do Brasil Simulator.',
    );
  }
  const bundle = result.data;
  if (bundle.dbVersion > LATEST_DB_VERSION) {
    throw new BundleError('Este save é de uma versão mais nova do jogo. Atualize o app para abri-lo.');
  }
  if (bundle.dbVersion < LATEST_DB_VERSION) {
    throw new BundleError('Este save é de uma versão anterior do jogo e não pode ser aberto. Comece um novo jogo.');
  }
  if (typeof bundle.campaign.scenario_id !== 'string' || typeof bundle.campaign.name !== 'string') {
    throw new BundleError('O arquivo de save está incompleto ou corrompido.');
  }
  return bundle;
}

/** Opções da cópia: id novo, nome e o que zerar. */
export interface ImportOptions {
  id: string;
  name: string;
}

async function columnsOf(db: SqlDatabase, table: string): Promise<Set<string>> {
  const cols = await db.all<{ name: string }>(`PRAGMA table_info(${table})`);
  return new Set(cols.map((c) => c.name));
}

/** Confere as colunas contra o esquema real e monta o INSERT (nomes já conferidos; valores como parâmetros). */
function insertSql(table: string, keys: readonly string[], allowed: Set<string>): string {
  for (const k of keys) {
    if (!allowed.has(k)) throw new BundleError('O arquivo de save tem dados desconhecidos e foi recusado.');
  }
  return `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`;
}

/**
 * Grava o pacote como uma campanha nova (`options.id`, `options.name`), numa transação. Alfinete e cadeado voltam a
 * desligados (a cópia é outra campanha). O estado mais recente é lido de volta antes do commit para garantir que a
 * campanha abre; se não abrir, nada fica gravado.
 */
export async function importBundle(db: SqlDatabase, bundle: CampaignBundle, options: ImportOptions): Promise<void> {
  const campaignCols = await columnsOf(db, 'campaigns');
  const childCols = new Map<BundleChildTable, Set<string>>();
  for (const table of BUNDLE_CHILD_TABLES) childCols.set(table, await columnsOf(db, table));

  const exists = await db.first<{ id: string }>('SELECT id FROM campaigns WHERE id = ?', [options.id]);
  if (exists) throw new BundleError('Já existe uma campanha com este identificador.');

  try {
    await writeBundle(db, bundle, options, campaignCols, childCols);
  } catch (e) {
    // Erro de SQL (coluna obrigatória ausente, tipo recusado por CHECK…) vira mensagem para o jogador.
    if (e instanceof BundleError) throw e;
    throw new BundleError('O arquivo de save está incompleto ou corrompido.');
  }
}

async function writeBundle(
  db: SqlDatabase,
  bundle: CampaignBundle,
  options: ImportOptions,
  campaignCols: Set<string>,
  childCols: Map<BundleChildTable, Set<string>>,
): Promise<void> {
  await db.transaction(async () => {
    const campaign: BundleRow = {
      ...bundle.campaign,
      id: options.id,
      name: options.name,
      pinned: 0,
      locked: 0,
      setup_json: withoutIronman(bundle.campaign.setup_json),
    };
    const keys = Object.keys(campaign);
    await db.run(
      insertSql('campaigns', keys, campaignCols),
      keys.map((k) => campaign[k] as SqlValue),
    );
    for (const table of BUNDLE_CHILD_TABLES) {
      const allowed = childCols.get(table) ?? new Set<string>();
      for (const r of bundle.tables[table]) {
        const copy: BundleRow = { ...r };
        if (AUTO_ID_TABLES.has(table)) delete copy.id;
        copy.campaign_id = options.id;
        const rowKeys = Object.keys(copy);
        await db.run(
          insertSql(table, rowKeys, allowed),
          rowKeys.map((k) => copy[k] as SqlValue),
        );
      }
    }
    // Lê o estado de volta: snapshot ausente, ilegível ou de versão mais nova lança e desfaz a transação.
    try {
      await loadLatestState(db, options.id);
    } catch (e) {
      if (e instanceof Error && e.name === 'SaveTooNewError') {
        throw new BundleError('Este save é de uma versão mais nova do jogo. Atualize o app para abri-lo.');
      }
      throw new BundleError('O arquivo de save está incompleto ou corrompido.');
    }
  });
}

/**
 * Tira o selo Ironman das opções da partida (PLANO_SAVES_HISTORICO.md H3, D-H3): a cópia importada de um arquivo não é
 * mais "sem volta", porque o original pode continuar existindo. Sem selo, ou ilegível, o valor fica como veio (a
 * validação do resto do pacote decide).
 */
function withoutIronman(setupJson: BundleRow[string] | undefined): BundleRow[string] {
  if (typeof setupJson !== 'string') return setupJson ?? null;
  try {
    const setup = JSON.parse(setupJson) as Record<string, unknown> | null;
    if (!setup || typeof setup !== 'object' || !('ironman' in setup)) return setupJson;
    delete setup.ironman;
    return JSON.stringify(setup);
  } catch {
    return setupJson;
  }
}

/** Partida Ironman não pode ser duplicada (B53); exportar continua valendo como cópia de segurança (D-H3). */
export const IRONMAN_DUPLICATE_MESSAGE = 'Modo sem volta (Ironman): esta partida não pode ser duplicada.';

/** Duplica uma campanha ("Salvar como"): exporta e importa na hora, com id e nome novos. Recusa partida Ironman. */
export async function duplicateCampaign(db: SqlDatabase, sourceId: string, options: ImportOptions): Promise<void> {
  const row = await db.first<{ setup_json: string | null }>('SELECT setup_json FROM campaigns WHERE id = ?', [
    sourceId,
  ]);
  if (row && parseSetupSnapshot(row.setup_json)?.ironman) throw new BundleError(IRONMAN_DUPLICATE_MESSAGE);
  await importBundle(db, await exportBundle(db, sourceId), options);
}

/** Nome sugerido do arquivo exportado: `<nome>-mes<n>.brasilsave.json`, só com caracteres seguros. */
export function bundleFileName(bundle: CampaignBundle): string {
  const name = String(bundle.campaign.name ?? 'campanha')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .toLowerCase()
    .slice(0, 40)
    // Depois do corte: o corte pode deixar um hífen no fim, que faria "--mes" no nome do arquivo.
    .replace(/^-+|-+$/g, '');
  const month = typeof bundle.campaign.current_month === 'number' ? bundle.campaign.current_month + 1 : 1;
  return `${name || 'campanha'}-mes${month}.brasilsave.json`;
}
