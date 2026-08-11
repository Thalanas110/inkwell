import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import type { PDFDocumentProxy } from "pdfjs-dist";
import {
  ArrowLeft,
  Check,
  Download,
  Loader2,
  MousePointer2,
  PenLine,
  Plus,
  Trash2,
  Type,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { PdfPage } from "@/components/PdfPage";
import { SignaturePad } from "@/components/SignaturePad";
import {
  addSignature,
  deleteAnnotation,
  deleteSignature,
  getDocument,
  listAnnotations,
  listFieldValues,
  listSignatures,
  renameDocument,
  setFieldValue,
  touchDocument,
  uid,
  upsertAnnotation,
  type AnnotationRow,
  type DocumentRow,
  type FieldValueRow,
  type SignatureRow,
} from "@/lib/db";
import { exportBytes, readFileBytes } from "@/lib/desktop";
import { buildFilledPdf, loadPdfDocument, readFormFields, type PdfField } from "@/lib/pdf";

type Tool = "select" | "text" | "check" | "signature";

const PAGE_WIDTHS = [520, 640, 760, 900, 1040];

export function Editor({ docId }: { docId: string }) {
  const [doc, setDoc] = useState<DocumentRow | null>(null);
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [fields, setFields] = useState<PdfField[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [annotations, setAnnotations] = useState<AnnotationRow[]>([]);
  const [signatures, setSignatures] = useState<SignatureRow[]>([]);
  const [activeSignature, setActiveSignature] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>("select");
  const [selected, setSelected] = useState<string | null>(null);
  const [zoom, setZoom] = useState(2);
  const [flatten, setFlatten] = useState(true);
  const [padOpen, setPadOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pageSizes = useRef<Record<number, { width: number; height: number }>>({});

  const pageWidth = PAGE_WIDTHS[zoom] ?? 760;

  const refreshSignatures = useCallback(async () => {
    const rows = await listSignatures();
    setSignatures(rows);
    setActiveSignature((cur) => cur ?? rows[0]?.id ?? null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const d = await getDocument(docId);
        if (!d) {
          setError("This document is no longer in your library.");
          return;
        }
        const raw = await readFileBytes(d.file_key);
        if (!raw) {
          setError("The stored PDF file could not be found.");
          return;
        }
        const [document, formFields, anns, vals] = await Promise.all([
          loadPdfDocument(raw),
          readFormFields(raw),
          listAnnotations(docId),
          listFieldValues(docId),
        ]);
        if (cancelled) return;
        setDoc(d);
        setBytes(raw);
        setPdf(document);
        setFields(formFields);
        setAnnotations(anns);
        const map: Record<string, string> = {};
        formFields.forEach((f) => (map[f.name] = f.value));
        vals.forEach((v: FieldValueRow) => (map[v.name] = v.value));
        setValues(map);
        await refreshSignatures();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not open this PDF.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [docId, refreshSignatures]);

  const persistAnnotation = useCallback(
    async (a: AnnotationRow) => {
      setAnnotations((prev) => {
        const next = prev.some((p) => p.id === a.id)
          ? prev.map((p) => (p.id === a.id ? a : p))
          : [...prev, a];
        return next;
      });
      await upsertAnnotation(a);
      await touchDocument(a.doc_id);
    },
    [],
  );

  const handlePageClick = async (page: number, rel: { x: number; y: number }) => {
    if (tool === "select") {
      setSelected(null);
      return;
    }
    const size = pageSizes.current[page];
    const base: AnnotationRow = {
      id: uid(),
      doc_id: docId,
      page,
      type: "text",
      x: rel.x,
      y: rel.y,
      w: 0.3,
      h: 0.04,
      data: JSON.stringify({ text: "", size: 12 }),
    };

    if (tool === "text") {
      await persistAnnotation(base);
      setSelected(base.id);
    } else if (tool === "check") {
      await persistAnnotation({
        ...base,
        type: "check",
        w: 0.03,
        h: 0.02,
        data: JSON.stringify({ size: 14 }),
      });
    } else if (tool === "signature") {
      const sig = signatures.find((s) => s.id === activeSignature);
      if (!sig) {
        toast.error("Add a signature first");
        setPadOpen(true);
        return;
      }
      const img = new Image();
      img.src = sig.data_url;
      await new Promise((r) => {
        img.onload = r;
        img.onerror = r;
      });
      const wNorm = 0.28;
      const ratio = img.height && img.width ? img.height / img.width : 0.34;
      const hNorm = size ? (wNorm * size.width * ratio) / size.height : wNorm * ratio;
      await persistAnnotation({
        ...base,
        type: "signature",
        w: wNorm,
        h: hNorm,
        data: JSON.stringify({ dataUrl: sig.data_url }),
      });
    }
    setTool("select");
  };

  const removeAnnotation = async (id: string) => {
    setAnnotations((prev) => prev.filter((a) => a.id !== id));
    setSelected(null);
    await deleteAnnotation(id);
  };

  const onFieldChange = async (field: PdfField, value: string) => {
    setValues((v) => ({ ...v, [field.name]: value }));
    await setFieldValue(docId, field.name, field.type, value);
    await touchDocument(docId);
  };

  const exportPdf = async () => {
    if (!bytes || !doc) return;
    setBusy(true);
    try {
      const rows: FieldValueRow[] = fields.map((f) => ({
        doc_id: docId,
        name: f.name,
        type: f.type,
        value: values[f.name] ?? "",
      }));
      const out = await buildFilledPdf(bytes, rows, annotations, flatten);
      const name = doc.name.replace(/\.pdf$/i, "") + "-signed.pdf";
      await exportBytes(name, out);
      toast.success("Saved signed PDF");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setBusy(false);
    }
  };

  const pages = useMemo(
    () => (pdf ? Array.from({ length: pdf.numPages }, (_, i) => i + 1) : []),
    [pdf],
  );

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="font-display text-3xl">Can't open this document</h1>
        <p className="text-sm text-muted-foreground">{error}</p>
        <Button asChild variant="outline">
          <Link to="/">Back to library</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-card px-4">
        <Button asChild variant="ghost" size="icon" aria-label="Back to library">
          <Link to="/">
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
        <input
          value={doc?.name ?? ""}
          onChange={(e) => setDoc((d) => (d ? { ...d, name: e.target.value } : d))}
          onBlur={(e) => doc && renameDocument(doc.id, e.target.value.trim() || "Untitled.pdf")}
          className="w-72 truncate rounded-md bg-transparent px-2 py-1 text-sm font-medium outline-none focus:bg-secondary"
        />
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Zoom out"
            onClick={() => setZoom((z) => Math.max(0, z - 1))}
          >
            <ZoomOut className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Zoom in"
            onClick={() => setZoom((z) => Math.min(PAGE_WIDTHS.length - 1, z + 1))}
          >
            <ZoomIn className="size-4" />
          </Button>
          <label className="flex cursor-pointer items-center gap-2 pl-2 text-xs text-muted-foreground">
            <Checkbox
              checked={flatten}
              onCheckedChange={(v) => setFlatten(Boolean(v))}
              aria-label="Flatten on export"
            />
            Flatten
          </label>
          <Button onClick={exportPdf} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
            Export signed PDF
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Tools */}
        <aside className="flex w-64 shrink-0 flex-col border-r bg-sidebar">
          <div className="space-y-1 p-3">
            <p className="px-1 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Tools
            </p>
            {(
              [
                { id: "select", label: "Select & move", icon: MousePointer2 },
                { id: "text", label: "Add text", icon: Type },
                { id: "check", label: "Add checkmark", icon: Check },
                { id: "signature", label: "Place signature", icon: PenLine },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                onClick={() => setTool(t.id)}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm transition-colors ${
                  tool === t.id
                    ? "bg-accent text-accent-foreground"
                    : "text-foreground hover:bg-secondary"
                }`}
              >
                <t.icon className="size-4" />
                {t.label}
              </button>
            ))}
          </div>

          <Separator />

          <div className="flex items-center justify-between px-4 pt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Signatures
            </p>
            <Button variant="ghost" size="icon" aria-label="New signature" onClick={() => setPadOpen(true)}>
              <Plus className="size-4" />
            </Button>
          </div>
          <ScrollArea className="flex-1 px-3 pb-3">
            <div className="space-y-2 pt-2">
              {signatures.length === 0 ? (
                <p className="px-1 text-xs text-muted-foreground">
                  No signatures yet. Draw one to start signing.
                </p>
              ) : null}
              {signatures.map((s) => (
                <div
                  key={s.id}
                  className={`group flex items-center gap-2 rounded-md border p-2 ${
                    activeSignature === s.id ? "border-primary bg-accent/50" : "bg-card"
                  }`}
                >
                  <button
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    onClick={() => {
                      setActiveSignature(s.id);
                      setTool("signature");
                    }}
                  >
                    <img src={s.data_url} alt={s.name} className="h-8 w-20 object-contain" />
                    <span className="truncate text-xs">{s.name}</span>
                  </button>
                  <button
                    aria-label={`Delete ${s.name}`}
                    className="opacity-0 transition-opacity group-hover:opacity-100"
                    onClick={async () => {
                      await deleteSignature(s.id);
                      await refreshSignatures();
                    }}
                  >
                    <Trash2 className="size-3.5 text-muted-foreground" />
                  </button>
                </div>
              ))}
            </div>
          </ScrollArea>
        </aside>

        {/* Pages */}
        <main className="grain min-h-0 flex-1 overflow-auto bg-background p-8">
          {!pdf ? (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <Loader2 className="mr-2 size-4 animate-spin" /> Loading document…
            </div>
          ) : (
            <div className="flex flex-col items-center gap-8">
              {pages.map((n) => (
                <PdfPage
                  key={n}
                  pdf={pdf}
                  pageNumber={n}
                  width={pageWidth}
                  onSize={(s) => (pageSizes.current[n] = s)}
                  onPageClick={(rel) => handlePageClick(n, rel)}
                >
                  {annotations
                    .filter((a) => a.page === n)
                    .map((a) => (
                      <AnnotationBox
                        key={a.id}
                        annotation={a}
                        selected={selected === a.id}
                        interactive={tool === "select"}
                        onSelect={() => setSelected(a.id)}
                        onChange={persistAnnotation}
                        onDelete={() => removeAnnotation(a.id)}
                      />
                    ))}
                </PdfPage>
              ))}
            </div>
          )}
        </main>

        {/* Form fields */}
        <aside className="flex w-80 shrink-0 flex-col border-l bg-sidebar">
          <p className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Form fields {fields.length ? `(${fields.length})` : ""}
          </p>
          <Separator />
          <ScrollArea className="flex-1">
            <div className="space-y-4 p-4">
              {fields.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  This PDF has no interactive form fields. Use the text and checkmark tools to fill
                  it by hand.
                </p>
              ) : null}
              {fields.map((f) => (
                <div key={f.name} className="space-y-1.5">
                  <Label className="text-xs" htmlFor={`f-${f.name}`}>
                    {f.name}
                  </Label>
                  {f.type === "checkbox" ? (
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox
                        id={`f-${f.name}`}
                        checked={Boolean(values[f.name])}
                        onCheckedChange={(v) => onFieldChange(f, v ? "1" : "")}
                      />
                      Checked
                    </label>
                  ) : f.options?.length ? (
                    <select
                      id={`f-${f.name}`}
                      value={values[f.name] ?? ""}
                      onChange={(e) => onFieldChange(f, e.target.value)}
                      className="h-9 w-full rounded-md border bg-card px-2 text-sm"
                    >
                      <option value="">—</option>
                      {f.options.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <Input
                      id={`f-${f.name}`}
                      value={values[f.name] ?? ""}
                      onChange={(e) => onFieldChange(f, e.target.value)}
                    />
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        </aside>
      </div>

      <SignaturePad
        open={padOpen}
        onOpenChange={setPadOpen}
        onSave={async (name, dataUrl) => {
          await addSignature(name, dataUrl);
          await refreshSignatures();
          toast.success("Signature saved");
        }}
      />
    </div>
  );
}

function AnnotationBox({
  annotation,
  selected,
  interactive,
  onSelect,
  onChange,
  onDelete,
}: {
  annotation: AnnotationRow;
  selected: boolean;
  interactive: boolean;
  onSelect: () => void;
  onChange: (a: AnnotationRow) => void;
  onDelete: () => void;
}) {
  const [local, setLocal] = useState(annotation);
  const latest = useRef(annotation);
  const drag = useRef<
    | {
        mode: "move";
        dx: number;
        dy: number;
      }
    | {
        mode: "resize";
        startW: number;
        startH: number;
        aspect: number;
        minW: number;
        minH: number;
      }
    | null
  >(null);

  useEffect(() => setLocal(annotation), [annotation]);
  useEffect(() => {
    latest.current = local;
  }, [local]);

  const data = JSON.parse(local.data || "{}") as { text?: string; size?: number; dataUrl?: string };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive) return;
    onSelect();
    const parent = e.currentTarget.parentElement!.getBoundingClientRect();
    drag.current = {
      mode: "move",
      dx: e.clientX - (parent.left + local.x * parent.width),
      dy: e.clientY - (parent.top + local.y * parent.height),
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onResizePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!interactive || local.type !== "signature") return;
    e.stopPropagation();
    onSelect();
    const parent = e.currentTarget.parentElement!.parentElement!.getBoundingClientRect();
    const startW = local.w * parent.width;
    const startH = local.h * parent.height;
    drag.current = {
      mode: "resize",
      startW,
      startH,
      aspect: startH / Math.max(1, startW),
      minW: 56,
      minH: 24,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const parent = e.currentTarget.parentElement!.getBoundingClientRect();
    if (drag.current.mode === "move") {
      setLocal((l) => ({
        ...l,
        x: Math.min(0.99, Math.max(0, (e.clientX - drag.current.dx - parent.left) / parent.width)),
        y: Math.min(0.99, Math.max(0, (e.clientY - drag.current.dy - parent.top) / parent.height)),
      }));
      return;
    }

    const boxLeft = parent.left + local.x * parent.width;
    const nextW = Math.max(
      drag.current.minW,
      Math.min(parent.width - local.x * parent.width, e.clientX - boxLeft),
    );
    const nextH = Math.max(drag.current.minH, nextW * drag.current.aspect);

    setLocal((l) => ({
      ...l,
      w: nextW / parent.width,
      h: nextH / parent.height,
    }));
  };

  const onPointerUp = () => {
    if (!drag.current) return;
    drag.current = null;
    onChange(latest.current);
  };

  const style: React.CSSProperties = {
    left: `${local.x * 100}%`,
    top: `${local.y * 100}%`,
    width: local.type === "check" ? undefined : `${local.w * 100}%`,
    height: local.type === "signature" ? `${local.h * 100}%` : undefined,
  };

  return (
    <div
      role="button"
      tabIndex={0}
      style={style}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onKeyDown={(e) => {
        if (e.key === "Delete" || e.key === "Backspace") {
          if (local.type !== "text") onDelete();
        }
      }}
      className={`absolute select-none ${interactive ? "cursor-move" : "cursor-default"} ${
        selected ? "outline outline-2 outline-primary" : "hover:outline hover:outline-1 hover:outline-primary/50"
      }`}
    >
      {local.type === "text" ? (
        selected ? (
          <textarea
            autoFocus
            value={data.text ?? ""}
            onChange={(e) => {
              const next = { ...local, data: JSON.stringify({ ...data, text: e.target.value }) };
              setLocal(next);
            }}
            onBlur={() => onChange(local)}
            onPointerDown={(e) => e.stopPropagation()}
            rows={Math.max(1, (data.text ?? "").split("\n").length)}
            className="w-full resize-none bg-transparent p-0 leading-tight text-ink outline-none"
            style={{ fontSize: (data.size ?? 12) * 1.0 }}
          />
        ) : (
          <span
            className="block whitespace-pre-wrap leading-tight text-ink"
            style={{ fontSize: (data.size ?? 12) * 1.0 }}
          >
            {data.text || "Text"}
          </span>
        )
      ) : local.type === "check" ? (
        <Check className="text-ink" style={{ width: data.size ?? 14, height: data.size ?? 14 }} />
      ) : (
        <img
          src={data.dataUrl}
          alt="Signature"
          draggable={false}
          style={{ width: "100%", height: "100%" }}
          className="pointer-events-none block object-contain"
        />
      )}

      {selected && interactive ? (
        <button
          onClick={onDelete}
          onPointerDown={(e) => e.stopPropagation()}
          aria-label="Delete item"
          className="absolute -right-2 -top-2 rounded-full bg-destructive p-1 text-destructive-foreground"
        >
          <Trash2 className="size-3" />
        </button>
      ) : null}

      {selected && interactive && local.type === "signature" ? (
        <button
          aria-label="Resize signature"
          onPointerDown={onResizePointerDown}
          className="absolute -bottom-2 -right-2 h-4 w-4 cursor-se-resize rounded-full border border-background bg-primary shadow"
        />
      ) : null}
    </div>
  );
}
