# Text Box Resize and Highlighted Font Size Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make text-box resizing change only the box dimensions and add a font-size selector that formats only highlighted text, including mixed-size PDF export.

**Architecture:** Extract text-run normalization, selection formatting, and resize math into pure helpers in `src/lib/text-runs.ts`. Keep `Editor.tsx` responsible for DOM selection/caret synchronization and contextual controls, while `pdf.ts` consumes the same normalized run model for export. Legacy `{ text, size }` annotations normalize to a single run without a database migration.

**Tech Stack:** React 19, TypeScript, Vitest, Tailwind utility classes, pdf-lib, existing TanStack/Vite editor.

## Global Constraints

- Text resizing updates only `w` and `h`; it must never mutate a text run's size.
- Formatting applies only to a non-empty highlighted range; a collapsed selection does not change text or future typing.
- Existing `{ text, size }` annotations remain readable and exportable without migration.
- Checkmark and signature resize behavior remains unchanged.
- Do not add font-family, bold, italic, color, alignment, or automatic PDF word wrapping.

---

### Task 1: Add pure text-run model and formatting helpers

**Files:**
- Create: `src/lib/text-runs.ts`
- Create: `tests/lib/text-runs.test.ts`

**Interfaces:**
- Produces `TextRun`, `TextData`, `FONT_SIZES`, `normalizeTextRuns`, `getTextRunSizeAtOffset`, and `applyFontSizeToRange` for the editor and PDF exporter.

- [ ] **Step 1: Write the failing tests**

Create tests that describe the run behavior without DOM or React dependencies:

```ts
import { describe, expect, it } from "vitest";
import {
  applyFontSizeToRange,
  normalizeTextRuns,
  type TextRun,
} from "../../src/lib/text-runs";

describe("normalizeTextRuns", () => {
  it("converts legacy text data into one run", () => {
    expect(normalizeTextRuns({ text: "Hello", size: 18 })).toEqual([
      { text: "Hello", size: 18 },
    ]);
  });

  it("falls back to a valid 12 point run for malformed data", () => {
    expect(normalizeTextRuns({ runs: [{ text: 3, size: -1 }] })).toEqual([
      { text: "", size: 12 },
    ]);
  });
});

describe("applyFontSizeToRange", () => {
  it("formats only the highlighted part of one run", () => {
    expect(applyFontSizeToRange([{ text: "Hello world", size: 12 }], 6, 11, 24)).toEqual([
      { text: "Hello ", size: 12 },
      { text: "world", size: 24 },
    ]);
  });

  it("formats across runs and merges adjacent equal-size runs", () => {
    const runs: TextRun[] = [
      { text: "One ", size: 12 },
      { text: "two ", size: 18 },
      { text: "three", size: 12 },
    ];
    expect(applyFontSizeToRange(runs, 2, 9, 12)).toEqual([
      { text: "On", size: 12 },
      { text: "e two", size: 12 },
      { text: " ", size: 18 },
      { text: "three", size: 12 },
    ]);
  });

  it("leaves runs unchanged for an empty selection", () => {
    const runs = [{ text: "Hello", size: 12 }];
    expect(applyFontSizeToRange(runs, 3, 3, 24)).toEqual(runs);
  });
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npm test -- tests/lib/text-runs.test.ts`

Expected: FAIL because `src/lib/text-runs.ts` does not exist yet.

- [ ] **Step 3: Implement the minimal run helpers**

In `src/lib/text-runs.ts`:

```ts
export const MIN_FONT_SIZE = 8;
export const MAX_FONT_SIZE = 72;
export const DEFAULT_FONT_SIZE = 12;
export const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 60, 72] as const;

export type TextRun = { text: string; size: number };
export type TextData = { text?: string; size?: number; runs?: unknown };

export function clampFontSize(size: unknown): number { /* clamp finite numeric values to 8..72 */ }
export function normalizeTextRuns(data: TextData): TextRun[] { /* validate runs, or migrate text/size */ }
export function applyFontSizeToRange(runs: TextRun[], start: number, end: number, size: number): TextRun[] { /* split intersecting runs, format, merge */ }
export function textFromRuns(runs: TextRun[]): string { return runs.map((run) => run.text).join(""); }
```

