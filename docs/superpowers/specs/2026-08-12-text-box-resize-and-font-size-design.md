# Text Box Resize and Highlighted Font Size

## Goal

Make text-box resizing change only the annotation box dimensions. Add a font-size selector that changes only the highlighted text inside the selected text box, while preserving mixed font sizes when the annotation is saved and exported.

## Current behavior and root cause

`AnnotationBox` stores text annotations as `{ text, size }`. Its resize handler calculates a proportional `nextSize` for text annotations and writes that value back to `data.size`. The renderer uses `data.size` as the font size, so dragging the resize handle scales the text instead of only resizing the box. The text editor is a plain `<textarea>`, which cannot display independently sized highlighted ranges.

## Approved approach

Use a small controlled rich-text representation composed of text runs:

```ts
type TextRun = { text: string; size: number };
type TextData = { text?: string; size?: number; runs?: TextRun[] };
```

The `runs` representation is authoritative for new or edited annotations. Existing annotations with `text` and `size` are normalized in memory to one run, preserving backward compatibility with stored documents. The optional legacy fields may remain when writing untouched data, but edited text annotations persist their normalized runs.

## Interaction design

### Resizing

- Text resizing updates only `w` and `h`.
- The text box gets an explicit height based on `h`, so dragging the handle changes the visible editing area.
- The text run sizes do not change during a resize.
- Existing checkmark and signature resize behavior remains unchanged.

### Editing and selection

- A selected text annotation uses a `contentEditable` editing surface rendered from its runs.
- Each run is rendered as a span with its own pixel font size.
- Text input, deletion, line breaks, and ordinary editing update the run model while preserving the plain-text content.
- The latest non-collapsed browser selection is captured as offsets into the annotation's plain text. Offsets are stored relative to the editor root rather than to individual DOM nodes, so selections spanning multiple runs are supported.
- Selection offsets are restored after a run update when possible; a collapsed selection remains a normal caret and does not trigger formatting.

### Font-size selector

- Add a contextual `Font size` selector to the existing editor actions.
- It is enabled only when a text annotation is selected and a non-empty text range has been highlighted.
- Selecting a size applies it to exactly that character range, splitting existing runs at the selection boundaries and merging adjacent runs with the same size.
- With no highlighted text, changing the selector has no effect. It does not change the whole box or future typing.
- The selector offers common PDF-friendly sizes: 8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 60, and 72 points. A mixed selection can display a neutral placeholder rather than pretending it has one size.

## Data flow and export

1. The editor renders `runs` and captures the highlighted range as plain-text offsets.
2. The font-size action transforms the runs and updates the local annotation state.
3. The existing annotation persistence path stores the updated JSON and touches the document timestamp.
4. PDF export normalizes legacy and current text data into runs.
5. Export draws each run with its own embedded Helvetica size, advances the x position using the PDF font metrics, and starts a new line at explicit line breaks. The line's vertical advance is based on the largest run on that line so mixed sizes do not overlap.

## Error handling and compatibility

- Malformed or empty run data falls back to the legacy text/size fields, then to an empty 12-point run.
- Run sizes are clamped to the selector's supported minimum and maximum when formatting; legacy values are clamped before rendering/exporting.
- Existing checkmark and signature data formats are not changed.
- Existing saved text annotations remain readable and exportable without a migration step.

## Testing

Add focused unit tests for pure text-run behavior:

- normalizing legacy `{ text, size }` data;
- applying a size to a highlighted range within one run;
- applying a size across multiple runs and merging adjacent equal-size runs;
- leaving runs unchanged for a collapsed or empty selection;
- ensuring resize calculations change dimensions without changing text-run sizes.

Retain the existing runtime tests and run the full test suite, lint, and production build. Manually verify that a text box can contain two differently sized highlighted portions, that resizing it leaves both sizes unchanged, and that the exported PDF retains the mixed sizes.

## Scope boundaries

This change does not add font-family, bold, italic, color, alignment, automatic word wrapping in PDF export, or a broader document styling system. It does not change form-field formatting or non-text annotation behavior.
