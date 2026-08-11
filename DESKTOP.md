# Inkwell — offline desktop build

Inkwell is fully local-first: PDFs, annotations, form values and signatures live in a
SQLite database (`sql.js`) plus a documents folder. Nothing is ever uploaded.

## Storage locations

| Runtime | Database | PDF files |
| --- | --- | --- |
| Electron | `<userData>/inkwell.db` | `<userData>/documents/*.pdf` |
| Browser preview | IndexedDB `inkwell-store` | IndexedDB `inkwell-store` |

The renderer talks to disk through `window.inkwellDesktop` (see `electron/preload.cjs`),
and transparently falls back to IndexedDB when that bridge is absent.

## Run the desktop app in development

```bash
npm run dev            # terminal 1 — Vite on http://localhost:8080
npm run electron:dev   # terminal 2 — Electron window pointed at the dev server
```

## Build and package

```bash
npm run build            # produces the client build in .output/public
npm run electron:package # @electron/packager -> electron-release/Inkwell-linux-x64
```

For macOS or Windows artifacts, swap the platform flag:

```bash
npx @electron/packager . "Inkwell" --platform=darwin --arch=arm64 --out=electron-release --overwrite --ignore="node_modules" --ignore="^/src" --ignore="^/electron-release"
```

In production the main process serves the built client from a loopback static server,
so router paths and the bundled `sql-wasm.wasm` / `pdf.worker.min.mjs` assets resolve
exactly as they do in the browser — with no network access required.

## Offline assets

`public/vendor/` holds the SQLite WASM binary and the PDF.js worker so the app never
reaches a CDN. The only remote request in the app is the Google Fonts stylesheet in
`src/routes/__root.tsx`; remove it and use system fonts if you need a hard air gap.
