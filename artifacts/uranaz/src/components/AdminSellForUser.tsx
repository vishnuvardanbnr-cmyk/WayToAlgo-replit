import { useState } from "react";
import { CircleDollarSign, RefreshCw, CheckCircle2, XCircle, ExternalLink } from "lucide-react";

const TEAL = "#00FF94";
const GREEN = "rgb(52,211,153)";
const RED = "rgb(248,113,113)";

const INPUT_CLS = "w-full rounded-xl px-3 py-2.5 text-sm outline-none transition-all";
const INPUT_STYLE = {
  background: "rgba(10,14,30,0.6)",
  border: "1px solid rgba(0,255,148,0.18)",
  color: "rgba(200,240,255,0.95)",
} as const;

function getToken() {
  return localStorage.getItem("waytoalgo_token") || "";
}

type Result = {
  ok: boolean;
  text: string;
  txHash?: string;
};

export default function AdminSellForUser() {
  const [userAddress, setUserAddress] = useState("");
  const [tokenAmount, setTokenAmount] = useState("");
  const [source, setSource] = useState<"trading" | "team">("trading");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  const canSubmit = /^0x[0-9a-fA-F]{40}$/.test(userAddress.trim()) &&
    parseFloat(tokenAmount) > 0 && !busy;

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
    } catch (e: any) {
      setResult({ ok: false, text: e?.message || "Connection error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Source selector */}
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

      {/* User wallet address */}
      <div>
        <label className="block text-xs font-semibold mb-1.5" style={{ color: "rgba(176,255,224,0.55)" }}>
          User Wallet Address (0x…)
        </label>
        <input
          className={INPUT_CLS}
          style={INPUT_STYLE}
          placeholder="0x1234…abcd"
          value={userAddress}
          onChange={e => setUserAddress(e.target.value)}
          spellCheck={false}
          autoComplete="off"
        />
        <div className="mt-1 text-xs" style={{ color: "rgba(176,255,224,0.35)" }}>
          The user's registered wallet address — USDT proceeds go to their Withdraw Balance automatically.
        </div>
      </div>

      {/* Token amount */}
      <div>
        <label className="block text-xs font-semibold mb-1.5" style={{ color: "rgba(176,255,224,0.55)" }}>
          WTA Amount to Sell
        </label>
        <input
          className={INPUT_CLS}
          style={INPUT_STYLE}
          type="number"
          min="0"
          step="any"
          placeholder="e.g. 250"
          value={tokenAmount}
          onChange={e => setTokenAmount(e.target.value)}
        />
      </div>

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
