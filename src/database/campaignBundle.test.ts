import { describe, expect, it } from 'vitest';

import { DEFAULT_SCENARIO_ID, loadContent } from '@/content';

import { advanceMonth, createInitialState, STATE_SCHEMA_VERSION, type Decision } from '../engine';
import {
  BUNDLE_CHILD_TABLES,
  BUNDLE_FORMAT,
  BUNDLE_FORMAT_VERSION,
  BundleError,
  bundleFileName,
  duplicateCampaign,
  exportBundle,
  importBundle,
  parseBundle,
} from './campaignBundle';
import {
  createCampaign,
  loadLatestState,
  recordMonth,
  setCampaignLocked,
  setCampaignPinned,
} from './campaignRepository';
import { LATEST_DB_VERSION } from './migrations';
import { migrate } from './migrate';
import { openNodeDatabase } from './nodeDatabase';
import type { SqlDatabase } from './types';

const ORIGEM = 'origem';
const COPIA = 'copia';
const content = loadContent(DEFAULT_SCENARIO_ID);
/** Turnos até depois da eleição geral (mês 45 no cenário padrão, mais a pré-campanha): grava `election_results`. */
const TURNOS_COM_ELEICAO = 52;

/** Decisões da campanha de teste: meses com ações da agenda alternados com meses sem decisão. */
const DECISOES: Decision[][] = [
  [{ policyId: 'contingenciamento', agendaCost: 1 }],
  [],
  [{ policyId: 'iof_credito_reducao', agendaCost: 1 }],
  [],
];

/**
 * Banco com uma campanha "origem" que começa na pré-campanha ("corrida") e avança `turnos` turnos: passa pela posse,
 * então as tabelas de governo, de pré-campanha e os snapshots ficam todos preenchidos.
 */
async function bancoComOrigem(turnos: number): Promise<SqlDatabase> {
  const db = openNodeDatabase();
  await migrate(db);
  let state = createInitialState({ content, difficulty: 'casual', seed: 2027, startPoint: 'corrida' });
  await createCampaign(db, {
    id: ORIGEM,
    name: 'Governo Azul',
    scenarioVersion: content.scenario.version,
    state,
    content,
    setup: { difficulty: 'casual', scenarioId: DEFAULT_SCENARIO_ID, startPoint: 'corrida', seed: 2027 },
  });
  for (let t = 0; t < turnos; t++) {
    const result = advanceMonth(state, { decisions: DECISOES[t % DECISOES.length] }, content);
    await recordMonth(db, ORIGEM, result, { content });
    state = result.state;
  }
  return db;
}

/** Arquivo de save como o jogador o teria: o pacote exportado, passado por texto JSON e lido de volta. */
type Arquivo = {
  format: unknown;
  formatVersion: unknown;
  dbVersion: unknown;
  engineVersion: unknown;
  campaign: Record<string, unknown>;
  tables: Record<string, Record<string, unknown>[]>;
};
async function arquivoDe(db: SqlDatabase, campaignId = ORIGEM): Promise<Arquivo> {
  return JSON.parse(JSON.stringify(await exportBundle(db, campaignId))) as Arquivo;
}

/** Linhas de uma tabela da campanha, sem `campaign_id` e sem ids automáticos, ordenadas (independe da ordem do banco). */
async function linhas(db: SqlDatabase, table: string, campaignId: string): Promise<string[]> {
  const rows = await db.all<Record<string, unknown>>(`SELECT * FROM ${table} WHERE campaign_id = ?`, [campaignId]);
  return rows
    .map((r) => {
      const copia = { ...r };
      delete copia.campaign_id;
      if (table === 'decisions' || table === 'events') delete copia.id;
      return JSON.stringify(copia);
    })
    .sort();
}

/** Linha da campanha (`SELECT *`), ou `undefined`. */
async function linhaCampanha(db: SqlDatabase, id: string): Promise<Record<string, unknown> | null> {
  return db.first<Record<string, unknown>>('SELECT * FROM campaigns WHERE id = ?', [id]);
}

/** Quantas linhas há em cada tabela da campanha e em `campaigns`: para provar que uma importação recusada não gravou nada. */
async function contagens(db: SqlDatabase): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const t of ['campaigns', ...BUNDLE_CHILD_TABLES]) {
    out[t] = (await db.first<{ n: number }>(`SELECT COUNT(*) AS n FROM ${t}`))?.n ?? -1;
  }
  return out;
}

