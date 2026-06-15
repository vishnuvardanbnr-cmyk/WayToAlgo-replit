import { useState, useEffect } from "react";
import { Award, Plus, Pencil, Trash2, X, Save, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const TEAL = "#00FF94";
const INPUT_CLS = "w-full rounded-xl px-3 py-2.5 text-sm outline-none transition-all";
const INPUT_STYLE = { background: "rgba(3,12,26,0.7)", border: "1px solid rgba(0,255,148,0.18)", color: "rgba(176,255,224,0.9)" };
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
  selfInvestmentMin: string | number;
  directBusinessMin: string | number;
  teamBusinessMin: string | number;
  legTopPct: number;
  legSecondPct: number;
  legRestPct: number;
  rewardMonthlyAmount: string | number;
  rewardMonths: number;
};

type RankForm = {
  rankNumber: number;
  name: string;
  selfInvestmentMin: number;
  directBusinessMin: number;
  teamBusinessMin: number;
  legTopPct: number;
  legSecondPct: number;
  legRestPct: number;
  rewardMonthlyAmount: number;
  rewardMonths: number;
};

const BLANK: RankForm = {
  rankNumber: 1,
  name: "",
  selfInvestmentMin: 0,
  directBusinessMin: 0,
  teamBusinessMin: 0,
  legTopPct: 40,
  legSecondPct: 30,
  legRestPct: 30,
  rewardMonthlyAmount: 0,
  rewardMonths: 0,
};

const RANK_GRADIENTS = [
  { from: "#b45309", to: "#d97706" },
  { from: "#6b7280", to: "#9ca3af" },
  { from: "#d97706", to: "#fbbf24" },
  { from: "#7c3aed", to: "#a78bfa" },
  { from: "#0891b2", to: "#00FF94" },
];

