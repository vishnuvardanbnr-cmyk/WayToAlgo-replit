import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import Pagination from "@/components/Pagination";
import {
  useGetIncomeSummary,
  useListInvestments,
  useListWithdrawals,
} from "@workspace/api-client-react";
import {
  Wallet,
  ArrowDownLeft,
  ArrowUpRight,
  ArrowLeftRight,
  X,
  CheckCircle,
  CheckCircle2,
  Clock,
  XCircle,
  TrendingUp,
  Calendar,
  Hash,
  DollarSign,
  Percent,
  Timer,
  MapPin,
  AlertCircle,
  Copy,
  RefreshCw,
  ExternalLink,
  ShieldAlert,
  Upload,
  CircleDollarSign,
  Coins,
  PiggyBank,
  TrendingDown,
} from "lucide-react";

function getToken() {
  return localStorage.getItem("waytoalgo_token") || "";
}

/* ────────────────────────────────────────────────
   DEPOSIT MODAL
   ──────────────────────────────────────────────── */
const USDT_CONTRACT = "0x55d398326f99059fF775485246999027B3197955";
const BSC_CHAIN_ID = "0x38";

function encodeTransfer(to: string, amountWei: bigint): string {
  const selector = "a9059cbb";
  const paddedTo = to.replace("0x", "").toLowerCase().padStart(64, "0");
  const paddedAmount = amountWei.toString(16).padStart(64, "0");
  return `0x${selector}${paddedTo}${paddedAmount}`;
}

function parseUsdt(value: string): bigint {
  const [whole = "0", frac = ""] = value.split(".");
  const fracPadded = frac.slice(0, 18).padEnd(18, "0");
  return BigInt(whole) * BigInt(10 ** 18) + BigInt(fracPadded);
}

async function waitForReceipt(txHash: string, maxWait = 120_000): Promise<any | null> {
  const eth = (window as any).ethereum;
  const deadline = Date.now() + maxWait;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 3000));
    const receipt = await eth.request({ method: "eth_getTransactionReceipt", params: [txHash] });
    if (receipt) return receipt;
  }
  return null;
}

async function fetchUsdtBalance(walletAddress: string): Promise<bigint> {
  const eth = (window as any).ethereum;
  const data = "0x70a08231" + walletAddress.replace("0x", "").toLowerCase().padStart(64, "0");
  const hex: string = await eth.request({ method: "eth_call", params: [{ to: USDT_CONTRACT, data }, "latest"] });
  return BigInt(hex);
}

type DepositStage = "idle" | "switch_network" | "sending" | "confirming" | "sweeping" | "credited" | "failed";