describe('pacote de campanha (PLANO_MENU_SAVES_CONFIG.md, Fase M5)', () => {
  it('a lista de tabelas filhas é exatamente o que tem campaign_id no banco', async () => {
    const db = await bancoComOrigem(0);
    const comCampanha: string[] = [];
    for (const t of await db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'")) {
      const colunas = await db.all<{ name: string }>(`PRAGMA table_info(${t.name})`);
      if (colunas.some((c) => c.name === 'campaign_id')) comCampanha.push(t.name);
    }
    expect(comCampanha.sort()).toEqual([...BUNDLE_CHILD_TABLES].sort());
  });

  describe('ida e volta', () => {
    it('exporta, serializa, lê e importa com id novo: tabelas filhas, linha da campanha e estado iguais', async () => {
      const db = await bancoComOrigem(TURNOS_COM_ELEICAO);
      const texto = JSON.stringify(await exportBundle(db, ORIGEM));
      await importBundle(db, parseBundle(JSON.parse(texto)), { id: COPIA, name: 'Cópia' });

      for (const t of BUNDLE_CHILD_TABLES) {
        expect(await linhas(db, t, COPIA)).toEqual(await linhas(db, t, ORIGEM));
      }
      const origem = await linhaCampanha(db, ORIGEM);
      const copia = await linhaCampanha(db, COPIA);
      const semIdentidade = ({ id, name, pinned, locked, ...resto }: Record<string, unknown>) => resto;
      expect(semIdentidade(copia!)).toEqual(semIdentidade(origem!));
      expect(await loadLatestState(db, COPIA)).toEqual(await loadLatestState(db, ORIGEM));
    });

    it('a campanha de teste tem linhas em todas as tabelas, então a comparação não é vazia', async () => {
      const db = await bancoComOrigem(TURNOS_COM_ELEICAO);
      for (const t of BUNDLE_CHILD_TABLES) {
        // Eventos dependem de sorteio no caminho: a campanha de teste pode não ter nenhum.
        if (t === 'events') continue;
        expect((await linhas(db, t, ORIGEM)).length, t).toBeGreaterThan(0);
      }
    });
  });

  describe('determinismo (AI_INSTRUCTIONS.md §5)', () => {
    it('original e cópia, avançadas com as mesmas decisões, dão o mesmo estado e o mesmo relatório mês a mês', async () => {
      const db = await bancoComOrigem(16);
      await duplicateCampaign(db, ORIGEM, { id: COPIA, name: 'Cópia' });
      const entradas = [
        { decisions: [{ policyId: 'irpf_tabela', agendaCost: 1 }] },
        { decisions: [] },
        { decisions: [{ policyId: 'contingenciamento', agendaCost: 1 }] },
      ];
      for (const entrada of entradas) {
        const original = advanceMonth(await loadLatestState(db, ORIGEM), entrada, content);
        const copia = advanceMonth(await loadLatestState(db, COPIA), entrada, content);
        expect(copia.state).toEqual(original.state);
        expect(copia.report).toEqual(original.report);
      }
    });
  });

  describe('alfinete e cadeado', () => {
    it('ligados na origem, voltam desligados na cópia; a origem não muda', async () => {
      const db = await bancoComOrigem(3);
      await setCampaignPinned(db, ORIGEM, true);
      await setCampaignLocked(db, ORIGEM, true);
      const linhaAntes = await linhaCampanha(db, ORIGEM);
      const estadoAntes = await loadLatestState(db, ORIGEM);

      await importBundle(db, parseBundle(await arquivoDe(db)), { id: COPIA, name: 'Cópia' });

      const copia = await linhaCampanha(db, COPIA);
      expect(copia).toMatchObject({ pinned: 0, locked: 0 });
      expect(await linhaCampanha(db, ORIGEM)).toEqual(linhaAntes);
      expect(await loadLatestState(db, ORIGEM)).toEqual(estadoAntes);
    });
  });

  describe('parseBundle recusa arquivos inválidos', () => {
    it('aceita o pacote exportado, sem alterações', async () => {
      const db = await bancoComOrigem(2);
      const a = await arquivoDe(db);
      expect(() => parseBundle(a)).not.toThrow();
    });

    it('valores que não são objeto', async () => {
      for (const raw of [null, undefined, 'texto', 42, [], true]) {
        expect(() => parseBundle(raw)).toThrow(BundleError);
      }
    });

    it('formato errado é "não é um save"', async () => {
      const db = await bancoComOrigem(1);
      const a = await arquivoDe(db);
      expect(() => parseBundle({ ...a, format: 'outro-jogo' })).toThrow(/não é um save/);
      expect(() => parseBundle({ foo: 'bar' })).toThrow(/não é um save/);
    });

    it('formatVersion errado é recusado', async () => {
      const db = await bancoComOrigem(1);
      const a = await arquivoDe(db);
      expect(a.formatVersion).toBe(BUNDLE_FORMAT_VERSION);
      expect(a.format).toBe(BUNDLE_FORMAT);
      expect(() => parseBundle({ ...a, formatVersion: BUNDLE_FORMAT_VERSION + 1 })).toThrow(BundleError);
    });

    it('dbVersion maior que a do app é "mais nova"', async () => {
      const db = await bancoComOrigem(1);
      const a = await arquivoDe(db);
      expect(() => parseBundle({ ...a, dbVersion: LATEST_DB_VERSION + 1 })).toThrow(/mais nova/);
    });

    it('dbVersion menor que a do app é "anterior" (antes do lançamento, sem conversão)', async () => {
      const db = await bancoComOrigem(1);
      const a = await arquivoDe(db);
      expect(() => parseBundle({ ...a, dbVersion: LATEST_DB_VERSION - 1 })).toThrow(/anterior/);
    });

    it('tabela filha faltando é recusada', async () => {
      const db = await bancoComOrigem(1);
      const a = await arquivoDe(db);
      const semSnapshots = { ...a, tables: { ...a.tables } };
      delete semSnapshots.tables.snapshots;
      expect(() => parseBundle(semSnapshots)).toThrow(BundleError);
    });

    it('valor de tipo não permitido (objeto, array ou boolean numa coluna) é recusado', async () => {
      const db = await bancoComOrigem(2);
      const base = await arquivoDe(db);
      const comObjeto = { ...base, campaign: { ...base.campaign, seed: {} } };
      const comArray = { ...base, campaign: { ...base.campaign, name: ['Governo'] } };
      const comBoolean = { ...base, campaign: { ...base.campaign, locked: true } };
      const comDecisaoBooleana = {
        ...base,
        tables: { ...base.tables, decisions: [{ ...base.tables.decisions[0], accepted: true }] },
      };
      for (const raw of [comObjeto, comArray, comBoolean, comDecisaoBooleana]) {
        expect(() => parseBundle(raw)).toThrow(BundleError);
      }
    });
  });

  describe('importBundle recusa sem gravar nada', () => {
    it('coluna desconhecida na campanha', async () => {
      const db = await bancoComOrigem(2);
      const a = await arquivoDe(db);
      a.campaign.coluna_inexistente = 'x';
      const antes = await contagens(db);
      await expect(importBundle(db, parseBundle(a), { id: COPIA, name: 'Cópia' })).rejects.toThrow(/desconhecidos/);
      expect(await contagens(db)).toEqual(antes);
    });

    it('coluna desconhecida numa linha filha (já gravou a campanha e as tabelas anteriores)', async () => {
      const db = await bancoComOrigem(2);
      const a = await arquivoDe(db);
      a.tables.decisions[0].coluna_inexistente = 'x';
      const antes = await contagens(db);
      await expect(importBundle(db, parseBundle(a), { id: COPIA, name: 'Cópia' })).rejects.toBeInstanceOf(BundleError);
      expect(await contagens(db)).toEqual(antes);
      expect(await linhaCampanha(db, COPIA)).toBeNull();
    });

    it('tentativa de injeção no nome da coluna não executa SQL e a tabela campaigns continua existindo', async () => {
      const db = await bancoComOrigem(2);
      const a = await arquivoDe(db);
      a.campaign["name) VALUES ('x'); DROP TABLE campaigns; --"] = 'x';
      const antes = await contagens(db);
      await expect(importBundle(db, parseBundle(a), { id: COPIA, name: 'Cópia' })).rejects.toThrow(/desconhecidos/);
      expect(await contagens(db)).toEqual(antes);
      const tabelas = await db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE name = 'campaigns'");
      expect(tabelas).toHaveLength(1);
    });

    it('snapshots vazios: a campanha não abre, então nada fica gravado', async () => {
      const db = await bancoComOrigem(2);
      const a = await arquivoDe(db);
      a.tables.snapshots = [];
      const antes = await contagens(db);
      await expect(importBundle(db, parseBundle(a), { id: COPIA, name: 'Cópia' })).rejects.toBeInstanceOf(BundleError);
      expect(await contagens(db)).toEqual(antes);
    });

    it('state_json corrompido: nada fica gravado', async () => {
      const db = await bancoComOrigem(2);
      const a = await arquivoDe(db);
      for (const s of a.tables.snapshots) s.state_json = '{"monthIndex": 3, corrompido';
      const antes = await contagens(db);
      await expect(importBundle(db, parseBundle(a), { id: COPIA, name: 'Cópia' })).rejects.toThrow(/incompleto/);
      expect(await contagens(db)).toEqual(antes);
    });

    it('state_schema_version maior que STATE_SCHEMA_VERSION é "mais nova" e nada fica gravado', async () => {
      const db = await bancoComOrigem(2);
      const a = await arquivoDe(db);
      for (const s of a.tables.snapshots) s.state_schema_version = STATE_SCHEMA_VERSION + 1;
      const antes = await contagens(db);
      await expect(importBundle(db, parseBundle(a), { id: COPIA, name: 'Cópia' })).rejects.toThrow(/mais nova/);
      expect(await contagens(db)).toEqual(antes);
    });

    it('coluna obrigatória ausente na campanha (scenario_version sem valor padrão) é recusada', async () => {
      const db = await bancoComOrigem(2);
      const a = await arquivoDe(db);
      delete a.campaign.scenario_version;
      const antes = await contagens(db);
      await expect(importBundle(db, parseBundle(a), { id: COPIA, name: 'Cópia' })).rejects.toThrow(/incompleto/);
      expect(await contagens(db)).toEqual(antes);
    });

    it('id já existente é recusado e a campanha existente fica intacta', async () => {
      const db = await bancoComOrigem(2);
      const linhaAntes = await linhaCampanha(db, ORIGEM);
      const antes = await contagens(db);
      await expect(importBundle(db, parseBundle(await arquivoDe(db)), { id: ORIGEM, name: 'Outra' })).rejects.toThrow(
        /Já existe/,
      );
      expect(await contagens(db)).toEqual(antes);
      expect(await linhaCampanha(db, ORIGEM)).toEqual(linhaAntes);
    });
  });

  describe('duplicateCampaign', () => {
    it('cria a cópia com o nome dado e deixa a origem intacta', async () => {
      const db = await bancoComOrigem(4);
      const linhaAntes = await linhaCampanha(db, ORIGEM);
      const estadoAntes = await loadLatestState(db, ORIGEM);

      await duplicateCampaign(db, ORIGEM, { id: COPIA, name: 'Governo Azul — cópia' });

      expect((await linhaCampanha(db, COPIA))?.name).toBe('Governo Azul — cópia');
      expect(await loadLatestState(db, COPIA)).toEqual(estadoAntes);
      expect(await linhaCampanha(db, ORIGEM)).toEqual(linhaAntes);
      expect(await loadLatestState(db, ORIGEM)).toEqual(estadoAntes);
    });
  });

  describe('bundleFileName', () => {
    /** Nome do arquivo para uma campanha com o nome e o mês dados (mês = `current_month`, 0 = posse). */
    const nomeDe = async (name: string, mes: number) => {
      const db = await bancoComOrigem(0);
      const pacote = await exportBundle(db, ORIGEM);
      pacote.campaign.name = name;
      pacote.campaign.current_month = mes;
      return bundleFileName(pacote);
    };

    it('acentos e símbolos viram ascii-hífen, em minúsculas, com o mês + 1', async () => {
      expect(await nomeDe('Governo Açaí — 2027!', 2)).toBe('governo-acai-2027-mes3.brasilsave.json');
      expect(await nomeDe('Índice Ômega', 0)).toBe('indice-omega-mes1.brasilsave.json');
    });

    it('nome vazio, só espaços ou sem letras cai em "campanha"', async () => {
      expect(await nomeDe('', 0)).toBe('campanha-mes1.brasilsave.json');
      expect(await nomeDe('   ', 0)).toBe('campanha-mes1.brasilsave.json');
      expect(await nomeDe('???', 4)).toBe('campanha-mes5.brasilsave.json');
    });

    it('o corte de 40 caracteres não deixa hífen sobrando antes de "-mes"', async () => {
      expect(await nomeDe(`${'a'.repeat(39)} bcd`, 0)).toBe(`${'a'.repeat(39)}-mes1.brasilsave.json`);
    });
  });
});
