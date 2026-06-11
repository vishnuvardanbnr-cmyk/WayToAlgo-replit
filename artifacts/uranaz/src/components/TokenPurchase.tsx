import { useState, useEffect, useCallback } from "react";
import {
  Coins, Wallet, RefreshCw, ArrowDownUp, CheckCircle2, XCircle,
  ExternalLink, TrendingUp, ShieldAlert, Sparkles, Droplet, Users, Layers,
} from "lucide-react";
import {
  isTokenConfigured, TOKEN_CONTRACT_ADDRESS,
  parseUnits18, formatUnits18, applySlippage,
  ensureBscNetwork, getAccount, getConnectedAccount, onAccountsChanged, waitForReceipt,
  readBuyPrice, readSellPrice, readQuoteBuy, readQuoteSell,
  readTokenBalance, readUsdtBalance, readAllowance, readSymbol,
  readTotalLiquidity, readTotalSupply, readHolderCount,
  readLevelPercents, REFERRAL_LEVELS, BPS_DENOMINATOR,
  approveUsdt, buyTokens, sellTokens,
} from "@/lib/tokenContract";

const ZERO_ADDR = "0x0000000000000000000000000000000000000000";

const TEAL = "#5B8CFF";
const GLASS = {
  background: "rgba(10,14,30,0.65)",
  backdropFilter: "blur(14px)",
  border: "1px solid rgba(91,140,255,0.12)",
} as const;

type Mode = "buy" | "sell";
type Stage =
  | "idle" | "switch_network" | "approving" | "approve_confirm"
  | "sending" | "confirming" | "success" | "failed";

const STAGE_LABEL: Record<Stage, string> = {
  idle: "",
  switch_network: "Switching to BSC…",
  approving: "Confirm USDT approval in wallet…",
  approve_confirm: "Waiting for approval confirmation…",
  sending: "Confirm transaction in wallet…",
  confirming: "Waiting for confirmation…",
  success: "Done!",
  failed: "Transaction failed",
};

