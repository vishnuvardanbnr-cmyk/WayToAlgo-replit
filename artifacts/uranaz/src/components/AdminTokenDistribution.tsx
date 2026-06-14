import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  Coins, RefreshCw, ShieldAlert, CheckCircle2, XCircle, Users, ArrowRight,
  ExternalLink, TrendingUp, Wallet, AlertTriangle, Loader2, ChevronDown, Calendar, Clock,
} from "lucide-react";

const TEAL = "#5B8CFF";
const GREEN = "rgb(52,211,153)";
const RED = "rgb(248,113,113)";
const AMBER = "rgb(251,191,36)";

const INPUT_CLS = "w-full rounded-xl px-3 py-2.5 text-sm outline-none transition-all";
const INPUT_STYLE = {
  background: "rgba(10,14,30,0.6)",
  border: "1px solid rgba(91,140,255,0.18)",
  color: "rgba(200,240,255,0.95)",
} as const;

function getToken() {
  return localStorage.getItem("waytoalgo_token") || "";
}
function authHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${getToken()}` };
}

type Mode = "buy" | "held";

interface TokenStatus {
  configured: boolean;
  contractAddress?: string;
  walletConfigured?: boolean;
  buyPrice?: string;
  sellPrice?: string;
  walletAddress?: string;
  walletTokenBalance?: string;
  walletUsdtBalance?: string;
  priceError?: string;
  balanceError?: string;
}

interface Preview {
  success: boolean;
  configured: boolean;
  error?: string;
  eligibleInvestments: number;
  eligibleInvestors: number;
  totalRoiPrincipalUsd: number;
  coolingHours: number;
  dailyRoiRate: number;
  expectedDailyUsd: number;
  buyPrice?: string;
  sellPrice?: string;
  walletTokenBalance?: string;
  walletUsdtBalance?: string;
  profitUsdt?: number;
  estTokens?: string;
  estInvestorTokens?: string;
  estLevelTokens?: string;
  estReserveTokens?: string;
  recipientCount?: number;
  sufficientUsdt?: boolean;
  sufficientTokens?: boolean;
}

interface Batch {
  id: number;
  usdtSpent: number;
  expectedUsdt: number;
  source: "buy" | "held";
  tokensBought: string;
  buyPrice: string;
  buyTxHash: string | null;
  recipientCount: number;
  roiTokenTotal: string;
  levelTokenTotal: string;
  status: string;
  note: string | null;
  createdAt: string;
}

function fmt(n: number | string | undefined, dp = 4): string {
  const v = typeof n === "string" ? parseFloat(n) : n;
  if (v === undefined || !Number.isFinite(v)) return "—";
  return v.toLocaleString(undefined, { maximumFractionDigits: dp });
}

/** Local YYYY-MM-DD key (sorts chronologically as a string). */
function dayKeyOf(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function dayLabel(key: string): string {
  return new Date(`${key}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "short", year: "numeric", month: "short", day: "numeric",
  });
}

/** Admin ROI token distribution — organised date-wise. Each day shows what was
 *  distributed; today shows a "Pending" entry that expands into the buy/held +
 *  amount + submit form. */
