import { useState } from "react";
import { KeyRound, Save, CheckCircle, AlertCircle } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const INPUT_STYLE = {
  background: "rgba(1,12,24,0.70)",
  border: "1px solid rgba(0,255,148,0.15)",
  color: "rgba(200,240,255,0.90)",
};

const BTN_STYLE = {
  background: "linear-gradient(135deg, rgba(0,255,148,0.25), rgba(0,204,119,0.15))",
  border: "1px solid rgba(0,255,148,0.35)",
  color: "#00FF94",
};

function Field({ label, value, onChange, placeholder, type = "text" }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold mb-1.5" style={{ color: "rgba(176,255,224,0.55)" }}>
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all"
        style={INPUT_STYLE}
      />
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-1 mt-2">
      <div className="h-px flex-1" style={{ background: "rgba(0,255,148,0.12)" }} />
      <span className="text-xs font-bold tracking-widest uppercase" style={{ color: "rgba(0,255,148,0.55)" }}>
        {children}
      </span>
      <div className="h-px flex-1" style={{ background: "rgba(0,255,148,0.12)" }} />
    </div>
  );
}

export default function CertEdit() {
  const [key, setKey]           = useState("");
  const [authed, setAuthed]     = useState(false);
  const [checking, setChecking] = useState(false);
  const [keyError, setKeyError] = useState("");

  const [feeFlat, setFeeFlat]     = useState("");
  const [feePct, setFeePct]       = useState("");
  const [savingFee, setSavingFee] = useState(false);
  const [savedFee, setSavedFee]   = useState(false);
  const [feeError, setFeeError]   = useState("");

  async function handleUnlock(e: React.FormEvent) {
    e.preventDefault();
    setKeyError("");
    setChecking(true);
    try {
      const feeCur = await fetch(`${BASE}/api/fee-config`).then(r => r.json());

      const probe = await fetch(`${BASE}/api/fee-config`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-cert-key": key },
        body: JSON.stringify({
          depositFeeFlat: feeCur.depositFeeFlat,
          depositFeePercent: feeCur.depositFeePercent,
        }),
      });
      if (probe.status === 401) { setKeyError("Wrong key. Try again."); return; }

      setFeeFlat(String(feeCur.depositFeeFlat));
      setFeePct(String((feeCur.depositFeePercent * 100).toFixed(3)));
      setAuthed(true);
    } catch {
      setKeyError("Connection error. Try again.");
    } finally {
      setChecking(false);
    }
  }

  async function handleSaveFee(e: React.FormEvent) {
    e.preventDefault();
    setFeeError("");
    setSavedFee(false);
    const flatNum = parseFloat(feeFlat);
    const pctNum  = parseFloat(feePct) / 100;
    if (isNaN(flatNum) || flatNum < 0) { setFeeError("Invalid flat fee."); return; }
    if (isNaN(pctNum) || pctNum < 0 || pctNum > 1) { setFeeError("Invalid percentage (enter 0–100)."); return; }
    setSavingFee(true);
    try {
      const res = await fetch(`${BASE}/api/fee-config`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-cert-key": key },
        body: JSON.stringify({ depositFeeFlat: flatNum, depositFeePercent: pctNum }),
      });
      if (!res.ok) { setFeeError("Save failed. Try again."); return; }
      setSavedFee(true);
      setTimeout(() => setSavedFee(false), 3000);
    } catch {
      setFeeError("Connection error. Try again.");
    } finally {
      setSavingFee(false);
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-12"
      style={{ background: "#050C0A" }}
    >
      <div
        className="fixed inset-0 pointer-events-none z-0"
        style={{
          backgroundImage: `linear-gradient(rgba(0,255,148,0.025) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(0,255,148,0.025) 1px, transparent 1px)`,
          backgroundSize: "60px 60px",
        }}
      />

      <div className="relative z-10 w-full max-w-md">
        <div className="text-center mb-8">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ background: "rgba(0,255,148,0.10)", border: "1px solid rgba(0,255,148,0.25)" }}
          >
            <KeyRound size={20} style={{ color: "#00FF94" }} />
          </div>
          <h1
            className="text-xl font-black mb-1"
            style={{ fontFamily: "'Sora', sans-serif", color: "rgba(200,240,255,0.90)" }}
          >
            Platform Config
          </h1>
          <p className="text-xs" style={{ color: "rgba(176,255,224,0.35)" }}>
            Manage platform fee settings
          </p>
        </div>

        <div
          className="rounded-2xl p-6"
          style={{
            background: "rgba(10,14,30,0.80)",
            backdropFilter: "blur(20px)",
            border: "1px solid rgba(0,255,148,0.13)",
            boxShadow: "0 8px 40px rgba(0,0,0,0.5)",
          }}
        >
          {!authed ? (
            <form onSubmit={handleUnlock} className="flex flex-col gap-4">
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: "rgba(176,255,224,0.55)" }}>
                  Access Key
                </label>
                <input
                  type="password"
                  value={key}
                  onChange={e => setKey(e.target.value)}
                  placeholder="Enter access key"
                  required
                  className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all"
                  style={{
                    background: "rgba(1,12,24,0.70)",
                    border: `1px solid ${keyError ? "rgba(248,113,113,0.5)" : "rgba(0,255,148,0.15)"}`,
                    color: "rgba(200,240,255,0.90)",
                  }}
                />
                {keyError && (
                  <p className="text-xs mt-1.5 flex items-center gap-1" style={{ color: "#f87171" }}>
                    <AlertCircle size={12} /> {keyError}
                  </p>
                )}
              </div>
              <button
                type="submit"
                disabled={checking}
                className="w-full py-3 rounded-xl font-bold text-sm transition-all hover:brightness-110 disabled:opacity-50"
                style={BTN_STYLE}
              >
                {checking ? "Checking…" : "Unlock"}
              </button>
            </form>
          ) : (
            <form onSubmit={handleSaveFee} className="flex flex-col gap-4">
              <SectionTitle>Platform Fees (Deposit &amp; Withdrawal)</SectionTitle>
              <div
                className="rounded-xl px-4 py-3 text-xs"
                style={{ background: "rgba(0,255,148,0.04)", border: "1px solid rgba(0,255,148,0.09)", color: "rgba(176,255,224,0.5)" }}
              >
                These rates apply to <strong style={{ color: "rgba(176,255,224,0.75)" }}>both deposits and withdrawals</strong>.
                Under $100 → flat fee. $100+ → percentage fee.
              </div>
              <Field
                label="Flat Fee (USD) — for deposits & withdrawals under $100"
                value={feeFlat}
                onChange={setFeeFlat}
                placeholder="e.g. 0.5"
                type="number"
              />
              <Field
                label="Percentage Fee (%) — for deposits & withdrawals $100 and above"
                value={feePct}
                onChange={setFeePct}
                placeholder="e.g. 0.5"
                type="number"
              />
              {feeError && (
                <p className="text-xs flex items-center gap-1" style={{ color: "#f87171" }}>
                  <AlertCircle size={12} /> {feeError}
                </p>
              )}
              {savedFee && (
                <p className="text-xs flex items-center gap-1" style={{ color: "#34d399" }}>
                  <CheckCircle size={12} /> Fees saved!
                </p>
              )}
              <button
                type="submit"
                disabled={savingFee}
                className="w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all hover:brightness-110 disabled:opacity-50"
                style={BTN_STYLE}
              >
                <Save size={14} />
                {savingFee ? "Saving…" : "Save Fees"}
              </button>
              <p className="text-center text-xs" style={{ color: "rgba(176,255,224,0.25)" }}>
                Fee changes apply immediately to all new deposits and withdrawals.
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