function DepositModal({ onClose, onCredited }: { onClose: () => void; onCredited?: () => void }) {
  const [depositAddress, setDepositAddress] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [stage, setStage] = useState<DepositStage>("idle");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [result, setResult] = useState<{ amount?: number; sweepTxHash?: string; newBalance?: number; message?: string } | null>(null);
  const [minDeposit, setMinDeposit] = useState(1);

  useEffect(() => {
    fetch("/api/deposits/address", { headers: { Authorization: `Bearer ${getToken()}` } })
      .then(r => r.json()).then(d => setDepositAddress(d.address)).catch(() => {});
    fetch("/api/settings/public").then(r => r.json())
      .then(d => { if (d.minDepositUsdt) setMinDeposit(parseFloat(d.minDepositUsdt)); }).catch(() => {});
  }, []);

  const handleDeposit = async () => {
    if (!depositAddress) return;
    const eth = (window as any).ethereum;
    if (!eth) {
      setStage("failed");
      setResult({ message: "MetaMask not detected. Please install MetaMask." });
      return;
    }
    const parsedAmt = parseFloat(amount);
    if (!amount || isNaN(parsedAmt) || parsedAmt < minDeposit) {
      setResult({ message: `Minimum deposit is $${minDeposit} USDT` });
      return;
    }

    setResult(null); setTxHash(null);

    try {
      // Switch to BSC if needed
      const chainId: string = await eth.request({ method: "eth_chainId" });
      if (chainId !== BSC_CHAIN_ID) {
        setStage("switch_network");
        try {
          await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: BSC_CHAIN_ID }] });
        } catch (e: any) {
          if (e.code === 4902) {
            await eth.request({
              method: "wallet_addEthereumChain",
              params: [{ chainId: BSC_CHAIN_ID, chainName: "BNB Smart Chain", nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 }, rpcUrls: ["https://bsc-dataseed.binance.org/"], blockExplorerUrls: ["https://bscscan.com"] }],
            });
          } else throw e;
        }
      }

      const accounts: string[] = await eth.request({ method: "eth_requestAccounts" });
      const from = accounts[0];
      if (!from) throw new Error("No wallet account found");

      // Check USDT balance before sending — prevents MetaMask "likely to fail" warning
      const amountWei = parseUsdt(parsedAmt.toFixed(18));
      const usdtBalance = await fetchUsdtBalance(from);
      if (usdtBalance < amountWei) {
        const humanBal = (Number(usdtBalance) / 1e18).toFixed(2);
        setStage("failed");
        setResult({ message: `Insufficient USDT. Your wallet has ${humanBal} USDT but you're trying to send ${parsedAmt} USDT.` });
        return;
      }

      setStage("sending");
      const hash: string = await eth.request({
        method: "eth_sendTransaction",
        params: [{ from, to: USDT_CONTRACT, data: encodeTransfer(depositAddress, amountWei), gas: "0x186A0" }],
      });

      setTxHash(hash);
      setStage("confirming");

      const receipt = await waitForReceipt(hash);
      if (!receipt || receipt.status === "0x0") {
        setStage("failed");
        setResult({ message: "Transaction failed or reverted on-chain." });
        return;
      }

      setStage("sweeping");
      const res = await fetch("/api/deposits/check", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      setResult(data);

      if (data.status === "credited") {
        setStage("credited");
        setAmount("");
        onCredited?.();
      } else {
        setStage("failed");
      }
    } catch (err: any) {
      if (err?.code === 4001) { setStage("idle"); }
      else { setStage("failed"); setResult({ message: err?.message ?? "Unknown error" }); }
    }
  };

  const reset = () => { setStage("idle"); setResult(null); setTxHash(null); };
  const busy = !["idle", "credited", "failed"].includes(stage);

  const stageLabel: Record<DepositStage, string> = {
    idle: "", switch_network: "Switching to BSC…", sending: "Confirm in MetaMask…",
    confirming: "Waiting for confirmation…", sweeping: "Processing deposit…",
    credited: "Deposit credited!", failed: "Deposit failed",
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3"
      style={{ background: "rgba(6,8,20,0.92)", backdropFilter: "blur(12px)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-3xl overflow-hidden"
        style={{
          background: "linear-gradient(170deg, rgba(4,16,32,0.99) 0%, rgba(2,10,22,0.99) 100%)",
          border: "1px solid rgba(91,140,255,0.18)",
          boxShadow: "0 8px 60px rgba(6,8,20,0.9), 0 0 0 1px rgba(91,140,255,0.06)",
          maxHeight: "92dvh", overflowY: "auto",
        }}
        onClick={e => e.stopPropagation()}
      >
        <div className="h-0.5 w-full" style={{ background: `linear-gradient(90deg, transparent, ${TEAL}, transparent)` }} />

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, rgba(91,140,255,0.18), rgba(91,140,255,0.06))", border: "1px solid rgba(91,140,255,0.28)", boxShadow: "0 0 16px rgba(91,140,255,0.15)" }}>
              <ArrowDownLeft size={18} style={{ color: TEAL }} />
            </div>
            <div>
              <div className="font-bold tracking-wide" style={{ color: "rgba(200,240,255,0.92)", fontFamily: "'Sora', sans-serif", fontSize: "0.8rem" }}>
                Deposit USDT
              </div>
              <div className="text-xs mt-0.5" style={{ color: "rgba(194,210,255,0.4)" }}>BEP-20 · Binance Smart Chain</div>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl flex items-center justify-center transition-all"
            style={{ background: "rgba(194,210,255,0.06)", border: "1px solid rgba(194,210,255,0.09)" }}>
            <X size={14} style={{ color: "rgba(194,210,255,0.45)" }} />
          </button>
        </div>

        <div className="px-5 pb-6 space-y-4">
          {/* Amount Input */}
          <div>
            <label className="block text-xs font-medium mb-2" style={{ color: "rgba(194,210,255,0.55)", letterSpacing: "0.05em" }}>
              AMOUNT (USDT)
            </label>
            <div className="relative">
              <input
                type="number" min={minDeposit} step="0.01"
                placeholder={`Min ${minDeposit} USDT`}
                value={amount} onChange={e => setAmount(e.target.value)}
                disabled={busy}
                className="w-full px-4 py-3 pr-16 rounded-xl text-sm outline-none disabled:opacity-50"
                style={{ background: "rgba(0,20,40,0.7)", border: "1px solid rgba(91,140,255,0.22)", color: "rgba(194,210,255,0.9)" }}
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold" style={{ color: TEAL }}>USDT</span>
            </div>
            {/* Quick amounts */}
            <div className="flex gap-1.5 mt-2">
              {[10, 50, 100, 500].map(v => (
                <button key={v} onClick={() => setAmount(String(v))} disabled={busy}
                  className="flex-1 py-1.5 rounded-lg text-xs font-medium transition-all disabled:opacity-40"
                  style={{
                    background: amount === String(v) ? "rgba(91,140,255,0.2)" : "rgba(0,20,40,0.5)",
                    border: `1px solid ${amount === String(v) ? "rgba(91,140,255,0.4)" : "rgba(91,140,255,0.12)"}`,
                    color: amount === String(v) ? TEAL : "rgba(194,210,255,0.45)",
                  }}>${v}</button>
              ))}
            </div>
          </div>

          {/* Warning */}
          <div className="flex gap-2.5 px-3 py-2.5 rounded-xl"
            style={{ background: "rgba(251,191,36,0.05)", border: "1px solid rgba(251,191,36,0.16)" }}>
            <ShieldAlert size={13} className="shrink-0 mt-0.5" style={{ color: "rgba(251,191,36,0.75)" }} />
            <p className="text-xs leading-relaxed" style={{ color: "rgba(251,191,36,0.75)" }}>
              MetaMask will switch to <strong>BNB Smart Chain</strong> automatically if needed.
            </p>
          </div>

          {/* Stage indicator */}
          {stage !== "idle" && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl"
              style={{
                background: stage === "credited" ? "rgba(52,211,153,0.06)" : stage === "failed" ? "rgba(248,113,113,0.06)" : "rgba(91,140,255,0.06)",
                border: `1px solid ${stage === "credited" ? "rgba(52,211,153,0.3)" : stage === "failed" ? "rgba(248,113,113,0.3)" : "rgba(91,140,255,0.2)"}`,
              }}>
              {busy && <RefreshCw size={14} className="animate-spin shrink-0" style={{ color: TEAL }} />}
              {stage === "credited" && <CheckCircle2 size={14} className="shrink-0" style={{ color: "rgba(52,211,153,0.9)" }} />}
              {stage === "failed" && <XCircle size={14} className="shrink-0" style={{ color: "rgba(248,113,113,0.9)" }} />}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium" style={{
                  color: stage === "credited" ? "rgba(52,211,153,0.95)" : stage === "failed" ? "rgba(248,113,113,0.9)" : "rgba(194,210,255,0.85)"
                }}>{stageLabel[stage]}</p>
                {result?.message && stage !== "credited" && (
                  <p className="text-xs mt-0.5 truncate" style={{ color: "rgba(194,210,255,0.4)" }}>{result.message}</p>
                )}
                {stage === "credited" && result && (
                  <p className="text-xs mt-0.5" style={{ color: "rgba(194,210,255,0.5)" }}>
                    New balance: <strong style={{ color: TEAL }}>${result.newBalance?.toFixed(2)}</strong>
                  </p>
                )}
              </div>
              {txHash && (
                <a href={`https://bscscan.com/tx/${txHash}`} target="_blank" rel="noopener noreferrer" style={{ color: TEAL }}>
                  <ExternalLink size={12} className="shrink-0" />
                </a>
              )}
            </div>
          )}

          {/* Action button */}
          {(stage === "idle" || stage === "failed") ? (
            <button
              onClick={stage === "failed" ? reset : handleDeposit}
              disabled={!depositAddress}
              className="w-full py-3.5 rounded-2xl font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              style={{
                background: "linear-gradient(135deg, #5B8CFF, #3D5CE0)", color: "#060814",
                fontFamily: "'Sora', sans-serif", fontSize: "0.75rem", letterSpacing: "0.05em",
                boxShadow: "0 0 24px rgba(91,140,255,0.25)",
              }}
            >
              {stage === "failed" ? <><RefreshCw size={14} /> Try Again</> : <><Upload size={14} /> Deposit Now</>}
            </button>
          ) : stage === "credited" ? (
            <button onClick={onClose}
              className="w-full py-3 rounded-2xl font-bold text-sm flex items-center justify-center gap-2"
              style={{ background: "rgba(52,211,153,0.12)", border: "1px solid rgba(52,211,153,0.35)", color: "rgba(52,211,153,0.9)" }}>
              <CheckCircle2 size={14} /> Done
            </button>
          ) : (
            <button disabled
              className="w-full py-3.5 rounded-2xl font-bold flex items-center justify-center gap-2 opacity-60"
              style={{ background: "linear-gradient(135deg, #5B8CFF, #3D5CE0)", color: "#060814", fontFamily: "'Sora', sans-serif", fontSize: "0.75rem", letterSpacing: "0.05em" }}>
              <RefreshCw size={14} className="animate-spin" /> {stageLabel[stage]}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const TEAL = "#5B8CFF";
const GLASS = {
  background: "rgba(10,14,30,0.65)",
  backdropFilter: "blur(14px)",
  border: "1px solid rgba(91,140,255,0.10)",
} as const;

/* ────────────────────────────────────────────────
   P2P TRANSFER MODAL
   ──────────────────────────────────────────────── */
function P2PModal({ usdtBalance, onClose, onSuccess }: {
  usdtBalance: number;
  onClose: () => void;
  onSuccess: (newUsdt: number) => void;
}) {
  const currency = "usdt" as const;
  const [userId, setUserId] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState<{ id: number; name: string; email: string } | null>(null);
  const [verifyError, setVerifyError] = useState("");
  const [amount, setAmount] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [sendError, setSendError] = useState("");

  const activeBal = usdtBalance;
  const coinColor = TEAL;
  const coinLabel = "USDT";

  const handleVerify = async () => {
    setVerified(null); setVerifyError("");
    if (!userId.trim()) { setVerifyError("Enter a referral code or user ID"); return; }
    setVerifying(true);
    try {
      const res = await fetch(`/api/wallet/p2p/lookup?query=${encodeURIComponent(userId.trim())}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("waytoalgo_token") || ""}` },
      });
      const data = await res.json();
      if (!res.ok) { setVerifyError(data.message || "User not found"); return; }
      setVerified(data);
    } catch { setVerifyError("Connection error"); }
    finally { setVerifying(false); }
  };

  const handleSend = async () => {
    if (!verified) return;
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { setSendError("Enter a valid amount"); return; }
    if (amt > activeBal) { setSendError(`Insufficient balance. Available: $${activeBal.toFixed(2)}`); return; }
    setSending(true); setSendError("");
    try {
      const res = await fetch("/api/wallet/p2p/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("waytoalgo_token") || ""}` },
        body: JSON.stringify({ recipientId: verified.id, amount: amt, currency }),
      });
      const data = await res.json();
      if (!res.ok) { setSendError(data.message || "Transfer failed"); return; }
      setSent(true);
      onSuccess(data.walletBalance);
    } catch { setSendError("Connection error"); }
    finally { setSending(false); }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3"
      style={{ background: "rgba(6,8,20,0.92)", backdropFilter: "blur(12px)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-3xl overflow-hidden"
        style={{
          background: "linear-gradient(170deg, rgba(4,16,32,0.99) 0%, rgba(2,10,22,0.99) 100%)",
          border: "1px solid rgba(91,140,255,0.18)",
          boxShadow: "0 8px 60px rgba(6,8,20,0.9)",
        }}
        onClick={e => e.stopPropagation()}
      >
        <div className="h-0.5 w-full" style={{ background: "linear-gradient(90deg, transparent, #5B8CFF, transparent)" }} />

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, rgba(91,140,255,0.18), rgba(91,140,255,0.06))", border: "1px solid rgba(91,140,255,0.28)" }}>
              <ArrowUpRight size={17} style={{ color: TEAL }} />
            </div>
            <div>
              <div className="font-bold" style={{ color: "rgba(200,240,255,0.92)", fontFamily: "'Sora', sans-serif", fontSize: "0.8rem" }}>P2P Transfer</div>
              <div className="text-xs mt-0.5" style={{ color: "rgba(194,210,255,0.35)" }}>Send to another user</div>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{ background: "rgba(194,210,255,0.06)", border: "1px solid rgba(194,210,255,0.09)" }}>
            <X size={14} style={{ color: "rgba(194,210,255,0.45)" }} />
          </button>
        </div>

        <div className="px-5 pb-6 space-y-4">
          {sent ? (
            <div className="text-center py-6">
              <CheckCircle2 size={48} className="mx-auto mb-3" style={{ color: "#34d399" }} />
              <div className="font-bold text-sm mb-1" style={{ color: "#34d399" }}>Transfer Successful!</div>
              <div className="text-xs" style={{ color: "rgba(194,210,255,0.45)" }}>
                ${parseFloat(amount).toFixed(2)} {coinLabel} sent to {verified?.name}
              </div>
              <button onClick={onClose} className="mt-5 w-full py-3 rounded-2xl font-bold text-xs"
                style={{ background: "linear-gradient(135deg, #5B8CFF, #3D5CE0)", color: "#060814" }}>
                Done
              </button>
            </div>
          ) : (
            <>

              {/* Available balance */}
              <div className="rounded-xl px-4 py-2.5 text-center"
                style={{ background: "rgba(91,140,255,0.06)", border: "1px solid rgba(91,140,255,0.12)" }}>
                <div className="text-xs mb-0.5" style={{ color: "rgba(194,210,255,0.4)" }}>Available {coinLabel}</div>
                <div className="font-bold text-sm" style={{ color: coinColor }}>${activeBal.toFixed(2)}</div>
              </div>

              {/* User ID lookup */}
              <div>
                <label className="block text-xs mb-1.5" style={{ color: "rgba(194,210,255,0.55)" }}>Recipient Referral Code or User ID</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={userId}
                    onChange={e => { setUserId(e.target.value); setVerified(null); setVerifyError(""); }}
                    placeholder="Enter referral code or user ID..."
                    className="flex-1 rounded-xl px-3 py-2.5 text-sm outline-none"
                    style={{
                      background: "rgba(0,20,40,0.6)",
                      border: `1px solid ${verified ? "rgba(52,211,153,0.45)" : verifyError ? "rgba(248,113,113,0.35)" : "rgba(91,140,255,0.15)"}`,
                      color: "rgba(200,240,255,0.9)",
                    }}
                    onKeyDown={e => e.key === "Enter" && handleVerify()}
                  />
                  <button
                    onClick={handleVerify}
                    disabled={verifying || !userId}
                    className="px-4 rounded-xl font-bold text-xs transition-all"
                    style={{
                      background: verified ? "linear-gradient(135deg, rgba(52,211,153,0.2), rgba(52,211,153,0.08))" : "linear-gradient(135deg, rgba(91,140,255,0.2), rgba(91,140,255,0.08))",
                      border: verified ? "1px solid rgba(52,211,153,0.4)" : "1px solid rgba(91,140,255,0.25)",
                      color: verified ? "#34d399" : TEAL,
                      opacity: verifying || !userId ? 0.5 : 1,
                    }}
                  >
                    {verifying ? "..." : verified ? <CheckCircle2 size={16} /> : "Verify"}
                  </button>
                </div>
                {verifyError && <p className="text-xs mt-1.5" style={{ color: "#f87171" }}>{verifyError}</p>}
                {verified && (
                  <div className="flex items-center gap-2 mt-2 px-3 py-2 rounded-xl"
                    style={{ background: "rgba(52,211,153,0.06)", border: "1px solid rgba(52,211,153,0.2)" }}>
                    <CheckCircle2 size={14} style={{ color: "#34d399" }} />
                    <div>
                      <div className="text-xs font-semibold" style={{ color: "#34d399" }}>{verified.name}</div>
                      <div className="text-xs" style={{ color: "rgba(194,210,255,0.35)" }}>{verified.email}</div>
                    </div>
                  </div>
                )}
              </div>

              {/* Amount */}
              {verified && (
                <div>
                  <label className="block text-xs mb-1.5" style={{ color: "rgba(194,210,255,0.55)" }}>Amount ({coinLabel})</label>
                  <div className="flex items-center gap-2 rounded-xl px-3 py-2.5"
                    style={{ background: "rgba(0,20,40,0.6)", border: "1px solid rgba(91,140,255,0.15)" }}>
                    <input
                      type="number"
                      value={amount}
                      onChange={e => { setAmount(e.target.value); setSendError(""); }}
                      placeholder="0.00"
                      className="flex-1 bg-transparent outline-none text-sm"
                      style={{ color: "rgba(200,240,255,0.9)" }}
                    />
                    <button
                      onClick={() => setAmount(activeBal.toFixed(2))}
                      className="text-xs font-bold px-2 py-0.5 rounded-lg"
                      style={{ background: "rgba(91,140,255,0.12)", color: coinColor }}
                    >
                      MAX
                    </button>
                  </div>
                  {sendError && <p className="text-xs mt-1.5" style={{ color: "#f87171" }}>{sendError}</p>}
                </div>
              )}

              {/* Send button */}
              <button
                onClick={handleSend}
                disabled={!verified || !amount || sending}
                className="w-full py-3 rounded-2xl font-bold text-xs transition-all"
                style={{
                  background: !verified || !amount ? "rgba(91,140,255,0.08)" : "linear-gradient(135deg, #5B8CFF, #3D5CE0)",
                  color: !verified || !amount ? "rgba(194,210,255,0.3)" : "#060814",
                  boxShadow: verified && amount ? "0 0 24px rgba(91,140,255,0.3)" : "none",
                  cursor: !verified || !amount || sending ? "not-allowed" : "pointer",
                }}
              >
                {sending ? "Sending..." : `Send ${coinLabel}${amount ? ` · $${parseFloat(amount || "0").toFixed(2)}` : ""}`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const statusConfig: Record<string, { icon: any; color: string; label: string }> = {
  pending:   { icon: Clock,        color: "#fbbf24", label: "Pending"   },
  approved:  { icon: CheckCircle,  color: "#34d399", label: "Approved"  },
  rejected:  { icon: XCircle,      color: "#f87171", label: "Rejected"  },
  active:    { icon: TrendingUp,   color: TEAL,      label: "Active"    },
  completed: { icon: CheckCircle,  color: "#34d399", label: "Completed" },
};

const planLabels: Record<string, string> = {
  tier1: "Starter — 0.6%/day · 300 days",
  tier2: "Growth  — 0.7%/day · 260 days",
  tier3: "Premium — 0.8%/day · 225 days",
};

function formatDate(iso: string, full = false) {
  const d = new Date(iso);
  return full
    ? d.toLocaleString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function shortId(id: string | number) {
  return String(id).slice(0, 8).toUpperCase();
}

/* ────────────────────────────────────────────────
   DETAIL MODAL
   ──────────────────────────────────────────────── */
function DetailModal({ item, type, onClose }: { item: any; type: "deposit" | "withdraw"; onClose: () => void }) {
  const cfg = statusConfig[item.status] || statusConfig.pending;
  const isDeposit = type === "deposit";
  const accentColor = isDeposit ? TEAL : "#f87171";

  const allRows =
    isDeposit
      ? [
          { icon: Hash,       label: "Transaction ID",  value: `#${shortId(item.id)}`,                                           raw: item.id },
          { icon: Calendar,   label: "Date",            value: formatDate(item.createdAt, true),                                  raw: item.createdAt },
          { icon: DollarSign, label: "Total Amount",    value: `$${item.amount?.toFixed(2)}`,                                     raw: item.amount },
          { icon: DollarSign, label: "USDT",            value: item.usdtAmount != null ? `$${item.usdtAmount.toFixed(2)}` : null, raw: item.usdtAmount },
          { icon: Percent,    label: "Plan",            value: item.plan ? (planLabels[item.plan] ?? item.plan) : null,           raw: item.plan },
          { icon: TrendingUp, label: "Expected Return", value: item.expectedReturn != null ? `$${item.expectedReturn.toFixed(2)}` : null, raw: item.expectedReturn },
          { icon: Timer,      label: "Duration",        value: item.durationDays != null ? `${item.durationDays} days` : null,    raw: item.durationDays },
          { icon: Calendar,   label: "Maturity Date",   value: item.maturityDate ? formatDate(item.maturityDate) : null,          raw: item.maturityDate },
        ]
      : [
          { icon: Hash,        label: "Transaction ID", value: `#${shortId(item.id)}`,                                             raw: item.id },
          { icon: Calendar,    label: "Requested",      value: formatDate(item.createdAt, true),                                   raw: item.createdAt },
          { icon: DollarSign,  label: "Amount",         value: `$${item.amount?.toFixed(2)}`,                                      raw: item.amount },
          { icon: MapPin,      label: "Wallet Address", value: item.walletAddress ?? null,                                          raw: item.walletAddress },
          { icon: Calendar,    label: "Processed",      value: item.processedAt ? formatDate(item.processedAt, true) : "Awaiting", raw: true },
          { icon: AlertCircle, label: "Reason",         value: item.rejectionReason ?? null,                                        raw: item.rejectionReason },
        ];

  const rows = allRows.filter(r => r.value !== null);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3"
      style={{ background: "rgba(6,8,20,0.88)", backdropFilter: "blur(10px)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-3xl overflow-hidden"
        style={{
          background: "linear-gradient(170deg, rgba(4,16,32,0.99) 0%, rgba(2,10,22,0.99) 100%)",
          border: "1px solid rgba(91,140,255,0.16)",
          boxShadow: "0 8px 60px rgba(6,8,20,0.9), 0 0 0 1px rgba(91,140,255,0.06)",
        }}
        onClick={e => e.stopPropagation()}
      >
        <div className="h-0.5 w-full" style={{ background: `linear-gradient(90deg, transparent, ${accentColor}, transparent)` }} />

        <div className="flex items-center justify-between px-5 pt-5 pb-4">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-2xl flex items-center justify-center"
              style={{
                background: `linear-gradient(135deg, ${accentColor}20, ${accentColor}08)`,
                border: `1px solid ${accentColor}30`,
                boxShadow: `0 0 16px ${accentColor}15`,
              }}
            >
              {isDeposit
                ? <ArrowDownLeft size={17} style={{ color: accentColor }} />
                : <ArrowUpRight  size={17} style={{ color: accentColor }} />}
            </div>
            <div>
              <div
                className="font-bold tracking-wide"
                style={{ color: "rgba(200,240,255,0.92)", fontFamily: "'Sora', sans-serif", fontSize: "0.78rem" }}
              >
                {isDeposit ? "Deposit Details" : "Withdrawal Details"}
              </div>
              <div className="flex items-center gap-1.5 mt-1">
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: cfg.color, boxShadow: `0 0 6px ${cfg.color}` }} />
                <span className="text-xs font-semibold" style={{ color: cfg.color }}>{cfg.label}</span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl flex items-center justify-center transition-all hover:brightness-125"
            style={{ background: "rgba(194,210,255,0.06)", border: "1px solid rgba(194,210,255,0.09)" }}
          >
            <X size={14} style={{ color: "rgba(194,210,255,0.45)" }} />
          </button>
        </div>

        <div
          className="mx-5 mb-5 rounded-2xl py-5 text-center"
          style={{
            background: isDeposit
              ? "linear-gradient(135deg, rgba(91,140,255,0.07), rgba(61,92,224,0.03))"
              : "linear-gradient(135deg, rgba(248,113,113,0.07), rgba(220,80,80,0.03))",
            border: `1px solid ${accentColor}20`,
          }}
        >
          <div className="text-xs mb-2 uppercase tracking-widest" style={{ color: "rgba(194,210,255,0.35)" }}>
            {isDeposit ? "Amount Deposited" : "Amount Withdrawn"}
          </div>
          <div
            className="font-black"
            style={{
              fontFamily: "'Sora', sans-serif",
              fontSize: "1.75rem",
              color: accentColor,
              textShadow: `0 0 24px ${accentColor}50`,
            }}
          >
            {isDeposit ? "+" : "−"}${item.amount?.toFixed(2)}
          </div>
        </div>

        <div className="mx-5 mb-4 h-px" style={{ background: "rgba(91,140,255,0.07)" }} />

        <div className="px-5 pb-6 space-y-0">
          {rows.map((row, i) => (
            <div
              key={row.label}
              className="flex items-center justify-between py-3"
              style={{ borderBottom: i < rows.length - 1 ? "1px solid rgba(91,140,255,0.05)" : "none" }}
            >
              <div className="flex items-center gap-2.5">
                <row.icon size={12} style={{ color: "rgba(194,210,255,0.28)" }} />
                <span className="text-xs" style={{ color: "rgba(194,210,255,0.42)" }}>{row.label}</span>
              </div>
              <span
                className="text-xs font-semibold text-right max-w-[55%] break-all leading-relaxed"
                style={{
                  color: row.label === "Transaction ID"
                    ? "rgba(194,210,255,0.55)"
                    : row.label === "Reason"
                      ? "#f87171"
                      : row.label === "Processed" && row.value === "Awaiting"
                        ? "#fbbf24"
                        : "rgba(200,240,255,0.85)",
                  fontFamily: row.label === "Transaction ID" || row.label === "Wallet Address"
                    ? "monospace"
                    : "inherit",
                }}
              >
                {row.value}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────
   EMPTY STATE
   ──────────────────────────────────────────────── */
function EmptyState() {
  return (
    <div className="rounded-xl p-12 text-center" style={GLASS}>
      <Wallet size={36} className="mx-auto mb-3" style={{ color: "rgba(194,210,255,0.15)" }} />
      <p className="text-sm" style={{ color: "rgba(194,210,255,0.3)" }}>No transactions yet</p>
    </div>
  );
}

/* ────────────────────────────────────────────────
   MAIN PAGE
   ──────────────────────────────────────────────── */
const WALLET_PAGE_SIZE = 10;
type EntryType = "deposit" | "withdraw";

/* ────────────────────────────────────────────────
   CONVERT MODAL
   ──────────────────────────────────────────────── */
function ConvertModal({
  source,
  sourceBalance,
  tokenPrice,
  onClose,
  onSuccess,
}: {
  source: "trading" | "team";
  sourceBalance: number;   // in WTA
  tokenPrice: number;      // WTA price in USDT (for estimate only)
  onClose: () => void;
  onSuccess: (data: { walletBalance: number; tradingProfitBalance: number; teamBenefitBalance: number }) => void;
}) {
  const [amount, setAmount] = useState("");
  const [converting, setConverting] = useState(false);
  const [done, setDone] = useState(false);
  const [result, setResult] = useState<{ usdtReceived?: number; error?: string } | null>(null);

  const label = source === "trading" ? "Trading Profit" : "Team Benefit";
  const tokenAmt = parseFloat(amount || "0");
  const estimatedUsdt = tokenAmt * tokenPrice;

  const handleConvert = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { setResult({ error: "Enter a valid token amount" }); return; }
    if (amt > sourceBalance) { setResult({ error: `Insufficient balance. Available: ${sourceBalance.toFixed(4)} WTA` }); return; }
    setConverting(true); setResult(null);
    try {
      const res = await fetch("/api/wallet/convert", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("waytoalgo_token") || ""}` },
        body: JSON.stringify({ source, amount: amt }),
      });
      const data = await res.json();
      if (!res.ok) { setResult({ error: data.message || "Conversion failed" }); return; }
      setResult({ usdtReceived: data.usdtReceived });
      setDone(true);
      onSuccess({ walletBalance: data.walletBalance, tradingProfitBalance: data.tradingProfitBalance, teamBenefitBalance: data.teamBenefitBalance });
    } catch { setResult({ error: "Connection error" }); }
    finally { setConverting(false); }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3"
      style={{ background: "rgba(6,8,20,0.92)", backdropFilter: "blur(12px)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-3xl overflow-hidden"
        style={{
          background: "linear-gradient(170deg, rgba(4,16,32,0.99) 0%, rgba(2,10,22,0.99) 100%)",
          border: "1px solid rgba(91,140,255,0.18)",
          boxShadow: "0 8px 60px rgba(6,8,20,0.9)",
        }}
        onClick={e => e.stopPropagation()}
      >
        <div className="h-0.5 w-full" style={{ background: "linear-gradient(90deg, transparent, #5B8CFF, transparent)" }} />
        <div className="flex items-center justify-between px-5 pt-5 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, rgba(91,140,255,0.18), rgba(91,140,255,0.06))", border: "1px solid rgba(91,140,255,0.28)" }}>
              <CircleDollarSign size={17} style={{ color: TEAL }} />
            </div>
            <div>
              <div className="font-bold" style={{ color: "rgba(200,240,255,0.92)", fontFamily: "'Sora', sans-serif", fontSize: "0.8rem" }}>
                Sell Tokens → Main Wallet
              </div>
              <div className="text-xs mt-0.5" style={{ color: "rgba(194,210,255,0.35)" }}>{label} WTA → USDT</div>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{ background: "rgba(194,210,255,0.06)", border: "1px solid rgba(194,210,255,0.09)" }}>
            <X size={14} style={{ color: "rgba(194,210,255,0.45)" }} />
          </button>
        </div>

        <div className="px-5 pb-6 space-y-4">
          {done ? (
            <div className="text-center py-4">
              <CheckCircle2 size={48} className="mx-auto mb-3" style={{ color: "#34d399" }} />
              <div className="font-bold text-sm mb-1" style={{ color: "#34d399" }}>Sale Successful!</div>
              <div className="text-xs mb-1" style={{ color: "rgba(194,210,255,0.5)" }}>
                Credited to your main wallet:
              </div>
              <div className="font-black text-xl mb-3" style={{ color: TEAL, fontFamily: "'Sora', sans-serif" }}>
                ${result?.usdtReceived?.toFixed(2)} USDT
              </div>
              <button onClick={onClose} className="w-full py-3 rounded-2xl font-bold text-xs"
                style={{ background: "linear-gradient(135deg, #5B8CFF, #3D5CE0)", color: "#060814" }}>
                Done
              </button>
            </div>
          ) : (
            <>
              <div className="rounded-xl px-4 py-2.5 text-center"
                style={{ background: "rgba(91,140,255,0.06)", border: "1px solid rgba(91,140,255,0.12)" }}>
                <div className="text-xs mb-0.5" style={{ color: "rgba(194,210,255,0.4)" }}>Available in {label}</div>
                <div className="font-bold text-sm" style={{ color: TEAL }}>{sourceBalance.toFixed(4)} WTA</div>
                {tokenPrice > 0 && (
                  <div className="text-xs mt-0.5" style={{ color: "rgba(194,210,255,0.3)" }}>
                    ≈ ${(sourceBalance * tokenPrice).toFixed(2)} USDT at current price
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs mb-1.5" style={{ color: "rgba(194,210,255,0.55)" }}>
                  WTA to Sell
                </label>
                <div className="relative">
                  <input
                    type="number" min="0.000001" step="0.0001"
                    value={amount}
                    onChange={e => { setAmount(e.target.value); setResult(null); }}
                    placeholder="Enter token amount..."
                    className="w-full px-4 py-3 pr-20 rounded-xl text-sm outline-none"
                    style={{ background: "rgba(0,20,40,0.7)", border: "1px solid rgba(91,140,255,0.22)", color: "rgba(194,210,255,0.9)" }}
                  />
                  <button
                    onClick={() => setAmount(sourceBalance.toFixed(6))}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold px-2 py-0.5 rounded-lg"
                    style={{ background: "rgba(91,140,255,0.15)", color: TEAL }}>
                    MAX
                  </button>
                </div>
              </div>

              {tokenAmt > 0 && (
                <div className="rounded-xl px-4 py-3 space-y-2"
                  style={{ background: "rgba(52,211,153,0.06)", border: "1px solid rgba(52,211,153,0.2)" }}>
                  <div className="flex justify-between text-xs">
                    <span style={{ color: "rgba(194,210,255,0.45)" }}>Selling</span>
                    <span style={{ color: "rgba(200,240,255,0.85)", fontWeight: 600 }}>{tokenAmt.toFixed(4)} WTA</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span style={{ color: "rgba(194,210,255,0.45)" }}>Token price (est.)</span>
                    <span style={{ color: "rgba(194,210,255,0.55)" }}>${tokenPrice.toFixed(4)}</span>
                  </div>
                  <div className="h-px" style={{ background: "rgba(52,211,153,0.15)" }} />
                  <div className="flex justify-between text-xs font-bold">
                    <span style={{ color: "#34d399" }}>Est. USDT to receive</span>
                    <span style={{ color: "#34d399" }}>≈${estimatedUsdt.toFixed(2)}</span>
                  </div>
                  <div className="text-xs" style={{ color: "rgba(194,210,255,0.25)" }}>
                    Actual amount depends on on-chain price at time of sale.
                  </div>
                </div>
              )}

              {result?.error && (
                <div className="px-3 py-2.5 rounded-xl text-xs"
                  style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.25)", color: "#f87171" }}>
                  {result.error}
                </div>
              )}

              <button
                onClick={handleConvert}
                disabled={converting || !amount || tokenAmt <= 0}
                className="w-full py-3.5 rounded-2xl font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                style={{
                  background: "linear-gradient(135deg, #5B8CFF, #3D5CE0)", color: "#060814",
                  fontFamily: "'Sora', sans-serif", fontSize: "0.75rem", letterSpacing: "0.05em",
                  boxShadow: "0 0 24px rgba(91,140,255,0.25)",
                }}
              >
                {converting ? <><RefreshCw size={14} className="animate-spin" /> Selling…</> : <><CircleDollarSign size={14} /> Sell & Credit to Main Wallet</>}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function WalletPage({ user }: { user: any }) {
  const [, setLocation] = useLocation();
  const [selected, setSelected] = useState<{ item: any; type: EntryType } | null>(null);
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [showP2PModal, setShowP2PModal] = useState(false);
  const [showConvertModal, setShowConvertModal] = useState<{ source: "trading" | "team" } | null>(null);
  const [page, setPage] = useState(1);
  const [localUsdtBal, setLocalUsdtBal] = useState<number | null>(null);
  const [localTradingBal, setLocalTradingBal] = useState<number | null>(null);
  const [localTeamBal, setLocalTeamBal] = useState<number | null>(null);
  const [tokenPrice, setTokenPrice] = useState(0);
  const [wtaHoldings, setWtaHoldings] = useState<{
    purchaseCount: number; totalUsdtSpent: string;
    totalWtaReceived: string; currentValue: string; sellPrice: string;
  } | null>(null);

  const usdtBalance = localUsdtBal ?? (user?.walletBalance ?? 0);
  // Trading Profit and Team Benefit are stored in WTA amounts
  const tradingBal = localTradingBal ?? (parseFloat(user?.tradingProfitBalance ?? "0") || 0);
  const teamBal = localTeamBal ?? (parseFloat(user?.teamBenefitBalance ?? "0") || 0);

  // Fetch token price from public settings
  useEffect(() => {
    fetch("/api/settings/public").then(r => r.json()).then(d => {
      if (d.hyperCoinPrice) setTokenPrice(parseFloat(d.hyperCoinPrice));
    }).catch(() => {});
  }, []);

  // Fetch WTA on-chain purchase holdings from DB
  useEffect(() => {
    fetch("/api/token/holdings", {
      headers: { Authorization: `Bearer ${getToken()}` },
    }).then(r => r.ok ? r.json() : null).then(d => {
      if (d) setWtaHoldings(d);
    }).catch(() => {});
  }, []);

  const { data: summary }    = useGetIncomeSummary();
  const { data: investments } = useListInvestments();
  const { data: withdrawals } = useListWithdrawals();

  /* Merge + sort descending by date */
  const combined: { item: any; type: EntryType }[] = [
    ...(investments ?? []).map(inv => ({ item: inv, type: "deposit" as EntryType })),
    ...(withdrawals ?? []).map(w   => ({ item: w,   type: "withdraw" as EntryType })),
  ].sort((a, b) => new Date(b.item.createdAt).getTime() - new Date(a.item.createdAt).getTime());

  const total      = combined.length;
  const totalPages = Math.max(1, Math.ceil(total / WALLET_PAGE_SIZE));
  const paginated  = combined.slice((page - 1) * WALLET_PAGE_SIZE, page * WALLET_PAGE_SIZE);

  return (
    <div className="px-4 py-6 max-w-2xl mx-auto space-y-5 pb-28 md:pb-8">

      {/* Header */}
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
        Wallet
      </h1>

      {/* ── Main Wallet Card ── */}
      <div
        className="rounded-2xl p-5"
        style={{
          background: "linear-gradient(135deg, rgba(91,140,255,0.13), rgba(61,92,224,0.05))",
          border: "1px solid rgba(91,140,255,0.28)",
          boxShadow: "0 0 24px rgba(91,140,255,0.08)",
        }}
      >
        <div className="text-xs uppercase tracking-widest mb-2" style={{ color: "rgba(194,210,255,0.4)" }}>
          Main Wallet
        </div>
        <div
          className="font-black"
          style={{ fontFamily: "'Sora', sans-serif", color: TEAL, fontSize: "2rem", textShadow: `0 0 20px ${TEAL}55`, lineHeight: 1.1 }}
        >
          ${usdtBalance.toFixed(2)}
        </div>
        <div className="text-xs mt-1.5" style={{ color: "rgba(194,210,255,0.28)" }}>USDT · Deposit, invest, withdraw</div>
      </div>

      {/* ── Earning Wallets ── */}
      <div className="grid grid-cols-2 gap-3">
        {/* Trading Profit Wallet */}
        <div
          className="rounded-2xl p-4"
          style={{
            background: "linear-gradient(135deg, rgba(52,211,153,0.10), rgba(16,185,129,0.04))",
            border: "1px solid rgba(52,211,153,0.22)",
          }}
        >
          <div className="text-xs uppercase tracking-widest mb-2" style={{ color: "rgba(194,210,255,0.38)" }}>Trading Profit</div>
          <div className="font-black" style={{ fontFamily: "'Sora', sans-serif", color: "#34d399", fontSize: "1.1rem", lineHeight: 1.1 }}>
            {tradingBal.toFixed(4)}
          </div>
          <div className="text-xs mb-1 font-semibold" style={{ color: "rgba(52,211,153,0.6)" }}>WTA</div>
          {tokenPrice > 0 && (
            <div className="text-xs mb-2" style={{ color: "rgba(194,210,255,0.3)" }}>≈${(tradingBal * tokenPrice).toFixed(2)}</div>
          )}
          <button
            onClick={() => setShowConvertModal({ source: "trading" })}
            disabled={tradingBal <= 0}
            className="w-full py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-40"
            style={{
              background: tradingBal > 0 ? "linear-gradient(135deg, rgba(52,211,153,0.2), rgba(52,211,153,0.08))" : "rgba(52,211,153,0.05)",
              border: "1px solid rgba(52,211,153,0.35)",
              color: "#34d399",
            }}
          >
            Sell →
          </button>
        </div>

        {/* Team Benefit Wallet */}
        <div
          className="rounded-2xl p-4"
          style={{
            background: "linear-gradient(135deg, rgba(168,85,247,0.10), rgba(139,92,246,0.04))",
            border: "1px solid rgba(168,85,247,0.22)",
          }}
        >
          <div className="text-xs uppercase tracking-widest mb-2" style={{ color: "rgba(194,210,255,0.38)" }}>Team Benefit</div>
          <div className="font-black" style={{ fontFamily: "'Sora', sans-serif", color: "#c084fc", fontSize: "1.1rem", lineHeight: 1.1 }}>
            {teamBal.toFixed(4)}
          </div>
          <div className="text-xs mb-1 font-semibold" style={{ color: "rgba(168,85,247,0.6)" }}>WTA</div>
          {tokenPrice > 0 && (
            <div className="text-xs mb-2" style={{ color: "rgba(194,210,255,0.3)" }}>≈${(teamBal * tokenPrice).toFixed(2)}</div>
          )}
          <button
            onClick={() => setShowConvertModal({ source: "team" })}
            disabled={teamBal <= 0}
            className="w-full py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-40"
            style={{
              background: teamBal > 0 ? "linear-gradient(135deg, rgba(168,85,247,0.2), rgba(168,85,247,0.08))" : "rgba(168,85,247,0.05)",
              border: "1px solid rgba(168,85,247,0.35)",
              color: "#c084fc",
            }}
          >
            Sell →
          </button>
        </div>
      </div>

      {/* Info note */}
      <div className="flex gap-2.5 px-3 py-2.5 rounded-xl"
        style={{ background: "rgba(91,140,255,0.04)", border: "1px solid rgba(91,140,255,0.10)" }}>
        <AlertCircle size={13} className="shrink-0 mt-0.5" style={{ color: "rgba(91,140,255,0.6)" }} />
        <p className="text-xs leading-relaxed" style={{ color: "rgba(194,210,255,0.45)" }}>
          Tokens in these wallets are held by the platform. Click <strong style={{ color: "rgba(194,210,255,0.7)" }}>Sell</strong> to sell them on-chain and receive USDT in your Main Wallet.
        </p>
      </div>

      {/* ── WTA Token Balance (on-chain purchases) ── */}
      {(wtaHoldings && wtaHoldings.purchaseCount > 0) ? (
        <div
          className="rounded-2xl p-5"
          style={{
            background: "linear-gradient(135deg, rgba(91,140,255,0.10), rgba(61,92,224,0.04))",
            border: "1px solid rgba(91,140,255,0.22)",
          }}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{ background: "linear-gradient(135deg, rgba(91,140,255,0.18), rgba(91,140,255,0.06))", border: "1px solid rgba(91,140,255,0.28)" }}
              >
                <Coins size={16} style={{ color: TEAL }} />
              </div>
              <div>
                <div className="font-bold text-sm" style={{ color: "rgba(200,240,255,0.92)", fontFamily: "'Sora', sans-serif" }}>
                  WTA Token Balance
                </div>
                <div className="text-xs mt-0.5" style={{ color: "rgba(194,210,255,0.38)" }}>
                  On-chain · {wtaHoldings.purchaseCount} purchase{wtaHoldings.purchaseCount !== 1 ? "s" : ""}
                </div>
              </div>
            </div>
            <a
              href="/invest?tab=token"
              className="text-xs px-3 py-1.5 rounded-xl font-semibold"
              style={{ background: "rgba(91,140,255,0.12)", border: "1px solid rgba(91,140,255,0.28)", color: TEAL }}
            >
              Buy More
            </a>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {/* WTA Holding */}
            <div className="rounded-xl px-3 py-3" style={{ background: "rgba(91,140,255,0.06)", border: "1px solid rgba(91,140,255,0.14)" }}>
              <div className="flex items-center gap-1 text-xs mb-1" style={{ color: "rgba(194,210,255,0.4)" }}>
                <Coins size={10} /> Holding
              </div>
              <div className="font-black text-base" style={{ color: "rgba(200,240,255,0.92)", fontFamily: "'Sora', sans-serif", lineHeight: 1.1 }}>
                {parseFloat(wtaHoldings.totalWtaReceived).toFixed(4)}
              </div>
              <div className="text-xs mt-0.5 font-semibold" style={{ color: "rgba(91,140,255,0.7)" }}>WTA</div>
            </div>

            {/* Current Value */}
            <div className="rounded-xl px-3 py-3" style={{ background: "rgba(91,140,255,0.06)", border: "1px solid rgba(91,140,255,0.14)" }}>
              <div className="flex items-center gap-1 text-xs mb-1" style={{ color: "rgba(194,210,255,0.4)" }}>
                <TrendingDown size={10} /> Current Value
              </div>
              <div className="font-black text-base" style={{ color: TEAL, fontFamily: "'Sora', sans-serif", lineHeight: 1.1 }}>
                ${parseFloat(wtaHoldings.currentValue).toFixed(2)}
              </div>
              <div className="text-xs mt-0.5" style={{ color: "rgba(194,210,255,0.3)" }}>
                @{parseFloat(wtaHoldings.sellPrice).toFixed(4)} sell
              </div>
            </div>

            {/* Total Purchased */}
            <div className="rounded-xl px-3 py-3" style={{ background: "rgba(91,140,255,0.06)", border: "1px solid rgba(91,140,255,0.14)" }}>
              <div className="flex items-center gap-1 text-xs mb-1" style={{ color: "rgba(194,210,255,0.4)" }}>
                <PiggyBank size={10} /> Purchased
              </div>
              <div className="font-black text-base" style={{ color: "rgba(200,240,255,0.85)", fontFamily: "'Sora', sans-serif", lineHeight: 1.1 }}>
                ${parseFloat(wtaHoldings.totalUsdtSpent).toFixed(2)}
              </div>
              <div className="text-xs mt-0.5" style={{ color: "rgba(194,210,255,0.3)" }}>USDT spent</div>
            </div>
          </div>
        </div>
      ) : (
        <div
          className="rounded-2xl p-4 flex items-center gap-3"
          style={{ background: "rgba(91,140,255,0.04)", border: "1px solid rgba(91,140,255,0.10)" }}
        >
          <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: "rgba(91,140,255,0.08)", border: "1px solid rgba(91,140,255,0.18)" }}>
            <Coins size={15} style={{ color: "rgba(91,140,255,0.6)" }} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold" style={{ color: "rgba(194,210,255,0.7)" }}>WTA Token Balance</div>
            <div className="text-xs mt-0.5" style={{ color: "rgba(194,210,255,0.35)" }}>
              No on-chain purchases yet · <a href="/invest?tab=token" style={{ color: TEAL }}>Buy WTA tokens</a>
            </div>
          </div>
        </div>
      )}


      {/* ── Earnings Stats ── */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total Earnings",     value: summary?.totalEarnings     },
          { label: "Pending Withdrawal", value: summary?.pendingWithdrawal },
          { label: "Total Withdrawn",    value: summary?.withdrawnTotal    },
        ].map(item => (
          <div key={item.label} className="rounded-xl p-3.5" style={GLASS}>
            <div className="text-xs mb-1" style={{ color: "rgba(194,210,255,0.38)" }}>{item.label}</div>
            <div className="font-bold text-sm" style={{ color: "rgba(194,210,255,0.82)" }}>
              ${item.value?.toFixed(2) ?? "0.00"}
            </div>
          </div>
        ))}
      </div>

      {/* ── Action Buttons ── */}
      <div className="grid gap-2 grid-cols-3">
        {/* Deposit */}
        <button
          onClick={() => setShowDepositModal(true)}
          className="flex flex-col items-center justify-center gap-1.5 py-3 rounded-2xl font-bold text-xs transition-all active:scale-[0.97]"
          style={{
            background: "linear-gradient(135deg, #5B8CFF, #3D5CE0)",
            color: "#060814",
            boxShadow: "0 0 24px rgba(91,140,255,0.30)",
          }}
        >
          <ArrowDownLeft size={16} strokeWidth={2.5} />
          Deposit
        </button>

        {/* P2P */}
        <button
          onClick={() => setShowP2PModal(true)}
          className="flex flex-col items-center justify-center gap-1.5 py-3 rounded-2xl font-bold text-xs transition-all active:scale-[0.97]"
          style={{
            background: "linear-gradient(135deg, rgba(52,211,153,0.18), rgba(16,185,129,0.10))",
            border: "1px solid rgba(52,211,153,0.32)",
            color: "#34d399",
            boxShadow: "0 0 20px rgba(52,211,153,0.12)",
          }}
        >
          <ArrowLeftRight size={16} strokeWidth={2.5} />
          P2P
        </button>

        {/* Withdraw */}
        <button
          onClick={() => setLocation("/withdrawals")}
          className="flex flex-col items-center justify-center gap-1.5 py-3 rounded-2xl font-bold text-xs transition-all active:scale-[0.97]"
          style={{
            background: "linear-gradient(135deg, rgba(248,113,113,0.18), rgba(220,60,60,0.12))",
            border: "1px solid rgba(248,113,113,0.35)",
            color: "#f87171",
            boxShadow: "0 0 20px rgba(248,113,113,0.12)",
          }}
        >
          <ArrowUpRight size={16} strokeWidth={2.5} />
          Withdraw
        </button>
      </div>

      {/* ── Section Label ── */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-px" style={{ background: "rgba(91,140,255,0.08)" }} />
        <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: "rgba(194,210,255,0.28)" }}>
          Transaction History
        </span>
        <div className="flex-1 h-px" style={{ background: "rgba(91,140,255,0.08)" }} />
      </div>

      {/* ── Combined History ── */}
      {combined.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-2.5">
          {paginated.map(({ item, type }) => {
            const isDeposit = type === "deposit";
            const cfg = statusConfig[item.status] || statusConfig.pending;
            const accentColor = isDeposit ? TEAL : "#f87171";

            return (
              <button
                key={`${type}-${item.id}`}
                onClick={() => setSelected({ item, type })}
                className="w-full rounded-xl px-4 py-3.5 flex items-center justify-between text-left transition-all hover:brightness-125 active:scale-[0.99]"
                style={{ ...GLASS, cursor: "pointer" }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: `${accentColor}12`, border: `1px solid ${accentColor}28` }}
                  >
                    {isDeposit
                      ? <ArrowDownLeft size={16} style={{ color: accentColor }} />
                      : <ArrowUpRight  size={16} style={{ color: accentColor }} />}
                  </div>
                  <div>
                    <div className="text-sm font-semibold" style={{ color: "rgba(194,210,255,0.85)" }}>
                      {isDeposit ? "Deposit" : "Withdrawal"}{" "}
                      <span className="font-mono text-xs" style={{ color: "rgba(194,210,255,0.35)" }}>#{shortId(item.id)}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs mt-0.5">
                      <cfg.icon size={10} style={{ color: cfg.color }} />
                      <span style={{ color: cfg.color }}>{cfg.label}</span>
                      <span style={{ color: "rgba(194,210,255,0.25)" }}>·</span>
                      <span style={{ color: "rgba(194,210,255,0.35)" }}>{formatDate(item.createdAt)}</span>
                    </div>
                    {isDeposit && item.plan && (
                      <div className="text-xs mt-0.5" style={{ color: "rgba(194,210,255,0.25)" }}>
                        {planLabels[item.plan] ?? item.plan}
                      </div>
                    )}
                    {!isDeposit && item.walletAddress && (
                      <div className="text-xs mt-0.5 truncate max-w-[160px]" style={{ color: "rgba(194,210,255,0.25)" }}>
                        {item.walletAddress}
                      </div>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0 ml-3">
                  <div
                    className="font-bold text-sm"
                    style={{ color: isDeposit ? TEAL : "#f87171" }}
                  >
                    {isDeposit ? "+" : "−"}${item.amount?.toFixed(2)}
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: "rgba(194,210,255,0.28)" }}>Tap for details</div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      <Pagination
        page={page}
        totalPages={totalPages}
        total={total}
        pageSize={WALLET_PAGE_SIZE}
        onPrev={() => setPage(p => Math.max(1, p - 1))}
        onNext={() => setPage(p => Math.min(totalPages, p + 1))}
      />

      {/* Detail Modal */}
      {selected && (
        <DetailModal
          item={selected.item}
          type={selected.type}
          onClose={() => setSelected(null)}
        />
      )}

      {/* Deposit Modal */}
      {showDepositModal && (
        <DepositModal onClose={() => setShowDepositModal(false)} />
      )}

      {/* P2P Modal */}
      {showP2PModal && (
        <P2PModal
          usdtBalance={usdtBalance}
          onClose={() => setShowP2PModal(false)}
          onSuccess={(newUsdt) => {
            setLocalUsdtBal(newUsdt);
          }}
        />
      )}

      {/* Convert Modal */}
      {showConvertModal && (
        <ConvertModal
          source={showConvertModal.source}
          sourceBalance={showConvertModal.source === "trading" ? tradingBal : teamBal}
          tokenPrice={tokenPrice}
          onClose={() => setShowConvertModal(null)}
          onSuccess={(data) => {
            setLocalUsdtBal(data.walletBalance);
            setLocalTradingBal(data.tradingProfitBalance);
            setLocalTeamBal(data.teamBenefitBalance);
          }}
        />
      )}

    </div>
  );
}
