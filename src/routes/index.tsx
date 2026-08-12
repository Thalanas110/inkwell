import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, FileSignature, FileText, Loader2, Plus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { createDocument, deleteDocument, listDocuments, uid, type DocumentRow } from "@/lib/db";
import { deleteFileBytes, runtimeLabel, saveFileBytes } from "@/lib/desktop";
import { loadPdfDocument } from "@/lib/pdf";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Inkwell — Offline PDF Fill & Sign" },
      {
        name: "description",
        content:
          "Fill PDF forms, add text and checkmarks, and sign documents entirely offline. Your files and signatures stay on your device.",
      },
      { property: "og:title", content: "Inkwell — Offline PDF Fill & Sign" },
      {
        property: "og:description",
        content:
          "A local-first desktop app for filling and signing PDFs. No accounts, no uploads, no internet required.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Library,
});

function Library() {
  const [docs, setDocs] = useState<DocumentRow[] | null>(null);
  const [query, setQuery] = useState("");
  const [importing, setImporting] = useState(false);
  const [deleting, setDeleting] = useState<DocumentRow | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const refresh = useCallback(async () => setDocs(await listDocuments()), []);

  useEffect(() => {
    refresh().catch(() => setDocs([]));
  }, [refresh]);

  const importFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setImporting(true);
    try {
      for (const file of Array.from(files)) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const id = uid();
        const fileKey = `${id}.pdf`;
        let pageCount = 1;
        try {
          const pdf = await loadPdfDocument(bytes);
          pageCount = pdf.numPages;
        } catch {
          toast.error(`${file.name} is not a readable PDF`);
          continue;
        }
        await saveFileBytes(fileKey, bytes);
        await createDocument({ id, name: file.name, file_key: fileKey, page_count: pageCount });
      }
      await refresh();
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const remove = async (doc: DocumentRow) => {
    await deleteDocument(doc.id);
    await deleteFileBytes(doc.file_key);
    await refresh();
    toast.success("Document removed");
  };

  const confirmRemove = async () => {
    if (!deleting) return;
    const doc = deleting;
    setDeleting(null);
    await remove(doc);
  };

  const filtered = (docs ?? []).filter((d) =>
    d.name.toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <div className="grain min-h-screen">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-6 py-5">
          <FileSignature className="size-6 text-primary" />
          <div className="mr-auto">
            <h1 className="font-display text-2xl leading-none">Inkwell</h1>
            <p className="mt-1 text-xs text-muted-foreground">
              {runtimeLabel()} — files stay on this device
            </p>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf"
            multiple
            className="hidden"
            onChange={(e) => importFiles(e.target.files)}
          />
          <Button onClick={() => fileRef.current?.click()} disabled={importing}>
            {importing ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            Add PDF
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        <section
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            importFiles(e.dataTransfer.files);
          }}
          className="paper-sheet mb-10 flex flex-col items-center justify-center rounded-lg border-dashed px-6 py-12 text-center"
        >
          <Upload className="size-6 text-muted-foreground" />
          <h2 className="mt-3 font-display text-xl">Drop a PDF to fill and sign</h2>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            Imported files are copied into the app's own storage, so your library keeps working even
            if the original moves.
          </p>
        </section>

        <div className="mb-4 flex items-center gap-3">
          <h2 className="font-display text-xl">Library</h2>
          <span className="text-xs text-muted-foreground">{filtered.length} documents</span>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search documents"
            className="ml-auto max-w-xs"
          />
        </div>

        {docs === null ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Opening your library…</p>
        ) : filtered.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Nothing here yet. Add your first PDF above.
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {filtered.map((d) => (
              <li
                key={d.id}
                className="paper-sheet group relative rounded-lg transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-lift"
              >
                <Link
                  to="/editor/$id"
                  params={{ id: d.id }}
                  aria-label={`Open ${d.name}`}
                  className="flex min-h-20 items-center gap-3 rounded-lg p-4 pr-20 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                >
                  <FileText className="size-5 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{d.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {d.page_count} page{d.page_count === 1 ? "" : "s"} · edited{" "}
                      {new Date(d.updated_at).toLocaleDateString()}
                    </span>
                  </span>
                  <span className="hidden shrink-0 items-center gap-1 text-xs font-medium text-primary sm:flex">
                    Open
                    <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </Link>
                <button
                  aria-label={`Delete ${d.name}`}
                  className="absolute right-3 top-1/2 z-10 -translate-y-1/2 rounded-md p-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => setDeleting(d)}
                >
                  <Trash2 className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>

      <Dialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete document?</DialogTitle>
            <DialogDescription>
              Remove <span className="font-medium text-foreground">{deleting?.name}</span> from your
              library? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void confirmRemove()}>
              Delete document
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
