import { useState, useRef } from "react";
import { useListAdminInvestments } from "@workspace/api-client-react";
import { TrendingUp, Coins, CheckCircle, XCircle, Clock, RefreshCw, Shield, Wallet, AlertTriangle } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ethers } from "ethers";

const TEAL = "#5B8CFF";
const GREEN = "#34d399";
const AMBER = "#fbbf24";
const RED = "#f87171";
const GLASS = { background: "rgba(10,14,30,0.65)", backdropFilter: "blur(14px)", border: "1px solid rgba(91,140,255,0.10)" } as const;

const BSC_CHAIN_ID = "0x38";
const BSC_CHAIN_PARAMS = {
  chainId: BSC_CHAIN_ID,
  chainName: "BNB Smart Chain",
  nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
  rpcUrls: ["https://bsc-dataseed.binance.org/"],
  blockExplorerUrls: ["https://bscscan.com/"],
};

const TOKEN_ABI = [
  "function buy(uint256 usdtAmount, uint256 minTokensOut, address[] referrers)",
  "function balanceOf(address owner) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
];
const USDT_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
];

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

type ResolveData = {
  id: number;
  contractAddress: string;
  usdtContractAddress: string;
  usdtAmount: number;
  userWallet: string;
  referrers: string[];
};

type RowStatus =
  | { phase: "idle" }
  | { phase: "approving" }
  | { phase: "buying" }
  | { phase: "transferring" }
  | { phase: "done"; txHash: string; wtaReceived: string }
  | { phase: "failed"; error: string };

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

async function fetchResolve(id: number, token: string): Promise<ResolveData> {
  const r = await fetch(`/api/admin/token-allocations/${id}/resolve`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await r.json();
  if (!r.ok) throw new Error(body.message ?? "Failed to resolve allocation");
  return body;
}

async function confirmAllocation(id: number, txHash: string, wtaReceived: string, walletAddress: string, token: string) {
  const r = await fetch(`/api/admin/token-allocations/${id}/confirm`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ txHash, wtaReceived, walletAddress }),
  });
  if (!r.ok) throw new Error("Failed to confirm allocation");
}

async function ensureBsc() {
  const eth = (window as any).ethereum;
  const chainId = await eth.request({ method: "eth_chainId" });
  if (chainId !== BSC_CHAIN_ID) {
    try {
      await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: BSC_CHAIN_ID }] });
    } catch (e: any) {
      if (e.code === 4902) {
        await eth.request({ method: "wallet_addEthereumChain", params: [BSC_CHAIN_PARAMS] });
      } else throw e;
    }
  }
}

