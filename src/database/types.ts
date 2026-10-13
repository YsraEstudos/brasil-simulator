/**
 * Interface mínima de banco SQL usada pela persistência. O app usa o adaptador do expo-sqlite
 * (`openDatabase.ts`); os testes usam o SQLite embutido no Node (`nodeDatabase.ts`). Assim migrações e
 * consultas são testadas com um SQLite de verdade, sem depender do aparelho.
 */

export type SqlValue = string | number | null;

export interface RunResult {
  changes: number;
  lastInsertRowId: number;
}

export interface SqlDatabase {
  /** Executa um ou mais comandos sem parâmetros (DDL, PRAGMA). */
  exec(sql: string): Promise<void>;
  run(sql: string, params?: readonly SqlValue[]): Promise<RunResult>;
  all<T>(sql: string, params?: readonly SqlValue[]): Promise<T[]>;
  first<T>(sql: string, params?: readonly SqlValue[]): Promise<T | null>;
  /** Executa `task` numa transação: tudo ou nada. */
  transaction(task: () => Promise<void>): Promise<void>;
  close(): Promise<void>;
}
