import { useState, useEffect } from "react";
import { Award, Plus, Pencil, Trash2, X, Save, ChevronUp, ChevronDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const TEAL = "#5B8CFF";
const INPUT_CLS = "w-full rounded-xl px-3 py-2.5 text-sm outline-none transition-all";
const INPUT_STYLE = { background: "rgba(3,12,26,0.7)", border: "1px solid rgba(91,140,255,0.18)", color: "rgba(194,210,255,0.9)" };
const ORBITRON: React.CSSProperties = { fontFamily: "'Sora', sans-serif" };

function getToken() { return localStorage.getItem("waytoalgo_token"); }
function authHeaders() {
  return { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` };
}

type Rank = {
  id: number;
  rankNumber: number;
  name: string;
  criteria: string;
  reward: string;
  requiresRankId: number | null;
  requiresCount: number | null;
  requiresLevels: number | null;
};

const BLANK: Omit<Rank, "id"> = {
  rankNumber: 1,
  name: "",
  criteria: "",
  reward: "",
  requiresRankId: null,
  requiresCount: null,
  requiresLevels: null,
};

const RANK_GRADIENTS = [
  { from: "#b45309", to: "#d97706" },
  { from: "#6b7280", to: "#9ca3af" },
  { from: "#d97706", to: "#fbbf24" },
  { from: "#7c3aed", to: "#a78bfa" },
  { from: "#0891b2", to: "#5B8CFF" },
];

function RankBadge({ index }: { index: number }) {
  const g = RANK_GRADIENTS[index % RANK_GRADIENTS.length] ?? RANK_GRADIENTS[0]!;
  return (
    <div
      className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm shrink-0"
      style={{ background: `linear-gradient(135deg, ${g.from}, ${g.to})`, boxShadow: `0 0 12px ${g.to}40` }}
    >
      {index + 1}
    </div>
  );
}

export default function AdminRanks() {
  const { toast } = useToast();
  const [ranks, setRanks] = useState<Rank[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [form, setForm] = useState<Omit<Rank, "id"> | null>(null);
  const [editId, setEditId] = useState<number | null>(null);

  async function load() {
    try {
      const res = await fetch("/api/admin/ranks", { headers: authHeaders() });
      const data = await res.json();
      setRanks(Array.isArray(data) ? data : []);
    } catch {
      toast({ title: "Failed to load ranks", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function openCreate() {
    const nextNum = ranks.length > 0 ? Math.max(...ranks.map(r => r.rankNumber)) + 1 : 1;
    setForm({ ...BLANK, rankNumber: nextNum });
    setEditId(null);
  }

  function openEdit(rank: Rank) {
    const { id, ...rest } = rank;
    setForm({ ...rest });
    setEditId(id);
  }

  function closeForm() { setForm(null); setEditId(null); }

  async function handleSave() {
    if (!form) return;
    setSaving(true);
    try {
      const url = editId ? `/api/admin/ranks/${editId}` : "/api/admin/ranks";
      const method = editId ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: authHeaders(),
        body: JSON.stringify({
          ...form,
          requiresRankId: form.requiresRankId || null,
          requiresCount: form.requiresCount || null,
          requiresLevels: form.requiresLevels || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Save failed");
      toast({ title: editId ? "Rank updated!" : "Rank created!" });
      closeForm();
      load();
    } catch (err: any) {
      toast({ title: err?.message || "Failed", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    try {
      await fetch(`/api/admin/ranks/${id}`, { method: "DELETE", headers: authHeaders() });
      toast({ title: "Rank deleted" });
      setDeleteId(null);
      load();
    } catch {
      toast({ title: "Delete failed", variant: "destructive" });
    }
  }

  function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
      <div className="space-y-1.5">
        <label className="text-xs font-medium" style={{ color: "rgba(194,210,255,0.55)" }}>{label}</label>
        {children}
      </div>
    );
  }

  return (
    <div className="px-4 md:px-6 py-6 max-w-4xl mx-auto pb-24 md:pb-10">
      {/* Header */}
      <header className="mb-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
            style={{
              background: "linear-gradient(135deg, rgba(91,140,255,0.2), rgba(61,92,224,0.08))",
              border: "1px solid rgba(91,140,255,0.35)",
              boxShadow: "0 0 20px rgba(91,140,255,0.18)",
            }}
          >
            <Award size={20} style={{ color: TEAL }} />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold" style={{ ...ORBITRON, background: "linear-gradient(135deg,#C2D2FF,#5B8CFF)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
              Rank Management
            </h1>
            <p className="text-xs mt-0.5" style={{ color: "rgba(194,210,255,0.4)" }}>
              Define ranks, criteria, and rewards shown to users
            </p>
          </div>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm transition-all"
          style={{
            background: "linear-gradient(135deg, rgba(91,140,255,0.18), rgba(61,92,224,0.08))",
            border: "1px solid rgba(91,140,255,0.4)",
            color: TEAL,
          }}
        >
          <Plus size={15} /> New Rank
        </button>
      </header>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => (
            <div key={i} className="rounded-2xl h-24 animate-pulse" style={{ background: "rgba(91,140,255,0.04)", border: "1px solid rgba(91,140,255,0.08)" }} />
          ))}
        </div>
      ) : ranks.length === 0 ? (
        <div className="rounded-2xl py-16 text-center" style={{ background: "rgba(10,14,30,0.5)", border: "1px dashed rgba(91,140,255,0.15)" }}>
          <Award size={32} className="mx-auto mb-3" style={{ color: "rgba(91,140,255,0.3)" }} />
          <p className="text-sm" style={{ color: "rgba(194,210,255,0.4)" }}>No ranks yet. Create your first one.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {ranks.map((rank, idx) => (
            <div
              key={rank.id}
              className="rounded-2xl p-4 flex items-start gap-4"
              style={{ background: "rgba(10,14,30,0.65)", backdropFilter: "blur(14px)", border: "1px solid rgba(91,140,255,0.10)" }}
            >
              <RankBadge index={idx} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-sm" style={{ color: "rgba(194,210,255,0.9)" }}>{rank.name}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "rgba(91,140,255,0.08)", border: "1px solid rgba(91,140,255,0.18)", color: TEAL }}>
                    Rank #{rank.rankNumber}
                  </span>
                </div>
                <p className="text-xs mt-1 line-clamp-1" style={{ color: "rgba(194,210,255,0.45)" }}>{rank.criteria}</p>
                <div className="flex flex-wrap gap-3 mt-2">
                  <span className="text-xs" style={{ color: "rgba(52,211,153,0.85)" }}>🎁 {rank.reward}</span>
                  {rank.requiresLevels != null && (
                    <span className="text-xs" style={{ color: "rgba(194,210,255,0.5)" }}>
                      Levels required: <strong style={{ color: "rgba(194,210,255,0.8)" }}>{rank.requiresLevels}</strong>
                    </span>
                  )}
                  {rank.requiresCount != null && (
                    <span className="text-xs" style={{ color: "rgba(194,210,255,0.5)" }}>
                      Qualifying refs: <strong style={{ color: "rgba(194,210,255,0.8)" }}>{rank.requiresCount}</strong>
                    </span>
                  )}
                  {rank.requiresRankId != null && (
                    <span className="text-xs" style={{ color: "rgba(194,210,255,0.5)" }}>
                      Refs need rank ID: <strong style={{ color: "rgba(194,210,255,0.8)" }}>{rank.requiresRankId}</strong>
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => openEdit(rank)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
                  style={{ background: "rgba(91,140,255,0.08)", border: "1px solid rgba(91,140,255,0.18)", color: TEAL }}
                  title="Edit"
                >
                  <Pencil size={13} />
                </button>
                <button
                  onClick={() => setDeleteId(rank.id)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
                  style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.22)", color: "rgba(248,113,113,0.85)" }}
                  title="Delete"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Modal */}
      {form && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" style={{ background: "rgba(0,5,15,0.8)", backdropFilter: "blur(6px)" }}>
          <div
            className="w-full max-w-lg rounded-2xl p-6 space-y-5 max-h-[90vh] overflow-y-auto"
            style={{ background: "rgba(4,14,28,0.98)", border: "1px solid rgba(91,140,255,0.22)", boxShadow: "0 24px 80px rgba(0,0,0,0.7)" }}
          >
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-base" style={{ ...ORBITRON, color: TEAL }}>
                {editId ? "Edit Rank" : "New Rank"}
              </h2>
              <button onClick={closeForm} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)", color: "rgba(194,210,255,0.6)" }}>
                <X size={14} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Rank Number">
                <div className="flex items-center gap-1">
                  <input
                    type="number" min="1"
                    value={form.rankNumber}
                    onChange={e => setForm(f => f && ({ ...f, rankNumber: parseInt(e.target.value) || 1 }))}
                    className={INPUT_CLS}
                    style={INPUT_STYLE}
                  />
                </div>
              </Field>
              <Field label="Rank Name">
                <input
                  value={form.name}
                  onChange={e => setForm(f => f && ({ ...f, name: e.target.value }))}
                  className={INPUT_CLS}
                  style={INPUT_STYLE}
                  placeholder="e.g. Bronze, Silver…"
                />
              </Field>
            </div>

            <Field label="Criteria (displayed to users)">
              <textarea
                value={form.criteria}
                onChange={e => setForm(f => f && ({ ...f, criteria: e.target.value }))}
                rows={2}
                className={INPUT_CLS + " resize-none"}
                style={INPUT_STYLE}
                placeholder="e.g. Complete 3 active levels with qualifying referrals"
              />
            </Field>

            <Field label="Reward">
              <input
                value={form.reward}
                onChange={e => setForm(f => f && ({ ...f, reward: e.target.value }))}
                className={INPUT_CLS}
                style={INPUT_STYLE}
                placeholder="e.g. Bronze Badge + 2% bonus"
              />
            </Field>

            <div
              className="rounded-xl p-4 space-y-4"
              style={{ background: "rgba(91,140,255,0.04)", border: "1px solid rgba(91,140,255,0.10)" }}
            >
              <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "rgba(194,210,255,0.4)" }}>Progress Requirements</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Field label="Levels Required">
                  <input
                    type="number" min="0"
                    value={form.requiresLevels ?? ""}
                    onChange={e => setForm(f => f && ({ ...f, requiresLevels: e.target.value === "" ? null : parseInt(e.target.value) }))}
                    className={INPUT_CLS}
                    style={INPUT_STYLE}
                    placeholder="None"
                  />
                </Field>
                <Field label="Qualifying Refs">
                  <input
                    type="number" min="0"
                    value={form.requiresCount ?? ""}
                    onChange={e => setForm(f => f && ({ ...f, requiresCount: e.target.value === "" ? null : parseInt(e.target.value) }))}
                    className={INPUT_CLS}
                    style={INPUT_STYLE}
                    placeholder="None"
                  />
                </Field>
                <Field label="Refs Need Rank ID">
                  <select
                    value={form.requiresRankId ?? ""}
                    onChange={e => setForm(f => f && ({ ...f, requiresRankId: e.target.value === "" ? null : parseInt(e.target.value) }))}
                    className={INPUT_CLS}
                    style={{ ...INPUT_STYLE, cursor: "pointer" }}
                  >
                    <option value="">None</option>
                    {ranks.filter(r => r.id !== editId).map(r => (
                      <option key={r.id} value={r.id} style={{ background: "#030c1a" }}>
                        #{r.rankNumber} {r.name}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            </div>

            <div className="flex gap-3 pt-1">
              <button
                onClick={closeForm}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(194,210,255,0.6)" }}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.name || !form.criteria || !form.reward}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-50"
                style={{
                  background: "linear-gradient(135deg, rgba(91,140,255,0.22), rgba(61,92,224,0.10))",
                  border: "1px solid rgba(91,140,255,0.4)",
                  color: TEAL,
                }}
              >
                <Save size={14} /> {saving ? "Saving…" : (editId ? "Update Rank" : "Create Rank")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deleteId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,5,15,0.85)", backdropFilter: "blur(6px)" }}>
          <div className="w-full max-w-sm rounded-2xl p-6 space-y-4" style={{ background: "rgba(4,14,28,0.98)", border: "1px solid rgba(248,113,113,0.3)" }}>
            <h3 className="font-bold text-sm" style={{ color: "rgba(248,113,113,0.9)" }}>Delete Rank?</h3>
            <p className="text-xs" style={{ color: "rgba(194,210,255,0.5)" }}>
              This will permanently remove the rank. Users currently at this rank will lose their rank assignment.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteId(null)} className="flex-1 py-2.5 rounded-xl text-sm font-medium" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(194,210,255,0.6)" }}>
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteId!)}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold"
                style={{ background: "rgba(248,113,113,0.12)", border: "1px solid rgba(248,113,113,0.35)", color: "rgba(248,113,113,0.9)" }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
