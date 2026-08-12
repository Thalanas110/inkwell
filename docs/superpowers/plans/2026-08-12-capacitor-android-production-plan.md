# Capacitor Android Production Target Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Inkwell as a Capacitor Android app with native SQLite persistence and device-local PDF import, storage, and export while preserving the existing Electron and browser runtimes.

**Architecture:** Keep the existing public document/annotation/signature operations, but move runtime-specific SQL and file behavior behind small adapters. Electron keeps its preload bridge, browser preview keeps sql.js plus IndexedDB, and Android uses `@capacitor-community/sqlite` plus Capacitor Filesystem. Capacitor packages `.output/public` into a committed `android/` project.

**Tech Stack:** React/Vite/TanStack Router, TypeScript, sql.js, Capacitor, `@capacitor-community/sqlite`, `@capacitor/filesystem`, Vitest, Android Gradle project.

## Global Constraints

- Android must use native SQLite for structured data; it must not silently fall back to IndexedDB.
- Android PDF files must be stored on-device and exported to the device Documents directory; do not add or invoke a share sheet.
- Electron behavior and scripts remain working.
- Browser preview/development keeps its IndexedDB fallback.
- The Android app ID is `com.inkwell.app` and the app name is `Inkwell`.
- The Capacitor web directory is `.output/public`.
- The generated `android/` project is committed.
- Cross-device and cross-runtime data migration is out of scope.
- Do not add cloud sync, accounts, remote storage, or an Android-specific UI redesign.

---

## File Map

Create or modify these focused units:

- Create `capacitor.config.ts` — Capacitor app metadata and web directory.
- Create `vitest.config.ts` — test environment and `@` alias used by unit tests.
- Create `tests/lib/runtime.test.ts` — runtime detection behavior.
- Create `tests/lib/capacitor-files.test.ts` — filename sanitizing and byte/base64 conversion behavior.
- Create `tests/lib/storage.test.ts` — shared storage API behavior against a fake SQL driver.
- Create `src/lib/runtime.ts` — browser, Electron, and native Capacitor runtime detection.
- Create `src/lib/storage/types.ts` — shared SQL driver and row/result types.
- Create `src/lib/storage/browser.ts` — current sql.js/IndexedDB database implementation.
- Create `src/lib/storage/android.ts` — native SQLite driver implementation.
- Create `src/lib/capacitor-files.ts` — Android Filesystem byte persistence and device export.
- Modify `src/lib/db.ts` — preserve the public database functions while routing through the selected driver.
- Modify `src/lib/desktop.ts` — route file operations to Electron, Android, or browser adapters and expose runtime-aware status helpers.
- Modify `src/routes/index.tsx` — show Android’s offline/device-local status without calling it desktop.
- Modify `package.json` and `package-lock.json` — dependencies and scripts.
- Create `android/` via Capacitor CLI — committed Android project and native plugin wiring.
- Modify `README.md` — Android development, sync, and production build instructions.

---

### Task 1: Add test infrastructure and runtime detection

**Files:**
- Create: `vitest.config.ts`
- Create: `tests/lib/runtime.test.ts`
- Create: `src/lib/runtime.ts`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Produces `RuntimeKind = "browser" | "electron" | "android"`.
- Produces `getRuntimeKind(): RuntimeKind` and `isAndroidRuntime(): boolean`.
- Runtime detection must use Electron’s existing `window.inkwellDesktop` bridge first, then Capacitor’s native platform signal, and otherwise return `"browser"`.

- [ ] **Step 1: Add Vitest and a test script**

Run:

```powershell
npm install --save-dev vitest
```

Add this script to `package.json` without removing existing scripts:

```json
"test": "vitest run"
```

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "jsdom",
  },
});
```

- [ ] **Step 2: Write the failing runtime tests**

Create `tests/lib/runtime.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import { getRuntimeKind } from "@/lib/runtime";

afterEach(() => {
  delete (window as unknown as { inkwellDesktop?: unknown }).inkwellDesktop;
  delete (window as unknown as { Capacitor?: unknown }).Capacitor;
});

