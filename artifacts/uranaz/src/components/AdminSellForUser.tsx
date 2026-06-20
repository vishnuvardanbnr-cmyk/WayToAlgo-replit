import { useState, useEffect, useRef } from "react";
import { CircleDollarSign, RefreshCw, CheckCircle2, XCircle, ExternalLink, User, Loader2 } from "lucide-react";

const TEAL = "#00FF94";
const GREEN = "rgb(52,211,153)";
const RED = "rgb(248,113,113)";
const AMBER = "rgb(251,191,36)";

const INPUT_CLS = "w-full rounded-xl px-3 py-2.5 text-sm outline-none transition-all";
const INPUT_STYLE = {
  background: "rgba(10,14,30,0.6)",
  border: "1px solid rgba(0,255,148,0.18)",
  color: "rgba(200,240,255,0.95)",
} as const;

function getToken() {
  return localStorage.getItem("waytoalgo_token") || "";
}

function fmt(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}

type UserInfo = {
  userId: number;
  name: string;
  email: string;
  tradingProfitBalance: number;
  teamBenefitBalance: number;
};

type Result = {
  ok: boolean;
  text: string;
  txHash?: string;
};

const VALID_ADDR = /^0x[0-9a-fA-F]{40}$/;

export default function AdminSellForUser() {
  const [userAddress, setUserAddress] = useState("");
  const [tokenAmount, setTokenAmount] = useState("");
  const [source, setSource] = useState<"trading" | "team">("trading");

  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [fetchingUser, setFetchingUser] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const addr = userAddress.trim();
    setUserInfo(null);
    setFetchError(null);
    setTokenAmount("");

    if (!VALID_ADDR.test(addr)) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setFetchingUser(true);
      setFetchError(null);
      try {
        const res = await fetch(`/api/admin/wallet/user-token-balance?address=${encodeURIComponent(addr)}`, {
          headers: { Authorization: `Bearer ${getToken()}` },
        });
        const data = await res.json();
        if (!res.ok) {
          setFetchError(data.message || "User not found");
        } else {
          setUserInfo(data);
        }
      } catch {
        setFetchError("Connection error");
      } finally {
        setFetchingUser(false);
      }
    }, 500);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [userAddress]);

  const activeBalance = userInfo
    ? (source === "trading" ? userInfo.tradingProfitBalance : userInfo.teamBenefitBalance)
    : 0;

  const canSubmit = VALID_ADDR.test(userAddress.trim()) &&
    parseFloat(tokenAmount) > 0 &&
    !!userInfo &&
    parseFloat(tokenAmount) <= activeBalance &&
    !busy;

  async function handleSell() {
    setResult(null);
    setBusy(true);
    try {
      const res = await fetch("/api/admin/wallet/sell-for-user", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({
          userAddress: userAddress.trim(),
          tokenAmount: parseFloat(tokenAmount),
          source,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResult({ ok: false, text: data.message || "Sell failed" });
        return;
      }
      setResult({
        ok: true,
        text: `Sold ${data.sold} WTA → $${parseFloat(data.usdtReceived).toFixed(4)} USDT credited to ${data.userName}'s Withdraw Balance (now $${parseFloat(data.withdrawBalance).toFixed(4)}).`,
        txHash: data.sellTxHash,
      });
      setUserAddress("");
      setTokenAmount("");
      setUserInfo(null);
    } catch (e: any) {
      setResult({ ok: false, text: e?.message || "Connection error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">

      {/* User wallet address */}
      <div>
        <label className="block text-xs font-semibold mb-1.5" style={{ color: "rgba(176,255,224,0.55)" }}>
          User Wallet Address (0x…)
        </label>
        <div className="relative">
          <input
            className={INPUT_CLS}
            style={{
              ...INPUT_STYLE,
              paddingRight: fetchingUser ? "2.5rem" : undefined,
              borderColor: userInfo
                ? "rgba(0,255,148,0.45)"
                : fetchError
                ? "rgba(248,113,113,0.45)"
                : "rgba(0,255,148,0.18)",
            }}
            placeholder="0x1234…abcd"
            value={userAddress}
            onChange={e => { setUserAddress(e.target.value); setResult(null); }}
            spellCheck={false}
            autoComplete="off"
          />
          {fetchingUser && (
            <Loader2
              size={14}
              className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin"
              style={{ color: "rgba(0,255,148,0.5)" }}
            />
          )}
        </div>

        {/* User info card — shown after successful fetch */}
        {userInfo && (
          <div
            className="mt-2 rounded-xl p-3 flex flex-col gap-2"
            style={{
              background: "rgba(0,255,148,0.05)",
              border: "1px solid rgba(0,255,148,0.18)",
            }}
          >
            <div className="flex items-center gap-2">
              <User size={13} style={{ color: TEAL }} />
              <span className="text-sm font-semibold" style={{ color: "rgba(176,255,224,0.9)" }}>
                {userInfo.name}
              </span>
              <span className="text-xs" style={{ color: "rgba(176,255,224,0.35)" }}>
                #{userInfo.userId} · {userInfo.email}
              </span>
            </div>
            <div className="flex gap-3 flex-wrap">
              <BalancePill
                label="Trading Profit"
                value={userInfo.tradingProfitBalance}
                active={source === "trading"}
                onClick={() => { setSource("trading"); setTokenAmount(""); }}
              />
              <BalancePill
                label="Team Benefit"
                value={userInfo.teamBenefitBalance}
                active={source === "team"}
                onClick={() => { setSource("team"); setTokenAmount(""); }}
              />
            </div>
          </div>
        )}

        {fetchError && (
          <div className="mt-1.5 text-xs flex items-center gap-1" style={{ color: RED }}>
            <XCircle size={12} /> {fetchError}
          </div>
        )}
      </div>

      {/* Source selector — only shown when no userInfo (fallback) */}
      {!userInfo && (
        <div className="flex gap-2">
          {(["trading", "team"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSource(s)}
              className="flex-1 py-2 rounded-xl text-xs font-semibold transition-all"
              style={{
                background: source === s ? "rgba(0,255,148,0.15)" : "rgba(10,14,30,0.5)",
                border: `1px solid ${source === s ? TEAL : "rgba(0,255,148,0.12)"}`,
                color: source === s ? TEAL : "rgba(176,255,224,0.5)",
              }}
            >
              {s === "trading" ? "Trading Profit" : "Team Benefit"}
            </button>
          ))}
        </div>
      )}

      {/* Token amount */}
      {userInfo && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-semibold" style={{ color: "rgba(176,255,224,0.55)" }}>
              WTA Amount to Sell
              <span className="ml-2 font-normal" style={{ color: "rgba(176,255,224,0.35)" }}>
                (from {source === "trading" ? "Trading Profit" : "Team Benefit"})
              </span>
            </label>
            {activeBalance > 0 && (
              <button
                type="button"
                onClick={() => setTokenAmount(activeBalance.toString())}
                className="text-xs px-2 py-0.5 rounded-lg font-semibold transition-all"
                style={{ background: "rgba(0,255,148,0.12)", color: TEAL, border: "1px solid rgba(0,255,148,0.22)" }}
              >
                Max
              </button>
            )}
          </div>
          <input
            className={INPUT_CLS}
            style={{
              ...INPUT_STYLE,
              borderColor: tokenAmount && parseFloat(tokenAmount) > activeBalance
                ? "rgba(248,113,113,0.45)"
                : "rgba(0,255,148,0.18)",
            }}
            type="number"
            min="0"
            step="any"
            placeholder={activeBalance > 0 ? `Max ${fmt(activeBalance)} WTA` : "No balance available"}
            value={tokenAmount}
            onChange={e => setTokenAmount(e.target.value)}
            disabled={activeBalance <= 0}
          />
          {tokenAmount && parseFloat(tokenAmount) > activeBalance && (
            <div className="mt-1 text-xs flex items-center gap-1" style={{ color: AMBER }}>
              Exceeds available balance of {fmt(activeBalance)} WTA
            </div>
          )}
        </div>
      )}

      {/* Result */}
      {result && (
        <div
          className="flex gap-2 p-3.5 rounded-xl text-xs"
          style={{
            background: result.ok ? "rgba(52,211,153,0.07)" : "rgba(248,113,113,0.07)",
            border: `1px solid ${result.ok ? "rgba(52,211,153,0.25)" : "rgba(248,113,113,0.25)"}`,
            color: result.ok ? GREEN : RED,
          }}
        >
          {result.ok
            ? <CheckCircle2 size={14} className="shrink-0 mt-0.5" />
            : <XCircle size={14} className="shrink-0 mt-0.5" />}
          <span className="leading-relaxed">
            {result.text}
            {result.ok && result.txHash && (
              <>
                {" "}
                <a
                  href={`https://bscscan.com/tx/${result.txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-0.5 underline"
                  style={{ color: TEAL }}
                >
                  View tx <ExternalLink size={11} />
                </a>
              </>
            )}
          </span>
        </div>
      )}

      {/* Submit */}
      <button
        type="button"
        disabled={!canSubmit}
        onClick={handleSell}
        className="w-full sm:w-auto sm:px-8 py-3 rounded-xl font-bold text-sm transition-all disabled:opacity-40 inline-flex items-center justify-center gap-2"
        style={{ background: `linear-gradient(135deg, ${TEAL}, #00CC77)`, color: "#050C0A" }}
      >
        {busy
          ? <><RefreshCw size={15} className="animate-spin" /> Selling…</>
          : <><CircleDollarSign size={15} /> Sell & Credit User</>}
      </button>
    </div>
  );
}

function BalancePill({
  label, value, active, onClick,
}: {
  label: string;
  value: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-start px-3 py-2 rounded-xl transition-all"
      style={{
        background: active ? "rgba(0,255,148,0.12)" : "rgba(10,14,30,0.5)",
        border: `1px solid ${active ? TEAL : "rgba(0,255,148,0.10)"}`,
        minWidth: "130px",
      }}
    >
      <span className="text-xs mb-0.5" style={{ color: active ? TEAL : "rgba(176,255,224,0.4)" }}>
        {label}
      </span>
      <span
        className="text-sm font-bold"
        style={{ color: value > 0 ? "rgba(176,255,224,0.9)" : "rgba(176,255,224,0.3)" }}
      >
        {fmt(value)} WTA
      </span>
    </button>
  );
}