function fmtUsd(n: number) {
  return n % 1 === 0 ? `$${n.toLocaleString("en-US")}` : `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

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
  const [running, setRunning] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [form, setForm] = useState<RankForm | null>(null);
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
    setForm({
      rankNumber: rank.rankNumber,
      name: rank.name,
      selfInvestmentMin: Number(rank.selfInvestmentMin) || 0,
      directBusinessMin: Number(rank.directBusinessMin) || 0,
      teamBusinessMin: Number(rank.teamBusinessMin) || 0,
      legTopPct: rank.legTopPct ?? 40,
      legSecondPct: rank.legSecondPct ?? 30,
      legRestPct: rank.legRestPct ?? 30,
      rewardMonthlyAmount: Number(rank.rewardMonthlyAmount) || 0,
      rewardMonths: rank.rewardMonths ?? 0,
    });
    setEditId(rank.id);
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
        body: JSON.stringify(form),
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

  async function runEngine() {
    setRunning(true);
    try {
      const res = await fetch("/api/admin/ranks/run-engine", { method: "POST", headers: authHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed");
      toast({ title: `Engine ran — ${data.promoted} promoted, ${data.paid} rewards paid` });
    } catch (err: any) {
      toast({ title: err?.message || "Engine failed", variant: "destructive" });
    } finally {
      setRunning(false);
    }
  }

  function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
    return (
      <div className="space-y-1.5">
        <label className="text-xs font-medium" style={{ color: "rgba(176,255,224,0.55)" }}>{label}</label>
        {children}
        {hint && <p className="text-[10px]" style={{ color: "rgba(176,255,224,0.3)" }}>{hint}</p>}
      </div>
    );
  }

  function NumField({ label, hint, value, onChange, step, min }: { label: string; hint?: string; value: number; onChange: (n: number) => void; step?: string; min?: string }) {
    return (
      <Field label={label} hint={hint}>
        <input
          type="number" min={min ?? "0"} step={step ?? "1"}
          value={value}
          onChange={e => onChange(e.target.value === "" ? 0 : parseFloat(e.target.value))}
          className={INPUT_CLS}
          style={INPUT_STYLE}
        />
      </Field>
    );
  }

  const legSum = form ? form.legTopPct + form.legSecondPct + form.legRestPct : 0;

  return (
    <div className="px-4 md:px-6 py-6 max-w-4xl mx-auto pb-24 md:pb-10">
      {/* Header */}
      <header className="mb-6 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
            style={{
              background: "linear-gradient(135deg, rgba(0,255,148,0.2), rgba(0,204,119,0.08))",
              border: "1px solid rgba(0,255,148,0.35)",
              boxShadow: "0 0 20px rgba(0,255,148,0.18)",
            }}
          >
            <Award size={20} style={{ color: TEAL }} />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold" style={{ ...ORBITRON, background: "linear-gradient(135deg,#B0FFE0,#00FF94)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
              Rank Management
            </h1>
            <p className="text-xs mt-0.5" style={{ color: "rgba(176,255,224,0.4)" }}>
              Define ranks, qualification requirements, and monthly rewards
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={runEngine}
            disabled={running}
            className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl font-semibold text-sm transition-all disabled:opacity-50"
            style={{ background: "rgba(52,211,153,0.10)", border: "1px solid rgba(52,211,153,0.3)", color: "rgba(52,211,153,0.95)" }}
            title="Run auto-promotion + pay due rewards now"
          >
            <RefreshCw size={15} className={running ? "animate-spin" : ""} /> Run Engine
          </button>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm transition-all"
            style={{
              background: "linear-gradient(135deg, rgba(0,255,148,0.18), rgba(0,204,119,0.08))",
              border: "1px solid rgba(0,255,148,0.4)",
              color: TEAL,
            }}
          >
            <Plus size={15} /> New Rank
          </button>
        </div>
      </header>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => (
            <div key={i} className="rounded-2xl h-24 animate-pulse" style={{ background: "rgba(0,255,148,0.04)", border: "1px solid rgba(0,255,148,0.08)" }} />
          ))}
        </div>
      ) : ranks.length === 0 ? (
        <div className="rounded-2xl py-16 text-center" style={{ background: "rgba(10,14,30,0.5)", border: "1px dashed rgba(0,255,148,0.15)" }}>
          <Award size={32} className="mx-auto mb-3" style={{ color: "rgba(0,255,148,0.3)" }} />
          <p className="text-sm" style={{ color: "rgba(176,255,224,0.4)" }}>No ranks yet. Create your first one.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {ranks.map((rank, idx) => (
            <div
              key={rank.id}
              className="rounded-2xl p-4 flex items-start gap-4"
              style={{ background: "rgba(10,14,30,0.65)", backdropFilter: "blur(14px)", border: "1px solid rgba(0,255,148,0.10)" }}
            >
              <RankBadge index={idx} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-sm" style={{ color: "rgba(176,255,224,0.9)" }}>{rank.name}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "rgba(0,255,148,0.08)", border: "1px solid rgba(0,255,148,0.18)", color: TEAL }}>
                    Rank #{rank.rankNumber}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-1 mt-2 text-xs" style={{ color: "rgba(176,255,224,0.55)" }}>
                  <span>Self ≥ <strong style={{ color: "rgba(176,255,224,0.85)" }}>{fmtUsd(Number(rank.selfInvestmentMin) || 0)}</strong></span>
                  <span>Direct ≥ <strong style={{ color: "rgba(176,255,224,0.85)" }}>{fmtUsd(Number(rank.directBusinessMin) || 0)}</strong></span>
                  <span>Team ≥ <strong style={{ color: "rgba(176,255,224,0.85)" }}>{fmtUsd(Number(rank.teamBusinessMin) || 0)}</strong></span>
                </div>
                <div className="flex flex-wrap items-center gap-3 mt-2">
                  <span className="text-xs font-semibold" style={{ color: "rgba(52,211,153,0.9)" }}>
                    🎁 {fmtUsd(Number(rank.rewardMonthlyAmount) || 0)}/mo × {rank.rewardMonths} mo = {fmtUsd((Number(rank.rewardMonthlyAmount) || 0) * (rank.rewardMonths || 0))}
                  </span>
                  <span className="text-[11px]" style={{ color: "rgba(176,255,224,0.4)" }}>
                    Legs {rank.legTopPct}/{rank.legSecondPct}/{rank.legRestPct}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => openEdit(rank)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
                  style={{ background: "rgba(0,255,148,0.08)", border: "1px solid rgba(0,255,148,0.18)", color: TEAL }}
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
            style={{ background: "rgba(4,14,28,0.98)", border: "1px solid rgba(0,255,148,0.22)", boxShadow: "0 24px 80px rgba(0,0,0,0.7)" }}
          >
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-base" style={{ ...ORBITRON, color: TEAL }}>
                {editId ? "Edit Rank" : "New Rank"}
              </h2>
              <button onClick={closeForm} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)", color: "rgba(176,255,224,0.6)" }}>
                <X size={14} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <NumField label="Rank Number" value={form.rankNumber} onChange={n => setForm(f => f && ({ ...f, rankNumber: Math.max(1, Math.round(n)) }))} min="1" />
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

            {/* Qualification requirements */}
            <div className="rounded-xl p-4 space-y-4" style={{ background: "rgba(0,255,148,0.04)", border: "1px solid rgba(0,255,148,0.10)" }}>
              <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "rgba(176,255,224,0.4)" }}>Qualification Requirements</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <NumField label="Self Investment ($)" value={form.selfInvestmentMin} onChange={n => setForm(f => f && ({ ...f, selfInvestmentMin: n }))} step="0.01" />
                <NumField label="Direct Business ($)" hint="Sum of directs' own invest" value={form.directBusinessMin} onChange={n => setForm(f => f && ({ ...f, directBusinessMin: n }))} step="0.01" />
                <NumField label="Team Business ($)" hint="Total balanced-leg volume" value={form.teamBusinessMin} onChange={n => setForm(f => f && ({ ...f, teamBusinessMin: n }))} step="0.01" />
              </div>
            </div>

            {/* Balanced leg caps */}
            <div className="rounded-xl p-4 space-y-4" style={{ background: "rgba(0,255,148,0.04)", border: "1px solid rgba(0,255,148,0.10)" }}>
              <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "rgba(176,255,224,0.4)" }}>Balanced Leg Caps (% of team requirement)</p>
              <div className="grid grid-cols-3 gap-3">
                <NumField label="Top Leg %" value={form.legTopPct} onChange={n => setForm(f => f && ({ ...f, legTopPct: Math.round(n) }))} />
                <NumField label="Second Leg %" value={form.legSecondPct} onChange={n => setForm(f => f && ({ ...f, legSecondPct: Math.round(n) }))} />
                <NumField label="Rest Legs %" value={form.legRestPct} onChange={n => setForm(f => f && ({ ...f, legRestPct: Math.round(n) }))} />
              </div>
              <p className="text-[11px]" style={{ color: legSum === 100 ? "rgba(52,211,153,0.8)" : "rgba(251,191,36,0.85)" }}>
                {legSum === 100 ? "✓ Caps total 100%" : `⚠ Caps total ${legSum}% (recommended 100%)`}
              </p>
            </div>

            {/* Reward */}
            <div className="rounded-xl p-4 space-y-4" style={{ background: "rgba(52,211,153,0.04)", border: "1px solid rgba(52,211,153,0.12)" }}>
              <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "rgba(52,211,153,0.55)" }}>Monthly Reward</p>
              <div className="grid grid-cols-2 gap-3">
                <NumField label="Monthly Amount ($)" value={form.rewardMonthlyAmount} onChange={n => setForm(f => f && ({ ...f, rewardMonthlyAmount: n }))} step="0.01" />
                <NumField label="Number of Months" value={form.rewardMonths} onChange={n => setForm(f => f && ({ ...f, rewardMonths: Math.max(0, Math.round(n)) }))} />
              </div>
              <p className="text-[11px]" style={{ color: "rgba(176,255,224,0.45)" }}>
                Total payout: <strong style={{ color: "rgba(52,211,153,0.9)" }}>{fmtUsd(form.rewardMonthlyAmount * form.rewardMonths)}</strong> credited to the Withdraw Wallet over {form.rewardMonths} months.
              </p>
            </div>

            <div className="flex gap-3 pt-1">
              <button
                onClick={closeForm}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(176,255,224,0.6)" }}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.name}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-50"
                style={{
                  background: "linear-gradient(135deg, rgba(0,255,148,0.22), rgba(0,204,119,0.10))",
                  border: "1px solid rgba(0,255,148,0.4)",
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
            <p className="text-xs" style={{ color: "rgba(176,255,224,0.5)" }}>
              This will permanently remove the rank. Users currently at this rank will lose their rank assignment.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteId(null)} className="flex-1 py-2.5 rounded-xl text-sm font-medium" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(176,255,224,0.6)" }}>
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
