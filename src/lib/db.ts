import { desktop } from "./desktop";
import { getRuntimeKind } from "./runtime";
import { createBrowserSqlDriver } from "./storage/browser";
import type { SqlDriver } from "./storage/types";

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

let driverPromise: Promise<SqlDriver> | null = null;
let testDriver: SqlDriver | undefined;

async function getDriver(): Promise<SqlDriver> {
  if (testDriver) return testDriver;
  if (!driverPromise) {
    driverPromise = createRuntimeDriver();
  }
  return driverPromise;
}

async function createRuntimeDriver(): Promise<SqlDriver> {
  if (getRuntimeKind() === "android") {
    const { createAndroidSqlDriver } = await import("./storage/android");
    return createAndroidSqlDriver();
  }

  const bridge = desktop();
  return createBrowserSqlDriver({
    ...(bridge
      ? {
          load: () => bridge.readDb(),
          save: async (bytes: Uint8Array) => {
            await bridge.writeDb(bytes);
          },
        }
      : {}),
  });
}

export function setSqlDriverForTests(driver: SqlDriver | undefined) {
  testDriver = driver;
  driverPromise = null;
}

export function getDb(): Promise<SqlDriver> {
  return getDriver();
}

export async function persist() {
  const driver = await getDriver();
  await driver.persist?.();
}

async function all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await getDriver()).query<T>(sql, params);
}

async function run(sql: string, params: unknown[] = []) {
  const driver = await getDriver();
  await driver.run(sql, params);
  await driver.persist?.();
}

export const uid = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

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
  const driver = await getDriver();
  await driver.run("DELETE FROM annotations WHERE doc_id = ?", [id]);
  await driver.run("DELETE FROM field_values WHERE doc_id = ?", [id]);
  await driver.run("DELETE FROM documents WHERE id = ?", [id]);
  await driver.persist?.();
}

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

export const listFieldValues = (docId: string) =>
  all<FieldValueRow>("SELECT * FROM field_values WHERE doc_id = ?", [docId]);

export const setFieldValue = (docId: string, name: string, type: string, value: string) =>
  run(
    `INSERT INTO field_values (doc_id, name, type, value) VALUES (?,?,?,?)
     ON CONFLICT(doc_id, name) DO UPDATE SET value=excluded.value, type=excluded.type`,
    [docId, name, type, value],
  );

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
