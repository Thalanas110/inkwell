import initSqlJs, { type Database } from "sql.js";
import { desktop } from "./desktop";
import { idbGet, idbSet } from "./idb";

export type DocumentRow = {
  id: string;
  name: string;
  file_key: string;
  page_count: number;
  created_at: number;
  updated_at: number;
};

export type AnnotationRow = {
  id: string;
  doc_id: string;
  page: number;
  type: "text" | "check" | "signature";
  x: number;
  y: number;
  w: number;
  h: number;
  data: string;
};

export type SignatureRow = {
  id: string;
  name: string;
  data_url: string;
  created_at: number;
};

export type FieldValueRow = { doc_id: string; name: string; type: string; value: string };

const SCHEMA = `
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  file_key TEXT NOT NULL,
  page_count INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS annotations (
  id TEXT PRIMARY KEY,
  doc_id TEXT NOT NULL,
  page INTEGER NOT NULL,
  type TEXT NOT NULL,
  x REAL NOT NULL, y REAL NOT NULL, w REAL NOT NULL, h REAL NOT NULL,
  data TEXT NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS field_values (
  doc_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  value TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (doc_id, name)
);
CREATE TABLE IF NOT EXISTS signatures (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  data_url TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
`;

let dbPromise: Promise<Database> | null = null;

async function loadExisting(): Promise<Uint8Array | null> {
  const d = desktop();
  if (d) return d.readDb();
  const v = await idbGet<Uint8Array | ArrayBuffer>("inkwell.db");
  if (!v) return null;
  return v instanceof Uint8Array ? v : new Uint8Array(v);
}

async function openDb(): Promise<Database> {
  const SQL = await initSqlJs({ locateFile: () => "/vendor/sql-wasm.wasm" });
  const existing = await loadExisting();
  const db = existing ? new SQL.Database(existing) : new SQL.Database();
  db.run(SCHEMA);
  return db;
}

export function getDb(): Promise<Database> {
  if (!dbPromise) dbPromise = openDb();
  return dbPromise;
}

export async function persist() {
  const db = await getDb();
  const bytes = db.export();
  const d = desktop();
  if (d) await d.writeDb(bytes);
  else await idbSet("inkwell.db", bytes);
}

async function all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  const db = await getDb();
  const stmt = db.prepare(sql);
  stmt.bind(params as never);
  const rows: T[] = [];
  while (stmt.step()) rows.push(stmt.getAsObject() as unknown as T);
  stmt.free();
  return rows;
}

async function run(sql: string, params: unknown[] = []) {
  const db = await getDb();
  db.run(sql, params as never);
  await persist();
}

export const uid = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

/* ---------- documents ---------- */

export const listDocuments = () =>
  all<DocumentRow>("SELECT * FROM documents ORDER BY updated_at DESC");

export const getDocument = async (id: string) =>
  (await all<DocumentRow>("SELECT * FROM documents WHERE id = ?", [id]))[0] ?? null;

export async function createDocument(doc: Omit<DocumentRow, "created_at" | "updated_at">) {
  const now = Date.now();
  await run(
    "INSERT INTO documents (id, name, file_key, page_count, created_at, updated_at) VALUES (?,?,?,?,?,?)",
    [doc.id, doc.name, doc.file_key, doc.page_count, now, now],
  );
}

export const touchDocument = (id: string) =>
  run("UPDATE documents SET updated_at = ? WHERE id = ?", [Date.now(), id]);

export const renameDocument = (id: string, name: string) =>
  run("UPDATE documents SET name = ?, updated_at = ? WHERE id = ?", [name, Date.now(), id]);

export async function deleteDocument(id: string) {
  const db = await getDb();
  db.run("DELETE FROM annotations WHERE doc_id = ?", [id]);
  db.run("DELETE FROM field_values WHERE doc_id = ?", [id]);
  db.run("DELETE FROM documents WHERE id = ?", [id]);
  await persist();
}

/* ---------- annotations ---------- */

export const listAnnotations = (docId: string) =>
  all<AnnotationRow>("SELECT * FROM annotations WHERE doc_id = ? ORDER BY page", [docId]);

export const upsertAnnotation = (a: AnnotationRow) =>
  run(
    `INSERT INTO annotations (id, doc_id, page, type, x, y, w, h, data)
     VALUES (?,?,?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET page=excluded.page, x=excluded.x, y=excluded.y,
       w=excluded.w, h=excluded.h, data=excluded.data`,
    [a.id, a.doc_id, a.page, a.type, a.x, a.y, a.w, a.h, a.data],
  );

export const deleteAnnotation = (id: string) => run("DELETE FROM annotations WHERE id = ?", [id]);

/* ---------- form fields ---------- */

export const listFieldValues = (docId: string) =>
  all<FieldValueRow>("SELECT * FROM field_values WHERE doc_id = ?", [docId]);

export const setFieldValue = (docId: string, name: string, type: string, value: string) =>
  run(
    `INSERT INTO field_values (doc_id, name, type, value) VALUES (?,?,?,?)
     ON CONFLICT(doc_id, name) DO UPDATE SET value=excluded.value, type=excluded.type`,
    [docId, name, type, value],
  );

/* ---------- signatures ---------- */

export const listSignatures = () =>
  all<SignatureRow>("SELECT * FROM signatures ORDER BY created_at DESC");

export const addSignature = (name: string, dataUrl: string) =>
  run("INSERT INTO signatures (id, name, data_url, created_at) VALUES (?,?,?,?)", [
    uid(),
    name,
    dataUrl,
    Date.now(),
  ]);

export const deleteSignature = (id: string) => run("DELETE FROM signatures WHERE id = ?", [id]);
