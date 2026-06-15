import { useState } from "react";
import { useListAdminInvestments } from "@workspace/api-client-react";
import { TrendingUp, Coins, CheckCircle, XCircle, Clock, RefreshCw, Shield } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const TEAL = "#5B8CFF";
const GREEN = "#34d399";
const AMBER = "#fbbf24";
const RED = "#f87171";
const GLASS = { background: "rgba(10,14,30,0.65)", backdropFilter: "blur(14px)", border: "1px solid rgba(91,140,255,0.10)" } as const;

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

type PendingRow = {
  id: number;
  userId: number;
  userName: string;
  userEmail: string;
  walletAddress: string;
  usdtSpent: number;
  createdAt: string;
};

type SettleResult = {
  settled: number;
  failed: number;
  results: {
    id: number;
    userId: number;
    usdtSpent: number;
    status: "settled" | "failed";
    transferTxHash?: string;
    wtaReceived?: string;
    error?: string;
  }[];
};

function usePendingAllocations() {
  const token = localStorage.getItem("waytoalgo_token") ?? "";
  return useQuery<{ rows: PendingRow[]; total: number }>({
    queryKey: ["admin-pending-allocations"],
    queryFn: async () => {
      const r = await fetch("/api/admin/token-allocations/pending", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error("Failed to fetch pending allocations");
      return r.json();
    },
  });
}

function useSettleAllocations() {
  const token = localStorage.getItem("waytoalgo_token") ?? "";
  const qc = useQueryClient();
  return useMutation<SettleResult, Error, { ids?: number[] }>({
    mutationFn: async ({ ids }) => {
      const r = await fetch("/api/admin/token-allocations/settle", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(ids && ids.length > 0 ? { ids } : {}),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.message ?? "Settlement failed");
      return body;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-pending-allocations"] }),
  });
}

function PendingAllocations() {
  const { data, isLoading, refetch } = usePendingAllocations();
  const settle = useSettleAllocations();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [lastResult, setLastResult] = useState<SettleResult | null>(null);
  const rows = data?.rows ?? [];

  function toggleRow(id: number) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === rows.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(rows.map(r => r.id)));
    }
  }

  async function handleSettle(ids?: number[]) {
    setLastResult(null);
    try {
      const result = await settle.mutateAsync({ ids });
      setLastResult(result);
      setSelected(new Set());
    } catch {}
  }

  const totalPendingUsdt = rows.reduce((s, r) => s + r.usdtSpent, 0);
  const selectedUsdt = rows.filter(r => selected.has(r.id)).reduce((s, r) => s + r.usdtSpent, 0);
  const allSelected = rows.length > 0 && selected.size === rows.length;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Coins size={16} style={{ color: GREEN }} />
          <span className="font-semibold text-sm" style={{ color: "rgba(194,210,255,0.85)" }}>
            Pending Token Allocations
          </span>
          {!isLoading && (
            <span
              className="text-xs px-2 py-0.5 rounded-full font-semibold"
              style={{
                background: rows.length > 0 ? "rgba(251,191,36,0.12)" : "rgba(52,211,153,0.10)",
                border: `1px solid ${rows.length > 0 ? "rgba(251,191,36,0.3)" : "rgba(52,211,153,0.22)"}`,
                color: rows.length > 0 ? AMBER : GREEN,
              }}
            >
              {rows.length} pending
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            className="p-1.5 rounded-lg transition-opacity hover:opacity-70"
            style={{ background: "rgba(91,140,255,0.08)", border: "1px solid rgba(91,140,255,0.15)" }}
          >
            <RefreshCw size={13} style={{ color: TEAL }} />
          </button>
          {selected.size > 0 && (
            <button
              onClick={() => handleSettle(Array.from(selected))}
              disabled={settle.isPending}
              className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all disabled:opacity-60"
              style={{
                background: "linear-gradient(135deg, #5B8CFF, #3D5CE0)",
                color: "#fff",
                boxShadow: "0 0 16px rgba(91,140,255,0.25)",
              }}
            >
              {settle.isPending ? "Settling…" : `Settle Selected (${selected.size}) · $${selectedUsdt.toFixed(2)}`}
            </button>
          )}
          {rows.length > 0 && selected.size === 0 && (
            <button
              onClick={() => handleSettle()}
              disabled={settle.isPending}
              className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all disabled:opacity-60"
              style={{
                background: "linear-gradient(135deg, #34d399, #059669)",
                color: "#fff",
                boxShadow: "0 0 16px rgba(52,211,153,0.25)",
              }}
            >
              {settle.isPending ? "Settling…" : `Settle All (${rows.length}) · $${totalPendingUsdt.toFixed(2)}`}
            </button>
          )}
        </div>
      </div>

      {/* Info box */}
      <div
        className="rounded-xl p-3 text-xs"
        style={{ background: "rgba(251,191,36,0.05)", border: "1px solid rgba(251,191,36,0.15)", color: "rgba(194,210,255,0.55)" }}
      >
        <strong style={{ color: AMBER }}>How it works:</strong> Each settlement buys WTA tokens on-chain and transfers them directly to the user's BSC wallet. The 5-level referral chain + admin cut are resolved automatically by the contract. Deposit enough USDT into the withdraw wallet first.
      </div>

      {/* Error from settle */}
      {settle.error && (
        <div className="rounded-xl p-3 text-xs" style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)", color: RED }}>
          {settle.error.message}
        </div>
      )}

      {/* Settlement result */}
      {lastResult && (
        <div
          className="rounded-xl p-3 space-y-2"
          style={{ background: "rgba(10,14,30,0.8)", border: "1px solid rgba(91,140,255,0.15)" }}
        >
          <div className="flex items-center gap-4 text-sm font-semibold">
            <span style={{ color: GREEN }}>✓ {lastResult.settled} settled</span>
            {lastResult.failed > 0 && <span style={{ color: RED }}>✗ {lastResult.failed} failed</span>}
          </div>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {lastResult.results.map(r => (
              <div key={r.id} className="flex items-start gap-2 text-xs">
                {r.status === "settled"
                  ? <CheckCircle size={12} style={{ color: GREEN, flexShrink: 0, marginTop: 1 }} />
                  : <XCircle size={12} style={{ color: RED, flexShrink: 0, marginTop: 1 }} />
                }
                <span style={{ color: r.status === "settled" ? "rgba(194,210,255,0.7)" : RED }}>
                  User #{r.userId} · ${r.usdtSpent.toFixed(2)} USDT
                  {r.status === "settled" && r.wtaReceived && ` → ${parseFloat(r.wtaReceived).toFixed(4)} WTA`}
                  {r.status === "settled" && r.transferTxHash && (
                    <a
                      href={`https://bscscan.com/tx/${r.transferTxHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-1 underline"
                      style={{ color: TEAL }}
                    >
                      BSCScan ↗
                    </a>
                  )}
                  {r.status === "failed" && r.error && ` — ${r.error}`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pending rows */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2].map(i => <div key={i} className="rounded-xl h-16 animate-pulse" style={{ background: "rgba(91,140,255,0.04)" }} />)}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl p-5 text-center" style={{ background: "rgba(52,211,153,0.04)", border: "1px solid rgba(52,211,153,0.10)" }}>
          <CheckCircle size={24} className="mx-auto mb-1.5" style={{ color: "rgba(52,211,153,0.4)" }} />
          <p className="text-xs" style={{ color: "rgba(194,210,255,0.4)" }}>No pending allocations — all tokens settled</p>
        </div>
      ) : (
        <>
          {/* Select all row */}
          <div
            className="flex items-center gap-2 px-1 py-1 cursor-pointer select-none"
            onClick={toggleAll}
          >
            <div
              className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0"
              style={{
                background: allSelected ? TEAL : "rgba(91,140,255,0.08)",
                border: `1px solid ${allSelected ? TEAL : "rgba(91,140,255,0.25)"}`,
              }}
            >
              {allSelected && <CheckCircle size={10} style={{ color: "#fff" }} />}
            </div>
            <span className="text-xs" style={{ color: "rgba(194,210,255,0.45)" }}>
              {allSelected ? "Deselect all" : `Select all ${rows.length}`}
            </span>
          </div>

          <div className="space-y-2">
            {rows.map(row => {
              const isSelected = selected.has(row.id);
              const hasWallet = /^0x[0-9a-fA-F]{40}$/.test(row.walletAddress);
              return (
                <div
                  key={row.id}
                  className="rounded-xl p-3 flex items-center gap-3 cursor-pointer transition-all"
                  style={{
                    background: isSelected ? "rgba(91,140,255,0.08)" : "rgba(251,191,36,0.04)",
                    border: `1px solid ${isSelected ? "rgba(91,140,255,0.25)" : "rgba(251,191,36,0.12)"}`,
                  }}
                  onClick={() => toggleRow(row.id)}
                >
                  {/* Checkbox */}
                  <div
                    className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0"
                    style={{
                      background: isSelected ? TEAL : "rgba(91,140,255,0.08)",
                      border: `1px solid ${isSelected ? TEAL : "rgba(91,140,255,0.25)"}`,
                    }}
                  >
                    {isSelected && <CheckCircle size={10} style={{ color: "#fff" }} />}
                  </div>

                  {/* User info */}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate" style={{ color: "rgba(194,210,255,0.85)" }}>{row.userName}</div>
                    <div className="text-xs truncate" style={{ color: "rgba(194,210,255,0.4)" }}>{row.userEmail}</div>
                    <div className="text-xs mt-0.5 font-mono" style={{ color: hasWallet ? "rgba(194,210,255,0.3)" : RED }}>
                      {hasWallet
                        ? `${row.walletAddress.slice(0, 8)}…${row.walletAddress.slice(-6)}`
                        : "⚠ No wallet address"}
                    </div>
                  </div>

                  {/* Amount + status */}
                  <div className="text-right flex-shrink-0">
                    <div className="font-bold text-sm" style={{ color: GREEN }}>${row.usdtSpent.toFixed(2)}</div>
                    <div className="flex items-center gap-1 justify-end mt-0.5">
                      <Clock size={10} style={{ color: AMBER }} />
                      <span className="text-xs" style={{ color: AMBER }}>pending</span>
                    </div>
                    <div className="text-xs mt-0.5" style={{ color: "rgba(194,210,255,0.3)" }}>{formatDate(row.createdAt)}</div>
                  </div>

                  {/* Individual settle button */}
                  <button
                    className="ml-1 px-2.5 py-1.5 rounded-lg text-xs font-bold flex-shrink-0 transition-all disabled:opacity-50"
                    style={{
                      background: "linear-gradient(135deg, #34d399, #059669)",
                      color: "#fff",
                    }}
                    disabled={settle.isPending || !hasWallet}
                    onClick={e => { e.stopPropagation(); handleSettle([row.id]); }}
                    title={hasWallet ? "Settle this user only" : "User has no wallet address"}
                  >
                    Settle
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

export default function AdminInvestments() {
  const { data, isLoading } = useListAdminInvestments();
  const investments = data?.investments ?? [];

  const totalInvested = investments.reduce((s, i) => s + i.amount, 0);
  const activeCount = investments.filter(i => i.status === "active").length;
  const safeCount = investments.filter(i => (i as any).investmentType === "safe").length;

  return (
    <div className="px-4 py-6 max-w-4xl mx-auto space-y-6 pb-24 md:pb-8">
      <div className="flex items-center gap-3">
        <h1
          className="text-xl font-bold"
          style={{
            fontFamily: "'Sora', sans-serif",
            background: "linear-gradient(135deg, #C2D2FF, #5B8CFF)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}
        >
          All Investments
        </h1>
        <span
          className="text-xs px-2.5 py-1 rounded-full font-semibold"
          style={{ background: "rgba(91,140,255,0.10)", border: "1px solid rgba(91,140,255,0.2)", color: TEAL }}
        >
          {data?.total ?? 0}
        </span>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Total Invested", value: `$${totalInvested.toFixed(0)}`, color: TEAL },
          { label: "Active",         value: activeCount,                    color: GREEN },
          { label: "Safe Invest",    value: safeCount,                      color: AMBER },
          { label: "Completed",      value: investments.filter(i => i.status !== "active").length, color: "rgba(194,210,255,0.45)" },
        ].map(item => (
          <div key={item.label} className="rounded-xl p-4 text-center" style={GLASS}>
            <div className="font-bold text-lg" style={{ color: item.color }}>{item.value}</div>
            <div className="text-xs mt-0.5" style={{ color: "rgba(194,210,255,0.35)" }}>{item.label}</div>
          </div>
        ))}
      </div>

      {/* Pending Token Allocations */}
      <div className="rounded-2xl p-4" style={GLASS}>
        <PendingAllocations />
      </div>

      {/* Investment list */}
      {isLoading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => (
            <div key={i} className="rounded-xl h-24 animate-pulse" style={{ background: "rgba(91,140,255,0.04)", border: "1px solid rgba(91,140,255,0.08)" }} />
          ))}
        </div>
      ) : !investments.length ? (
        <div className="rounded-xl p-8 text-center" style={GLASS}>
          <TrendingUp size={32} className="mx-auto mb-2" style={{ color: "rgba(194,210,255,0.2)" }} />
          <p className="text-sm" style={{ color: "rgba(194,210,255,0.35)" }}>No investments yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {investments.map(inv => (
            <div key={inv.id} data-testid={`row-investment-${inv.id}`} className="rounded-xl p-4" style={GLASS}>
              <div className="flex items-center justify-between mb-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm" style={{ color: "rgba(194,210,255,0.85)" }}>{(inv as any).userName ?? `User #${inv.userId}`}</span>
                    {(inv as any).investmentType === "safe" && (
                      <span className="text-xs px-1.5 py-0.5 rounded font-semibold flex items-center gap-1" style={{ background: "rgba(52,211,153,0.10)", border: "1px solid rgba(52,211,153,0.22)", color: GREEN }}>
                        <Shield size={9} /> Safe
                      </span>
                    )}
                  </div>
                  <div className="text-xs capitalize" style={{ color: "rgba(194,210,255,0.4)" }}>
                    {inv.planTier.replace("tier", "Tier ")}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-bold" style={{ color: TEAL }}>${inv.amount.toFixed(2)}</div>
                  <span
                    className="text-xs px-2 py-0.5 rounded-full font-medium"
                    style={inv.status === "active" ? {
                      background: "rgba(52,211,153,0.10)",
                      border: "1px solid rgba(52,211,153,0.22)",
                      color: GREEN,
                    } : {
                      background: "rgba(194,210,255,0.05)",
                      border: "1px solid rgba(194,210,255,0.10)",
                      color: "rgba(194,210,255,0.4)",
                    }}
                  >
                    {inv.status}
                  </span>
                </div>
              </div>
              <div
                className="grid grid-cols-4 gap-2 pt-2 text-center"
                style={{ borderTop: "1px solid rgba(91,140,255,0.07)" }}
              >
                {[
                  { label: "Daily",    value: `${(inv.dailyRate * 100).toFixed(1)}%` },
                  { label: "Duration", value: `${inv.durationDays}d` },
                  { label: "Earned",   value: `$${inv.earnedSoFar.toFixed(2)}` },
                  { label: "Started",  value: formatDate(inv.startDate) },
                ].map(item => (
                  <div key={item.label}>
                    <div className="text-xs font-semibold" style={{ color: "rgba(194,210,255,0.75)" }}>{item.value}</div>
                    <div className="text-xs" style={{ color: "rgba(194,210,255,0.35)" }}>{item.label}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
