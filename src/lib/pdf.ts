import type { AnnotationRow, FieldValueRow } from "./db";

/** Everything here is browser-only: pdfjs/pdf-lib are imported lazily inside the functions. */

export type PdfField = {
  name: string;
  type: "text" | "checkbox" | "dropdown" | "radio" | "other";
  value: string;
  options?: string[];
};

export type TextData = { text: string; size: number };
export type CheckData = { size: number };
export type SignatureData = { dataUrl: string; signedAt?: string };

export async function getPdfjs() {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/vendor/pdf.worker.min.mjs";
  return pdfjs;
}

export async function loadPdfDocument(bytes: Uint8Array) {
  const pdfjs = await getPdfjs();
  return pdfjs.getDocument({ data: bytes.slice() }).promise;
}

export async function readFormFields(bytes: Uint8Array): Promise<PdfField[]> {
  const { PDFDocument } = await import("pdf-lib");
  const pdf = await PDFDocument.load(bytes.slice(), { ignoreEncryption: true });
  const form = pdf.getForm();
  return form.getFields().map((f) => {
    const name = f.getName();
    const kind = f.constructor.name;
    if (kind === "PDFTextField") {
      const tf = form.getTextField(name);
      return { name, type: "text" as const, value: tf.getText() ?? "" };
    }
    if (kind === "PDFCheckBox") {
      return { name, type: "checkbox" as const, value: form.getCheckBox(name).isChecked() ? "1" : "" };
    }
    if (kind === "PDFDropdown") {
      const dd = form.getDropdown(name);
      return {
        name,
        type: "dropdown" as const,
        value: dd.getSelected()[0] ?? "",
        options: dd.getOptions(),
      };
    }
    if (kind === "PDFRadioGroup") {
      const rg = form.getRadioGroup(name);
      return {
        name,
        type: "radio" as const,
        value: rg.getSelected() ?? "",
        options: rg.getOptions(),
      };
    }
    return { name, type: "other" as const, value: "" };
  });
}

async function dataUrlToBytes(dataUrl: string) {
  const res = await fetch(dataUrl);
  return new Uint8Array(await res.arrayBuffer());
}

export async function buildFilledPdf(
  original: Uint8Array,
  fields: FieldValueRow[],
  annotations: AnnotationRow[],
  flatten: boolean,
): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const pdf = await PDFDocument.load(original.slice(), { ignoreEncryption: true });
  const form = pdf.getForm();
  const font = await pdf.embedFont(StandardFonts.Helvetica);

  for (const f of fields) {
    try {
      if (f.type === "text") form.getTextField(f.name).setText(f.value);
      else if (f.type === "checkbox") {
        const cb = form.getCheckBox(f.name);
        if (f.value) cb.check();
        else cb.uncheck();
      } else if (f.type === "dropdown" && f.value) form.getDropdown(f.name).select(f.value);
      else if (f.type === "radio" && f.value) form.getRadioGroup(f.name).select(f.value);
    } catch {
      /* field missing or read-only — skip */
    }
  }

  const pages = pdf.getPages();
  const ink = rgb(0.11, 0.1, 0.09);

  for (const a of annotations) {
    const page = pages[a.page - 1];
    if (!page) continue;
    const { width: W, height: H } = page.getSize();
    const x = a.x * W;
    const yTop = a.y * H;

    if (a.type === "text") {
      const d = JSON.parse(a.data) as TextData;
      if (!d.text) continue;
      const size = d.size || 12;
      d.text.split("\n").forEach((line, i) => {
        page.drawText(line, {
          x,
          y: H - yTop - size - i * size * 1.25,
          size,
          font,
          color: ink,
        });
      });
    } else if (a.type === "check") {
      const d = JSON.parse(a.data) as CheckData;
      const s = d.size || 14;
      const y = H - yTop - s;
      const t = Math.max(1, s / 8);
      page.drawLine({
        start: { x: x + s * 0.15, y: y + s * 0.5 },
        end: { x: x + s * 0.4, y: y + s * 0.2 },
        thickness: t,
        color: ink,
      });
      page.drawLine({
        start: { x: x + s * 0.4, y: y + s * 0.2 },
        end: { x: x + s * 0.88, y: y + s * 0.82 },
        thickness: t,
        color: ink,
      });
    } else if (a.type === "signature") {
      const d = JSON.parse(a.data) as SignatureData;
      if (!d.dataUrl) continue;
      const bytes = await dataUrlToBytes(d.dataUrl);
      const img = d.dataUrl.includes("image/jpeg")
        ? await pdf.embedJpg(bytes)
        : await pdf.embedPng(bytes);
      const w = a.w * W;
      const h = a.h * H;
      page.drawImage(img, { x, y: H - yTop - h, width: w, height: h });
      if (d.signedAt) {
        const signedAt = new Date(d.signedAt);
        if (!Number.isNaN(signedAt.getTime())) {
          page.drawText(
            `Digitally signed on ${signedAt.toISOString().replace("T", " ").replace(".000Z", " UTC")}`,
            {
            x,
            y: Math.max(4, H - yTop - h - 9),
            size: 6,
            font,
            color: ink,
            },
          );
        }
      }
    }
  }

  if (flatten) {
    try {
      form.flatten();
    } catch {
      /* nothing to flatten */
    }
  }

  return pdf.save();
}
