import { afterEach, describe, expect, it } from "vitest";
import { createDocument, listDocuments, setSqlDriverForTests } from "../../src/lib/db";
import type { SqlDriver } from "../../src/lib/storage/types";

describe("shared SQLite storage API", () => {
  afterEach(() => setSqlDriverForTests(undefined));

  it("creates and lists documents through the selected driver", async () => {
    const document = {
      id: "doc-1",
      name: "contract.pdf",
      file_key: "doc-1.pdf",
      page_count: 2,
      created_at: 1,
      updated_at: 1,
    };
    const runs: Array<{ sql: string; values?: unknown[] }> = [];
    const fake: SqlDriver = {
      async execute() {},
      async query<T>() {
        return [document] as T[];
      },
      async run(sql, values) {
        runs.push({ sql, values });
      },
    };

    setSqlDriverForTests(fake);
    await createDocument(document);

    expect(await listDocuments()).toEqual([document]);
    expect(runs[0]).toEqual({
      sql: expect.stringContaining("INSERT INTO documents"),
      values: [
        document.id,
        document.name,
        document.file_key,
        document.page_count,
        expect.any(Number),
        expect.any(Number),
      ],
    });
  });
});
