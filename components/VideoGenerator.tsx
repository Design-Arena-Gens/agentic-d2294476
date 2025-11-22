"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Slide = {
  id: string;
  text: string;
  durationSec: number;
  bg: string;
  textColor: string;
};

const defaultSlides: Slide[] = [
  { id: crypto.randomUUID(), text: "Welcome to Video Generator", durationSec: 2, bg: "#0ea5e9", textColor: "#ffffff" },
  { id: crypto.randomUUID(), text: "Type text, pick colors, export WebM", durationSec: 2, bg: "#111827", textColor: "#f97316" },
];

export default function VideoGenerator() {
  const [slides, setSlides] = useState<Slide[]>(defaultSlides);
  const [width, setWidth] = useState(720);
  const [height, setHeight] = useState(1280);
  const [fps, setFps] = useState(30);
  const [loading, setLoading] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [log, setLog] = useState<string>("");

  const ffmpegRef = useRef<any>(null);

  useEffect(() => {
    // Lazy load on first interaction
  }, []);

  const ensureFFmpeg = useCallback(async () => {
    if (!ffmpegRef.current) {
      const mod: any = await import("@ffmpeg/ffmpeg");
      const createFFmpeg = mod.createFFmpeg ?? mod.default?.createFFmpeg;
      ffmpegRef.current = createFFmpeg({ log: true });
    }
    if (!ffmpegRef.current.isLoaded()) {
      setLog((l) => l + "\nLoading ffmpeg.wasm (~20MB) ...");
      await ffmpegRef.current.load();
      setLog((l) => l + "\nffmpeg ready.");
    }
  }, []);

  const addSlide = () => {
    setSlides((s) => [
      ...s,
      {
        id: crypto.randomUUID(),
        text: "New slide",
        durationSec: 2,
        bg: "#1f2937",
        textColor: "#ffffff",
      },
    ]);
  };

  const removeSlide = (id: string) => {
    setSlides((s) => s.filter((x) => x.id !== id));
  };

  const updateSlide = (id: string, patch: Partial<Slide>) => {
    setSlides((s) => s.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  };

  const renderSlideToCanvas = async (
    canvas: HTMLCanvasElement,
    slide: Slide
  ): Promise<HTMLCanvasElement> => {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2d context not available");

    // Background
    ctx.fillStyle = slide.bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Text
    const margin = Math.floor(canvas.width * 0.08);
    const maxWidth = canvas.width - margin * 2;

    // Adaptive font size based on width
    let fontSize = Math.max(28, Math.floor(canvas.width / 13));
    ctx.fillStyle = slide.textColor;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // Wrap text into lines
    const lines: string[] = [];
    const words = slide.text.split(/\s+/);
    const testCanvas = document.createElement("canvas");
    const testCtx = testCanvas.getContext("2d")!;

    while (fontSize >= 18) {
      testCtx.font = `700 ${fontSize}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto`;
      lines.length = 0;
      let current = "";
      for (const word of words) {
        const candidate = current ? current + " " + word : word;
        const m = testCtx.measureText(candidate);
        if (m.width > maxWidth) {
          if (current) lines.push(current);
          current = word;
        } else {
          current = candidate;
        }
      }
      if (current) lines.push(current);

      const totalHeight = lines.length * fontSize * 1.25;
      if (totalHeight < canvas.height * 0.7) break;
      fontSize -= 2;
    }

    ctx.font = `700 ${fontSize}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto`;

    const totalHeight = lines.length * fontSize * 1.25;
    let y = canvas.height / 2 - totalHeight / 2 + fontSize / 2;

    for (const line of lines) {
      ctx.fillText(line, canvas.width / 2, y, maxWidth);
      y += fontSize * 1.25;
    }

    return canvas;
  };

  const generate = useCallback(async () => {
    try {
      setLoading(true);
      setVideoUrl(null);
      setLog("");
      await ensureFFmpeg();

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const frameInputs: { name: string; data: Uint8Array }[] = [];
      let frameIndex = 0;

      for (const slide of slides) {
        const framesForSlide = Math.max(1, Math.round(slide.durationSec * fps));
        for (let i = 0; i < framesForSlide; i++) {
          await renderSlideToCanvas(canvas, slide);
          const blob: Blob = await new Promise((resolve) => canvas.toBlob((b) => resolve(b!), "image/png"));
          const arrayBuf = await blob.arrayBuffer();
          const name = `frame_${String(frameIndex).padStart(5, "0")}.png`;
          frameInputs.push({ name, data: new Uint8Array(arrayBuf) });
          frameIndex += 1;
        }
      }

      // Write frames into ffmpeg FS
      for (const f of frameInputs) {
        ffmpegRef.current.FS("writeFile", f.name, f.data);
      }

      const args = [
        "-framerate", String(fps),
        "-i", "frame_%05d.png",
        "-c:v", "libvpx",
        "-pix_fmt", "yuv420p",
        "-b:v", "1M",
        "out.webm",
      ];

      setLog((l) => l + "\nEncoding ...");
      await ffmpegRef.current.run(...args);

      const data = ffmpegRef.current.FS("readFile", "out.webm");
      const out = URL.createObjectURL(new Blob([data.buffer], { type: "video/webm" }));
      setVideoUrl(out);

      // Cleanup FS
      for (const f of frameInputs) {
        try { ffmpegRef.current.FS("unlink", f.name); } catch {}
      }
      try { ffmpegRef.current.FS("unlink", "out.webm"); } catch {}

      setLog((l) => l + "\nDone.");
    } catch (e: any) {
      console.error(e);
      setLog((l) => l + "\nError: " + (e?.message ?? String(e)));
    } finally {
      setLoading(false);
    }
  }, [ensureFFmpeg, fps, height, slides, width]);

  return (
    <div className="card">
      <div className="controls">
        <div className="row">
          <label>Dimensions</label>
        </div>
        <div className="row" />

        <div className="row">
          <input type="number" value={width} min={256} max={1920} onChange={(e) => setWidth(parseInt(e.target.value || "0") || 0)} />
          <input type="number" value={height} min={256} max={1920} onChange={(e) => setHeight(parseInt(e.target.value || "0") || 0)} />
          <input type="number" value={fps} min={1} max={60} onChange={(e) => setFps(parseInt(e.target.value || "0") || 0)} />
        </div>
        <div className="row">
          <span className="small">width</span>
          <span className="small">height</span>
          <span className="small">fps</span>
        </div>
      </div>

      <div style={{ height: 12 }} />

      <div className="list">
        {slides.map((s) => (
          <div className="slide" key={s.id}>
            <textarea value={s.text} onChange={(e) => updateSlide(s.id, { text: e.target.value })} />
            <div className="right">
              <div className="inline">
                <input type="color" value={s.bg} onChange={(e) => updateSlide(s.id, { bg: e.target.value })} />
                <input type="color" value={s.textColor} onChange={(e) => updateSlide(s.id, { textColor: e.target.value })} />
              </div>
              <div className="inline">
                <input type="number" min={1} max={10} value={s.durationSec} onChange={(e) => updateSlide(s.id, { durationSec: Math.max(1, parseInt(e.target.value || "1")) })} />
                <button className="remove" onClick={() => removeSlide(s.id)}>Remove</button>
              </div>
            </div>
          </div>
        ))}
        <div>
          <button className="add" onClick={addSlide}>Add slide</button>
        </div>
      </div>

      <div style={{ height: 16 }} />

      <div className="controls">
        <div className="row">
          <button onClick={generate} disabled={loading}>{loading ? "Generating..." : "Generate video"}</button>
        </div>
        <div className="row">
          {videoUrl && (
            <a href={videoUrl} download="video.webm">
              <button>Download WebM</button>
            </a>
          )}
        </div>
      </div>

      <div className="preview">
        {videoUrl ? (
          <video src={videoUrl} controls playsInline />
        ) : (
          <div className="small muted">Generate to preview the result here.</div>
        )}
      </div>

      <div style={{ whiteSpace: "pre-wrap", marginTop: 12 }} className="small">{log}</div>
    </div>
  );
}
