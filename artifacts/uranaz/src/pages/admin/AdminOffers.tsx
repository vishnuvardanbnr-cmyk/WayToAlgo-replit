import { useState, useEffect } from "react";
import { Plus, Pencil, Trash2, ToggleLeft, ToggleRight, Save, X } from "lucide-react";

const TEAL = "#00FF94";
const GLASS = { background: "rgba(10,14,30,0.65)", backdropFilter: "blur(14px)", border: "1px solid rgba(0,255,148,0.10)" } as const;
const INPUT_CLS = "w-full rounded-xl px-3 py-2.5 text-sm outline-none transition-all";
const INPUT_STYLE = { background: "rgba(3,12,26,0.7)", border: "1px solid rgba(0,255,148,0.18)", color: "rgba(176,255,224,0.9)" };

type CriterionType = "self_invest" | "team_business" | "leg";
interface Criterion {
  type: CriterionType;
  label: string;
  target: number;
  legIndex?: number;
}
interface Offer {
  id: number;
  title: string;
  subtitle: string;
  emoji: string;
  reward: string;
  endDate: string | null;
  active: boolean;
  criteria: Criterion[];
  createdAt: string;
}

const BLANK_OFFER = {
  title: "",
  subtitle: "",
  emoji: "🎁",
  reward: "",
  endDate: "",
  active: true,
  criteria: [] as Criterion[],
};

const CRITERION_PRESETS = [
  { type: "self_invest" as CriterionType, label: "Self Invest", target: 500 },
  { type: "team_business" as CriterionType, label: "Team Business", target: 25000 },
  { type: "leg" as CriterionType, legIndex: 1, label: "Leg 1", target: 10000 },
  { type: "leg" as CriterionType, legIndex: 2, label: "Leg 2", target: 10000 },
  { type: "leg" as CriterionType, legIndex: 3, label: "Leg 3", target: 5000 },
];

