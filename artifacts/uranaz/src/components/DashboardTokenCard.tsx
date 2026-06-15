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
  readTokenBalance,
} from "@/lib/tokenContract";

const TEAL = "#00FF94";
const GLASS = {
  background: "rgba(10,14,30,0.65)",
  backdropFilter: "blur(14px)",
  border: "1px solid rgba(0,255,148,0.12)",
} as const;

const DECIMALS_BASE = 10n ** 18n;

interface Holdings {
  purchaseCount: number;
  totalUsdtSpent: string;
  totalWtaReceived: string;
  sellPrice: string;
  currentValue: string;
}

function getToken() {
  return localStorage.getItem("waytoalgo_token") || "";
}

export default function DashboardTokenCard() {
  const configured = isTokenConfigured();

  const [account, setAccount] = useState<string | null>(null);
  const [symbol, setSymbol] = useState("WTA");

  const [buyPrice, setBuyPrice] = useState<bigint | null>(null);
  const [sellPrice, setSellPrice] = useState<bigint | null>(null);
  const [liquidity, setLiquidity] = useState<bigint | null>(null);
  const [supply, setSupply] = useState<bigint | null>(null);
  const [holders, setHolders] = useState<number | null>(null);

  const [tokenBal, setTokenBal] = useState<bigint>(0n);
  const [holdings, setHoldings] = useState<Holdings | null>(null);
  const [loading, setLoading] = useState(false);

  // Fetch DB-stored purchase totals (no wallet required)
  const loadHoldings = useCallback(async () => {
    try {
      const res = await fetch("/api/token/holdings", {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.ok) setHoldings(await res.json());
    } catch { /* non-fatal */ }
  }, []);

  // Token-wide stats — each read independently guarded
  const loadStats = useCallback(() => {
    if (!isTokenConfigured()) return;
    readBuyPrice().then(setBuyPrice).catch(() => setBuyPrice(null));
    readSellPrice().then(setSellPrice).catch(() => setSellPrice(null));
    readSymbol().then(setSymbol).catch(() => {});
    readTotalLiquidity().then(setLiquidity).catch(() => setLiquidity(null));
    readTotalSupply().then(setSupply).catch(() => setSupply(null));
    readHolderCount().then(setHolders).catch(() => setHolders(null));
  }, []);

  const loadOnChainBalance = useCallback((addr: string | null) => {
    if (!isTokenConfigured() || !addr) { setTokenBal(0n); return; }
    readTokenBalance(addr).then(setTokenBal).catch(() => setTokenBal(0n));
  }, []);

  const refresh = useCallback((addr?: string | null) => {
    setLoading(true);
    loadStats();
    loadOnChainBalance(addr ?? account);
    loadHoldings().finally(() => setLoading(false));
  }, [account, loadStats, loadOnChainBalance, loadHoldings]);

  useEffect(() => {
    loadHoldings();
    if (configured) loadStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configured]);

  // Auto-detect already-connected wallet (no popup) + react to changes
  useEffect(() => {
    let active = true;
    getConnectedAccount().then((addr) => {
      if (active && addr) { setAccount(addr); loadOnChainBalance(addr); }
    });
    const unsubscribe = onAccountsChanged((addr) => {
      setAccount(addr);
      loadOnChainBalance(addr);
    });
    return () => { active = false; unsubscribe(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const priceUsdt = buyPrice !== null ? formatUnits18(buyPrice, 6) : "—";
  const sellPriceUsdt = sellPrice !== null ? formatUnits18(sellPrice, 6) : "—";
  const liquidityUsdt = liquidity !== null ? formatUnits18(liquidity, 2) : "—";
  const supplyDisplay = supply !== null ? formatUnits18(supply, 2) : "—";
  const holdersDisplay = holders !== null ? holders.toLocaleString() : "—";

  // Holdings display — prefer live wallet balance; fall back to DB totals
  const walletConnected = configured && account;
  const hasWalletBal = walletConnected && tokenBal > 0n;
  const hasDbPurchases = (holdings?.purchaseCount ?? 0) > 0;
  const showHoldings = configured && (hasWalletBal || hasDbPurchases);

  // Current value: wallet balance × live sell price if connected, else DB value
  const currentValue = (() => {
    if (hasWalletBal && sellPrice !== null) {
      const val = (tokenBal * sellPrice) / DECIMALS_BASE;
      return formatUnits18(val, 2) + " USDT";
    }
    if (holdings && parseFloat(holdings.currentValue) > 0) {
      return parseFloat(holdings.currentValue).toFixed(2) + " USDT";
    }
    return "—";
  })();

  const holdingDisplay = hasWalletBal
    ? formatUnits18(tokenBal, 4)
    : holdings
    ? parseFloat(holdings.totalWtaReceived).toFixed(4)
    : "—";

  const purchasedDisplay = holdings
    ? parseFloat(holdings.totalUsdtSpent).toFixed(2) + " USDT"
    : "—";

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-sm tracking-wide" style={{ color: "rgba(176,255,224,0.8)" }}>
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
              style={{ background: "linear-gradient(135deg, rgba(0,255,148,0.18), rgba(0,255,148,0.06))", border: "1px solid rgba(0,255,148,0.28)" }}
            >
              <Coins size={18} style={{ color: TEAL }} />
            </div>
            <div>
              <div className="font-bold tracking-wide" style={{ color: "rgba(200,240,255,0.92)", fontFamily: "'Sora', sans-serif", fontSize: "0.85rem" }}>
                {symbol} Token
              </div>
              <div className="text-xs mt-0.5" style={{ color: "rgba(176,255,224,0.4)" }}>On-chain · BNB Smart Chain</div>
            </div>
          </div>
          <button
            onClick={() => refresh()}
            disabled={loading}
            className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{ background: "rgba(176,255,224,0.06)", border: "1px solid rgba(176,255,224,0.09)" }}
            title="Refresh"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} style={{ color: "rgba(176,255,224,0.5)" }} />
          </button>
        </div>

        {/* price row */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl px-3 py-2.5" style={{ background: "rgba(0,255,148,0.06)", border: "1px solid rgba(0,255,148,0.12)" }}>
            <div className="flex items-center gap-1 text-xs mb-0.5" style={{ color: "rgba(176,255,224,0.4)" }}>
              <TrendingUp size={11} /> Buy Price
            </div>
            <div className="font-bold text-sm" style={{ color: TEAL }}>{priceUsdt} USDT</div>
          </div>
          <div className="rounded-xl px-3 py-2.5" style={{ background: "rgba(176,255,224,0.04)", border: "1px solid rgba(176,255,224,0.1)" }}>
            <div className="text-xs mb-0.5" style={{ color: "rgba(176,255,224,0.4)" }}>Sell Price</div>
            <div className="font-bold text-sm" style={{ color: "rgba(200,240,255,0.85)" }}>{sellPriceUsdt} USDT</div>
          </div>
        </div>

        {/* token-wide stats */}
        <div className="grid grid-cols-3 gap-2 mt-2">
          <div className="rounded-xl px-3 py-2.5" style={{ background: "rgba(176,255,224,0.04)", border: "1px solid rgba(176,255,224,0.1)" }}>
            <div className="flex items-center gap-1 text-xs mb-0.5" style={{ color: "rgba(176,255,224,0.4)" }}>
              <Droplet size={11} /> Liquidity
            </div>
            <div className="font-bold text-sm truncate" style={{ color: "rgba(200,240,255,0.85)" }}>
              {liquidityUsdt}<span className="text-xs font-normal" style={{ color: "rgba(176,255,224,0.4)" }}> USDT</span>
            </div>
          </div>
          <div className="rounded-xl px-3 py-2.5" style={{ background: "rgba(176,255,224,0.04)", border: "1px solid rgba(176,255,224,0.1)" }}>
            <div className="flex items-center gap-1 text-xs mb-0.5" style={{ color: "rgba(176,255,224,0.4)" }}>
              <Layers size={11} /> Supply
            </div>
            <div className="font-bold text-sm truncate" style={{ color: "rgba(200,240,255,0.85)" }}>{supplyDisplay}</div>
          </div>
          <div className="rounded-xl px-3 py-2.5" style={{ background: "rgba(176,255,224,0.04)", border: "1px solid rgba(176,255,224,0.1)" }}>
            <div className="flex items-center gap-1 text-xs mb-0.5" style={{ color: "rgba(176,255,224,0.4)" }}>
              <Users size={11} /> Holders
            </div>
            <div className="font-bold text-sm truncate" style={{ color: "rgba(200,240,255,0.85)" }}>{holdersDisplay}</div>
          </div>
        </div>

        {/* my holdings */}
        {showHoldings ? (
          <div className="mt-3 rounded-xl p-3" style={{ background: "linear-gradient(135deg, rgba(0,255,148,0.08), rgba(0,204,119,0.03))", border: "1px solid rgba(0,255,148,0.18)" }}>
            <div className="flex items-center gap-1.5 text-xs mb-2.5" style={{ color: "rgba(176,255,224,0.55)" }}>
              <Wallet size={12} style={{ color: TEAL }} /> My Holdings
              {!walletConnected && (
                <span className="ml-auto text-xs" style={{ color: "rgba(176,255,224,0.35)" }}>from purchase history</span>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <div className="text-xs" style={{ color: "rgba(176,255,224,0.4)" }}>Holding</div>
                <div className="font-bold text-sm mt-0.5" style={{ color: "rgba(200,240,255,0.9)" }}>
                  {holdingDisplay} <span className="text-xs font-normal" style={{ color: "rgba(176,255,224,0.4)" }}>{symbol}</span>
                </div>
              </div>
              <div>
                <div className="text-xs" style={{ color: "rgba(176,255,224,0.4)" }}>Current Value</div>
                <div className="font-bold text-sm mt-0.5" style={{ color: TEAL }}>{currentValue}</div>
              </div>
              <div>
                <div className="flex items-center gap-1 text-xs" style={{ color: "rgba(176,255,224,0.4)" }}>
                  <PiggyBank size={10} /> Purchased
                </div>
                <div className="font-bold text-sm mt-0.5" style={{ color: "rgba(200,240,255,0.9)" }}>{purchasedDisplay}</div>
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-3 flex gap-2.5 px-3 py-2.5 rounded-xl" style={{ background: "rgba(0,255,148,0.05)", border: "1px solid rgba(0,255,148,0.12)" }}>
            <Sparkles size={13} className="shrink-0 mt-0.5" style={{ color: TEAL }} />
            <p className="text-xs leading-relaxed" style={{ color: "rgba(176,255,224,0.6)" }}>
              {configured
                ? <>Buy <Link href="/invest?tab=token" style={{ color: TEAL, fontWeight: 600 }}>WTA tokens</Link> to see your holdings, current value and purchase total here.</>
                : "Live prices, your holdings, current value and purchase total appear here once the token contract is added."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
