import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";

type Props = {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  width: number;
  onSize?: (size: { width: number; height: number }) => void;
  children?: React.ReactNode;
  onPageClick?: (rel: { x: number; y: number }) => void;
};

/** Renders a single PDF page to a canvas and layers annotation children on top. */
export function PdfPage({ pdf, pageNumber, width, onSize, children, onPageClick }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let task: { cancel: () => void } | null = null;

    (async () => {
      const page = await pdf.getPage(pageNumber);
      if (cancelled) return;
      const base = page.getViewport({ scale: 1 });
      const scale = width / base.width;
      const viewport = page.getViewport({ scale });
      const ratio = window.devicePixelRatio || 1;
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = Math.floor(viewport.width * ratio);
      canvas.height = Math.floor(viewport.height * ratio);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      setHeight(viewport.height);
      onSize?.({ width: viewport.width, height: viewport.height });
      const ctx = canvas.getContext("2d")!;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      task = page.render({ canvasContext: ctx, viewport });
      try {
        await (task as unknown as { promise: Promise<void> }).promise;
      } catch {
        /* render cancelled */
      }
    })();

    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [pdf, pageNumber, width, onSize]);

  return (
    <div
      className="paper-sheet relative mx-auto overflow-hidden rounded-sm"
      style={{ width, height: height || width * 1.29 }}
      onClick={(e) => {
        if (!onPageClick) return;
        if (e.target !== e.currentTarget && (e.target as HTMLElement).tagName !== "CANVAS") return;
        const r = e.currentTarget.getBoundingClientRect();
        onPageClick({ x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height });
      }}
    >
      <canvas ref={canvasRef} className="block" />
      {children}
    </div>
  );
}