function getToken(): string | null {
  return localStorage.getItem("waytoalgo_token");
}
function authHeaders() {
  return { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` };
}

function CriteriaBuilder({ criteria, onChange }: { criteria: Criterion[]; onChange: (c: Criterion[]) => void }) {
  const addCriterion = (preset: typeof CRITERION_PRESETS[0]) => {
    onChange([...criteria, { type: preset.type, label: preset.label, target: preset.target, legIndex: (preset as any).legIndex }]);
  };
  const removeCriterion = (i: number) => {
    onChange(criteria.filter((_, idx) => idx !== i));
  };
  const updateCriterion = (i: number, field: keyof Criterion, value: any) => {
    onChange(criteria.map((c, idx) => idx === i ? { ...c, [field]: value } : c));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium" style={{ color: "rgba(176,255,224,0.5)" }}>Criteria (Progress Bars)</span>
      </div>

      {criteria.length === 0 && (
        <div className="text-xs px-3 py-2 rounded-xl" style={{ color: "rgba(176,255,224,0.3)", background: "rgba(0,255,148,0.03)", border: "1px dashed rgba(0,255,148,0.12)" }}>
          No criteria yet — add one below or use a preset
        </div>
      )}

      {criteria.map((c, i) => (
        <div key={i} className="rounded-xl p-3 space-y-2" style={{ background: "rgba(0,255,148,0.04)", border: "1px solid rgba(0,255,148,0.10)" }}>
          <div className="flex gap-2">
            <input
              className={INPUT_CLS + " flex-1"}
              style={INPUT_STYLE}
              placeholder="Label"
              value={c.label}
              onChange={e => updateCriterion(i, "label", e.target.value)}
            />
            <input
              type="number"
              className={INPUT_CLS}
              style={{ ...INPUT_STYLE, width: "110px" }}
              placeholder="Target $"
              value={c.target}
              onChange={e => updateCriterion(i, "target", parseFloat(e.target.value) || 0)}
            />
            <button type="button" onClick={() => removeCriterion(i)} className="p-2 rounded-lg transition-all" style={{ color: "rgba(248,113,113,0.7)", background: "rgba(248,113,113,0.08)" }}>
              <X size={14} />
            </button>
          </div>
          <div className="flex gap-2 items-center">
            <span className="text-xs" style={{ color: "rgba(176,255,224,0.3)" }}>Type:</span>
            {(["self_invest", "team_business", "leg"] as CriterionType[]).map(t => (
              <button
                key={t}
                type="button"
                onClick={() => updateCriterion(i, "type", t)}
                className="text-xs px-2 py-0.5 rounded-lg transition-all"
                style={{
                  background: c.type === t ? "rgba(0,255,148,0.15)" : "rgba(0,255,148,0.04)",
                  border: `1px solid ${c.type === t ? "rgba(0,255,148,0.3)" : "rgba(0,255,148,0.08)"}`,
                  color: c.type === t ? TEAL : "rgba(176,255,224,0.4)",
                }}
              >
                {t.replace("_", " ")}
              </button>
            ))}
            {c.type === "leg" && (
              <input
                type="number"
                min={1}
                max={10}
                className={INPUT_CLS}
                style={{ ...INPUT_STYLE, width: "70px" }}
                placeholder="Leg #"
                value={c.legIndex ?? 1}
                onChange={e => updateCriterion(i, "legIndex", parseInt(e.target.value) || 1)}
              />
            )}
          </div>
        </div>
      ))}

      {/* Quick presets */}
      <div className="pt-1">
        <div className="text-xs mb-1.5" style={{ color: "rgba(176,255,224,0.3)" }}>Quick add:</div>
        <div className="flex flex-wrap gap-1.5">
          {CRITERION_PRESETS.map((p, i) => (
            <button
              key={i}
              type="button"
              onClick={() => addCriterion(p)}
              className="text-xs px-2.5 py-1 rounded-lg transition-all flex items-center gap-1"
              style={{ background: "rgba(0,255,148,0.06)", border: "1px solid rgba(0,255,148,0.12)", color: "rgba(176,255,224,0.5)" }}
            >
              <Plus size={10} /> {p.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => onChange([...criteria, { type: "self_invest", label: "", target: 0 }])}
            className="text-xs px-2.5 py-1 rounded-lg transition-all flex items-center gap-1"
            style={{ background: "rgba(0,255,148,0.06)", border: "1px solid rgba(0,255,148,0.12)", color: "rgba(176,255,224,0.5)" }}
          >
            <Plus size={10} /> Custom
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminOffers() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | "new" | null>(null);
  const [form, setForm] = useState(BLANK_OFFER);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const loadOffers = async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/offers", { headers: authHeaders() });
      const data = await r.json();
      setOffers(Array.isArray(data) ? data : []);
    } catch {
      setOffers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadOffers(); }, []);

  const openNew = () => {
    setForm(BLANK_OFFER);
    setEditingId("new");
    setError("");
  };

  const openEdit = (o: Offer) => {
    setForm({
      title: o.title,
      subtitle: o.subtitle,
      emoji: o.emoji,
      reward: o.reward,
      endDate: o.endDate ?? "",
      active: o.active,
      criteria: o.criteria,
    });
    setEditingId(o.id);
    setError("");
  };

  const handleSave = async () => {
    if (!form.title.trim()) { setError("Title is required"); return; }
    setSaving(true);
    setError("");
    try {
      const body = { ...form, endDate: form.endDate || null };
      let r;
      if (editingId === "new") {
        r = await fetch("/api/admin/offers", { method: "POST", headers: authHeaders(), body: JSON.stringify(body) });
      } else {
        r = await fetch(`/api/admin/offers/${editingId}`, { method: "PUT", headers: authHeaders(), body: JSON.stringify(body) });
      }
      if (!r.ok) throw new Error(await r.text());
      setEditingId(null);
      await loadOffers();
    } catch (e: any) {
      setError(e.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (o: Offer) => {
    await fetch(`/api/admin/offers/${o.id}`, {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify({ active: !o.active }),
    });
    await loadOffers();
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this offer?")) return;
    await fetch(`/api/admin/offers/${id}`, { method: "DELETE", headers: authHeaders() });
    await loadOffers();
  };

  const isEditing = editingId !== null;

  return (
    <div className="px-4 py-6 max-w-2xl mx-auto space-y-5 pb-24 md:pb-8">
      {/* Header */}
      <div className="flex items-center gap-3">
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
            Manage Offers
          </h1>
          <p className="text-xs" style={{ color: "rgba(176,255,224,0.4)" }}>Create and manage user-facing offers</p>
        </div>
        <button
          onClick={openNew}
          className="ml-auto flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all"
          style={{ background: "linear-gradient(135deg, #00FF94, #00CC77)", color: "#050C0A" }}
        >
          <Plus size={15} /> New Offer
        </button>
      </div>

      {/* Edit / Create form */}
      {isEditing && (
        <div
          className="rounded-2xl p-5 space-y-4"
          style={{
            background: "linear-gradient(155deg, rgba(4,16,32,0.97), rgba(2,10,22,0.97))",
            border: "1px solid rgba(0,255,148,0.22)",
          }}
        >
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-sm" style={{ color: TEAL }}>
              {editingId === "new" ? "Create New Offer" : "Edit Offer"}
            </h2>
            <button onClick={() => setEditingId(null)} className="p-1.5 rounded-lg" style={{ color: "rgba(176,255,224,0.4)" }}>
              <X size={16} />
            </button>
          </div>

          {error && (
            <div className="text-xs px-3 py-2 rounded-xl" style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)", color: "rgba(248,113,113,0.85)" }}>
              {error}
            </div>
          )}

          <div className="grid grid-cols-[64px,1fr] gap-3">
            <div>
              <label className="text-xs block mb-1.5" style={{ color: "rgba(176,255,224,0.5)" }}>Emoji</label>
              <input className={INPUT_CLS} style={{ ...INPUT_STYLE, textAlign: "center", fontSize: "1.4rem", padding: "6px" }}
                value={form.emoji} onChange={e => setForm(f => ({ ...f, emoji: e.target.value }))} maxLength={4} />
            </div>
            <div>
              <label className="text-xs block mb-1.5" style={{ color: "rgba(176,255,224,0.5)" }}>Title *</label>
              <input className={INPUT_CLS} style={INPUT_STYLE} placeholder="e.g. Singapore Trip" value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
            </div>
          </div>

          <div>
            <label className="text-xs block mb-1.5" style={{ color: "rgba(176,255,224,0.5)" }}>Subtitle</label>
            <input className={INPUT_CLS} style={INPUT_STYLE} placeholder="e.g. 3-Day 5-Star Package" value={form.subtitle}
              onChange={e => setForm(f => ({ ...f, subtitle: e.target.value }))} />
          </div>

          <div>
            <label className="text-xs block mb-1.5" style={{ color: "rgba(176,255,224,0.5)" }}>Reward Description</label>
            <input className={INPUT_CLS} style={INPUT_STYLE} placeholder="What do qualifiers win?" value={form.reward}
              onChange={e => setForm(f => ({ ...f, reward: e.target.value }))} />
          </div>

          <div>
            <label className="text-xs block mb-1.5" style={{ color: "rgba(176,255,224,0.5)" }}>End Date &amp; Time (optional)</label>
            <input type="datetime-local" className={INPUT_CLS} style={INPUT_STYLE} value={form.endDate ?? ""}
              onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} />
          </div>

          <div className="flex items-center justify-between px-3 py-2.5 rounded-xl" style={{ background: "rgba(0,255,148,0.05)", border: "1px solid rgba(0,255,148,0.10)" }}>
            <div>
              <div className="text-sm font-medium" style={{ color: "rgba(176,255,224,0.8)" }}>Active</div>
              <div className="text-xs" style={{ color: "rgba(176,255,224,0.35)" }}>Visible to users when on</div>
            </div>
            <button type="button" onClick={() => setForm(f => ({ ...f, active: !f.active }))} className="transition-all">
              {form.active
                ? <ToggleRight size={32} style={{ color: TEAL }} />
                : <ToggleLeft size={32} style={{ color: "rgba(176,255,224,0.2)" }} />}
            </button>
          </div>

          <CriteriaBuilder criteria={form.criteria} onChange={c => setForm(f => ({ ...f, criteria: c }))} />

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-3 rounded-xl font-bold transition-all disabled:opacity-60 flex items-center justify-center gap-2"
            style={{ background: "linear-gradient(135deg, #00FF94, #00CC77)", color: "#050C0A", boxShadow: "0 0 20px rgba(0,255,148,0.25)" }}
          >
            <Save size={15} />
            {saving ? "Saving…" : editingId === "new" ? "Create Offer" : "Save Changes"}
          </button>
        </div>
      )}

      {/* Offers list */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2].map(i => (
            <div key={i} className="rounded-2xl h-24 animate-pulse" style={{ background: "rgba(0,255,148,0.04)", border: "1px solid rgba(0,255,148,0.08)" }} />
          ))}
        </div>
      ) : offers.length === 0 ? (
        <div
          className="rounded-2xl p-8 text-center"
          style={{ background: "rgba(10,14,30,0.65)", border: "1px dashed rgba(0,255,148,0.12)" }}
        >
          <div className="text-3xl mb-3">🎁</div>
          <div className="text-sm font-medium mb-1" style={{ color: "rgba(176,255,224,0.6)" }}>No offers yet</div>
          <div className="text-xs" style={{ color: "rgba(176,255,224,0.3)" }}>Click "New Offer" to create your first one</div>
        </div>
      ) : (
        <div className="space-y-3">
          {offers.map(o => (
            <div
              key={o.id}
              className="rounded-2xl p-4"
              style={{
                background: o.active
                  ? "linear-gradient(155deg, rgba(4,16,32,0.97), rgba(2,10,22,0.97))"
                  : "rgba(10,14,30,0.5)",
                border: o.active
                  ? "1px solid rgba(0,255,148,0.20)"
                  : "1px solid rgba(0,255,148,0.07)",
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
                    style={{ background: "rgba(0,255,148,0.08)", border: "1px solid rgba(0,255,148,0.15)" }}
                  >
                    {o.emoji}
                  </div>
                  <div className="min-w-0">
                    <div className="font-bold text-sm truncate" style={{ color: "rgba(176,255,224,0.9)" }}>{o.title}</div>
                    {o.subtitle && <div className="text-xs truncate" style={{ color: "rgba(176,255,224,0.4)" }}>{o.subtitle}</div>}
                    <div className="flex items-center gap-2 mt-1">
                      <span
                        className="text-xs px-2 py-0.5 rounded-full font-medium"
                        style={{
                          background: o.active ? "rgba(52,211,153,0.10)" : "rgba(176,255,224,0.05)",
                          border: `1px solid ${o.active ? "rgba(52,211,153,0.22)" : "rgba(176,255,224,0.08)"}`,
                          color: o.active ? "rgba(52,211,153,0.85)" : "rgba(176,255,224,0.3)",
                        }}
                      >
                        {o.active ? "Active" : "Paused"}
                      </span>
                      <span className="text-xs" style={{ color: "rgba(176,255,224,0.25)" }}>
                        {o.criteria.length} criteria
                      </span>
                      {o.endDate && (
                        <span className="text-xs" style={{ color: "rgba(176,255,224,0.25)" }}>
                          ends {new Date(o.endDate).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => handleToggle(o)}
                    className="p-2 rounded-lg transition-all"
                    title={o.active ? "Pause" : "Activate"}
                    style={{ background: "rgba(0,255,148,0.06)", border: "1px solid rgba(0,255,148,0.10)" }}
                  >
                    {o.active
                      ? <ToggleRight size={16} style={{ color: TEAL }} />
                      : <ToggleLeft size={16} style={{ color: "rgba(176,255,224,0.3)" }} />}
                  </button>
                  <button
                    onClick={() => openEdit(o)}
                    className="p-2 rounded-lg transition-all"
                    style={{ background: "rgba(0,255,148,0.06)", border: "1px solid rgba(0,255,148,0.10)" }}
                  >
                    <Pencil size={14} style={{ color: TEAL }} />
                  </button>
                  <button
                    onClick={() => handleDelete(o.id)}
                    className="p-2 rounded-lg transition-all"
                    style={{ background: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.10)" }}
                  >
                    <Trash2 size={14} style={{ color: "rgba(248,113,113,0.7)" }} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
