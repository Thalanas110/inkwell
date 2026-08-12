# Capacitor Android Production Target

## Goal

Add Android as a first-class production target for Inkwell alongside the existing Electron application. The Android app must use native SQLite for structured data and store/export PDF files on the device. Cross-device data migration is explicitly out of scope for this release.

## Current context

Inkwell is a Vite/TanStack React application with an Electron runtime. Its shared data layer currently uses `sql.js` and persists the SQLite database either through the Electron preload bridge or IndexedDB. PDF bytes use the same runtime split, while browser export currently uses a download link.

The production web client is emitted to `.output/public`. It includes local copies of the SQL.js WASM binary and PDF.js worker under `public/vendor/`, so the client can operate offline after packaging.

## Approved approach

Use Capacitor to package the existing client into a generated Android project. Keep the UI and domain-level database API shared, and introduce runtime-specific persistence adapters:

- Electron continues using its existing preload bridge and file-backed SQLite database.
- Android uses `@capacitor-community/sqlite` for the application database.
- Android uses Capacitor Filesystem for PDF persistence and for writing exported PDFs into the device Documents directory.
- Browser preview/development retains the existing IndexedDB fallback.

No Android-to-browser, browser-to-Android, or Electron-to-Android data migration is required. Each runtime owns its local data.

## Architecture

### Capacitor packaging

Add a root `capacitor.config.ts` with:

- App ID: `com.inkwell.app`
- App name: `Inkwell`
- Web directory: `.output/public`
- Android navigation behavior compatible with the existing client-side router

Add the Capacitor core, CLI, Android platform, native SQLite, and Filesystem dependencies using compatible versions. Generate and commit the `android/` project so Android builds are reproducible from the repository.

Add scripts for:

- production web build followed by Capacitor asset synchronization;
- Android debug/build workflows;
- opening the Android project in Android Studio.

Existing Electron scripts remain unchanged.

### Storage adapter boundary

Preserve the public operations used by routes and components: opening the database, listing and mutating documents, annotations, field values, and signatures; reading/writing/deleting PDF bytes; and exporting a PDF.

Move runtime-specific details behind adapters selected at runtime:

- Electron adapter delegates to `window.inkwellDesktop`.
- Android adapter delegates structured data to the native SQLite plugin and file operations to Capacitor Filesystem.
- Browser adapter keeps the current `sql.js` plus IndexedDB behavior for local preview.

The SQL schema remains logically identical across adapters. Android initialization creates the existing tables if they do not exist and persists all mutations through native SQLite transactions/operations.

### Android file behavior

Imported PDF bytes are written to an app-owned Filesystem location using the document file key. Reads and deletes use that same key. Export writes the final PDF bytes to the device Documents directory with the requested filename and returns the resulting saved filename/path to the caller.

Export must not invoke a share sheet. The implementation should sanitize filenames enough to avoid path traversal and preserve a `.pdf` extension.

### Offline assets and routing

The Android bundle must resolve `/vendor/sql-wasm.wasm` and `/vendor/pdf.worker.min.mjs` from packaged assets. Since Android will use native SQLite, SQL.js remains needed for browser preview but is not the Android database implementation.

Client-side routes must continue to load when launched from the Capacitor origin and when navigating directly to editor routes. No server-only TanStack Start behavior may be required by the Android runtime.

## Error handling

- Surface native SQLite initialization or query failures through the existing application error handling rather than silently falling back to IndexedDB on Android.
- Surface Filesystem read/write/delete failures to the user through the existing toast/error paths.
- Treat an unavailable Capacitor bridge as browser runtime, but never classify an Android native SQLite failure as a browser environment.
- Keep Electron behavior and its existing error handling intact.

## Testing and verification

Before implementation is considered complete:

1. Add focused tests for runtime selection and the Android persistence/export adapter behavior where the repository’s test tooling permits.
2. Run the production web build and confirm the generated `.output/public` contains the SQL.js WASM and PDF.js worker assets.
3. Run lint and the available automated tests.
4. Run Capacitor synchronization and verify the generated Android project references the configured app ID, web directory, Filesystem, and SQLite dependencies.
5. Run the Android Gradle build when an Android SDK/Gradle environment is available; otherwise report that environment limitation explicitly.
6. Manually verify on an Android emulator/device: import a PDF, close/reopen the app, confirm the document remains in the library, edit/save annotations, and export a PDF into Documents.

## Out of scope

- Cross-device or cross-runtime data migration.
- Cloud sync, accounts, or remote storage.
- Android-specific UI redesign.
- Share-sheet integration.
- Replacing Electron’s existing storage implementation.