The implementation must clamp offsets to the total text length, normalize reversed ranges with `Math.min/Math.max`, ignore empty ranges, discard invalid run entries, and merge adjacent non-empty runs with equal sizes.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `npm test -- tests/lib/text-runs.test.ts`

Expected: PASS with all text-run tests green.

- [ ] **Step 5: Commit the task when repository permissions allow**

Run: `git add src/lib/text-runs.ts tests/lib/text-runs.test.ts && git commit -m "feat: add text run formatting helpers"`

If `.git/index.lock` remains inaccessible, leave the files unstaged and record the permission error for handoff.

### Task 2: Make annotation resize independent from font size

**Files:**
- Modify: `src/components/Editor.tsx:510-620`
- Create: `tests/lib/annotation-resize.test.ts`

**Interfaces:**
- Consumes the existing `AnnotationRow` geometry and produces updated normalized geometry without changing `data.runs`, `data.text`, or `data.size` for text annotations.

- [ ] **Step 1: Write the failing resize invariant test**

Extract a pure helper signature into the test’s intended API:

```ts
import { describe, expect, it } from "vitest";
import { resizeAnnotation } from "../../src/lib/annotation-resize";

describe("resizeAnnotation", () => {
  it("resizes a text box without changing its font runs", () => {
    const annotation = {
      id: "a",
      doc_id: "d",
      page: 1,
      type: "text" as const,
      x: 0.1,
      y: 0.2,
      w: 0.3,
      h: 0.04,
      data: JSON.stringify({ runs: [{ text: "Hello", size: 18 }] }),
    };
    const resized = resizeAnnotation(annotation, { width: 520, height: 700 }, { clientX: 260, clientY: 180 });
    expect(resized.w).not.toBe(annotation.w);
    expect(resized.h).not.toBe(annotation.h);
    expect(JSON.parse(resized.data)).toEqual(JSON.parse(annotation.data));
  });
});
```

The helper should accept the annotation, parent dimensions, and pointer position, returning the same shape currently produced by the resize branch. Preserve the existing checkmark square and signature aspect-ratio rules.

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npm test -- tests/lib/annotation-resize.test.ts`

Expected: FAIL because the helper is not present.

- [ ] **Step 3: Implement geometry extraction and wire the component**

Create `src/lib/annotation-resize.ts` with the existing minimum dimensions and aspect-ratio calculations. For `type === "text"`, return only updated `w` and `h` and copy `data` unchanged. Remove `startSize` from the text resize drag state in `Editor.tsx`; retain it only for checkmarks. Set the rendered annotation style height for text boxes as well as signatures, using `${local.h * 100}%`, so the box dimensions remain visible during editing.

- [ ] **Step 4: Run focused tests and the existing suite**

Run: `npm test -- tests/lib/annotation-resize.test.ts tests/lib/text-runs.test.ts`

Expected: PASS with no failures.

- [ ] **Step 5: Commit the task when repository permissions allow**

Run: `git add src/lib/annotation-resize.ts src/components/Editor.tsx tests/lib/annotation-resize.test.ts && git commit -m "fix: keep text size fixed while resizing boxes"`

### Task 3: Support mixed-size content editing and contextual font selector

**Files:**
- Modify: `src/components/Editor.tsx:1-40,240-430,500-730`
- Modify: `src/lib/text-runs.ts`
- Modify: `src/styles.css:155-210` only if a selection/editor utility is required
- Create: `tests/lib/selection-offsets.test.ts`

**Interfaces:**
- Consumes `normalizeTextRuns`, `textFromRuns`, and `applyFontSizeToRange`.
- Produces a selected text annotation editor with `data-runs` spans and a `Font size` select control whose change handler receives the selected annotation id and size.

- [ ] **Step 1: Write the failing selection-offset tests**

Add pure DOM-independent helpers for converting a content-editable selection to plain-text offsets:

```ts
import { describe, expect, it } from "vitest";
import { selectionOffsets } from "../../src/lib/selection-offsets";