export default function TokenPurchase({ user: _user }: { user: any }) {
  const configured = isTokenConfigured();

  const [account, setAccount] = useState<string | null>(null);
  const [symbol, setSymbol] = useState("WTA");
  const [mode, setMode] = useState<Mode>("buy");
  const [amount, setAmount] = useState("");

  const [buyPrice, setBuyPrice] = useState<bigint | null>(null);
  const [sellPrice, setSellPrice] = useState<bigint | null>(null);
  const [tokenBal, setTokenBal] = useState<bigint>(0n);
  const [usdtBal, setUsdtBal] = useState<bigint>(0n);
  const [quoteOut, setQuoteOut] = useState<bigint | null>(null);

  const [liquidity, setLiquidity] = useState<bigint | null>(null);
  const [supply, setSupply] = useState<bigint | null>(null);
  const [holders, setHolders] = useState<number | null>(null);

  // On-chain referral config + this user's upline (supplied by the website).
  const [uplines, setUplines] = useState<string[]>([]);
  const [levelPercents, setLevelPercents] = useState<number[]>([]);

  const [stage, setStage] = useState<Stage>("idle");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loadingChain, setLoadingChain] = useState(false);

  const busy = !["idle", "success", "failed"].includes(stage);

  /* ── load live on-chain data ── */
  // Display-only token-wide stats. Each read is independently guarded so an RPC
  // failure (e.g. eth_getLogs limits) only blanks that one stat, never trading.
  const loadStats = useCallback(async () => {
    if (!isTokenConfigured()) return;
    readTotalLiquidity().then(setLiquidity).catch(() => setLiquidity(null));
    readTotalSupply().then(setSupply).catch(() => setSupply(null));
    readHolderCount().then(setHolders).catch(() => setHolders(null));
  }, []);

  // Referral config: this user's upline (from the website's referral tree) and
  // the per-level reward percentages (from the contract). Isolated/non-fatal —
  // a failure just means no referral breakdown is shown, never blocks trading.
  const loadReferral = useCallback(async () => {
    if (!isTokenConfigured()) return;
    readLevelPercents().then(setLevelPercents).catch(() => setLevelPercents([]));
    try {
      const res = await fetch("/api/token/upline", {
        headers: { Authorization: `Bearer ${localStorage.getItem("waytoalgo_token") || ""}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data?.addresses)) setUplines(data.addresses);
      }
    } catch { /* non-fatal */ }
  }, []);

  const refreshChain = useCallback(async (addr?: string | null) => {
    setLoadingChain(true);
    try {
      const who = addr ?? account;
      if (configured) {
        const [bp, sp, sym] = await Promise.all([readBuyPrice(), readSellPrice(), readSymbol()]);
        setBuyPrice(bp); setSellPrice(sp); setSymbol(sym);
        if (who) {
          const [tb, ub] = await Promise.all([readTokenBalance(who), readUsdtBalance(who)]);
          setTokenBal(tb); setUsdtBal(ub);
        }
        // Token-wide stats are display-only — fetch them on an isolated path so a
        // stats/RPC failure can never break the core price & balance refresh.
        loadStats();
      } else if (who) {
        // Preview mode: contract not set, but USDT balance is still readable.
        const ub = await readUsdtBalance(who);
        setUsdtBal(ub);
      }
    } catch {
      /* read failures are non-fatal — the UI just shows placeholders */
    } finally {
      setLoadingChain(false);
    }
  }, [configured, account, loadStats]);

  useEffect(() => {
    if (configured) { refreshChain(null); loadReferral(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configured]);

  /* ── auto-detect an already-connected wallet (no popup) + react to changes ── */
  useEffect(() => {
    let active = true;
    getConnectedAccount().then((addr) => {
      if (active && addr) { setAccount(addr); refreshChain(addr); }
    });
    const unsubscribe = onAccountsChanged((addr) => {
      setAccount(addr);
      if (addr) refreshChain(addr);
      else { setTokenBal(0n); setUsdtBal(0n); }
    });
    return () => { active = false; unsubscribe(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── live quote as the user types ── */
  useEffect(() => {
    if (!configured) return;
    const parsed = parseFloat(amount);
    if (!amount || isNaN(parsed) || parsed <= 0) { setQuoteOut(null); return; }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const wei = parseUnits18(amount);
        const q = mode === "buy" ? await readQuoteBuy(wei) : await readQuoteSell(wei);
        if (!cancelled) setQuoteOut(q);
      } catch {
        if (!cancelled) setQuoteOut(null);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [amount, mode, configured]);

  const connect = async () => {
    try {
      await ensureBscNetwork();
      const addr = await getAccount();
      setAccount(addr);
      await refreshChain(addr);
    } catch (e: any) {
      setErrorMsg(e?.message ?? "Failed to connect wallet.");
    }
  };

  const reset = () => { setStage("idle"); setTxHash(null); setErrorMsg(null); };

  const handleSubmit = async () => {
    setErrorMsg(null); setTxHash(null);
    if (!configured) { setErrorMsg("Trading is not enabled yet — the contract address has not been set."); return; }
    const parsed = parseFloat(amount);
    if (!amount || isNaN(parsed) || parsed <= 0) { setErrorMsg("Enter a valid amount."); return; }

    try {
      setStage("switch_network");
      await ensureBscNetwork();
      const from = await getAccount();
      setAccount(from);
      const wei = parseUnits18(amount);

      if (mode === "buy") {
        if (wei > usdtBal) {
          setStage("failed");
          setErrorMsg(`Insufficient USDT. Your wallet has ${formatUnits18(usdtBal, 2)} USDT.`);
          return;
        }
        // approve USDT to the token contract if needed
        const allowance = await readAllowance(from);
        if (allowance < wei) {
          setStage("approving");
          const aHash = await approveUsdt(wei);
          setStage("approve_confirm");
          const aReceipt = await waitForReceipt(aHash);
          if (!aReceipt || aReceipt.status === "0x0") {
            setStage("failed"); setErrorMsg("USDT approval failed on-chain."); return;
          }
        }
        const gross = await readQuoteBuy(wei);
        // Referral rewards are carved from the buyer's gross mint, so slippage
        // must protect the NET amount the buyer actually receives.
        const refBps = BigInt(activeReferralBps);
        const net = gross - (gross * refBps) / BigInt(BPS_DENOMINATOR);
        const minOut = applySlippage(net);
        setStage("sending");
        const hash = await buyTokens(wei, minOut, uplines);
        setTxHash(hash);
        setStage("confirming");
        const receipt = await waitForReceipt(hash);
        if (!receipt || receipt.status === "0x0") {
          setStage("failed"); setErrorMsg("Buy transaction reverted on-chain."); return;
        }
      } else {
        if (wei > tokenBal) {
          setStage("failed");
          setErrorMsg(`Insufficient ${symbol}. You hold ${formatUnits18(tokenBal, 4)} ${symbol}.`);
          return;
        }
        const quote = await readQuoteSell(wei);
        const minOut = applySlippage(quote);
        setStage("sending");
        const hash = await sellTokens(wei, minOut);
        setTxHash(hash);
        setStage("confirming");
        const receipt = await waitForReceipt(hash);
        if (!receipt || receipt.status === "0x0") {
          setStage("failed"); setErrorMsg("Sell transaction reverted on-chain."); return;
        }
      }

      setStage("success");
      setAmount("");
      setQuoteOut(null);
      await refreshChain(from);
    } catch (err: any) {
      if (err?.code === 4001) { setStage("idle"); return; } // user rejected
      setStage("failed");
      setErrorMsg(err?.message ?? "Unknown error.");
    }
  };

  // ── Referral breakdown (buy only) ──
  // A level contributes only when the website supplied a real upline address
  // AND the admin set a non-zero percent for it. Rewards are carved from the
  // buyer's gross mint (totalSupply unaffected), so the buyer receives the rest.
  const activeReferralBps = (() => {
    let sum = 0;
    const self = account ? account.toLowerCase() : null;
    const n = Math.min(uplines.length, levelPercents.length, REFERRAL_LEVELS);
    for (let i = 0; i < n; i++) {
      const ref = uplines[i] ? uplines[i].toLowerCase() : "";
      // Mirror the contract: zero-address, self, and zero-percent levels are skipped.
      if (ref && ref !== ZERO_ADDR && ref !== self && levelPercents[i] > 0) {
        sum += levelPercents[i];
      }
    }
    return sum;
  })();
  const grossBuy = mode === "buy" ? quoteOut : null;
  const referralTokens =
    grossBuy !== null ? (grossBuy * BigInt(activeReferralBps)) / BigInt(BPS_DENOMINATOR) : 0n;
  const netBuyTokens = grossBuy !== null ? grossBuy - referralTokens : null;
  const referralPct = (activeReferralBps / BPS_DENOMINATOR) * 100;

  const priceUsdt = buyPrice !== null ? formatUnits18(buyPrice, 6) : "—";
  const sellPriceUsdt = sellPrice !== null ? formatUnits18(sellPrice, 6) : "—";
  const liquidityUsdt = liquidity !== null ? formatUnits18(liquidity, 2) : "—";
  const supplyDisplay = supply !== null ? formatUnits18(supply, 2) : "—";
  const holdersDisplay = holders !== null ? holders.toLocaleString() : "—";
  const balForMode = mode === "buy" ? usdtBal : tokenBal;
  const balLabel = mode === "buy" ? "USDT" : symbol;

  return (
    <div className="space-y-4">
      {/* Preview notice — shown until the deployed contract address is set */}
      {!configured && (
        <div className="flex gap-2.5 px-4 py-3 rounded-2xl" style={{ background: "rgba(91,140,255,0.06)", border: "1px solid rgba(91,140,255,0.2)" }}>
          <Sparkles size={15} className="shrink-0 mt-0.5" style={{ color: TEAL }} />
          <p className="text-xs leading-relaxed" style={{ color: "rgba(194,210,255,0.7)" }}>
            <span style={{ color: TEAL, fontWeight: 700 }}>Preview mode.</span> This is exactly how the live Buy/Sell screen will look. Prices, balances and trading turn on automatically once the deployed contract address is added.
          </p>
        </div>
      )}

      {/* Price header */}
      <div className="rounded-2xl p-5" style={GLASS}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-2xl flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, rgba(91,140,255,0.18), rgba(91,140,255,0.06))", border: "1px solid rgba(91,140,255,0.28)" }}
            >
              <Coins size={18} style={{ color: TEAL }} />
            </div>
            <div>
              <div className="font-bold tracking-wide" style={{ color: "rgba(200,240,255,0.92)", fontFamily: "'Sora', sans-serif", fontSize: "0.85rem" }}>
                {symbol} Token
              </div>
              <div className="text-xs mt-0.5" style={{ color: "rgba(194,210,255,0.4)" }}>On-chain · BNB Smart Chain</div>
            </div>
          </div>
          <button
            onClick={() => refreshChain()}
            disabled={loadingChain}
            className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{ background: "rgba(194,210,255,0.06)", border: "1px solid rgba(194,210,255,0.09)" }}
            title="Refresh"
          >
            <RefreshCw size={13} className={loadingChain ? "animate-spin" : ""} style={{ color: "rgba(194,210,255,0.5)" }} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl px-3 py-2.5" style={{ background: "rgba(91,140,255,0.06)", border: "1px solid rgba(91,140,255,0.12)" }}>
            <div className="flex items-center gap-1 text-xs mb-0.5" style={{ color: "rgba(194,210,255,0.4)" }}>
              <TrendingUp size={11} /> Buy Price
            </div>
            <div className="font-bold text-sm" style={{ color: TEAL }}>{priceUsdt} USDT</div>
          </div>
          <div className="rounded-xl px-3 py-2.5" style={{ background: "rgba(194,210,255,0.04)", border: "1px solid rgba(194,210,255,0.1)" }}>
            <div className="text-xs mb-0.5" style={{ color: "rgba(194,210,255,0.4)" }}>Sell Price</div>
            <div className="font-bold text-sm" style={{ color: "rgba(200,240,255,0.85)" }}>{sellPriceUsdt} USDT</div>
          </div>
        </div>

        {/* Token-wide on-chain stats */}
        <div className="grid grid-cols-3 gap-2 mt-2">
          <div className="rounded-xl px-3 py-2.5" style={{ background: "rgba(194,210,255,0.04)", border: "1px solid rgba(194,210,255,0.1)" }}>
            <div className="flex items-center gap-1 text-xs mb-0.5" style={{ color: "rgba(194,210,255,0.4)" }}>
              <Droplet size={11} /> Liquidity
            </div>
            <div className="font-bold text-sm truncate" style={{ color: "rgba(200,240,255,0.85)" }}>
              {liquidityUsdt}<span className="text-xs font-normal" style={{ color: "rgba(194,210,255,0.4)" }}> USDT</span>
            </div>
          </div>
          <div className="rounded-xl px-3 py-2.5" style={{ background: "rgba(194,210,255,0.04)", border: "1px solid rgba(194,210,255,0.1)" }}>
            <div className="flex items-center gap-1 text-xs mb-0.5" style={{ color: "rgba(194,210,255,0.4)" }}>
              <Layers size={11} /> Supply
            </div>
            <div className="font-bold text-sm truncate" style={{ color: "rgba(200,240,255,0.85)" }}>{supplyDisplay}</div>
          </div>
          <div className="rounded-xl px-3 py-2.5" style={{ background: "rgba(194,210,255,0.04)", border: "1px solid rgba(194,210,255,0.1)" }}>
            <div className="flex items-center gap-1 text-xs mb-0.5" style={{ color: "rgba(194,210,255,0.4)" }}>
              <Users size={11} /> Holders
            </div>
            <div className="font-bold text-sm truncate" style={{ color: "rgba(200,240,255,0.85)" }}>{holdersDisplay}</div>
          </div>
        </div>
      </div>

      {/* Wallet / trade card */}
      <div className="rounded-2xl p-5" style={GLASS}>
        {!account ? (
          <button
            onClick={connect}
            className="w-full py-3.5 rounded-2xl font-bold flex items-center justify-center gap-2"
            style={{
              background: "linear-gradient(135deg, #5B8CFF, #3D5CE0)", color: "#060814",
              fontFamily: "'Sora', sans-serif", fontSize: "0.75rem", letterSpacing: "0.05em",
              boxShadow: "0 0 24px rgba(91,140,255,0.25)",
            }}
          >
            <Wallet size={15} /> Connect Wallet
          </button>
        ) : (
          <>
            {/* connected address + balances */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "#34d399", boxShadow: "0 0 6px #34d399" }} />
                <span className="text-xs font-mono" style={{ color: "rgba(194,210,255,0.55)" }}>
                  {account.slice(0, 6)}…{account.slice(-4)}
                </span>
              </div>
              <div className="text-xs" style={{ color: "rgba(194,210,255,0.4)" }}>
                {symbol}: <span style={{ color: "rgba(200,240,255,0.8)", fontWeight: 600 }}>{formatUnits18(tokenBal, 4)}</span>
              </div>
            </div>

            {/* buy/sell switch */}
            <div className="flex gap-1.5 p-1 rounded-xl mb-4" style={{ background: "rgba(0,20,40,0.5)", border: "1px solid rgba(91,140,255,0.1)" }}>
              {(["buy", "sell"] as Mode[]).map(m => (
                <button
                  key={m}
                  onClick={() => { setMode(m); setAmount(""); setQuoteOut(null); reset(); }}
                  disabled={busy}
                  className="flex-1 py-2 rounded-lg text-xs font-bold transition-all disabled:opacity-50"
                  style={{
                    background: mode === m ? (m === "buy" ? "linear-gradient(135deg, rgba(91,140,255,0.22), rgba(91,140,255,0.08))" : "linear-gradient(135deg, rgba(248,113,113,0.2), rgba(248,113,113,0.07))") : "transparent",
                    border: mode === m ? `1px solid ${m === "buy" ? "rgba(91,140,255,0.4)" : "rgba(248,113,113,0.4)"}` : "1px solid transparent",
                    color: mode === m ? (m === "buy" ? TEAL : "#f87171") : "rgba(194,210,255,0.4)",
                    textTransform: "uppercase", letterSpacing: "0.05em",
                  }}
                >
                  {m}
                </button>
              ))}
            </div>

            {/* amount input */}
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs" style={{ color: "rgba(194,210,255,0.55)" }}>
                  You pay ({balLabel})
                </label>
                <button
                  onClick={() => setAmount(formatUnits18(balForMode, mode === "buy" ? 2 : 6))}
                  disabled={busy}
                  className="text-xs font-semibold"
                  style={{ color: TEAL }}
                >
                  Max: {formatUnits18(balForMode, mode === "buy" ? 2 : 4)}
                </button>
              </div>
              <div className="relative">
                <input
                  type="number" min="0" step="any"
                  placeholder="0.00"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  disabled={busy}
                  className="w-full px-4 py-3 pr-20 rounded-xl text-sm outline-none disabled:opacity-50"
                  style={{ background: "rgba(0,20,40,0.7)", border: "1px solid rgba(91,140,255,0.22)", color: "rgba(194,210,255,0.9)" }}
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold" style={{ color: TEAL }}>{balLabel}</span>
              </div>
            </div>

            {/* estimated output */}
            <div className="flex items-center justify-center my-1">
              <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: "rgba(91,140,255,0.08)", border: "1px solid rgba(91,140,255,0.15)" }}>
                <ArrowDownUp size={13} style={{ color: "rgba(194,210,255,0.5)" }} />
              </div>
            </div>

            <div className="mb-4 rounded-xl px-4 py-3" style={{ background: "rgba(91,140,255,0.04)", border: "1px solid rgba(91,140,255,0.1)" }}>
              <div className="text-xs mb-0.5" style={{ color: "rgba(194,210,255,0.4)" }}>
                You receive (estimated)
              </div>
              <div className="font-bold text-base" style={{ color: mode === "buy" ? TEAL : "#34d399" }}>
                {mode === "buy"
                  ? (netBuyTokens !== null ? formatUnits18(netBuyTokens, 4) : "—")
                  : (quoteOut !== null ? formatUnits18(quoteOut, 4) : "—")}{" "}
                <span className="text-xs font-normal" style={{ color: "rgba(194,210,255,0.45)" }}>
                  {mode === "buy" ? symbol : "USDT"}
                </span>
              </div>
              {mode === "buy" && activeReferralBps > 0 && grossBuy !== null && (
                <div className="flex items-center gap-1.5 text-xs mt-1.5" style={{ color: "rgba(194,210,255,0.45)" }}>
                  <Users size={11} style={{ color: TEAL }} />
                  <span>
                    {formatUnits18(referralTokens, 4)} {symbol} ({referralPct.toFixed(2)}%) shared to your upline team
                  </span>
                </div>
              )}
              <div className="text-xs mt-1" style={{ color: "rgba(194,210,255,0.3)" }}>
                Includes the contract's 10% spread · 1% slippage protection
                {mode === "buy" && activeReferralBps > 0 ? " · referral reward" : ""}
              </div>
            </div>

            {/* stage indicator */}
            {stage !== "idle" && (
              <div
                className="flex items-center gap-3 px-4 py-3 rounded-xl mb-3"
                style={{
                  background: stage === "success" ? "rgba(52,211,153,0.06)" : stage === "failed" ? "rgba(248,113,113,0.06)" : "rgba(91,140,255,0.06)",
                  border: `1px solid ${stage === "success" ? "rgba(52,211,153,0.3)" : stage === "failed" ? "rgba(248,113,113,0.3)" : "rgba(91,140,255,0.2)"}`,
                }}
              >
                {busy && <RefreshCw size={14} className="animate-spin shrink-0" style={{ color: TEAL }} />}
                {stage === "success" && <CheckCircle2 size={14} className="shrink-0" style={{ color: "rgba(52,211,153,0.9)" }} />}
                {stage === "failed" && <XCircle size={14} className="shrink-0" style={{ color: "rgba(248,113,113,0.9)" }} />}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium" style={{
                    color: stage === "success" ? "rgba(52,211,153,0.95)" : stage === "failed" ? "rgba(248,113,113,0.9)" : "rgba(194,210,255,0.85)",
                  }}>{STAGE_LABEL[stage]}</p>
                  {errorMsg && stage === "failed" && (
                    <p className="text-xs mt-0.5 break-words" style={{ color: "rgba(194,210,255,0.4)" }}>{errorMsg}</p>
                  )}
                </div>
                {txHash && (
                  <a href={`https://bscscan.com/tx/${txHash}`} target="_blank" rel="noopener noreferrer" style={{ color: TEAL }}>
                    <ExternalLink size={12} className="shrink-0" />
                  </a>
                )}
              </div>
            )}

            {errorMsg && stage !== "failed" && (
              <p className="text-xs mb-3" style={{ color: "#f87171" }}>{errorMsg}</p>
            )}

            {/* action button */}
            <button
              onClick={stage === "failed" ? reset : handleSubmit}
              disabled={busy || !configured}
              className="w-full py-3.5 rounded-2xl font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              style={{
                background: !configured
                  ? "rgba(194,210,255,0.08)"
                  : mode === "buy"
                    ? "linear-gradient(135deg, #5B8CFF, #3D5CE0)"
                    : "linear-gradient(135deg, #f87171, #dc4f4f)",
                color: !configured ? "rgba(194,210,255,0.6)" : mode === "buy" ? "#060814" : "#fff",
                fontFamily: "'Sora', sans-serif", fontSize: "0.75rem", letterSpacing: "0.05em",
                boxShadow: !configured ? "none" : mode === "buy" ? "0 0 24px rgba(91,140,255,0.25)" : "0 0 24px rgba(248,113,113,0.2)",
              }}
            >
              {!configured ? (
                <><Coins size={14} /> {mode === "buy" ? "Buy" : "Sell"} — Available Soon</>
              ) : busy ? (
                <><RefreshCw size={14} className="animate-spin" /> {STAGE_LABEL[stage]}</>
              ) : stage === "failed" ? (
                <><RefreshCw size={14} /> Try Again</>
              ) : (
                <><Coins size={14} /> {mode === "buy" ? `Buy ${symbol}` : `Sell ${symbol}`}</>
              )}
            </button>

            {/* info */}
            <div className="flex gap-2.5 px-3 py-2.5 rounded-xl mt-3" style={{ background: "rgba(251,191,36,0.05)", border: "1px solid rgba(251,191,36,0.16)" }}>
              <ShieldAlert size={13} className="shrink-0 mt-0.5" style={{ color: "rgba(251,191,36,0.75)" }} />
              <p className="text-xs leading-relaxed" style={{ color: "rgba(251,191,36,0.75)" }}>
                This is a real on-chain transaction from your own wallet — separate from your platform balance. Buying first requires a one-time USDT approval.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