describe("getRuntimeKind", () => {
  it("returns electron when the Electron bridge is available", () => {
    (window as unknown as { inkwellDesktop: { platform: string } }).inkwellDesktop = {
      platform: "win32",
    };

    expect(getRuntimeKind()).toBe("electron");
  });

  it("returns android when Capacitor reports a native Android platform", () => {
    (window as unknown as { Capacitor: { isNativePlatform: () => boolean; getPlatform: () => string } }).Capacitor = {
      isNativePlatform: () => true,
      getPlatform: () => "android",
    };

    expect(getRuntimeKind()).toBe("android");
  });

  it("returns browser when neither native runtime is available", () => {
    expect(getRuntimeKind()).toBe("browser");
  });
});
```

- [ ] **Step 3: Run the tests and verify the expected failure**

Run:

```powershell
npm test -- tests/lib/runtime.test.ts
```

Expected: Vitest starts, then fails because `src/lib/runtime.ts` does not yet export `getRuntimeKind`.

- [ ] **Step 4: Implement the minimal runtime detector**

Create `src/lib/runtime.ts`:

```ts
export type RuntimeKind = "browser" | "electron" | "android";

type CapacitorWindow = Window & {
  Capacitor?: {
    isNativePlatform?: () => boolean;
    getPlatform?: () => string;
  };
  inkwellDesktop?: unknown;
};

export function getRuntimeKind(): RuntimeKind {
  if (typeof window === "undefined") return "browser";

  const runtimeWindow = window as CapacitorWindow;
  if (runtimeWindow.inkwellDesktop) return "electron";

  const capacitor = runtimeWindow.Capacitor;
  if (capacitor?.isNativePlatform?.() && capacitor.getPlatform?.() === "android") {
    return "android";
  }

  return "browser";
}

