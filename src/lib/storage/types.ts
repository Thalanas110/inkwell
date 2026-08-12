export type SqlDriver = {
  execute(sql: string): Promise<void>;
  query<T>(sql: string, values?: unknown[]): Promise<T[]>;
  run(sql: string, values?: unknown[]): Promise<void>;
  persist?: () => Promise<void>;
};
