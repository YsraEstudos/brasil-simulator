import { MIGRATIONS, type Migration } from './migrations';
import type { SqlDatabase } from './types';

/** O banco foi criado por uma versão mais nova do app: não mexemos para não corromper o save. */
export class DatabaseTooNewError extends Error {
  constructor(
    readonly dbVersion: number,
    readonly appVersion: number,
  ) {
    super(`banco na versão ${dbVersion}, app conhece até ${appVersion}`);
    this.name = 'DatabaseTooNewError';
  }
}

export async function currentVersion(db: SqlDatabase): Promise<number> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    INTEGER PRIMARY KEY,
      name       TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
  `);
  const row = await db.first<{ v: number | null }>('SELECT MAX(version) AS v FROM schema_migrations');
  return row?.v ?? 0;
}

/**
 * Aplica as migrações pendentes, cada uma em sua própria transação (falhou → nada daquela versão fica).
 * Devolve as versões aplicadas.
 */
export async function migrate(db: SqlDatabase, migrations: readonly Migration[] = MIGRATIONS): Promise<number[]> {
  await db.exec('PRAGMA foreign_keys = ON;');
  const from = await currentVersion(db);
  const latest = migrations.length ? migrations[migrations.length - 1].version : 0;
  if (from > latest) throw new DatabaseTooNewError(from, latest);

  const applied: number[] = [];
  for (const m of migrations) {
    if (m.version <= from) continue;
    await db.transaction(async () => {
      await db.exec(m.sql);
      await db.run('INSERT INTO schema_migrations (version, name) VALUES (?, ?)', [m.version, m.name]);
    });
    applied.push(m.version);
  }
  return applied;
}
