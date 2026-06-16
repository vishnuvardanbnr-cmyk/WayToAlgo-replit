import { useState, useEffect } from "react";
import { CheckCircle2, Clock, XCircle, RefreshCw, ArrowDownToLine, Wallet, AlertTriangle, ExternalLink, Loader2, Send } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const TEAL = "#00FF94";
const GLASS = { background: "rgba(10,14,30,0.65)", backdropFilter: "blur(14px)", border: "1px solid rgba(0,255,148,0.10)" } as const;
const USDT_CONTRACT = "0x55d398326f99059fF775485246999027B3197955";
const BSC_CHAIN_ID = "0x38"; // 56 decimal

function getToken() { return localStorage.getItem("waytoalgo_token") || ""; }

type DepositRecord = {
  id: number; amount: number; status: string;
  sweepTxHash?: string | null; createdAt: string; creditedAt?: string | null;
};

const statusConfig: Record<string, { icon: typeof CheckCircle2; color: string; label: string }> = {
  pending:  { icon: Clock,        color: "rgba(251,191,36,0.9)",  label: "Pending" },
  sweeping: { icon: RefreshCw,    color: TEAL,                    label: "Sweeping" },
  credited: { icon: CheckCircle2, color: "rgba(52,211,153,0.9)",  label: "Credited" },
  failed:   { icon: XCircle,      color: "rgba(248,113,113,0.9)", label: "Failed" },
};

// Encode ERC-20/BEP-20 transfer(address,uint256) call data
function encodeTransfer(to: string, amountWei: bigint): string {
  const selector = "a9059cbb";
  const paddedTo = to.replace("0x", "").toLowerCase().padStart(64, "0");
  const paddedAmount = amountWei.toString(16).padStart(64, "0");
  return `0x${selector}${paddedTo}${paddedAmount}`;
}

// Parse a decimal USDT amount (e.g. "12.5") → bigint with 18 decimals
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

// balanceOf(address) on USDT contract
async function fetchUsdtBalance(walletAddress: string): Promise<bigint> {
  const eth = (window as any).ethereum;
  const data = "0x70a08231" + walletAddress.replace("0x", "").toLowerCase().padStart(64, "0");
  const hex: string = await eth.request({ method: "eth_call", params: [{ to: USDT_CONTRACT, data }, "latest"] });
  return BigInt(hex);
}

type Stage = "idle" | "switch_network" | "sending" | "confirming" | "sweeping" | "credited" | "failed";

async function refreshUser(onUpdate: (u: any) => void) {
  try {
    const res = await fetch("/api/auth/me", { headers: { Authorization: `Bearer ${getToken()}` } });
    if (res.ok) onUpdate(await res.json());
  } catch {}
}

