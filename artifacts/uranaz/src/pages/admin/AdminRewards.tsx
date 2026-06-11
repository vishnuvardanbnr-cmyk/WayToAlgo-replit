import { useState, useEffect, useCallback } from "react";
import { Gift, Award, CheckCircle, RotateCcw, ChevronDown, ChevronRight, Users, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const TEAL = "#5B8CFF";
const ORBITRON: React.CSSProperties = { fontFamily: "'Sora', sans-serif" };
const GLASS = { background: "rgba(10,14,30,0.65)", backdropFilter: "blur(14px)", border: "1px solid rgba(91,140,255,0.10)" } as const;

function getToken() { return localStorage.getItem("waytoalgo_token"); }
function authHeaders() {
  return { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` };
}

type EligibleUser = {
  id: number; name: string; email: string; phone: string;
  referralCode: string; totalInvested: number; teamBusiness: number;
  rewarded: boolean; rewardedAt: string | null; rewardNote: string | null;
};
type AchieverUser = {
  id: number; name: string; email: string; phone: string;
  referralCode: string; totalInvested: number;
  rewarded: boolean; rewardedAt: string | null; rewardNote: string | null;
};
type OfferGroup = {
  offer: { id: number; title: string; emoji: string; reward: string; endDate: string | null };
  eligible: EligibleUser[];
};
type RankGroup = {
  rank: { id: number; rankNumber: number; name: string; reward: string };
  achievers: AchieverUser[];
};

type Tab = "offers" | "ranks";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function RewardedBadge({ rewardedAt, note }: { rewardedAt: string | null; note: string | null }) {
  return (
    <div className="flex items-center gap-1.5">
      <CheckCircle size={14} style={{ color: "#34d399" }} />
      <span className="text-xs font-semibold" style={{ color: "#34d399" }}>Rewarded</span>
      {rewardedAt && (
        <span className="text-xs" style={{ color: "rgba(194,210,255,0.35)" }}>
          {formatDate(rewardedAt)}
        </span>
      )}
      {note && (
        <span className="text-xs italic" style={{ color: "rgba(194,210,255,0.4)" }}>— {note}</span>
      )}
    </div>
  );
}

function UserRow({
  user,
  onMark,
  onUnmark,
  type,
  referenceId,
  extraInfo,
}: {
  user: EligibleUser | AchieverUser;
  onMark: (userId: number, note: string) => Promise<void>;
  onUnmark: (userId: number) => Promise<void>;
  type: "offer" | "rank";
  referenceId: number;
  extraInfo?: React.ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const [showNote, setShowNote] = useState(false);
  const [note, setNote] = useState("");

  const handleMark = async () => {
    setBusy(true);
    await onMark(user.id, note);
    setBusy(false);
    setShowNote(false);
    setNote("");
  };

  const handleUnmark = async () => {
    setBusy(true);
    await onUnmark(user.id);
    setBusy(false);
  };

  return (
    <div
      className="rounded-xl p-3 transition-all"
      style={{
        background: user.rewarded ? "rgba(52,211,153,0.05)" : "rgba(91,140,255,0.03)",
        border: user.rewarded ? "1px solid rgba(52,211,153,0.18)" : "1px solid rgba(91,140,255,0.08)",
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm" style={{ color: "rgba(194,210,255,0.9)" }}>{user.name}</span>
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "rgba(91,140,255,0.08)", border: "1px solid rgba(91,140,255,0.15)", color: TEAL }}>
              {user.referralCode}
            </span>
          </div>
          <div className="text-xs mt-0.5" style={{ color: "rgba(194,210,255,0.4)" }}>{user.email} · {user.phone}</div>
          {extraInfo}
          {user.rewarded && (
            <div className="mt-1.5">
              <RewardedBadge rewardedAt={user.rewardedAt} note={user.rewardNote} />
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!user.rewarded ? (
            <>
              {showNote ? (
                <div className="flex items-center gap-1.5">
                  <input
                    autoFocus
                    value={note}
                    onChange={e => setNote(e.target.value)}
                    placeholder="Note (optional)"
                    className="text-xs px-2 py-1.5 rounded-lg outline-none"
                    style={{ background: "rgba(3,12,26,0.8)", border: "1px solid rgba(91,140,255,0.2)", color: "rgba(194,210,255,0.9)", width: "140px" }}
                    onKeyDown={e => e.key === "Enter" && handleMark()}
                  />
                  <button
                    onClick={handleMark}
                    disabled={busy}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-60"
                    style={{ background: "rgba(52,211,153,0.15)", border: "1px solid rgba(52,211,153,0.3)", color: "#34d399" }}
                  >
                    {busy ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle size={11} />}
                    Confirm
                  </button>
                  <button
                    onClick={() => { setShowNote(false); setNote(""); }}
                    className="text-xs px-2 py-1.5 rounded-lg"
                    style={{ color: "rgba(194,210,255,0.4)", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowNote(true)}
                  disabled={busy}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-60"
                  style={{ background: "rgba(52,211,153,0.12)", border: "1px solid rgba(52,211,153,0.25)", color: "#34d399" }}
                >
                  <CheckCircle size={12} /> Mark Rewarded
                </button>
              )}
            </>
          ) : (
            <button
              onClick={handleUnmark}
              disabled={busy}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all disabled:opacity-60"
              style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.18)", color: "rgba(248,113,113,0.75)" }}
            >
              {busy ? <Loader2 size={11} className="animate-spin" /> : <RotateCcw size={11} />}
              Undo
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function OfferSection({ group, onRefresh }: { group: OfferGroup; onRefresh: () => void }) {
  const [open, setOpen] = useState(true);
  const { toast } = useToast();
  const rewardedCount = group.eligible.filter(u => u.rewarded).length;

  const mark = useCallback(async (userId: number, type: "offer" | "rank", refId: number, note: string) => {
    const r = await fetch("/api/admin/mark-rewarded", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ userId, type, referenceId: refId, note: note || undefined }),
    });
    if (!r.ok) { toast({ title: "Failed to mark rewarded", variant: "destructive" }); return; }
    toast({ title: "Marked as rewarded!" });
    onRefresh();
  }, [onRefresh, toast]);

  const unmark = useCallback(async (userId: number, type: "offer" | "rank", refId: number) => {
    const r = await fetch("/api/admin/mark-rewarded", {
      method: "DELETE",
      headers: authHeaders(),
      body: JSON.stringify({ userId, type, referenceId: refId }),
    });
    if (!r.ok) { toast({ title: "Failed to undo", variant: "destructive" }); return; }
    toast({ title: "Reward status cleared" });
    onRefresh();
  }, [onRefresh, toast]);

  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(91,140,255,0.12)" }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 p-4 text-left transition-all"
        style={{ background: open ? "rgba(4,16,32,0.97)" : "rgba(10,14,30,0.7)" }}
      >
        <span className="text-2xl">{group.offer.emoji}</span>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-sm" style={{ color: "rgba(194,210,255,0.9)" }}>{group.offer.title}</div>
          <div className="text-xs mt-0.5" style={{ color: "rgba(194,210,255,0.4)" }}>
            🎁 {group.offer.reward}
            {group.offer.endDate && <span className="ml-2">· ends {new Date(group.offer.endDate).toLocaleDateString()}</span>}
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right">
            <div className="text-sm font-bold" style={{ color: TEAL }}>{group.eligible.length}</div>
            <div className="text-xs" style={{ color: "rgba(194,210,255,0.35)" }}>eligible</div>
          </div>
          <div className="text-right">
            <div className="text-sm font-bold" style={{ color: "#34d399" }}>{rewardedCount}</div>
            <div className="text-xs" style={{ color: "rgba(194,210,255,0.35)" }}>rewarded</div>
          </div>
          {open ? <ChevronDown size={16} style={{ color: "rgba(194,210,255,0.4)" }} /> : <ChevronRight size={16} style={{ color: "rgba(194,210,255,0.4)" }} />}
        </div>
      </button>

      {open && (
        <div className="p-4 pt-2 space-y-2" style={{ background: "rgba(3,12,26,0.6)" }}>
          {group.eligible.length === 0 ? (
            <div className="text-center py-6 text-sm" style={{ color: "rgba(194,210,255,0.35)" }}>
              No eligible users yet
            </div>
          ) : (
            group.eligible.map(u => (
              <UserRow
                key={u.id}
                user={u}
                type="offer"
                referenceId={group.offer.id}
                onMark={(uid, note) => mark(uid, "offer", group.offer.id, note)}
                onUnmark={(uid) => unmark(uid, "offer", group.offer.id)}
                extraInfo={
                  <div className="flex items-center gap-3 mt-1 text-xs" style={{ color: "rgba(194,210,255,0.45)" }}>
                    <span>Self: <strong style={{ color: "rgba(194,210,255,0.75)" }}>${u.totalInvested.toFixed(0)}</strong></span>
                    <span>Team: <strong style={{ color: "rgba(194,210,255,0.75)" }}>${u.teamBusiness.toFixed(0)}</strong></span>
                  </div>
                }
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function RankSection({ group, onRefresh }: { group: RankGroup; onRefresh: () => void }) {
  const [open, setOpen] = useState(true);
  const { toast } = useToast();
  const rewardedCount = group.achievers.filter(u => u.rewarded).length;

  const RANK_COLORS = ["#b45309", "#6b7280", "#d97706", "#7c3aed", "#0891b2"];
  const color = RANK_COLORS[(group.rank.rankNumber - 1) % RANK_COLORS.length] ?? RANK_COLORS[0]!;

  const mark = useCallback(async (userId: number, type: "offer" | "rank", refId: number, note: string) => {
    const r = await fetch("/api/admin/mark-rewarded", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ userId, type, referenceId: refId, note: note || undefined }),
    });
    if (!r.ok) { toast({ title: "Failed to mark rewarded", variant: "destructive" }); return; }
    toast({ title: "Marked as rewarded!" });
    onRefresh();
  }, [onRefresh, toast]);

  const unmark = useCallback(async (userId: number, type: "offer" | "rank", refId: number) => {
    const r = await fetch("/api/admin/mark-rewarded", {
      method: "DELETE",
      headers: authHeaders(),
      body: JSON.stringify({ userId, type, referenceId: refId }),
    });
    if (!r.ok) { toast({ title: "Failed to undo", variant: "destructive" }); return; }
    toast({ title: "Reward status cleared" });
    onRefresh();
  }, [onRefresh, toast]);

  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(91,140,255,0.12)" }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 p-4 text-left transition-all"
        style={{ background: open ? "rgba(4,16,32,0.97)" : "rgba(10,14,30,0.7)" }}
      >
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm shrink-0"
          style={{ background: `linear-gradient(135deg, ${color}aa, ${color})`, boxShadow: `0 0 12px ${color}55` }}
        >
          {group.rank.rankNumber}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-sm" style={{ color: "rgba(194,210,255,0.9)" }}>{group.rank.name}</div>
          <div className="text-xs mt-0.5" style={{ color: "rgba(194,210,255,0.4)" }}>🎁 {group.rank.reward}</div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right">
            <div className="text-sm font-bold" style={{ color: TEAL }}>{group.achievers.length}</div>
            <div className="text-xs" style={{ color: "rgba(194,210,255,0.35)" }}>achieved</div>
          </div>
          <div className="text-right">
            <div className="text-sm font-bold" style={{ color: "#34d399" }}>{rewardedCount}</div>
            <div className="text-xs" style={{ color: "rgba(194,210,255,0.35)" }}>rewarded</div>
          </div>
          {open ? <ChevronDown size={16} style={{ color: "rgba(194,210,255,0.4)" }} /> : <ChevronRight size={16} style={{ color: "rgba(194,210,255,0.4)" }} />}
        </div>
      </button>

      {open && (
        <div className="p-4 pt-2 space-y-2" style={{ background: "rgba(3,12,26,0.6)" }}>
          {group.achievers.length === 0 ? (
            <div className="text-center py-6 text-sm" style={{ color: "rgba(194,210,255,0.35)" }}>
              No achievers yet
            </div>
          ) : (
            group.achievers.map(u => (
              <UserRow
                key={u.id}
                user={u}
                type="rank"
                referenceId={group.rank.id}
                onMark={(uid, note) => mark(uid, "rank", group.rank.id, note)}
                onUnmark={(uid) => unmark(uid, "rank", group.rank.id)}
                extraInfo={
                  <div className="flex items-center gap-3 mt-1 text-xs" style={{ color: "rgba(194,210,255,0.45)" }}>
                    <span>Invested: <strong style={{ color: "rgba(194,210,255,0.75)" }}>${u.totalInvested.toFixed(0)}</strong></span>
                  </div>
                }
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default function AdminRewards() {
  const [tab, setTab] = useState<Tab>("offers");
  const [offerGroups, setOfferGroups] = useState<OfferGroup[]>([]);
  const [rankGroups, setRankGroups] = useState<RankGroup[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [oRes, rRes] = await Promise.all([
        fetch("/api/admin/offer-eligible", { headers: authHeaders() }),
        fetch("/api/admin/rank-achievers", { headers: authHeaders() }),
      ]);
      setOfferGroups(await oRes.json());
      setRankGroups(await rRes.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const totalOfferEligible = offerGroups.reduce((s, g) => s + g.eligible.length, 0);
  const totalOfferRewarded = offerGroups.reduce((s, g) => s + g.eligible.filter(u => u.rewarded).length, 0);
  const totalRankAchieved = rankGroups.reduce((s, g) => s + g.achievers.length, 0);
  const totalRankRewarded = rankGroups.reduce((s, g) => s + g.achievers.filter(u => u.rewarded).length, 0);

  return (
    <div className="px-4 md:px-6 py-6 max-w-4xl mx-auto pb-24 md:pb-10">
      <header className="mb-6 flex items-center gap-3">
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
          style={{
            background: "linear-gradient(135deg, rgba(91,140,255,0.2), rgba(61,92,224,0.08))",
            border: "1px solid rgba(91,140,255,0.35)",
            boxShadow: "0 0 20px rgba(91,140,255,0.18)",
          }}
        >
          <Gift size={20} style={{ color: TEAL }} />
        </div>
        <div>
          <h1 className="text-xl md:text-2xl font-bold" style={{ ...ORBITRON, background: "linear-gradient(135deg,#C2D2FF,#5B8CFF)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
            Rewards Hub
          </h1>
          <p className="text-xs mt-0.5" style={{ color: "rgba(194,210,255,0.4)" }}>
            Track offer eligibility and rank achievers · mark physical rewards as given
          </p>
        </div>
      </header>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: "Offer Eligible", value: totalOfferEligible, icon: Gift, color: TEAL },
          { label: "Offer Rewarded", value: totalOfferRewarded, icon: CheckCircle, color: "#34d399" },
          { label: "Rank Achieved", value: totalRankAchieved, icon: Award, color: "#a78bfa" },
          { label: "Rank Rewarded", value: totalRankRewarded, icon: CheckCircle, color: "#34d399" },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="rounded-xl p-3" style={GLASS}>
            <Icon size={16} className="mb-2" style={{ color }} />
            <div className="text-xl font-bold" style={{ color: "rgba(194,210,255,0.9)" }}>{loading ? "—" : value}</div>
            <div className="text-xs mt-0.5" style={{ color: "rgba(194,210,255,0.4)" }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 rounded-xl p-1" style={{ background: "rgba(3,12,26,0.6)", border: "1px solid rgba(91,140,255,0.10)" }}>
        {([
          { id: "offers" as Tab, label: "Offer Eligible", icon: Gift },
          { id: "ranks" as Tab, label: "Rank Achievers", icon: Award },
        ]).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold transition-all"
            style={{
              background: tab === id ? "rgba(91,140,255,0.12)" : "transparent",
              border: tab === id ? "1px solid rgba(91,140,255,0.25)" : "1px solid transparent",
              color: tab === id ? TEAL : "rgba(194,210,255,0.45)",
            }}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="rounded-2xl h-20 animate-pulse" style={{ background: "rgba(91,140,255,0.04)", border: "1px solid rgba(91,140,255,0.08)" }} />
          ))}
        </div>
      ) : tab === "offers" ? (
        <div className="space-y-4">
          {offerGroups.length === 0 ? (
            <div className="rounded-2xl py-16 text-center" style={{ background: "rgba(10,14,30,0.5)", border: "1px dashed rgba(91,140,255,0.15)" }}>
              <Gift size={32} className="mx-auto mb-3" style={{ color: "rgba(91,140,255,0.3)" }} />
              <p className="text-sm" style={{ color: "rgba(194,210,255,0.4)" }}>No active offers. Create offers in the Offers section.</p>
            </div>
          ) : (
            offerGroups.map(g => (
              <OfferSection key={g.offer.id} group={g} onRefresh={load} />
            ))
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {rankGroups.length === 0 ? (
            <div className="rounded-2xl py-16 text-center" style={{ background: "rgba(10,14,30,0.5)", border: "1px dashed rgba(91,140,255,0.15)" }}>
              <Award size={32} className="mx-auto mb-3" style={{ color: "rgba(91,140,255,0.3)" }} />
              <p className="text-sm" style={{ color: "rgba(194,210,255,0.4)" }}>No ranks configured yet. Create ranks in Rank Management.</p>
            </div>
          ) : (
            rankGroups.map(g => (
              <RankSection key={g.rank.id} group={g} onRefresh={load} />
            ))
          )}
        </div>
      )}
    </div>
  );
}
