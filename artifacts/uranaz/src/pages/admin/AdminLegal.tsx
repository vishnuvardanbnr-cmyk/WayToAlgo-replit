import { useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Save, FileText, Shield } from "lucide-react";

const TEAL = "#00FF94";
const GLASS = { background: "rgba(10,14,30,0.65)", backdropFilter: "blur(14px)", border: "1px solid rgba(0,255,148,0.10)" } as const;
const TEXTAREA_STYLE = {
  background: "rgba(0,20,40,0.7)",
  border: "1px solid rgba(0,255,148,0.18)",
  color: "rgba(176,255,224,0.9)",
  fontFamily: "monospace",
  fontSize: "0.82rem",
  lineHeight: "1.6",
  resize: "vertical" as const,
};
const LABEL_STYLE = { color: "rgba(176,255,224,0.6)", fontSize: "0.75rem", letterSpacing: "0.06em", textTransform: "uppercase" as const };

export default function AdminLegal() {
  const { toast } = useToast();
  const [termsContent, setTermsContent] = useState("");
  const [privacyContent, setPrivacyContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<"terms" | "privacy" | null>(null);

  useEffect(() => {
    fetch("/api/admin/legal", {
      headers: { Authorization: `Bearer ${localStorage.getItem("waytoalgo_token")}` },
    })
      .then(r => r.json())
      .then(d => {
        setTermsContent(d.termsContent ?? "");
        setPrivacyContent(d.privacyContent ?? "");
      })
      .catch(() => toast({ title: "Failed to load legal content", variant: "destructive" }))
      .finally(() => setLoading(false));
  }, []);

  async function save(field: "terms" | "privacy") {
    setSaving(field);
    try {
      const body = field === "terms"
        ? { termsContent }
        : { privacyContent };
      const res = await fetch("/api/admin/legal", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("waytoalgo_token")}`,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Save failed");
      toast({ title: `${field === "terms" ? "Terms & Conditions" : "Privacy Policy"} saved!` });
    } catch {
      toast({ title: "Failed to save", variant: "destructive" });
    } finally {
      setSaving(null);
    }
  }

  if (loading) {
    return (
      <div className="px-4 py-6 max-w-4xl mx-auto space-y-4">
        {[1, 2].map(i => (
          <div key={i} className="rounded-xl h-64 animate-pulse" style={{ background: "rgba(0,255,148,0.04)", border: "1px solid rgba(0,255,148,0.08)" }} />
        ))}
      </div>
    );
  }

  return (
    <div className="px-4 py-6 max-w-4xl mx-auto space-y-6 pb-24 md:pb-8">
      <div>
        <h1
          className="text-xl font-bold"
          style={{
            fontFamily: "'Sora', sans-serif",
            background: "linear-gradient(135deg, #B0FFE0, #00FF94)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}
        >
          Legal Content
        </h1>
        <p className="text-xs mt-0.5" style={{ color: "rgba(176,255,224,0.4)" }}>
          Edit Terms & Conditions and Privacy Policy shown to users. Plain text or Markdown supported.
        </p>
      </div>

      {/* Terms & Conditions */}
      <div className="rounded-2xl p-5 space-y-4" style={GLASS}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: "rgba(0,255,148,0.12)", border: "1px solid rgba(0,255,148,0.25)" }}
            >
              <FileText size={15} style={{ color: TEAL }} />
            </div>
            <div>
              <div className="text-sm font-semibold" style={{ color: "rgba(176,255,224,0.9)" }}>Terms &amp; Conditions</div>
              <div className="text-xs" style={{ color: "rgba(176,255,224,0.4)" }}>Shown at /terms</div>
            </div>
          </div>
          <button
            onClick={() => save("terms")}
            disabled={saving === "terms"}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all disabled:opacity-60"
            style={{
              background: "linear-gradient(135deg, #00FF94, #00CC77)",
              color: "#050C0A",
              boxShadow: "0 0 16px rgba(0,255,148,0.3)",
            }}
          >
            <Save size={14} />
            {saving === "terms" ? "Saving…" : "Save"}
          </button>
        </div>
        <div>
          <div className="mb-1.5" style={LABEL_STYLE}>Content</div>
          <textarea
            rows={18}
            value={termsContent}
            onChange={e => setTermsContent(e.target.value)}
            placeholder="Enter your Terms & Conditions here..."
            className="w-full rounded-xl px-3 py-3 focus:outline-none transition-colors"
            style={TEXTAREA_STYLE}
          />
        </div>
      </div>

      {/* Privacy Policy */}
      <div className="rounded-2xl p-5 space-y-4" style={GLASS}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: "rgba(0,255,148,0.12)", border: "1px solid rgba(0,255,148,0.25)" }}
            >
              <Shield size={15} style={{ color: TEAL }} />
            </div>
            <div>
              <div className="text-sm font-semibold" style={{ color: "rgba(176,255,224,0.9)" }}>Privacy Policy</div>
              <div className="text-xs" style={{ color: "rgba(176,255,224,0.4)" }}>Shown at /privacy</div>
            </div>
          </div>
          <button
            onClick={() => save("privacy")}
            disabled={saving === "privacy"}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all disabled:opacity-60"
            style={{
              background: "linear-gradient(135deg, #00FF94, #00CC77)",
              color: "#050C0A",
              boxShadow: "0 0 16px rgba(0,255,148,0.3)",
            }}
          >
            <Save size={14} />
            {saving === "privacy" ? "Saving…" : "Save"}
          </button>
        </div>
        <div>
          <div className="mb-1.5" style={LABEL_STYLE}>Content</div>
          <textarea
            rows={18}
            value={privacyContent}
            onChange={e => setPrivacyContent(e.target.value)}
            placeholder="Enter your Privacy Policy here..."
            className="w-full rounded-xl px-3 py-3 focus:outline-none transition-colors"
            style={TEXTAREA_STYLE}
          />
        </div>
      </div>
    </div>
  );
}