export default function Deposit({ user, onUpdate }: { user: any; onUpdate?: (u: any) => void }) {
  const { toast } = useToast();
  const [depositAddress, setDepositAddress] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [result, setResult] = useState<{ amount?: number; sweepTxHash?: string; newBalance?: number; message?: string } | null>(null);
  const [history, setHistory] = useState<DepositRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [minDeposit, setMinDeposit] = useState(1);

  useEffect(() => {
    fetch("/api/deposits/address", { headers: { Authorization: `Bearer ${getToken()}` } })
      .then(r => r.json()).then(d => setDepositAddress(d.address)).catch(() => {});
    fetch("/api/settings/public").then(r => r.json()).then(d => {
      if (d.minDepositUsdt) setMinDeposit(parseFloat(d.minDepositUsdt));
    }).catch(() => {});
    fetchHistory();
  }, []);

  const fetchHistory = () => {
    setHistoryLoading(true);
    fetch("/api/deposits", { headers: { Authorization: `Bearer ${getToken()}` } })
      .then(r => r.json()).then(d => setHistory(Array.isArray(d) ? d : [])).catch(() => {})
      .finally(() => setHistoryLoading(false));
  };

  const handleDeposit = async () => {
    if (!depositAddress) { toast({ title: "Not ready", description: "Deposit address not loaded yet.", variant: "destructive" }); return; }
    const eth = (window as any).ethereum;
    if (!eth) { toast({ title: "MetaMask not found", description: "Please install MetaMask to use this feature.", variant: "destructive" }); return; }

    const parsedAmount = parseFloat(amount);
    if (!amount || isNaN(parsedAmount) || parsedAmount <= 0) {
      toast({ title: "Enter an amount", variant: "destructive" }); return;
    }
    if (parsedAmount < minDeposit) {
      toast({ title: `Minimum deposit is $${minDeposit} USDT`, variant: "destructive" }); return;
    }

    setResult(null);
    setTxHash(null);

    try {
      // 1. Ensure BSC network
      const chainId: string = await eth.request({ method: "eth_chainId" });
      if (chainId !== BSC_CHAIN_ID) {
        setStage("switch_network");
        try {
          await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: BSC_CHAIN_ID }] });
        } catch (switchErr: any) {
          if (switchErr.code === 4902) {
            await eth.request({
              method: "wallet_addEthereumChain",
              params: [{
                chainId: BSC_CHAIN_ID,
                chainName: "BNB Smart Chain",
                nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
                rpcUrls: ["https://bsc-dataseed.binance.org/"],
                blockExplorerUrls: ["https://bscscan.com"],
              }],
            });
          } else throw switchErr;
        }
      }

      // 2. Get sender account
      const accounts: string[] = await eth.request({ method: "eth_requestAccounts" });
      const from = accounts[0];
      if (!from) throw new Error("No wallet account found");

      // 3. Check USDT balance before sending — prevents MetaMask "likely to fail" warning
      const amountWei = parseUsdt(parsedAmount.toFixed(18));
      const usdtBalance = await fetchUsdtBalance(from);
      if (usdtBalance < amountWei) {
        const humanBal = (Number(usdtBalance) / 1e18).toFixed(2);
        setStage("failed");
        setResult({ message: `Insufficient USDT. Your wallet has ${humanBal} USDT but you're trying to send ${parsedAmount} USDT.` });
        return;
      }

      // 4. Send USDT transfer to deposit address
      setStage("sending");
      const data = encodeTransfer(depositAddress, amountWei);

      const hash: string = await eth.request({
        method: "eth_sendTransaction",
        params: [{
          from,
          to: USDT_CONTRACT,
          data,
          gas: "0x186A0", // 100 000 gas limit
        }],
      });

      setTxHash(hash);
      setStage("confirming");
      toast({ title: "Transaction submitted", description: "Waiting for BSC confirmation…" });

      // 4. Wait for on-chain confirmation
      const receipt = await waitForReceipt(hash);
      if (!receipt || receipt.status === "0x0") {
        setStage("failed");
        setResult({ message: "Transaction failed or reverted on-chain." });
        return;
      }

      // 5. Tell backend to sweep + credit
      setStage("sweeping");
      const res = await fetch("/api/deposits/check", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
      });
      const data2 = await res.json();
      setResult(data2);

      if (data2.status === "credited") {
        setStage("credited");
        setAmount("");
        toast({ title: `+$${data2.amount?.toFixed(2)} USDT Credited!`, description: "Your wallet balance has been updated." });
        fetchHistory();
        if (onUpdate) refreshUser(onUpdate);
      } else {
        setStage("failed");
        toast({ title: data2.message ?? "Sweep failed", variant: "destructive" });
      }
    } catch (err: any) {
      if (err?.code === 4001) {
        setStage("idle");
        toast({ title: "Transaction cancelled" });
      } else {
        setStage("failed");
        setResult({ message: err?.message ?? "Unknown error" });
        toast({ title: "Deposit failed", description: err?.message, variant: "destructive" });
      }
    }
  };

  const reset = () => { setStage("idle"); setResult(null); setTxHash(null); };

  const stageLabel: Record<Stage, string> = {
    idle: "",
    switch_network: "Switching to BSC network…",
    sending: "Confirm in MetaMask…",
    confirming: "Waiting for BSC confirmation…",
    sweeping: "Processing deposit…",
    credited: "Deposit credited!",
    failed: "Deposit failed",
  };

  const busy = stage !== "idle" && stage !== "credited" && stage !== "failed";

  return (
    <div className="px-4 py-6 max-w-xl mx-auto pb-24 md:pb-8 space-y-5">

      {/* Header */}
      <div className="flex items-center gap-3">
        <ArrowDownToLine size={20} style={{ color: TEAL }} />
        <h1 className="text-xl font-bold" style={{
          fontFamily: "'Sora', sans-serif",
          background: "linear-gradient(135deg, #B0FFE0, #00FF94)",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
        }}>Deposit USDT</h1>
      </div>

      {/* Wallet Balance */}
      <div className="flex items-center justify-between px-5 py-4 rounded-2xl"
        style={{ background: "rgba(0,255,148,0.06)", border: "1px solid rgba(0,255,148,0.18)" }}>
        <div className="flex items-center gap-3">
          <Wallet size={18} style={{ color: TEAL }} />
          <span className="text-sm font-medium" style={{ color: "rgba(176,255,224,0.7)" }}>Wallet Balance</span>
        </div>
        <span className="font-bold text-lg" style={{ color: TEAL, fontFamily: "'Sora', sans-serif" }}>
          ${parseFloat(user?.walletBalance ?? "0").toFixed(2)}
        </span>
      </div>

      {/* Deposit Card */}
      <div className="rounded-2xl p-5 space-y-5" style={GLASS}>

        <div>
          <h2 className="font-semibold text-sm mb-0.5" style={{ color: TEAL }}>Deposit via Connected Wallet</h2>
          <p className="text-xs" style={{ color: "rgba(176,255,224,0.4)" }}>
            USDT (BEP-20) will be sent from your MetaMask to your deposit address automatically.
          </p>
        </div>

        {/* Amount Input */}
        <div>
          <label className="block text-xs font-medium mb-2" style={{ color: "rgba(176,255,224,0.6)", letterSpacing: "0.05em" }}>
            AMOUNT (USDT)
          </label>
          <div className="relative">
            <input
              type="number"
              min={minDeposit}
              step="0.01"
              placeholder={`Min ${minDeposit} USDT`}
              value={amount}
              onChange={e => setAmount(e.target.value)}
              disabled={busy}
              className="w-full px-4 py-3 pr-16 rounded-xl text-sm outline-none disabled:opacity-50"
              style={{
                background: "rgba(0,20,40,0.7)",
                border: "1px solid rgba(0,255,148,0.22)",
                color: "rgba(176,255,224,0.9)",
              }}
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold"
              style={{ color: TEAL }}>USDT</span>
          </div>
          {/* Quick amount buttons */}
          <div className="flex gap-2 mt-2">
            {[10, 50, 100, 500].map(v => (
              <button
                key={v}
                onClick={() => setAmount(String(v))}
                disabled={busy}
                className="flex-1 py-1.5 rounded-lg text-xs font-medium transition-all disabled:opacity-40"
                style={{
                  background: amount === String(v) ? "rgba(0,255,148,0.2)" : "rgba(0,20,40,0.5)",
                  border: `1px solid ${amount === String(v) ? "rgba(0,255,148,0.4)" : "rgba(0,255,148,0.12)"}`,
                  color: amount === String(v) ? TEAL : "rgba(176,255,224,0.5)",
                }}
              >${v}</button>
            ))}
          </div>
        </div>

        {/* Warning */}
        <div className="flex gap-3 p-3 rounded-xl"
          style={{ background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.18)" }}>
          <AlertTriangle size={14} className="shrink-0 mt-0.5" style={{ color: "rgba(251,191,36,0.8)" }} />
          <p className="text-xs" style={{ color: "rgba(251,191,36,0.75)" }}>
            Make sure MetaMask is connected to <strong>BNB Smart Chain (BSC)</strong>. The app will switch automatically if needed.
          </p>
        </div>

        {/* Stage indicator */}
        {stage !== "idle" && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl"
            style={{
              background: stage === "credited" ? "rgba(52,211,153,0.06)" : stage === "failed" ? "rgba(248,113,113,0.06)" : "rgba(0,255,148,0.06)",
              border: `1px solid ${stage === "credited" ? "rgba(52,211,153,0.3)" : stage === "failed" ? "rgba(248,113,113,0.3)" : "rgba(0,255,148,0.2)"}`,
            }}>
            {busy && <Loader2 size={15} className="animate-spin shrink-0" style={{ color: TEAL }} />}
            {stage === "credited" && <CheckCircle2 size={15} className="shrink-0" style={{ color: "rgba(52,211,153,0.9)" }} />}
            {stage === "failed" && <XCircle size={15} className="shrink-0" style={{ color: "rgba(248,113,113,0.9)" }} />}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium" style={{
                color: stage === "credited" ? "rgba(52,211,153,0.95)" : stage === "failed" ? "rgba(248,113,113,0.9)" : "rgba(176,255,224,0.85)"
              }}>
                {stageLabel[stage]}
              </p>
              {result?.message && stage !== "credited" && (
                <p className="text-xs mt-0.5" style={{ color: "rgba(176,255,224,0.45)" }}>{result.message}</p>
              )}
              {stage === "credited" && result && (
                <p className="text-xs mt-0.5" style={{ color: "rgba(176,255,224,0.5)" }}>
                  New balance: <strong style={{ color: TEAL }}>${result.newBalance?.toFixed(2)}</strong>
                </p>
              )}
            </div>
            {txHash && (
              <a href={`https://bscscan.com/tx/${txHash}`} target="_blank" rel="noopener noreferrer" style={{ color: TEAL }}>
                <ExternalLink size={13} className="shrink-0" />
              </a>
            )}
          </div>
        )}

        {/* Sweep tx link on success */}
        {stage === "credited" && result?.sweepTxHash && (
          <a href={`https://bscscan.com/tx/${result.sweepTxHash}`} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs" style={{ color: TEAL }}>
            <ExternalLink size={11} /> View sweep on BSCScan
          </a>
        )}

        {/* Action Button */}
        {(stage === "idle" || stage === "failed") ? (
          <button
            onClick={stage === "failed" ? reset : handleDeposit}
            disabled={!depositAddress}
            className="w-full py-3.5 rounded-xl font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            style={{
              background: "linear-gradient(135deg, #00FF94, #00CC77)",
              color: "#050C0A",
              fontFamily: "'Sora', sans-serif",
              fontSize: "0.8rem",
              letterSpacing: "0.04em",
              boxShadow: "0 0 20px rgba(0,255,148,0.25)",
            }}
          >
            {stage === "failed" ? (
              <><RefreshCw size={15} /> Try Again</>
            ) : (
              <><Send size={15} /> Deposit Now</>
            )}
          </button>
        ) : stage === "credited" ? (
          <button
            onClick={reset}
            className="w-full py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2"
            style={{
              background: "rgba(52,211,153,0.12)",
              border: "1px solid rgba(52,211,153,0.35)",
              color: "rgba(52,211,153,0.9)",
            }}
          >
            <CheckCircle2 size={15} /> Make Another Deposit
          </button>
        ) : (
          <button disabled className="w-full py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 opacity-60"
            style={{ background: "linear-gradient(135deg, #00FF94, #00CC77)", color: "#050C0A", fontFamily: "'Sora', sans-serif", fontSize: "0.8rem", letterSpacing: "0.04em" }}>
            <Loader2 size={15} className="animate-spin" />
            {stageLabel[stage]}
          </button>
        )}
      </div>

      {/* Deposit History */}
      <div className="rounded-2xl p-5" style={GLASS}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-sm" style={{ color: TEAL }}>Deposit History</h2>
          <button onClick={fetchHistory} style={{ color: "rgba(0,255,148,0.5)" }}>
            <RefreshCw size={14} />
          </button>
        </div>

        {historyLoading ? (
          <div className="space-y-2">
            {[1, 2].map(i => <div key={i} className="h-14 rounded-xl animate-pulse" style={{ background: "rgba(0,255,148,0.04)" }} />)}
          </div>
        ) : history.length === 0 ? (
          <p className="text-sm text-center py-6" style={{ color: "rgba(176,255,224,0.3)" }}>No deposits yet</p>
        ) : (
          <div className="space-y-2">
            {history.map(dep => {
              const cfg = statusConfig[dep.status] ?? statusConfig.pending;
              const StatusIcon = cfg.icon;
              return (
                <div key={dep.id} className="flex items-center justify-between px-4 py-3 rounded-xl"
                  style={{ background: "rgba(0,15,30,0.5)", border: "1px solid rgba(0,255,148,0.07)" }}>
                  <div className="flex items-center gap-3">
                    <StatusIcon size={16} style={{ color: cfg.color }} />
                    <div>
                      <div className="text-sm font-medium" style={{ color: "rgba(176,255,224,0.85)" }}>
                        ${parseFloat(String(dep.amount)).toFixed(2)} USDT
                      </div>
                      <div className="text-xs" style={{ color: "rgba(176,255,224,0.35)" }}>
                        {new Date(dep.createdAt).toLocaleDateString()} · {cfg.label}
                      </div>
                    </div>
                  </div>
                  {dep.sweepTxHash && (
                    <a href={`https://bscscan.com/tx/${dep.sweepTxHash}`} target="_blank" rel="noopener noreferrer" style={{ color: TEAL }}>
                      <ExternalLink size={13} />
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
