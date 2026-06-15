import { useEffect, useRef } from "react";

/* Trading-terminal Matrix Rain — falling financial/crypto characters */
const CHARS = "01₿Ξ$%+−×=↑↓▲▼BCDEF789USDT·•◈←→0123456";
const COL_W  = 18;   // px per column
const FONT   = 13;   // font size px

export default function MatrixRain() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d")!;
    let raf: number;

    const resize = () => {
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const cols = () => Math.ceil(canvas.width / COL_W);

    let drops: number[] = [];
    let speeds: number[] = [];
    const init = () => {
      const n = cols();
      drops  = Array.from({ length: n }, () => Math.random() * -(canvas.height / COL_W));
      speeds = Array.from({ length: n }, () => 0.25 + Math.random() * 0.6);
    };
    init();
    window.addEventListener("resize", init);

    let frame = 0;
    const draw = () => {
      frame++;

      /* Fade trail — semi-transparent dark overlay each frame */
      ctx.fillStyle = "rgba(5,12,10,0.055)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.font = `${FONT}px 'Courier New', monospace`;

      const n = drops.length;
      for (let i = 0; i < n; i++) {
        const y = drops[i] * COL_W;
        if (y < -COL_W) { drops[i] += speeds[i]; continue; }

        const x = i * COL_W;
        const ch = CHARS[Math.floor(Math.random() * CHARS.length)];

        /* Head — bright white-green */
        ctx.fillStyle = "rgba(180,255,220,0.92)";
        ctx.fillText(ch, x, y);

        /* Second char (just behind head) — vivid green */
        if (y > COL_W) {
          ctx.fillStyle = "rgba(0,255,148,0.75)";
          ctx.fillText(CHARS[Math.floor(Math.random() * CHARS.length)], x, y - COL_W);
        }

        drops[i] += speeds[i];

        /* Reset column after it falls off screen */
        if (y > canvas.height && Math.random() > 0.978) {
          drops[i] = Math.random() * -30;
          speeds[i] = 0.25 + Math.random() * 0.6;
        }
      }

      raf = requestAnimationFrame(draw);
    };

    draw();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("resize", init);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 0,
        opacity: 0.18,
      }}
    />
  );
}
