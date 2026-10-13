import * as SQLite from 'expo-sqlite';

import { migrate } from './migrate';
import type { SqlDatabase } from './types';

export const DATABASE_NAME = 'brasil-simulator.db';

/** Abre o banco do aparelho (expo-sqlite), liga WAL e chaves estrangeiras e aplica as migrações. */
export async function openDatabase(name = DATABASE_NAME): Promise<SqlDatabase> {
  const native = await SQLite.openDatabaseAsync(name);
  await native.execAsync('PRAGMA journal_mode = WAL;');
  const db: SqlDatabase = {
    exec: (sql) => native.execAsync(sql),
    run: async (sql, params = []) => {
      const r = await native.runAsync(sql, [...params]);
      return { changes: r.changes, lastInsertRowId: r.lastInsertRowId };
    },
    all: (sql, params = []) => native.getAllAsync(sql, [...params]),
    first: (sql, params = []) => native.getFirstAsync(sql, [...params]),
    // withExclusiveTransactionAsync exigiria passar o objeto da transação a cada consulta; o app faz uma
    // gravação por vez, então a transação comum basta.
    transaction: (task) => native.withTransactionAsync(task),
    close: () => native.closeAsync(),
  };
  await migrate(db);
  return db;
}
