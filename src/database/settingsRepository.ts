import type { SqlDatabase } from './types';

/** Lê uma preferência; devolve `fallback` se não existir ou estiver corrompida. */
export async function getSetting<T>(db: SqlDatabase, key: string, fallback: T): Promise<T> {
  const row = await db.first<{ value_json: string }>('SELECT value_json FROM settings WHERE key = ?', [key]);
  if (!row) return fallback;
  try {
    return JSON.parse(row.value_json) as T;
  } catch {
    return fallback;
  }
}

export async function setSetting(db: SqlDatabase, key: string, value: unknown): Promise<void> {
  await db.run(
    `INSERT INTO settings (key, value_json) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json,
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
    [key, JSON.stringify(value)],
  );
}
