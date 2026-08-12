import { CapacitorSQLite, SQLiteConnection } from "@capacitor-community/sqlite";
import { SCHEMA } from "./schema";
import type { SqlDriver } from "./types";

let driverPromise: Promise<SqlDriver> | undefined;

export function createAndroidSqlDriver(): Promise<SqlDriver> {
  if (!driverPromise) driverPromise = openAndroidSqlDriver();
  return driverPromise;
}

async function openAndroidSqlDriver(): Promise<SqlDriver> {
  const sqlite = new SQLiteConnection(CapacitorSQLite);
  const connection = await sqlite.createConnection("inkwell", false, "no-encryption", 1, false);
  await connection.open();
  await connection.execute(SCHEMA);

  return {
    async execute(sql: string) {
      await connection.execute(sql);
    },
    async query<T>(sql: string, values: unknown[] = []) {
      const result = await connection.query(sql, values as unknown[]);
      return (result.values ?? []) as T[];
    },
    async run(sql: string, values: unknown[] = []) {
      await connection.run(sql, values as unknown[]);
    },
  };
}
