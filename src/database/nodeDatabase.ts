/// <reference types="node" />
import { createRequire } from 'node:module';

import type { SqlDatabase, SqlValue } from './types';

/**
 * Adaptador para testes (Vitest/Node) sobre o `node:sqlite` embutido no Node ≥ 22.
 * Não é importado pelo app: o Metro só empacota o que o app importa.
 */
export function openNodeDatabase(path = ':memory:'): SqlDatabase {
  // createRequire: o Vite não resolve `node:sqlite` como import estático.
  const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');
  const native = new DatabaseSync(path);
  const params = (p: readonly SqlValue[] = []) => [...p];
  return {
    exec: async (sql) => {
      native.exec(sql);
    },
    run: async (sql, p) => {
      const r = native.prepare(sql).run(...params(p));
      return { changes: Number(r.changes), lastInsertRowId: Number(r.lastInsertRowid) };
    },
    all: async <T>(sql: string, p?: readonly SqlValue[]) => native.prepare(sql).all(...params(p)) as T[],
    first: async <T>(sql: string, p?: readonly SqlValue[]) => (native.prepare(sql).get(...params(p)) as T) ?? null,
    transaction: async (task) => {
      native.exec('BEGIN');
      try {
        await task();
        native.exec('COMMIT');
      } catch (e) {
        native.exec('ROLLBACK');
        throw e;
      }
    },
    close: async () => native.close(),
  };
}
