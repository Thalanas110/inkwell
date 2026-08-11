import { useEffect, useRef, useState } from "react";
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
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSave: (name: string, dataUrl: string) => void;
};

export function SignaturePad({ open, onOpenChange, onSave }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const dirty = useRef(false);
  const [name, setName] = useState("My signature");
  const [uploaded, setUploaded] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const c = canvasRef.current;
    if (!c) return;
    const CSS_W = 640;
    const CSS_H = 220;
    const ratio = window.devicePixelRatio || 1;
    c.width = CSS_W * ratio;
    c.height = CSS_H * ratio;
    const ctx = c.getContext("2d")!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(ratio, ratio);
    ctx.clearRect(0, 0, CSS_W, CSS_H);
    ctx.lineWidth = 2.6;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#1c1917";
    dirty.current = false;
    setUploaded(null);
  }, [open]);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = canvasRef.current!;
    const r = e.currentTarget.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    const scaleX = c.width / r.width; // bitmap pixels per CSS pixel
    const scaleY = c.height / r.height;
    // Convert pointer (CSS px relative to element) -> bitmap px -> CSS drawing units (divide by ratio)
    const x = ((e.clientX - r.left) * scaleX) / ratio;
    const y = ((e.clientY - r.top) * scaleY) / ratio;
    return { x, y };
  };

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    dirty.current = true;
    const ctx = canvasRef.current!.getContext("2d")!;
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current!.getContext("2d")!;
    const p = pos(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  };
  const end = () => {
    drawing.current = false;
  };

  const clear = () => {
    const c = canvasRef.current!;
    const ctx = c.getContext("2d")!;
    const ratio = window.devicePixelRatio || 1;
    const cssW = c.width / ratio;
    const cssH = c.height / ratio;
    ctx.clearRect(0, 0, cssW, cssH);
    dirty.current = false;
  };

  const save = () => {
    const dataUrl = uploaded ?? (dirty.current ? canvasRef.current!.toDataURL("image/png") : null);
    if (!dataUrl) return;
    onSave(name.trim() || "Signature", dataUrl);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Add a signature</DialogTitle>
          <DialogDescription>
            Draw it or upload a transparent PNG. Signatures are stored locally on this device.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="draw">
          <TabsList>
            <TabsTrigger value="draw">Draw</TabsTrigger>
            <TabsTrigger value="upload">Upload</TabsTrigger>
          </TabsList>
          <TabsContent value="draw" className="mt-4">
            <div className="paper-sheet grain rounded-md p-2 flex justify-center">
              <canvas
                ref={canvasRef}
                onPointerDown={start}
                onPointerMove={move}
                onPointerUp={end}
                onPointerLeave={end}
                className="h-[220px] w-full max-w-[640px] block cursor-crosshair touch-none rounded-sm"
              />
            </div>
            <Button variant="ghost" size="sm" className="mt-2" onClick={clear}>
              Clear
            </Button>
          </TabsContent>
          <TabsContent value="upload" className="mt-4 space-y-3">
            <Input
              type="file"
              accept="image/png,image/jpeg"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => setUploaded(String(reader.result));
                reader.readAsDataURL(file);
              }}
            />
            {uploaded ? (
              <div className="paper-sheet flex justify-center rounded-md p-3">
                <img src={uploaded} alt="Uploaded signature preview" className="max-h-32" />
              </div>
            ) : null}
          </TabsContent>
        </Tabs>

        <div className="space-y-2">
          <Label htmlFor="sig-name">Label</Label>
          <Input id="sig-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save}>Save signature</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