export const isAndroidRuntime = () => getRuntimeKind() === "android";
```

- [ ] **Step 5: Run the focused test and lint**

Run:

```powershell
npm test -- tests/lib/runtime.test.ts
npm run lint
```

Expected: all runtime tests pass and ESLint exits with code 0.

- [ ] **Step 6: Commit the runtime foundation**

```powershell
git add package.json package-lock.json vitest.config.ts src/lib/runtime.ts tests/lib/runtime.test.ts
git commit -m "test: add runtime detection coverage"
```

### Task 2: Extract a shared SQL storage boundary and add Android SQLite

**Files:**
- Create: `src/lib/storage/types.ts`
- Create: `src/lib/storage/browser.ts`
- Create: `src/lib/storage/android.ts`
- Create: `tests/lib/storage.test.ts`
- Modify: `src/lib/db.ts`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- `SqlDriver` exposes `execute(sql: string): Promise<void>`, `query<T>(sql: string, values?: unknown[]): Promise<T[]>`, and `run(sql: string, values?: unknown[]): Promise<void>`.
- `createAndroidSqlDriver(): Promise<SqlDriver>` opens one native database named `inkwell`, initializes the shared schema, and rejects native errors.
- `db.ts` continues exporting the existing functions (`getDb`, `persist`, `listDocuments`, `getDocument`, `createDocument`, `touchDocument`, `renameDocument`, `deleteDocument`, annotation functions, field-value functions, and signature functions) so existing routes do not change their data API.

- [ ] **Step 1: Write a failing test for the shared database operations**

Create `tests/lib/storage.test.ts` with an in-memory fake driver that records SQL calls and returns rows. Test that `createDocument` issues an insert with the expected values and that `listDocuments` returns the driver’s rows. The test must import those functions from `@/lib/db` and install the fake driver through an explicit test-only factory parameter or exported `setSqlDriverForTests` hook, not by mocking the database module.

The required assertions are:

```ts
expect(await listDocuments()).toEqual([document]);
expect(fake.runs[0]).toEqual({
  sql: expect.stringContaining("INSERT INTO documents"),
  values: [document.id, document.name, document.file_key, document.page_count, expect.any(Number), expect.any(Number)],
});
```

- [ ] **Step 2: Run the storage test and verify it fails for the missing boundary**

```powershell
npm test -- tests/lib/storage.test.ts
```

Expected: the test fails because the driver seam and the refactored shared operations do not exist yet.

- [ ] **Step 3: Define the driver types and move the browser implementation**

Create `src/lib/storage/types.ts`:

```ts
export type SqlDriver = {
  execute(sql: string): Promise<void>;
  query<T>(sql: string, values?: unknown[]): Promise<T[]>;
  run(sql: string, values?: unknown[]): Promise<void>;
};
```

Move the current schema string and sql.js initialization into `src/lib/storage/browser.ts`. The browser driver must load `/vendor/sql-wasm.wasm`, hydrate from IndexedDB key `inkwell.db`, create the existing schema, and persist the exported sql.js database back to that key after every mutation. Keep all SQL table names and columns unchanged.

- [ ] **Step 4: Implement the Android native SQLite driver**

Create `src/lib/storage/android.ts` using `SQLiteConnection` from `@capacitor-community/sqlite`:

```ts
const sqlite = new SQLiteConnection(CapacitorSQLite);
const connection = await sqlite.createConnection("inkwell", false, "no-encryption", 1, false);
await connection.open();
await connection.execute(SCHEMA);
```

Wrap the connection as `SqlDriver`:

- `execute` calls `connection.execute(sql)`.
- `query` calls `connection.query(sql, values)` and returns `result.values ?? []`.
- `run` calls `connection.run(sql, values)`.

Cache the initialization promise so React Strict Mode cannot create multiple connections. Do not catch native initialization errors to fall back to browser storage.

- [ ] **Step 5: Refactor `src/lib/db.ts` to select a driver**

Use `getRuntimeKind()` to choose `createAndroidSqlDriver()` on Android and the browser driver otherwise, while retaining Electron database persistence through the existing bridge. Keep the exported domain functions and SQL schema identical. For Electron, the browser sql.js driver may be reused with its existing `desktop().readDb()`/`desktop().writeDb()` persistence path; browser-only IndexedDB remains the fallback when that bridge is absent.

Expose a narrowly scoped `setSqlDriverForTests(driver: SqlDriver | undefined)` reset hook for `tests/lib/storage.test.ts`, and ensure production code never calls it.

- [ ] **Step 6: Run storage tests, the full test suite, and typecheck/build**

```powershell
npm test
npx tsc --noEmit
npm run build
```

Expected: all tests pass, TypeScript exits with code 0, and the production build exits with code 0.

- [ ] **Step 7: Commit the SQLite adapter**

```powershell
git add src/lib/db.ts src/lib/storage tests/lib/storage.test.ts package.json package-lock.json
git commit -m "feat: add native Android SQLite storage"
```

### Task 3: Add Android Filesystem persistence and real device export

**Files:**
- Create: `src/lib/capacitor-files.ts`
- Create: `tests/lib/capacitor-files.test.ts`
- Modify: `src/lib/desktop.ts`
- Modify: `src/routes/index.tsx`

**Interfaces:**
- `sanitizePdfFilename(name: string): string` returns a safe non-empty filename ending in `.pdf`.
- `saveCapacitorFile(key: string, bytes: Uint8Array): Promise<void>` stores app-owned PDF bytes using `Directory.Data`.
- `readCapacitorFile(key: string): Promise<Uint8Array | null>` returns stored bytes or `null` for a missing file.
- `deleteCapacitorFile(key: string): Promise<void>` removes app-owned PDF bytes.
- `exportCapacitorPdf(name: string, bytes: Uint8Array): Promise<string>` writes to `Directory.Documents` and returns the saved path.

- [ ] **Step 1: Write failing pure-function tests**

Create tests covering:

```ts
expect(sanitizePdfFilename("signed contract")).toBe("signed contract.pdf");
expect(sanitizePdfFilename("../secret\\contract.PDF")).toBe(".._secret_contract.PDF");
expect(sanitizePdfFilename("   ")).toBe("inkwell-document.pdf");
```

Also test that converting a `Uint8Array([0, 1, 2, 255])` to base64 and back returns the same bytes. Keep Capacitor APIs out of these pure tests.

- [ ] **Step 2: Run the focused tests and verify the expected failure**

```powershell
npm test -- tests/lib/capacitor-files.test.ts
```

Expected: failure because the filename and byte-conversion helpers do not yet exist.

- [ ] **Step 3: Implement the pure helpers and Capacitor Filesystem adapter**

Use `@capacitor/filesystem` with base64 for binary data. App-owned files use `Directory.Data`; exported files use `Directory.Documents`:

```ts
await Filesystem.writeFile({
  path: key,
  data: bytesToBase64(bytes),
  directory: Directory.Data,
  recursive: true,
});