describe("selectionOffsets", () => {
  it("calculates offsets across multiple formatted spans", () => {
    const root = document.createElement("div");
    root.innerHTML = '<span>One </span><span>two</span>';
    document.body.append(root);
    const range = document.createRange();
    range.setStart(root.firstChild!, 2);
    range.setEnd(root.lastChild!, 2);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    expect(selectionOffsets(root, selection)).toEqual({ start: 2, end: 6 });
    root.remove();
  });

  it("returns null for a collapsed selection", () => {
    const root = document.createElement("div");
    root.textContent = "Hello";
    const range = document.createRange();
    range.setStart(root.firstChild!, 2);
    range.collapse(true);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    expect(selectionOffsets(root, selection)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npm test -- tests/lib/selection-offsets.test.ts`

Expected: FAIL because `src/lib/selection-offsets.ts` does not exist.

- [ ] **Step 3: Implement offset calculation and the editor model**

Create `src/lib/selection-offsets.ts` with `selectionOffsets(root: HTMLElement, selection: Selection): { start: number; end: number } | null`. Return null unless the range is inside the root and non-collapsed. Calculate each endpoint by walking text nodes in document order and summing text lengths before the endpoint.

In `AnnotationBox`, parse the annotation data once per render and normalize to runs. Replace the selected text `<textarea>` with a `contentEditable` `<div>` containing one `<span>` per run. Use `suppressContentEditableWarning`, `role="textbox"`, `aria-multiline="true"`, and `onInput` to read `innerText` plus the current selection, then rebuild runs while preserving existing run sizes for unchanged character ranges. Capture the latest selection on `onSelect`, `onKeyUp`, `onMouseUp`, and `onInput`. Use a layout effect/ref callback to restore a saved selection after React rerenders.

For ordinary text edits, map the new plain text onto the old runs with a simple common-prefix/common-suffix calculation: retain the old run sizes for unchanged prefix/suffix characters and assign the active run size to inserted characters. This keeps typing predictable without adding a full rich-text editor dependency. Persist `{ runs }` and use `textFromRuns(runs)` for display/export compatibility.

Add `selectedTextRange` state in `Editor`, derived from the selected `AnnotationBox` callback. Render the selector in `.editor-actions`:

```tsx
<label className="flex items-center gap-2 pl-2 text-xs text-muted-foreground">
  Font size
  <select
    aria-label="Font size"
    value={selectedSize ?? ""}
    disabled={!selectedTextRange}
    onChange={(event) => applySelectedFontSize(Number(event.target.value))}
    className="h-8 rounded-md border bg-card px-2 text-sm text-foreground"
  >
    <option value="" disabled>{selectedSize === null ? "Mixed" : "—"}</option>
    {FONT_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
  </select>
</label>
```

`applySelectedFontSize` must update only the selected text annotation’s range, persist through `persistAnnotation`, and leave all other annotations untouched. Clear or update the selection metadata after formatting so a second choice still targets the same highlighted characters when the range can be restored.

- [ ] **Step 4: Run focused tests and TypeScript/lint checks**

Run: `npm test -- tests/lib/text-runs.test.ts tests/lib/selection-offsets.test.ts tests/lib/annotation-resize.test.ts`

Expected: PASS.

Run: `npm run lint`

Expected: exit code 0 with no ESLint errors.

- [ ] **Step 5: Commit the task when repository permissions allow**

Run: `git add src/components/Editor.tsx src/lib/text-runs.ts src/lib/selection-offsets.ts src/styles.css tests/lib/selection-offsets.test.ts && git commit -m "feat: format highlighted text with font size selector"`

### Task 4: Export mixed-size text runs to PDF

**Files:**
- Modify: `src/lib/pdf.ts:1-15,90-125`
- Create: `tests/lib/pdf-text-runs.test.ts`

**Interfaces:**
- Consumes `normalizeTextRuns` and `textFromRuns` from `src/lib/text-runs.ts`.
- Keeps `buildFilledPdf`’s public signature unchanged.

- [ ] **Step 1: Write the failing pure layout test**

Add a helper in `src/lib/pdf.ts` with a testable signature:

```ts
export type PdfTextRunPlacement = { text: string; x: number; y: number; size: number };
export function layoutTextRuns(runs: TextRun[], x: number, baselineTop: number, lineGap = 1.25): PdfTextRunPlacement[];
```

Test that a mixed-size line emits one placement per run with increasing x positions, and a newline resets x while advancing y by the largest size in the preceding line:

```ts
it("lays out mixed-size runs without overlapping lines", () => {
  expect(layoutTextRuns([
    { text: "A", size: 12 },
    { text: "big", size: 24 },
    { text: "\nnext", size: 10 },
  ], 10, 100)).toEqual([
    { text: "A", x: 10, y: 100, size: 12 },
    { text: "big", x: 17.2, y: 100, size: 24 },
    { text: "next", x: 10, y: 70, size: 10 },
  ]);
});
```

The exact x advance must be implemented using the embedded font’s width during export; if the pure helper cannot access pdf-lib font metrics, keep its metric callback explicit and test with a deterministic callback.

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npm test -- tests/lib/pdf-text-runs.test.ts`

Expected: FAIL because mixed-run layout is not present.

- [ ] **Step 3: Implement mixed-run PDF export**

Change `TextData` parsing in `buildFilledPdf` to call `normalizeTextRuns`. For each annotation, split runs on `\n`, draw each non-empty segment with its run size, advance x with `font.widthOfTextAtSize(segment, size)`, and advance the next line using the maximum size on the completed line times `1.25`. Preserve the existing top-left annotation coordinate convention and Helvetica font. Keep empty text behavior unchanged.

- [ ] **Step 4: Run focused tests, full tests, and build**

Run: `npm test -- tests/lib/pdf-text-runs.test.ts tests/lib/text-runs.test.ts tests/lib/annotation-resize.test.ts tests/lib/selection-offsets.test.ts`

Expected: PASS.

Run: `npm test`

Expected: all tests pass, including `tests/lib/runtime.test.ts`.

Run: `npm run build`

Expected: production build exits 0.

- [ ] **Step 5: Commit the task when repository permissions allow**

Run: `git add src/lib/pdf.ts tests/lib/pdf-text-runs.test.ts && git commit -m "feat: export mixed-size text annotations"`

### Task 5: Final verification and manual interaction check

**Files:**
- Modify: none unless verification finds a concrete defect.

- [ ] **Step 1: Inspect the final diff and status**

Run: `git diff --check; git status --short; git diff --stat`

Expected: no whitespace errors; only the intended text-run/editor/export files plus the user’s pre-existing changes are present.

- [ ] **Step 2: Run the complete verification commands**

Run:

```powershell
npm test
npm run lint
npm run build
```

Expected: each command exits 0.

- [ ] **Step 3: Manually verify the user-visible behavior**

In the running editor, add a text box, type two words, highlight only the second word, choose a different font size, and confirm only that word changes. Resize the box with the bottom-right handle and confirm both font sizes remain unchanged while the box dimensions change. Reload the document and confirm the mixed sizes remain. Export the PDF and confirm the two text sizes remain visually distinct.

- [ ] **Step 4: Report repository permission limits accurately**

If git writes remain blocked, report that implementation files were verified but commits could not be created because `.git/index.lock` is inaccessible in this workspace. Do not claim commits exist.
