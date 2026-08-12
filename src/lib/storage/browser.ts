import initSqlJs, { type Database } from "sql.js";
import { idbGet, idbSet } from "../idb";
import { SCHEMA } from "./schema";
import type { SqlDriver } from "./types";

type BrowserStorageOptions = {
  load?: () => Promise<Uint8Array | null>;
  save?: (bytes: Uint8Array) => Promise<void>;
};

export async function createBrowserSqlDriver(
  options: BrowserStorageOptions = {},
): Promise<SqlDriver> {
  const SQL = await initSqlJs({ locateFile: () => "/vendor/sql-wasm.wasm" });
  const existing = await (options.load?.() ?? loadFromIndexedDb());
  const db: Database = existing ? new SQL.Database(existing) : new SQL.Database();
  db.run(SCHEMA);

  return {
    async execute(sql: string) {
      db.run(sql);
    },
    async query<T>(sql: string, values: unknown[] = []) {
      const stmt = db.prepare(sql);
      stmt.bind(values as never);
      const rows: T[] = [];
      while (stmt.step()) rows.push(stmt.getAsObject() as unknown as T);
      stmt.free();
      return rows;
    },
    async run(sql: string, values: unknown[] = []) {
      db.run(sql, values as never);
    },
    async persist() {
      const bytes = db.export();
      if (options.save) await options.save(bytes);
      else await idbSet("inkwell.db", bytes);
    },
  };
}

async function loadFromIndexedDb(): Promise<Uint8Array | null> {
  const value = await idbGet<Uint8Array | ArrayBuffer>("inkwell.db");
  if (!value) return null;
  return value instanceof Uint8Array ? value : new Uint8Array(value);
}