function PendingAllocations() {
  const qc = useQueryClient();
  const { data, isLoading, refetch } = usePendingAllocations();
  const token = localStorage.getItem("waytoalgo_token") ?? "";

  const [connectedAddr, setConnectedAddr] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [rowStatus, setRowStatus] = useState<Map<number, RowStatus>>(new Map());
  const settling = useRef(false);

  const rows = data?.rows ?? [];

  function setStatus(id: number, s: RowStatus) {
    setRowStatus(prev => new Map(prev).set(id, s));
  }

  async function connectWallet() {
    const eth = (window as any).ethereum;
    if (!eth) { alert("MetaMask is not installed"); return; }
    setConnecting(true);
    try {
      await ensureBsc();
      const accounts: string[] = await eth.request({ method: "eth_requestAccounts" });
      setConnectedAddr(accounts[0] ?? null);
    } catch (e: any) {
      alert(e.message ?? "Failed to connect");
    } finally {
      setConnecting(false);
    }
  }

  async function settleOne(id: number) {
    if (!connectedAddr) { alert("Connect MetaMask first"); return; }
    const row = rows.find(r => r.id === id);
    if (!row) return;

    setStatus(id, { phase: "approving" });
    try {
      const resolve = await fetchResolve(id, token);
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const adminAddr = await signer.getAddress();

      const usdt = new ethers.Contract(resolve.usdtContractAddress, USDT_ABI, signer);
      const tokenContract = new ethers.Contract(resolve.contractAddress, TOKEN_ABI, signer);
      const usdtWei = ethers.parseUnits(resolve.usdtAmount.toFixed(6), 18);

      // 1. Approve USDT
      const approveTx = await usdt.approve(resolve.contractAddress, usdtWei);
      await approveTx.wait(1);

      // 2. Get balance before buy
      setStatus(id, { phase: "buying" });
      const balBefore: bigint = await tokenContract.balanceOf(adminAddr);

      // 3. Buy tokens (contract distributes to referrers automatically)
      const buyTx = await tokenContract.buy(usdtWei, 0n, resolve.referrers);
      await buyTx.wait(1);

      // 4. Compute tokens received
      const balAfter: bigint = await tokenContract.balanceOf(adminAddr);
      const tokensReceived = balAfter - balBefore;
      if (tokensReceived <= 0n) throw new Error("No tokens received — check USDT balance and contract address");

      // 5. Transfer tokens to user
      setStatus(id, { phase: "transferring" });
      const transferTx = await tokenContract.transfer(resolve.userWallet, tokensReceived);
      await transferTx.wait(1);

      const wtaReceived = ethers.formatUnits(tokensReceived, 18);

      // 6. Confirm to backend
      await confirmAllocation(id, transferTx.hash, wtaReceived, resolve.userWallet, token);

      setStatus(id, { phase: "done", txHash: transferTx.hash, wtaReceived });
      qc.invalidateQueries({ queryKey: ["admin-pending-allocations"] });
    } catch (e: any) {
      setStatus(id, { phase: "failed", error: e.message ?? "Unknown error" });
    }
  }

  async function settleMany(ids: number[]) {
    if (settling.current) return;
    settling.current = true;
    for (const id of ids) {
      const s = rowStatus.get(id);
      if (s && s.phase === "done") continue;
      await settleOne(id);
    }
    settling.current = false;
    setSelected(new Set());
  }

  function toggleRow(id: number) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleAll() {
    if (selected.size === rows.length) setSelected(new Set());
    else setSelected(new Set(rows.map(r => r.id)));
  }

  const allSelected = rows.length > 0 && selected.size === rows.length;
  const totalPendingUsdt = rows.reduce((s, r) => s + r.usdtSpent, 0);
  const selectedUsdt = rows.filter(r => selected.has(r.id)).reduce((s, r) => s + r.usdtSpent, 0);
  const isBusy = (id: number) => { const s = rowStatus.get(id); return !!s && s.phase !== "idle" && s.phase !== "done" && s.phase !== "failed"; };
  const isAnyBusy = rows.some(r => isBusy(r.id));

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
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => refetch()}
            className="p-1.5 rounded-lg transition-opacity hover:opacity-70"
            style={{ background: "rgba(91,140,255,0.08)", border: "1px solid rgba(91,140,255,0.15)" }}
          >
            <RefreshCw size={13} style={{ color: TEAL }} />
          </button>

          {/* MetaMask connect */}
          {!connectedAddr ? (
            <button
              onClick={connectWallet}
              disabled={connecting}
              className="px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all disabled:opacity-60"
              style={{ background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.3)", color: AMBER }}
            >
              <Wallet size={12} />
              {connecting ? "Connecting…" : "Connect MetaMask"}
            </button>
          ) : (
            <span
              className="px-2.5 py-1 rounded-lg text-xs font-mono flex items-center gap-1.5"
              style={{ background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.2)", color: GREEN }}
            >
              <CheckCircle size={10} />
              {connectedAddr.slice(0, 6)}…{connectedAddr.slice(-4)}
            </span>
          )}

          {selected.size > 0 && (
            <button
              onClick={() => settleMany(Array.from(selected))}
              disabled={!connectedAddr || isAnyBusy}
              className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all disabled:opacity-60"
              style={{ background: "linear-gradient(135deg, #5B8CFF, #3D5CE0)", color: "#fff", boxShadow: "0 0 16px rgba(91,140,255,0.25)" }}
            >
              Settle Selected ({selected.size}) · ${selectedUsdt.toFixed(2)}
            </button>
          )}
          {rows.length > 0 && selected.size === 0 && (
            <button
              onClick={() => settleMany(rows.map(r => r.id))}
              disabled={!connectedAddr || isAnyBusy}
              className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all disabled:opacity-60"
              style={{ background: "linear-gradient(135deg, #34d399, #059669)", color: "#fff", boxShadow: "0 0 16px rgba(52,211,153,0.25)" }}
            >
              Settle All ({rows.length}) · ${totalPendingUsdt.toFixed(2)}
            </button>
          )}
        </div>
      </div>

      {/* Info box */}
      <div
        className="rounded-xl p-3 text-xs"
        style={{ background: "rgba(91,140,255,0.05)", border: "1px solid rgba(91,140,255,0.12)", color: "rgba(194,210,255,0.55)" }}
      >
        <strong style={{ color: TEAL }}>How it works:</strong> Connect your MetaMask wallet (BSC mainnet). For each settlement, you'll approve USDT → buy WTA tokens → they transfer directly to the user's wallet. Referral commissions are distributed on-chain automatically by the contract.
      </div>

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
          <div className="flex items-center gap-2 px-1 py-1 cursor-pointer select-none" onClick={toggleAll}>
            <div
              className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0"
              style={{ background: allSelected ? TEAL : "rgba(91,140,255,0.08)", border: `1px solid ${allSelected ? TEAL : "rgba(91,140,255,0.25)"}` }}
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
              const status: RowStatus = rowStatus.get(row.id) ?? { phase: "idle" };
              const busy = isBusy(row.id);

              const phaseLabel: Record<string, string> = {
                approving: "Approving USDT…",
                buying: "Buying tokens…",
                transferring: "Transferring…",
              };

              return (
                <div
                  key={row.id}
                  className="rounded-xl p-3 flex items-start gap-3 transition-all"
                  style={{
                    background: status.phase === "done"
                      ? "rgba(52,211,153,0.05)"
                      : status.phase === "failed"
                        ? "rgba(248,113,113,0.05)"
                        : isSelected ? "rgba(91,140,255,0.08)" : "rgba(251,191,36,0.04)",
                    border: `1px solid ${
                      status.phase === "done" ? "rgba(52,211,153,0.2)"
                      : status.phase === "failed" ? "rgba(248,113,113,0.2)"
                      : isSelected ? "rgba(91,140,255,0.25)" : "rgba(251,191,36,0.12)"
                    }`,
                    cursor: busy || status.phase === "done" ? "default" : "pointer",
                  }}
                  onClick={() => { if (!busy && status.phase !== "done") toggleRow(row.id); }}
                >
                  {/* Checkbox */}
                  {status.phase === "done" ? (
                    <CheckCircle size={16} style={{ color: GREEN, flexShrink: 0, marginTop: 2 }} />
                  ) : status.phase === "failed" ? (
                    <XCircle size={16} style={{ color: RED, flexShrink: 0, marginTop: 2 }} />
                  ) : (
                    <div
                      className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0 mt-0.5"
                      style={{ background: isSelected ? TEAL : "rgba(91,140,255,0.08)", border: `1px solid ${isSelected ? TEAL : "rgba(91,140,255,0.25)"}` }}
                    >
                      {isSelected && <CheckCircle size={10} style={{ color: "#fff" }} />}
                    </div>
                  )}

                  {/* User info */}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate" style={{ color: "rgba(194,210,255,0.85)" }}>{row.userName}</div>
                    <div className="text-xs truncate" style={{ color: "rgba(194,210,255,0.4)" }}>{row.userEmail}</div>
                    <div className="text-xs mt-0.5 font-mono" style={{ color: hasWallet ? "rgba(194,210,255,0.3)" : RED }}>
                      {hasWallet ? `${row.walletAddress.slice(0, 8)}…${row.walletAddress.slice(-6)}` : "⚠ No wallet address"}
                    </div>

                    {/* Status row */}
                    {status.phase !== "idle" && (
                      <div className="mt-1.5 text-xs" style={{ color: status.phase === "done" ? GREEN : status.phase === "failed" ? RED : AMBER }}>
                        {status.phase === "done" && (
                          <>
                            ✓ {parseFloat(status.wtaReceived).toFixed(4)} WTA sent ·{" "}
                            <a href={`https://bscscan.com/tx/${status.txHash}`} target="_blank" rel="noopener noreferrer" className="underline" style={{ color: TEAL }}>BSCScan ↗</a>
                          </>
                        )}
                        {status.phase === "failed" && <><AlertTriangle size={10} className="inline mr-0.5" />{status.error}</>}
                        {busy && <>{phaseLabel[status.phase] ?? status.phase}</>}
                      </div>
                    )}
                  </div>

                  {/* Amount */}
                  <div className="text-right flex-shrink-0">
                    <div className="font-bold text-sm" style={{ color: GREEN }}>${row.usdtSpent.toFixed(2)}</div>
                    {status.phase === "idle" && (
                      <div className="flex items-center gap-1 justify-end mt-0.5">
                        <Clock size={10} style={{ color: AMBER }} />
                        <span className="text-xs" style={{ color: AMBER }}>pending</span>
                      </div>
                    )}
                    <div className="text-xs mt-0.5" style={{ color: "rgba(194,210,255,0.3)" }}>{formatDate(row.createdAt)}</div>
                  </div>

                  {/* Settle button */}
                  {status.phase !== "done" && (
                    <button
                      className="ml-1 px-2.5 py-1.5 rounded-lg text-xs font-bold flex-shrink-0 transition-all disabled:opacity-50"
                      style={{ background: busy ? "rgba(91,140,255,0.15)" : "linear-gradient(135deg, #34d399, #059669)", color: "#fff" }}
                      disabled={busy || !connectedAddr || !hasWallet}
                      onClick={e => { e.stopPropagation(); settleOne(row.id); }}
                      title={!connectedAddr ? "Connect MetaMask first" : !hasWallet ? "User has no wallet address" : "Settle via MetaMask"}
                    >
                      {busy ? phaseLabel[status.phase] ?? "…" : status.phase === "failed" ? "Retry" : "Settle"}
                    </button>
                  )}
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