export default function AdminTokenDistribution() {
  const [status, setStatus] = useState<TokenStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);

  const [mode, setMode] = useState<Mode>("buy");
  const [amount, setAmount] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [confirming, setConfirming] = useState(false);
  const [distributing, setDistributing] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const [batches, setBatches] = useState<Batch[]>([]);

  const todayKey = dayKeyOf(new Date());
  const [openDay, setOpenDay] = useState<string>(todayKey);

  const loadStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const r = await fetch("/api/admin/token/status", { headers: authHeaders() });
      setStatus(await r.json());
    } catch {
      setStatus(null);
    } finally {
      setStatusLoading(false);
    }
  }, []);

  const loadBatches = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/token/batches", { headers: authHeaders() });
      if (r.ok) setBatches(await r.json());
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    loadStatus();
    loadBatches();
  }, [loadStatus, loadBatches]);

  // Debounced preview whenever amount/mode change.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setPreviewLoading(true);
      try {
        const amt = parseFloat(amount);
        const q = new URLSearchParams({
          profitUsdt: Number.isFinite(amt) && amt > 0 ? String(amt) : "0",
          mode,
        });
        const r = await fetch(`/api/admin/token/preview?${q}`, { headers: authHeaders() });
        setPreview(await r.json());
      } catch {
        setPreview(null);
      } finally {
        setPreviewLoading(false);
      }
    }, 450);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [amount, mode]);

  const amt = parseFloat(amount);
  const amtValid = Number.isFinite(amt) && amt > 0;

  const insufficient =
    amtValid && preview
      ? mode === "buy"
        ? preview.sufficientUsdt === false
        : preview.sufficientTokens === false
      : false;

  const noEligible = preview ? preview.eligibleInvestments === 0 : false;
  const configured = status?.configured && status?.walletConfigured;

  // Never let the admin distribute without a valid, up-to-date preview that
  // reflects the exact amount currently entered.
  const previewReady =
    !!preview &&
    preview.success &&
    preview.profitUsdt != null &&
    Math.abs(preview.profitUsdt - amt) < 1e-9 &&
    !!preview.estTokens;

  // Flat daily ROI minimum: admin may distribute the same or more, never less.
  const requiredUsd = preview?.expectedDailyUsd ?? 0;
  const belowMinimum = amtValid && requiredUsd > 0 && amt + 1e-6 < requiredUsd;

  const canDistribute =
    amtValid && !!configured && !noEligible && !insufficient && !belowMinimum &&
    !previewLoading && !distributing && previewReady;

  const doDistribute = async () => {
    setDistributing(true);
    setResult(null);
    try {
      const r = await fetch("/api/admin/token/distribute", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ profitUsdt: amt, mode }),
      });
      const data = await r.json();
      if (r.ok && data.success) {
        setResult({
          ok: true,
          text: `Distributed ${fmt(data.tokensBought)} WTA to ${data.recipientCount} user(s) across ${data.eligibleInvestments} investment(s).`,
        });
        setAmount("");
        setConfirming(false);
        loadStatus();
        loadBatches();
      } else {
        setResult({ ok: false, text: data.error || data.message || "Distribution failed" });
        setConfirming(false);
      }
    } catch (e: any) {
      setResult({ ok: false, text: e?.message || "Network error" });
      setConfirming(false);
    } finally {
      setDistributing(false);
    }
  };

  // ── Group distributions by calendar day ──
  const dayGroups = useMemo(() => {
    const m = new Map<string, Batch[]>();
    for (const b of batches) {
      const k = dayKeyOf(new Date(b.createdAt));
      const arr = m.get(k) ?? [];
      arr.push(b);
      m.set(k, arr);
    }
    return m;
  }, [batches]);

  const dayKeys = useMemo(() => {
    const keys = new Set<string>([todayKey, ...dayGroups.keys()]);
    return Array.from(keys).sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
  }, [dayGroups, todayKey]);

  const StatChip = ({ label, value, sub, color = TEAL }: { label: string; value: string; sub?: string; color?: string }) => (
    <div className="rounded-xl p-3.5" style={{ background: "rgba(91,140,255,0.04)", border: "1px solid rgba(91,140,255,0.12)" }}>
      <div className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: "rgba(194,210,255,0.5)" }}>{label}</div>
      <div className="text-xl font-black leading-tight" style={{ color }}>{value}</div>
      {sub && <div className="text-[11px] mt-0.5" style={{ color: "rgba(194,210,255,0.4)" }}>{sub}</div>}
    </div>
  );

  const SourceChip = ({ source }: { source: "buy" | "held" }) => (
    <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold" style={{
      background: source === "held" ? "rgba(192,132,252,0.12)" : "rgba(91,140,255,0.12)",
      color: source === "held" ? "#c084fc" : TEAL,
    }}>{source === "held" ? "HELD" : "BUY"}</span>
  );

  // ── The distribution form (mode + amount + preview + submit). Rendered inside
  //    the expanded "today" row. Defined as a render helper (called directly, not
  //    as a JSX component) so the amount input keeps focus across re-renders. ──
  const renderDistributionForm = () => (
    <div className="space-y-5">
      {/* Mode toggle */}
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] mb-2" style={{ color: "rgba(194,210,255,0.55)" }}>Distribution Source</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {([
            { key: "buy" as Mode, icon: TrendingUp, title: "Buy New Tokens", desc: "Spend USDT from the withdraw wallet to buy WTA on-chain, then distribute." },
            { key: "held" as Mode, icon: Wallet, title: "Distribute Held Tokens", desc: "Use WTA you've already sent to the withdraw wallet. No buy — assigns virtually." },
          ]).map(({ key, icon: Icon, title, desc }) => {
            const active = mode === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => { setMode(key); setResult(null); setConfirming(false); }}
                className="text-left rounded-xl p-4 transition-all"
                style={{
                  background: active ? "rgba(91,140,255,0.10)" : "rgba(10,14,30,0.5)",
                  border: active ? `1px solid ${TEAL}` : "1px solid rgba(91,140,255,0.14)",
                }}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <Icon size={15} style={{ color: active ? TEAL : "rgba(194,210,255,0.6)" }} />
                  <span className="text-sm font-bold" style={{ color: active ? "rgba(200,240,255,0.95)" : "rgba(194,210,255,0.7)" }}>{title}</span>
                  {active && <CheckCircle2 size={13} style={{ color: TEAL }} className="ml-auto" />}
                </div>
                <div className="text-xs leading-relaxed" style={{ color: "rgba(194,210,255,0.45)" }}>{desc}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Amount */}
      <div>
        <label className="text-xs font-medium block mb-1.5" style={{ color: "rgba(194,210,255,0.6)" }}>
          ROI value to distribute (USDT)
        </label>
        <div className="relative max-w-xs">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: "rgba(194,210,255,0.5)" }}>$</span>
          <input
            type="number" min="0" step="0.01" placeholder="0.00"
            value={amount}
            onChange={(e) => { setAmount(e.target.value); setResult(null); setConfirming(false); }}
            className={INPUT_CLS + " pl-7"}
            style={INPUT_STYLE}
          />
        </div>
        <p className="text-xs mt-1" style={{ color: "rgba(194,210,255,0.35)" }}>
          Converted to a WTA quantity at the current buy price. {mode === "buy" ? "This USDT is spent buying tokens on-chain." : "Tokens are taken from those you've sent to the withdraw wallet."}
        </p>
        {requiredUsd > 0 && (
          <div className="mt-3 rounded-xl p-3" style={{
            background: belowMinimum ? "rgba(248,113,113,0.06)" : "rgba(91,140,255,0.05)",
            border: `1px solid ${belowMinimum ? "rgba(248,113,113,0.25)" : "rgba(91,140,255,0.15)"}`,
          }}>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "rgba(194,210,255,0.5)" }}>Required today (minimum)</div>
                <div className="text-lg font-black" style={{ color: belowMinimum ? RED : TEAL }}>${fmt(requiredUsd, 2)}</div>
                <div className="text-[11px] mt-0.5" style={{ color: "rgba(194,210,255,0.4)" }}>
                  eligible principal ${fmt(preview?.totalRoiPrincipalUsd, 2)} × {fmt((preview?.dailyRoiRate ?? 0) * 100, 3)}%/day — you may distribute more, never less.
                </div>
              </div>
              <button
                type="button"
                onClick={() => { setAmount((Math.ceil(requiredUsd * 100) / 100).toFixed(2)); setResult(null); setConfirming(false); }}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg shrink-0"
                style={{ color: TEAL, background: "rgba(91,140,255,0.12)" }}
              >
                Use minimum
              </button>
            </div>
            {belowMinimum && (
              <div className="mt-2 flex gap-1.5 text-[11px]" style={{ color: "rgba(248,113,113,0.9)" }}>
                <AlertTriangle size={13} className="shrink-0 mt-0.5" /> Amount is below the required daily minimum — enter at least ${fmt(requiredUsd, 2)}.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Preview */}
      <div className="rounded-2xl p-4" style={{ background: "rgba(10,14,30,0.45)", border: "1px solid rgba(91,140,255,0.14)" }}>
        <div className="flex items-center gap-2 mb-3">
          <Users size={14} style={{ color: TEAL }} />
          <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "rgba(194,210,255,0.7)" }}>Preview — who gets paid</span>
          {previewLoading && <Loader2 size={13} className="animate-spin ml-1" style={{ color: TEAL }} />}
        </div>

        <p className="text-xs mb-3 leading-relaxed" style={{ color: "rgba(194,210,255,0.45)" }}>
          Only investments past the {preview?.coolingHours ?? 24}h cooling window are eligible — so today's run pays the previous day's accrued ROI.
        </p>

        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          <StatChip label="Eligible Users" value={fmt(preview?.eligibleInvestors, 0)} sub={`${fmt(preview?.eligibleInvestments, 0)} investment(s)`} />
          <StatChip label="Total ROI Principal" value={`$${fmt(preview?.totalRoiPrincipalUsd, 2)}`} sub="eligible base" />
          <StatChip label="Recipients (incl. uplines)" value={fmt(preview?.recipientCount, 0)} sub="users credited" />
        </div>

        {amtValid && preview?.estTokens && (
          <div className="mt-3 grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatChip label="Tokens Distributed" value={`${fmt(preview.estTokens)} WTA`} color="#c084fc" />
            <StatChip label="Investor Share" value={`${fmt(preview.estInvestorTokens)} WTA`} sub="Trading Profit" color={GREEN} />
            <StatChip label="Level Pool" value={`${fmt(preview.estLevelTokens)} WTA`} sub="Team Benefit" />
            <StatChip label="To Reserve" value={`${fmt(preview.estReserveTokens)} WTA`} sub="unclaimed levels" color={AMBER} />
          </div>
        )}

        {amtValid && noEligible && (
          <div className="mt-3 flex gap-2 p-3 rounded-xl text-xs" style={{ background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.2)", color: "rgba(251,191,36,0.85)" }}>
            <AlertTriangle size={14} className="shrink-0 mt-0.5" /> No eligible investments right now — nothing would be distributed.
          </div>
        )}
        {amtValid && insufficient && mode === "buy" && (
          <div className="mt-3 flex gap-2 p-3 rounded-xl text-xs" style={{ background: "rgba(248,113,113,0.07)", border: "1px solid rgba(248,113,113,0.22)", color: "rgba(248,113,113,0.9)" }}>
            <XCircle size={14} className="shrink-0 mt-0.5" /> Withdraw wallet has only ${fmt(preview?.walletUsdtBalance, 2)} USDT — not enough to buy ${fmt(amt, 2)}.
          </div>
        )}
        {amtValid && insufficient && mode === "held" && (
          <div className="mt-3 flex gap-2 p-3 rounded-xl text-xs" style={{ background: "rgba(248,113,113,0.07)", border: "1px solid rgba(248,113,113,0.22)", color: "rgba(248,113,113,0.9)" }}>
            <XCircle size={14} className="shrink-0 mt-0.5" /> Withdraw wallet holds only {fmt(preview?.walletTokenBalance)} WTA — send more tokens before distributing {fmt(preview?.estTokens)} WTA.
          </div>
        )}
      </div>

      {/* Result + action */}
      {result && (
        <div className="flex gap-2 p-3.5 rounded-xl text-xs" style={{
          background: result.ok ? "rgba(52,211,153,0.07)" : "rgba(248,113,113,0.07)",
          border: `1px solid ${result.ok ? "rgba(52,211,153,0.25)" : "rgba(248,113,113,0.25)"}`,
          color: result.ok ? GREEN : RED,
        }}>
          {result.ok ? <CheckCircle2 size={15} className="shrink-0 mt-0.5" /> : <XCircle size={15} className="shrink-0 mt-0.5" />}
          <span className="leading-relaxed">{result.text}</span>
        </div>
      )}

      {!confirming ? (
        <button
          type="button"
          disabled={!canDistribute}
          onClick={() => setConfirming(true)}
          className="w-full sm:w-auto sm:px-8 py-3 rounded-xl font-bold transition-all disabled:opacity-40 inline-flex items-center justify-center gap-2"
          style={{ background: `linear-gradient(135deg, ${TEAL}, #3D5CE0)`, color: "#fff" }}
        >
          <Coins size={16} />
          {mode === "buy" ? "Buy & Distribute" : "Distribute Held Tokens"}
        </button>
      ) : (
        <div className="rounded-xl p-4" style={{ background: "rgba(91,140,255,0.06)", border: `1px solid ${TEAL}55` }}>
          <div className="text-sm font-semibold mb-1" style={{ color: "rgba(200,240,255,0.95)" }}>Confirm distribution</div>
          <div className="text-xs mb-3 leading-relaxed" style={{ color: "rgba(194,210,255,0.6)" }}>
            {mode === "buy"
              ? <>Spend <strong>${fmt(amt, 2)}</strong> buying WTA on-chain and distribute to <strong>{fmt(preview?.recipientCount, 0)}</strong> user(s) across <strong>{fmt(preview?.eligibleInvestments, 0)}</strong> investment(s). This advances each eligible investment by one day.</>
              : <>Distribute <strong>{fmt(preview?.estTokens)} WTA</strong> (${fmt(amt, 2)} worth) from the withdraw wallet to <strong>{fmt(preview?.recipientCount, 0)}</strong> user(s) across <strong>{fmt(preview?.eligibleInvestments, 0)}</strong> investment(s). This advances each eligible investment by one day.</>}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={distributing}
              onClick={doDistribute}
              className="px-5 py-2.5 rounded-xl font-bold text-sm transition-all disabled:opacity-50 inline-flex items-center gap-2"
              style={{ background: `linear-gradient(135deg, ${TEAL}, #3D5CE0)`, color: "#fff" }}
            >
              {distributing ? <><Loader2 size={14} className="animate-spin" /> Processing…</> : <><ArrowRight size={14} /> Confirm & Distribute</>}
            </button>
            <button
              type="button"
              disabled={distributing}
              onClick={() => setConfirming(false)}
              className="px-5 py-2.5 rounded-xl font-medium text-sm transition-all disabled:opacity-50"
              style={{ background: "rgba(10,14,30,0.6)", border: "1px solid rgba(91,140,255,0.18)", color: "rgba(194,210,255,0.7)" }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );

  // ── A single completed/failed distribution's detail card (render helper) ──
  const renderBatchCard = (b: Batch) => (
    <div key={b.id} className="rounded-xl p-3.5" style={{ background: "rgba(10,14,30,0.5)", border: "1px solid rgba(91,140,255,0.12)" }}>
      <div className="flex items-center gap-2 flex-wrap">
        <SourceChip source={b.source} />
        <span className="text-sm font-bold" style={{ color: "rgba(200,240,255,0.95)" }}>${fmt(b.usdtSpent, 2)}</span>
        <span className="text-xs" style={{ color: "rgba(194,210,255,0.5)" }}>{fmt(b.tokensBought)} WTA</span>
        {b.status === "completed" && b.expectedUsdt > 0 && b.usdtSpent - b.expectedUsdt > 0.01 && (
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md" style={{ color: AMBER, background: "rgba(251,191,36,0.12)" }}>
            +${fmt(b.usdtSpent - b.expectedUsdt, 2)} extra
          </span>
        )}
        <span className="ml-auto inline-flex items-center gap-1 text-[11px]" style={{ color: "rgba(194,210,255,0.4)" }}>
          <Clock size={11} />{new Date(b.createdAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
        </span>
        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md" style={{
          color: b.status === "completed" ? GREEN : b.status === "failed" ? RED : AMBER,
          background: b.status === "completed" ? "rgba(52,211,153,0.1)" : b.status === "failed" ? "rgba(248,113,113,0.1)" : "rgba(251,191,36,0.1)",
        }}>{b.status}</span>
        {b.buyTxHash && (
          <a href={`https://bscscan.com/tx/${b.buyTxHash}`} target="_blank" rel="noreferrer" style={{ color: TEAL }}>
            <ExternalLink size={13} />
          </a>
        )}
      </div>
      <div className="mt-2.5 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
        <div><span style={{ color: "rgba(194,210,255,0.4)" }}>Recipients </span><span style={{ color: "rgba(200,240,255,0.85)" }}>{b.recipientCount}</span></div>
        <div><span style={{ color: "rgba(194,210,255,0.4)" }}>Investor </span><span style={{ color: GREEN }}>{fmt(b.roiTokenTotal)} WTA</span></div>
        <div><span style={{ color: "rgba(194,210,255,0.4)" }}>Levels </span><span style={{ color: TEAL }}>{fmt(b.levelTokenTotal)} WTA</span></div>
        <div><span style={{ color: "rgba(194,210,255,0.4)" }}>Price </span><span style={{ color: "rgba(200,240,255,0.85)" }}>${fmt(b.buyPrice, 6)}</span></div>
      </div>
      {b.status === "completed" && b.expectedUsdt > 0 && b.usdtSpent - b.expectedUsdt > 0.01 && (
        <div className="mt-2 text-[11px]" style={{ color: "rgba(251,191,36,0.8)" }}>
          Flat-rate minimum was ${fmt(b.expectedUsdt, 2)} — ${fmt(b.usdtSpent - b.expectedUsdt, 2)} extra distributed beyond the daily ROI.
        </div>
      )}
      {b.note && <div className="mt-2 text-[11px]" style={{ color: "rgba(248,113,113,0.7)" }}>{b.note}</div>}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* ── Live status ── */}
      <div className="flex items-center justify-between">
        <div className="text-xs" style={{ color: "rgba(194,210,255,0.5)" }}>
          {status?.contractAddress ? (
            <span className="font-mono">Contract {status.contractAddress.slice(0, 8)}…{status.contractAddress.slice(-6)}</span>
          ) : "Token contract not configured"}
        </div>
        <button
          type="button"
          onClick={() => { loadStatus(); loadBatches(); }}
          className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg transition-colors"
          style={{ color: TEAL, background: "rgba(91,140,255,0.08)" }}
        >
          <RefreshCw size={12} className={statusLoading ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

      {!configured && !statusLoading && (
        <div className="flex gap-3 p-3.5 rounded-xl" style={{ background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.20)" }}>
          <ShieldAlert size={16} className="shrink-0 mt-0.5" style={{ color: AMBER }} />
          <div className="text-xs leading-relaxed" style={{ color: "rgba(251,191,36,0.85)" }}>
            Configure the <strong>token contract address</strong> and the <strong>withdraw + gas wallet</strong> keys before distributing.
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatChip label="Buy Price" value={status?.buyPrice ? `$${fmt(status.buyPrice, 6)}` : "—"} sub="USDT / WTA" />
        <StatChip label="Sell Price" value={status?.sellPrice ? `$${fmt(status.sellPrice, 6)}` : "—"} sub="USDT / WTA" />
        <StatChip label="Withdraw Wallet — Tokens" value={`${fmt(status?.walletTokenBalance)} WTA`} sub="available to distribute" color="#c084fc" />
        <StatChip label="Withdraw Wallet — USDT" value={`$${fmt(status?.walletUsdtBalance, 2)}`} sub="available to buy" color={GREEN} />
      </div>

      {/* ── Date-wise distribution ledger ── */}
      <div>
        <div className="flex items-center gap-2 mb-3 pt-2" style={{ borderTop: "1px solid rgba(91,140,255,0.1)" }}>
          <Calendar size={14} style={{ color: TEAL }} />
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: "rgba(194,210,255,0.55)" }}>Daily Distributions</span>
        </div>

        <div className="space-y-2.5">
          {dayKeys.map((key) => {
            const dayBatches = (dayGroups.get(key) ?? []).slice().sort(
              (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
            );
            const completed = dayBatches.filter((b) => b.status === "completed");
            const totalUsdt = completed.reduce((s, b) => s + b.usdtSpent, 0);
            const totalRecipients = completed.reduce((s, b) => s + b.recipientCount, 0);
            const totalExtra = completed.reduce((s, b) => s + Math.max(0, b.usdtSpent - (b.expectedUsdt ?? 0)), 0);
            const isToday = key === todayKey;
            const distributedToday = isToday && completed.length > 0;
            const isPending = isToday && completed.length === 0;
            const isOpen = openDay === key;

            const badge = isPending
              ? { text: "Pending", color: AMBER, bg: "rgba(251,191,36,0.12)" }
              : completed.length > 0
                ? { text: "Distributed", color: GREEN, bg: "rgba(52,211,153,0.1)" }
                : { text: "Failed", color: RED, bg: "rgba(248,113,113,0.1)" };

            return (
              <div key={key} className="rounded-2xl overflow-hidden" style={{
                background: "rgba(10,14,30,0.45)",
                border: isPending ? "1px solid rgba(251,191,36,0.3)" : "1px solid rgba(91,140,255,0.12)",
              }}>
                {/* Header row — click to expand */}
                <button
                  type="button"
                  onClick={() => setOpenDay(isOpen ? "" : key)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 text-left"
                >
                  <div className="flex flex-col">
                    <span className="text-sm font-bold" style={{ color: "rgba(200,240,255,0.95)" }}>
                      {dayLabel(key)}{isToday && <span className="ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ color: TEAL, background: "rgba(91,140,255,0.12)" }}>TODAY</span>}
                    </span>
                    {completed.length > 0 && (
                      <span className="text-[11px] mt-0.5" style={{ color: "rgba(194,210,255,0.45)" }}>
                        ${fmt(totalUsdt, 2)} · {totalRecipients} recipient(s) · {completed.length} run(s){totalExtra > 0.01 && <span style={{ color: AMBER }}> · +${fmt(totalExtra, 2)} extra</span>}
                      </span>
                    )}
                    {isPending && (
                      <span className="text-[11px] mt-0.5" style={{ color: "rgba(251,191,36,0.7)" }}>
                        Not distributed yet — tap to set source &amp; amount
                      </span>
                    )}
                  </div>
                  <span className="ml-auto inline-flex items-center gap-2">
                    {distributedToday && <SourceChip source={completed[0].source} />}
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md" style={{ color: badge.color, background: badge.bg }}>{badge.text}</span>
                    <ChevronDown size={16} style={{ color: "rgba(194,210,255,0.5)", transform: isOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
                  </span>
                </button>

                {/* Expanded body */}
                {isOpen && (
                  <div className="px-4 pb-4 pt-1 space-y-4" style={{ borderTop: "1px solid rgba(91,140,255,0.1)" }}>
                    {isToday && (
                      <div className="pt-3">
                        {distributedToday && (
                          <p className="text-[11px] mb-3" style={{ color: "rgba(194,210,255,0.45)" }}>
                            Already distributed today. Run another distribution below to advance another day or catch up.
                          </p>
                        )}
                        {renderDistributionForm()}
                      </div>
                    )}
                    {dayBatches.length > 0 && (
                      <div className="space-y-2">
                        {isToday && <div className="text-[11px] font-semibold uppercase tracking-wider pt-1" style={{ color: "rgba(194,210,255,0.5)" }}>Runs on this day</div>}
                        {dayBatches.map((b) => renderBatchCard(b))}
                      </div>
                    )}
                    {!isToday && dayBatches.length === 0 && (
                      <p className="text-[11px] py-2" style={{ color: "rgba(194,210,255,0.4)" }}>No distributions recorded for this day.</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