await Filesystem.writeFile({
  path: sanitizePdfFilename(name),
  data: bytesToBase64(bytes),
  directory: Directory.Documents,
  recursive: true,
});
```

Convert `readFile`’s base64 string back to `Uint8Array`. Return `null` only for the plugin’s missing-file error; rethrow all other Filesystem failures.

- [ ] **Step 4: Route `src/lib/desktop.ts` through the Android adapter**

Keep the existing Electron bridge path first. When `getRuntimeKind()` is `"android"`, delegate `saveFileBytes`, `readFileBytes`, `deleteFileBytes`, and `exportBytes` to the Capacitor adapter. Preserve the current browser IndexedDB/download behavior for `"browser"`.

Update `isDesktop()` to remain Electron-only and add a runtime label helper used by the home route. Update `src/routes/index.tsx` so Android displays `Android · offline` and continues to tell the user files stay on the device.

- [ ] **Step 5: Run focused tests and the full web checks**

```powershell
npm test
npx tsc --noEmit
npm run lint
npm run build
```

Expected: all tests pass, TypeScript and lint exit 0, and the build contains the existing `public/vendor/sql-wasm.wasm` and `public/vendor/pdf.worker.min.mjs` assets under `.output/public/vendor/`.

- [ ] **Step 6: Commit device file storage/export**

```powershell
git add src/lib/capacitor-files.ts tests/lib/capacitor-files.test.ts src/lib/desktop.ts src/routes/index.tsx
git commit -m "feat: persist and export Android PDFs on device"
```

### Task 4: Configure Capacitor and generate the Android project

**Files:**
- Create: `capacitor.config.ts`
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `android/` via Capacitor CLI

**Interfaces:**
- `capacitor.config.ts` exports `appId: "com.inkwell.app"`, `appName: "Inkwell"`, and `webDir: ".output/public"`.
- `npm run android:sync` produces a synchronized Android project from the latest production web build.
- `npm run android:open` opens the generated project in Android Studio.
- `npm run android:build` runs the production web build, syncs Capacitor, and invokes the Android Gradle assemble task.

- [ ] **Step 1: Install Capacitor dependencies**

Run:

```powershell
npm install @capacitor/core @capacitor/filesystem @capacitor-community/sqlite
npm install --save-dev @capacitor/cli @capacitor/android
```

Do not install `@capacitor/share`.

- [ ] **Step 2: Create the Capacitor configuration**

Create `capacitor.config.ts`:

```ts
import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.inkwell.app",
  appName: "Inkwell",
  webDir: ".output/public",
};

export default config;
```

- [ ] **Step 3: Add production Android scripts**

Add these scripts while preserving the Electron scripts:

```json
"android:build": "npm run build && npx cap sync android && cd android && gradlew.bat assembleDebug",
"android:sync": "npm run build && npx cap sync android",
"android:open": "npx cap open android"
```

Use `gradlew` instead of `gradlew.bat` when running the build on macOS/Linux; do not alter the Windows script’s behavior.

- [ ] **Step 4: Add and sync the Android platform**

Run:

```powershell
npx cap add android
npm run android:sync
```

Verify that `android/app/src/main/AndroidManifest.xml` and Gradle files contain the generated app ID, that the web assets are copied from `.output/public`, and that the native SQLite and Filesystem plugins are registered by the synced project.

- [ ] **Step 5: Inspect native configuration and commit the generated project**

Run:

```powershell
git status --short
git diff --check
```

Confirm that no keystore, local SDK path, or machine-specific IDE file is included. Commit the generated Android project and configuration:

```powershell
git add capacitor.config.ts android package.json package-lock.json
git commit -m "feat: add Capacitor Android project"
```

### Task 5: Document and verify production Android delivery

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Document Android setup and workflows**

Add a concise Android section covering:

```text
npm install
npm run android:sync
npm run android:open
npm run android:build
```

Document that Android stores structured data in native SQLite, keeps PDF files on the device, exports PDFs to Documents, and does not synchronize data with Electron/browser installs.

- [ ] **Step 2: Run the complete verification commands**

Run each command fresh and record its exit status:

```powershell
npm test
npx tsc --noEmit
npm run lint
npm run build
npm run android:sync
Push-Location android
.\gradlew.bat assembleDebug
Pop-Location
```

Expected: tests, typecheck, lint, web build, Capacitor sync, and Android debug assembly all exit 0. If the Android SDK/Gradle environment is unavailable, report that exact limitation and still verify all web/runtime checks.

Confirm the production build contains:

```text
.output/public/vendor/sql-wasm.wasm
.output/public/vendor/pdf.worker.min.mjs
```

- [ ] **Step 3: Perform device-level acceptance checks when an emulator/device is available**

On Android, verify this sequence:

1. Launch Inkwell and confirm the home status reads `Android · offline`.
2. Import a PDF and confirm it appears in the library.
3. Close and reopen the app; confirm the document remains.
4. Add or edit an annotation/signature and confirm it remains after reopening.
5. Export the document and confirm a `.pdf` file exists in the device Documents directory.
6. Confirm export did not open a share sheet.
7. Open an editor route directly after relaunch and confirm the route renders instead of showing a native/web 404.

- [ ] **Step 4: Commit documentation and final verification notes**

```powershell
git add README.md
git commit -m "docs: document Android production workflow"
```

Before reporting completion, inspect `git status --short`, review the final diff, and report any unavailable device/SDK verification rather than implying it passed.
