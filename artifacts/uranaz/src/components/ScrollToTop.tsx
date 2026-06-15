import { useState, useEffect } from "react";
import { ArrowUp } from "lucide-react";

export default function ScrollToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 300);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!visible) return null;

  return (
    <button
      data-testid="scroll-to-top"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      className="fixed bottom-24 right-4 z-50 w-10 h-10 rounded-full flex items-center justify-center transition-all hover:scale-110"
      style={{
        background: "linear-gradient(135deg, #00FF94, #00CC77)",
        color: "#050C0A",
        boxShadow: "0 0 16px rgba(0,255,148,0.45), 0 4px 12px rgba(0,0,0,0.4)",
      }}
    >
      <ArrowUp size={17} />
    </button>
  );
}
