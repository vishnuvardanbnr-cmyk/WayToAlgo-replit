import { useState, useEffect, useCallback } from "react";
import { Users, RefreshCw, CheckCircle2, XCircle, ShieldAlert, Sparkles, ExternalLink } from "lucide-react";
import {
  isTokenConfigured, TOKEN_CONTRACT_ADDRESS,
  ensureBscNetwork, getAccount, getConnectedAccount, waitForReceipt,
  readLevelPercents, readOwner, setLevelPercents as writeLevelPercents,
  REFERRAL_LEVELS, BPS_DENOMINATOR,
} from "@/lib/tokenContract";

const TEAL = "#5B8CFF";
const INPUT_CLS = "w-full rounded-xl px-3 py-2.5 text-sm outline-none transition-all";
const INPUT_STYLE = {
  background: "rgba(10,14,30,0.6)",
  border: "1px solid rgba(91,140,255,0.18)",
  color: "rgba(200,240,255,0.95)",
} as const;

type Stage = "idle" | "switch_network" | "sending" | "confirming" | "success" | "failed";

const MAX_TOTAL_BPS = 9000; // must match contract MAX_TOTAL_BPS

/** Admin-only on-chain referral percentage configurator (owner MetaMask tx). */
export default function AdminTokenReferral() {
  const configured = isTokenConfigured();

  const [account, setAccount] = useState<string | null>(null);
  const [owner, setOwner] = useState<string | null>(null);
  // Percentages as human strings (e.g. "5" = 5%), one per level.
  const [percents, setPercents] = useState<string[]>(Array(REFERRAL_LEVELS).fill("0"));
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState<Stage>("idle");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const busy = stage === "switch_network" || stage === "sending" || stage === "confirming";

  const load = useCallback(async () => {
    if (!isTokenConfigured()) return;
    setLoading(true);
    try {
      const [bps, own] = await Promise.all([readLevelPercents(), readOwner().catch(() => null)]);
      setPercents(bps.map((b) => String(b / 100))); // bps -> percent
      if (own) setOwner(own);
    } catch (e: any) {
      setErrorMsg(e?.message ?? "Failed to read on-chain referral config.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (configured) {
      load();
      getConnectedAccount().then((a) => { if (a) setAccount(a); });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configured]);

  const connect = async () => {
    setErrorMsg(null);
    try {
      await ensureBscNetwork();
      const addr = await getAccount();
      setAccount(addr);
    } catch (e: any) {
      setErrorMsg(e?.message ?? "Failed to connect wallet.");
    }
  };

  const totalBps = percents.reduce((sum, p) => {
    const v = parseFloat(p);
    return sum + (isNaN(v) ? 0 : Math.round(v * 100));
  }, 0);
  const totalPct = totalBps / 100;
  const overCap = totalBps > MAX_TOTAL_BPS;

  const setPercentAt = (i: number, v: string) => {
    setPercents((prev) => prev.map((p, idx) => (idx === i ? v : p)));
  };

  const isOwner = !!(account && owner && account.toLowerCase() === owner.toLowerCase());

  const save = async () => {
    setErrorMsg(null); setTxHash(null);
    if (!configured) { setErrorMsg("Token contract address is not set yet."); return; }
    if (overCap) { setErrorMsg(`Total cannot exceed ${MAX_TOTAL_BPS / 100}%.`); return; }
    const bps = percents.map((p) => {
      const v = parseFloat(p);
      return isNaN(v) ? 0 : Math.round(v * 100);
    });
    try {
      setStage("switch_network");
      await ensureBscNetwork();
      const from = await getAccount();
      setAccount(from);
      if (owner && from.toLowerCase() !== owner.toLowerCase()) {
        setStage("failed");
        setErrorMsg("Connected wallet is not the contract owner. Switch to the owner wallet to update percentages.");
        return;
      }
      setStage("sending");
      const hash = await writeLevelPercents(bps);
      setTxHash(hash);
      setStage("confirming");
      const receipt = await waitForReceipt(hash);
      if (!receipt || receipt.status === "0x0") {
        setStage("failed"); setErrorMsg("Transaction reverted on-chain."); return;
      }
      setStage("success");
      await load();
    } catch (err: any) {
      if (err?.code === 4001) { setStage("idle"); return; }
      setStage("failed");
      setErrorMsg(err?.message ?? "Unknown error.");
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex gap-3 p-3.5 rounded-xl" style={{ background: "rgba(91,140,255,0.06)", border: "1px solid rgba(91,140,255,0.2)" }}>
        <Users size={16} className="shrink-0 mt-0.5" style={{ color: TEAL }} />
        <div className="text-xs leading-relaxed" style={{ color: "rgba(194,210,255,0.75)" }}>
          Set the per-level referral reward (up to {REFERRAL_LEVELS} levels). On every on-chain token purchase, each
          upline sponsor receives this percentage of the buyer's tokens — carved from the buyer's own allocation, so
          total supply is unaffected. Changing these values is an on-chain transaction signed by the
          <strong> contract owner</strong> wallet in MetaMask.
        </div>
      </div>

      {!configured ? (
        <div className="flex gap-2.5 px-4 py-3 rounded-xl" style={{ background: "rgba(91,140,255,0.06)", border: "1px solid rgba(91,140,255,0.2)" }}>
          <Sparkles size={15} className="shrink-0 mt-0.5" style={{ color: TEAL }} />
          <p className="text-xs leading-relaxed" style={{ color: "rgba(194,210,255,0.7)" }}>
            <span style={{ color: TEAL, fontWeight: 700 }}>Preview mode.</span> Referral percentages become editable once the deployed token contract address is set.
          </p>
        </div>
      ) : (
        <>
          {/* Wallet / owner status */}
          <div className="flex flex-wrap items-center gap-3 justify-between text-xs">
            <div style={{ color: "rgba(194,210,255,0.6)" }}>
              {account ? (
                <span className="font-mono">Connected: {account.slice(0, 6)}…{account.slice(-4)}{isOwner ? " · owner ✓" : owner ? " · not owner" : ""}</span>
              ) : (
                <span>Wallet not connected</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {!account && (
                <button onClick={connect} className="px-3 py-1.5 rounded-lg font-semibold" style={{ background: "rgba(91,140,255,0.12)", border: "1px solid rgba(91,140,255,0.3)", color: TEAL }}>
                  Connect Wallet
                </button>
              )}
              <button onClick={load} disabled={loading} className="px-3 py-1.5 rounded-lg flex items-center gap-1.5 disabled:opacity-60" style={{ background: "rgba(91,140,255,0.06)", border: "1px solid rgba(91,140,255,0.18)", color: "rgba(194,210,255,0.7)" }}>
                <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Refresh
              </button>
            </div>
          </div>

          {/* Per-level inputs */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {percents.map((p, i) => (
              <div key={i}>
                <label className="text-xs font-medium block mb-1.5" style={{ color: "rgba(194,210,255,0.6)" }}>
                  Level {i + 1}
                </label>
                <div className="relative">
                  <input
                    type="number" step="0.01" min="0"
                    value={p}
                    onChange={(e) => setPercentAt(i, e.target.value)}
                    className={INPUT_CLS + " pr-6"}
                    style={INPUT_STYLE}
                  />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs" style={{ color: "rgba(194,210,255,0.4)" }}>%</span>
                </div>
              </div>
            ))}
          </div>

          {/* Total */}
          <div className="flex items-center justify-between px-4 py-3 rounded-xl" style={{ background: overCap ? "rgba(248,113,113,0.06)" : "rgba(91,140,255,0.04)", border: `1px solid ${overCap ? "rgba(248,113,113,0.3)" : "rgba(91,140,255,0.12)"}` }}>
            <span className="text-xs" style={{ color: "rgba(194,210,255,0.6)" }}>Total referral payout per buy</span>
            <span className="font-bold text-sm" style={{ color: overCap ? "rgba(248,113,113,0.95)" : TEAL }}>
              {totalPct.toFixed(2)}% {overCap ? `· exceeds ${MAX_TOTAL_BPS / 100}% cap` : ""}
            </span>
          </div>

          {overCap && (
            <div className="flex gap-2 text-xs" style={{ color: "rgba(248,113,113,0.85)" }}>
              <ShieldAlert size={14} className="shrink-0 mt-0.5" />
              <span>The contract caps total referral payout at {MAX_TOTAL_BPS / 100}% so the buyer always keeps a share. Reduce the values to save.</span>
            </div>
          )}

          {/* Stage indicator */}
          {stage !== "idle" && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl" style={{
              background: stage === "success" ? "rgba(52,211,153,0.06)" : stage === "failed" ? "rgba(248,113,113,0.06)" : "rgba(91,140,255,0.06)",
              border: `1px solid ${stage === "success" ? "rgba(52,211,153,0.3)" : stage === "failed" ? "rgba(248,113,113,0.3)" : "rgba(91,140,255,0.2)"}`,
            }}>
              {busy && <RefreshCw size={14} className="animate-spin shrink-0" style={{ color: TEAL }} />}
              {stage === "success" && <CheckCircle2 size={14} className="shrink-0" style={{ color: "rgba(52,211,153,0.9)" }} />}
              {stage === "failed" && <XCircle size={14} className="shrink-0" style={{ color: "rgba(248,113,113,0.9)" }} />}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium" style={{ color: stage === "success" ? "rgba(52,211,153,0.95)" : stage === "failed" ? "rgba(248,113,113,0.9)" : "rgba(194,210,255,0.85)" }}>
                  {stage === "switch_network" && "Switching to BSC…"}
                  {stage === "sending" && "Confirm transaction in wallet…"}
                  {stage === "confirming" && "Waiting for confirmation…"}
                  {stage === "success" && "Referral percentages updated on-chain."}
                  {stage === "failed" && "Update failed"}
                </p>
                {errorMsg && stage === "failed" && (
                  <p className="text-xs mt-0.5 break-words" style={{ color: "rgba(194,210,255,0.4)" }}>{errorMsg}</p>
                )}
                {txHash && (
                  <a href={`https://bscscan.com/tx/${txHash}`} target="_blank" rel="noreferrer" className="text-xs mt-0.5 inline-flex items-center gap-1" style={{ color: TEAL }}>
                    View on BscScan <ExternalLink size={10} />
                  </a>
                )}
              </div>
            </div>
          )}

          {errorMsg && stage !== "failed" && (
            <p className="text-xs" style={{ color: "rgba(248,113,113,0.85)" }}>{errorMsg}</p>
          )}

          <div className="flex justify-end">
            <button
              onClick={save}
              disabled={busy || overCap || loading}
              className="px-8 py-3 rounded-xl font-bold transition-all disabled:opacity-60 flex items-center justify-center gap-2"
              style={{ background: TEAL, color: "#021018" }}
            >
              {busy ? <RefreshCw size={15} className="animate-spin" /> : <Users size={15} />}
              Save On-Chain
            </button>
          </div>

          <p className="text-xs" style={{ color: "rgba(194,210,255,0.3)" }}>
            Contract: <span className="font-mono">{TOKEN_CONTRACT_ADDRESS.slice(0, 10)}…{TOKEN_CONTRACT_ADDRESS.slice(-6)}</span>
          </p>
        </>
      )}
    </div>
  );
}
