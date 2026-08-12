export const MIN_FONT_SIZE = 8;
export const MAX_FONT_SIZE = 72;
export const DEFAULT_FONT_SIZE = 12;

export const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 60, 72] as const;

export type TextRun = { text: string; size: number };

export type TextData = {
  text?: string;
  size?: number;
  runs?: unknown;
  [key: string]: unknown;
};

export function clampFontSize(size: unknown): number {
  const numeric = typeof size === "number" ? size : Number(size);
  if (!Number.isFinite(numeric)) return DEFAULT_FONT_SIZE;
  return Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, numeric));
}

function mergeRuns(runs: TextRun[]): TextRun[] {
  const merged: TextRun[] = [];
  for (const run of runs) {
    if (!run.text) continue;
    const previous = merged[merged.length - 1];
    if (previous && previous.size === run.size) previous.text += run.text;
    else merged.push({ ...run });
  }
  return merged.length ? merged : [{ text: "", size: DEFAULT_FONT_SIZE }];
}

export function normalizeTextRuns(data: TextData): TextRun[] {
  if (Array.isArray(data.runs)) {
    const valid = data.runs.flatMap((run) => {
      if (!run || typeof run !== "object") return [];
      const candidate = run as { text?: unknown; size?: unknown };
      if (typeof candidate.text !== "string") return [];
      return [{ text: candidate.text, size: clampFontSize(candidate.size) }];
    });
    if (valid.length) return mergeRuns(valid);
  }

  return [
    {
      text: typeof data.text === "string" ? data.text : "",
      size: clampFontSize(data.size),
    },
  ];
}

export function textFromRuns(runs: TextRun[]): string {
  return runs.map((run) => run.text).join("");
}

export function getTextRunSizeAtOffset(runs: TextRun[], offset: number): number {
  let cursor = 0;
  for (const run of runs) {
    const end = cursor + run.text.length;
    if (offset < end || (offset === end && run.text.length > 0)) return run.size;
    cursor = end;
  }
  return runs[runs.length - 1]?.size ?? DEFAULT_FONT_SIZE;
}

export function getFontSizesInRange(runs: TextRun[], start: number, end: number): number[] {
  const rangeStart = Math.max(0, Math.min(start, end));
  const rangeEnd = Math.max(0, Math.max(start, end));
  if (rangeStart === rangeEnd) return [];

  const sizes = new Set<number>();
  let cursor = 0;
  for (const run of runs) {
    const runEnd = cursor + run.text.length;
    if (runEnd > rangeStart && cursor < rangeEnd) sizes.add(run.size);
    cursor = runEnd;
  }
  return [...sizes];
}

export function applyFontSizeToRange(
  runs: TextRun[],
  start: number,
  end: number,
  size: number,
): TextRun[] {
  const text = textFromRuns(runs);
  const rangeStart = Math.max(0, Math.min(text.length, Math.min(start, end)));
  const rangeEnd = Math.max(0, Math.min(text.length, Math.max(start, end)));
  if (rangeStart === rangeEnd) return runs.map((run) => ({ ...run }));

  const next: TextRun[] = [];
  let cursor = 0;
  for (const run of runs) {
    const runStart = cursor;
    const runEnd = cursor + run.text.length;
    const beforeEnd = Math.max(0, Math.min(run.text.length, rangeStart - runStart));
    const selectedStart = Math.max(0, Math.min(run.text.length, rangeStart - runStart));
    const selectedEnd = Math.max(0, Math.min(run.text.length, rangeEnd - runStart));
    const afterStart = Math.max(0, Math.min(run.text.length, rangeEnd - runStart));

    if (beforeEnd > 0) next.push({ text: run.text.slice(0, beforeEnd), size: run.size });
    if (selectedEnd > selectedStart) {
      next.push({ text: run.text.slice(selectedStart, selectedEnd), size: clampFontSize(size) });
    }
    if (afterStart < run.text.length)
      next.push({ text: run.text.slice(afterStart), size: run.size });
    cursor = runEnd;
  }

  return mergeRuns(next);
}

export function replaceTextPreservingRuns(
  runs: TextRun[],
  nextText: string,
  preferredSize = DEFAULT_FONT_SIZE,
): TextRun[] {
  const previousText = textFromRuns(runs);
  if (previousText === nextText) return runs.map((run) => ({ ...run }));

  let prefix = 0;
  while (
    prefix < previousText.length &&
    prefix < nextText.length &&
    previousText[prefix] === nextText[prefix]
  ) {
    prefix += 1;
  }

  let suffix = 0;
  while (
    suffix < previousText.length - prefix &&
    suffix < nextText.length - prefix &&
    previousText[previousText.length - suffix - 1] === nextText[nextText.length - suffix - 1]
  ) {
    suffix += 1;
  }

  const changedEnd = previousText.length - suffix;
  const replacementEnd = nextText.length - suffix;
  const before = sliceRuns(runs, 0, prefix);
  const after = sliceRuns(runs, changedEnd, previousText.length);
  const replacement = nextText.slice(prefix, replacementEnd);
  const size = getTextRunSizeAtOffset(runs, Math.min(prefix, previousText.length)) || preferredSize;

  return mergeRuns([
    ...before,
    ...(replacement ? [{ text: replacement, size: clampFontSize(size) }] : []),
    ...after,
  ]);
}

function sliceRuns(runs: TextRun[], start: number, end: number): TextRun[] {
  const result: TextRun[] = [];
  let cursor = 0;
  for (const run of runs) {
    const localStart = Math.max(0, start - cursor);
    const localEnd = Math.min(run.text.length, end - cursor);
    if (localEnd > localStart)
      result.push({ text: run.text.slice(localStart, localEnd), size: run.size });
    cursor += run.text.length;
  }
  return result;
}
