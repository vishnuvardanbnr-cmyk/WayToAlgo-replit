import { useState, useEffect, useCallback } from "react";
import { Link } from "wouter";
import {
  Coins, RefreshCw, TrendingUp, Droplet, Layers, Users,
  Wallet, PiggyBank, ArrowRight, Sparkles,
} from "lucide-react";
import {
  isTokenConfigured, formatUnits18,
  getConnectedAccount, onAccountsChanged,
  readBuyPrice, readSellPrice, readSymbol,
  readTotalLiquidity, readTotalSupply, readHolderCount,
  readTokenBalance, readUserPurchase,
} from "@/lib/tokenContract";

const TEAL = "#5B8CFF";
const GLASS = {
  background: "rgba(10,14,30,0.65)",
  backdropFilter: "blur(14px)",
  border: "1px solid rgba(91,140,255,0.12)",
} as const;

const DECIMALS_BASE = 10n ** 18n;

export default function DashboardTokenCard() {
  const configured = isTokenConfigured();

  const [account, setAccount] = useState<string | null>(null);
  const [symbol, setSymbol] = useState("TOKEN");

  const [buyPrice, setBuyPrice] = useState<bigint | null>(null);
  const [sellPrice, setSellPrice] = useState<bigint | null>(null);
  const [liquidity, setLiquidity] = useState<bigint | null>(null);
  const [supply, setSupply] = useState<bigint | null>(null);
  const [holders, setHolders] = useState<number | null>(null);

  const [tokenBal, setTokenBal] = useState<bigint>(0n);
  const [usdtSpent, setUsdtSpent] = useState<bigint | null>(null);
  const [loading, setLoading] = useState(false);

  // Token-wide stats — each read independently guarded so an RPC failure
  // (e.g. eth_getLogs limits) only blanks that one stat.
  const loadStats = useCallback(() => {
    if (!isTokenConfigured()) return;
    readBuyPrice().then(setBuyPrice).catch(() => setBuyPrice(null));
    readSellPrice().then(setSellPrice).catch(() => setSellPrice(null));
    readSymbol().then(setSymbol).catch(() => {});
    readTotalLiquidity().then(setLiquidity).catch(() => setLiquidity(null));
    readTotalSupply().then(setSupply).catch(() => setSupply(null));
    readHolderCount().then(setHolders).catch(() => setHolders(null));
  }, []);

  // This user's holdings + cost basis (USDT spent buying), derived from the
  // contract's TokensBought events. Isolated/non-fatal.
  const loadHoldings = useCallback((addr: string | null) => {
    if (!isTokenConfigured() || !addr) {
      setTokenBal(0n); setUsdtSpent(null);
      return;
    }
    readTokenBalance(addr).then(setTokenBal).catch(() => setTokenBal(0n));
    readUserPurchase(addr)
      .then((r) => setUsdtSpent(r ? r.usdtSpent : null))
      .catch(() => setUsdtSpent(null));
  }, []);

  const refresh = useCallback((addr?: string | null) => {
    setLoading(true);
    try {
      loadStats();
      loadHoldings(addr ?? account);
    } finally {
      setLoading(false);
    }
  }, [account, loadStats, loadHoldings]);

  useEffect(() => {
    if (configured) loadStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configured]);

  // Auto-detect an already-connected wallet (no popup) + react to changes.
  useEffect(() => {
    let active = true;
    getConnectedAccount().then((addr) => {
      if (active && addr) { setAccount(addr); loadHoldings(addr); }
    });
    const unsubscribe = onAccountsChanged((addr) => {
      setAccount(addr);
      loadHoldings(addr);
    });
    return () => { active = false; unsubscribe(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const priceUsdt = buyPrice !== null ? formatUnits18(buyPrice, 6) : "—";
  const sellPriceUsdt = sellPrice !== null ? formatUnits18(sellPrice, 6) : "—";
  const liquidityUsdt = liquidity !== null ? formatUnits18(liquidity, 2) : "—";
  const supplyDisplay = supply !== null ? formatUnits18(supply, 2) : "—";
  const holdersDisplay = holders !== null ? holders.toLocaleString() : "—";

  // Current value = holding marked at the live sell price.
  const currentValue =
    sellPrice !== null ? (tokenBal * sellPrice) / DECIMALS_BASE : null;
  const hasHoldings = configured && account && tokenBal > 0n;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-sm tracking-wide" style={{ color: "rgba(194,210,255,0.8)" }}>
          {symbol} Token
        </h2>
        <Link href="/invest?tab=token" className="text-xs flex items-center gap-1" style={{ color: TEAL }}>
          Buy / Sell <ArrowRight size={12} />
        </Link>
      </div>

      <div className="rounded-2xl p-5" style={GLASS}>
        {/* header */}
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
            onClick={() => refresh()}
            disabled={loading}
            className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{ background: "rgba(194,210,255,0.06)", border: "1px solid rgba(194,210,255,0.09)" }}
            title="Refresh"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} style={{ color: "rgba(194,210,255,0.5)" }} />
          </button>
        </div>

        {/* price row */}
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

        {/* token-wide stats */}
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

        {/* my holdings */}
        {hasHoldings ? (
          <div className="mt-3 rounded-xl p-3" style={{ background: "linear-gradient(135deg, rgba(91,140,255,0.08), rgba(61,92,224,0.03))", border: "1px solid rgba(91,140,255,0.18)" }}>
            <div className="flex items-center gap-1.5 text-xs mb-2.5" style={{ color: "rgba(194,210,255,0.55)" }}>
              <Wallet size={12} style={{ color: TEAL }} /> My Holdings
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <div className="text-xs" style={{ color: "rgba(194,210,255,0.4)" }}>Holding</div>
                <div className="font-bold text-sm mt-0.5" style={{ color: "rgba(200,240,255,0.9)" }}>
                  {formatUnits18(tokenBal, 4)}
                </div>
              </div>
              <div>
                <div className="text-xs" style={{ color: "rgba(194,210,255,0.4)" }}>Current Value</div>
                <div className="font-bold text-sm mt-0.5" style={{ color: TEAL }}>
                  {currentValue !== null ? formatUnits18(currentValue, 2) : "—"}
                  <span className="text-xs font-normal" style={{ color: "rgba(194,210,255,0.4)" }}> USDT</span>
                </div>
              </div>
              <div>
                <div className="flex items-center gap-1 text-xs" style={{ color: "rgba(194,210,255,0.4)" }}>
                  <PiggyBank size={10} /> Purchased
                </div>
                <div className="font-bold text-sm mt-0.5" style={{ color: "rgba(200,240,255,0.9)" }}>
                  {usdtSpent !== null ? formatUnits18(usdtSpent, 2) : "—"}
                  <span className="text-xs font-normal" style={{ color: "rgba(194,210,255,0.4)" }}> USDT</span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-3 flex gap-2.5 px-3 py-2.5 rounded-xl" style={{ background: "rgba(91,140,255,0.05)", border: "1px solid rgba(91,140,255,0.12)" }}>
            <Sparkles size={13} className="shrink-0 mt-0.5" style={{ color: TEAL }} />
            <p className="text-xs leading-relaxed" style={{ color: "rgba(194,210,255,0.6)" }}>
              {configured
                ? <>Connect your wallet on the <Link href="/invest?tab=token" style={{ color: TEAL, fontWeight: 600 }}>Buy / Sell</Link> screen to see your holdings, current value and purchase total.</>
                : "Live prices, your holdings, current value and purchase total appear here once the token contract is added."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
