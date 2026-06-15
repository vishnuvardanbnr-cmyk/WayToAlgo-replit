import { useState } from "react";
import { Link } from "wouter";
import { Wallet, RefreshCw, Search, ExternalLink, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { getToken } from "@/lib/auth";

const TEAL = "#00FF94";
const GLASS = {
  background: "rgba(10,14,30,0.65)",
  backdropFilter: "blur(14px)",
  border: "1px solid rgba(0,255,148,0.10)",
} as const;

function fmt(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function shortAddr(addr: string | null) {
  if (!addr) return "—";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

async function fetchWalletBalances() {
  const res = await fetch("/api/admin/wallet-balances", {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) throw new Error("Failed to load");
  return res.json();
}

type UserRow = {
  id: number;
  name: string;
  email: string;
  walletAddress: string | null;
  walletBalance: number;
  withdrawBalance: number;
};

type SortKey = "withdrawBalance" | "walletBalance" | "name";
type SortDir = "asc" | "desc";

export default function AdminWalletBalances() {
  const [data, setData] = useState<{
    totalWithdrawBalance: number;
    totalWalletBalance: number;
    withdrawWalletAddress: string | null;
    withdrawWalletUsdtBalance: number | null;
    onChainError: string | null;
    users: UserRow[];
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("withdrawBalance");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const d = await fetchWalletBalances();
      setData(d);
      setLoaded(true);
    } catch (e: any) {
      setError(e.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  if (!loaded) {
    return (
      <div className="px-4 md:px-8 py-6 max-w-5xl mx-auto pb-24 md:pb-8 flex flex-col items-center justify-center min-h-[60vh] gap-6">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center"
          style={{ background: "rgba(0,255,148,0.10)", border: "1px solid rgba(0,255,148,0.22)" }}
        >
          <Wallet size={30} style={{ color: TEAL }} />
        </div>
        <div className="text-center">
          <h1 className="text-xl font-bold mb-1" style={{ color: "rgba(176,255,224,0.9)", fontFamily: "'Sora', sans-serif" }}>
            Wallet Balances
          </h1>
          <p className="text-sm" style={{ color: "rgba(176,255,224,0.4)" }}>
            View all user withdraw balances and the actual USDT in the withdraw wallet
          </p>
        </div>
        {error && (
          <div className="text-sm px-4 py-2 rounded-xl" style={{ background: "rgba(255,80,80,0.10)", border: "1px solid rgba(255,80,80,0.25)", color: "rgba(255,140,140,0.9)" }}>
            {error}
          </div>
        )}
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm transition-all disabled:opacity-60"
          style={{ background: "linear-gradient(135deg, #00FF94, #00CC77)", color: "#050C0A" }}
        >
          {loading ? <RefreshCw size={15} className="animate-spin" /> : <Wallet size={15} />}
          {loading ? "Loading…" : "Load Wallet Balances"}
        </button>
      </div>
    );
  }

  if (!data) return null;

  const filtered = data.users.filter(u => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      u.name.toLowerCase().includes(s) ||
      u.email.toLowerCase().includes(s) ||
      (u.walletAddress ?? "").toLowerCase().includes(s)
    );
  });

  const sorted = [...filtered].sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    if (sortKey === "name") return dir * a.name.localeCompare(b.name);
    return dir * (a[sortKey] - b[sortKey]);
  });

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  }

  function SortIcon({ k }: { k: SortKey }) {
    if (sortKey !== k) return null;
    return sortDir === "asc" ? <ChevronUp size={13} /> : <ChevronDown size={13} />;
  }

  const surplus = data.withdrawWalletUsdtBalance !== null
    ? data.withdrawWalletUsdtBalance - data.totalWithdrawBalance
    : null;

  return (
    <div className="px-4 md:px-8 py-6 max-w-5xl mx-auto space-y-5 pb-24 md:pb-8">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1
            className="text-xl md:text-2xl font-bold"
            style={{
              fontFamily: "'Sora', sans-serif",
              background: "linear-gradient(135deg, #B0FFE0, #00FF94)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            Wallet Balances
          </h1>
          <p className="text-sm" style={{ color: "rgba(176,255,224,0.4)" }}>
            User platform balances vs. actual USDT in withdraw wallet
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all disabled:opacity-60 shrink-0"
          style={{ background: "rgba(0,255,148,0.10)", border: "1px solid rgba(0,255,148,0.22)", color: TEAL }}
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Total user withdraw balance */}
        <div className="rounded-xl p-4 space-y-1" style={GLASS}>
          <div className="text-xs font-semibold uppercase tracking-widest" style={{ color: "rgba(176,255,224,0.45)" }}>
            Total Owed to Users
          </div>
          <div className="text-2xl font-bold" style={{ color: "rgba(176,255,224,0.9)" }}>
            ${fmt(data.totalWithdrawBalance)}
          </div>
          <div className="text-xs" style={{ color: "rgba(176,255,224,0.4)" }}>
            Sum of all user withdraw balances
          </div>
        </div>

        {/* Withdraw wallet on-chain */}
        <div
          className="rounded-xl p-4 space-y-1"
          style={{
            ...GLASS,
            border: data.withdrawWalletUsdtBalance !== null
              ? `1px solid ${surplus! >= 0 ? "rgba(0,255,148,0.25)" : "rgba(255,80,80,0.30)"}`
              : "1px solid rgba(0,255,148,0.10)",
          }}
        >
          <div className="text-xs font-semibold uppercase tracking-widest" style={{ color: "rgba(176,255,224,0.45)" }}>
            Withdraw Wallet (On-chain)
          </div>
          {data.withdrawWalletUsdtBalance !== null ? (
            <div className="text-2xl font-bold" style={{ color: surplus! >= 0 ? TEAL : "#ff5050" }}>
              ${fmt(data.withdrawWalletUsdtBalance)}
            </div>
          ) : (
            <div className="text-2xl font-bold" style={{ color: "rgba(176,255,224,0.4)" }}>—</div>
          )}
          {data.withdrawWalletAddress && (
            <a
              href={`https://bscscan.com/address/${data.withdrawWalletAddress}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs hover:underline"
              style={{ color: "rgba(176,255,224,0.4)" }}
            >
              {shortAddr(data.withdrawWalletAddress)}
              <ExternalLink size={10} />
            </a>
          )}
          {data.onChainError && (
            <div className="text-xs flex items-center gap-1" style={{ color: "rgba(255,180,100,0.8)" }}>
              <AlertTriangle size={11} /> {data.onChainError}
            </div>
          )}
        </div>

        {/* Surplus / Shortfall */}
        <div
          className="rounded-xl p-4 space-y-1"
          style={{
            ...GLASS,
            border: surplus !== null
              ? `1px solid ${surplus >= 0 ? "rgba(0,255,148,0.20)" : "rgba(255,80,80,0.35)"}`
              : "1px solid rgba(0,255,148,0.10)",
            background: surplus !== null && surplus < 0 ? "rgba(255,30,30,0.06)" : "rgba(10,14,30,0.65)",
          }}
        >
          <div className="text-xs font-semibold uppercase tracking-widest" style={{ color: "rgba(176,255,224,0.45)" }}>
            {surplus === null ? "Surplus / Shortfall" : surplus >= 0 ? "Surplus" : "Shortfall"}
          </div>
          {surplus !== null ? (
            <div className="text-2xl font-bold" style={{ color: surplus >= 0 ? TEAL : "#ff5050" }}>
              {surplus >= 0 ? "+" : ""}{fmt(surplus)}
            </div>
          ) : (
            <div className="text-2xl font-bold" style={{ color: "rgba(176,255,224,0.4)" }}>—</div>
          )}
          <div className="text-xs" style={{ color: "rgba(176,255,224,0.4)" }}>
            {surplus !== null
              ? surplus >= 0
                ? "Wallet can cover all pending withdrawals"
                : "Top up withdraw wallet to cover all payouts"
              : "Configure withdraw wallet to see status"}
          </div>
        </div>
      </div>

      {/* Platform wallet balance (total walletBalance) */}
      <div className="rounded-xl p-4" style={GLASS}>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest mb-0.5" style={{ color: "rgba(176,255,224,0.45)" }}>
              Total Platform Wallet Balance (all users)
            </div>
            <div className="text-xl font-bold" style={{ color: "rgba(176,255,224,0.85)" }}>
              ${fmt(data.totalWalletBalance)}
            </div>
          </div>
          <div className="text-xs text-right" style={{ color: "rgba(176,255,224,0.4)" }}>
            <div>{data.users.length} users total</div>
            <div>{data.users.filter(u => u.withdrawBalance > 0).length} with pending withdrawable balance</div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl overflow-hidden" style={{ background: "rgba(10,14,30,0.65)", border: "1px solid rgba(0,255,148,0.10)" }}>
        {/* Search */}
        <div className="p-4 border-b" style={{ borderColor: "rgba(0,255,148,0.08)" }}>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "rgba(176,255,224,0.35)" }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name, email or wallet…"
              className="w-full pl-9 pr-4 py-2 rounded-xl text-sm outline-none"
              style={{
                background: "rgba(0,20,40,0.5)",
                border: "1px solid rgba(0,255,148,0.12)",
                color: "rgba(176,255,224,0.85)",
              }}
            />
          </div>
        </div>

        {/* Table header */}
        <div
          className="grid text-xs font-semibold uppercase tracking-widest px-4 py-2.5"
          style={{
            gridTemplateColumns: "2fr 2fr 2fr 1fr 1fr",
            color: "rgba(176,255,224,0.45)",
            borderBottom: "1px solid rgba(0,255,148,0.08)",
            background: "rgba(0,255,148,0.03)",
          }}
        >
          <button className="text-left flex items-center gap-1" onClick={() => toggleSort("name")}>
            User <SortIcon k="name" />
          </button>
          <span>Wallet Address</span>
          <span>Email</span>
          <button className="text-right flex items-center justify-end gap-1" onClick={() => toggleSort("walletBalance")}>
            Platform Bal <SortIcon k="walletBalance" />
          </button>
          <button className="text-right flex items-center justify-end gap-1" onClick={() => toggleSort("withdrawBalance")}>
            Withdraw Bal <SortIcon k="withdrawBalance" />
          </button>
        </div>

        {/* Rows */}
        {sorted.length === 0 ? (
          <div className="text-center py-10 text-sm" style={{ color: "rgba(176,255,224,0.35)" }}>
            No users found
          </div>
        ) : (
          sorted.map((u, idx) => (
            <div
              key={u.id}
              className="grid items-center px-4 py-3"
              style={{
                gridTemplateColumns: "2fr 2fr 2fr 1fr 1fr",
                borderBottom: idx < sorted.length - 1 ? "1px solid rgba(0,255,148,0.05)" : "none",
                background: idx % 2 === 0 ? "transparent" : "rgba(0,255,148,0.015)",
              }}
            >
              {/* Name */}
              <div className="min-w-0 pr-2">
                <Link href={`/admin/users?highlight=${u.id}`}>
                  <div
                    className="text-sm font-semibold truncate cursor-pointer hover:underline"
                    style={{ color: "rgba(176,255,224,0.9)" }}
                  >
                    {u.name}
                  </div>
                </Link>
                <div className="text-xs truncate" style={{ color: "rgba(176,255,224,0.35)" }}>
                  #{u.id}
                </div>
              </div>

              {/* Wallet address */}
              <div className="min-w-0 pr-2">
                {u.walletAddress ? (
                  <a
                    href={`https://bscscan.com/address/${u.walletAddress}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs hover:underline truncate"
                    style={{ color: "rgba(176,255,224,0.5)", fontFamily: "monospace" }}
                  >
                    {shortAddr(u.walletAddress)}
                    <ExternalLink size={10} className="shrink-0" />
                  </a>
                ) : (
                  <span className="text-xs" style={{ color: "rgba(176,255,224,0.25)" }}>Not set</span>
                )}
              </div>

              {/* Email */}
              <div className="min-w-0 pr-2">
                <div className="text-xs truncate" style={{ color: "rgba(176,255,224,0.5)" }}>
                  {u.email}
                </div>
              </div>

              {/* Platform wallet balance */}
              <div className="text-right">
                <div
                  className="text-sm font-bold"
                  style={{ color: u.walletBalance > 0 ? "rgba(176,255,224,0.85)" : "rgba(176,255,224,0.3)" }}
                >
                  ${fmt(u.walletBalance)}
                </div>
              </div>

              {/* Withdraw balance */}
              <div className="text-right">
                <div
                  className="text-sm font-bold"
                  style={{ color: u.withdrawBalance > 0 ? TEAL : "rgba(176,255,224,0.3)" }}
                >
                  ${fmt(u.withdrawBalance)}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs" style={{ color: "rgba(176,255,224,0.4)" }}>
        <span><span className="font-semibold" style={{ color: "rgba(176,255,224,0.7)" }}>Platform Bal</span> — total wallet balance (usable inside the platform)</span>
        <span><span className="font-semibold" style={{ color: TEAL }}>Withdraw Bal</span> — amount pending/ready to be paid out to the user's wallet</span>
      </div>
    </div>
  );
}
