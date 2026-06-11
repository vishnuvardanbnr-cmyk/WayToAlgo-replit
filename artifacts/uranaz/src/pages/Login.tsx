import { useState } from "react";
import { Link, useLocation } from "wouter";
import { setToken } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { useWallet } from "@/hooks/useWallet";
import { Wallet, CheckCircle2, Loader2 } from "lucide-react";

interface Props { onLogin: (user: any) => void; }

const TEAL = "#5B8CFF";

export default function Login({ onLogin }: Props) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [connectedAddress, setConnectedAddress] = useState("");
  const wallet = useWallet();

  const handleWalletLogin = async () => {
    setLoading(true);
    try {
      // Step 1: connect
      const address = await wallet.connect();
      if (!address) return;
      setConnectedAddress(address);

      // Step 2: get nonce
      const nonceRes = await fetch(`/api/auth/wallet-nonce?address=${encodeURIComponent(address)}`);
      if (!nonceRes.ok) {
        const err = await nonceRes.json().catch(() => ({}));
        throw new Error(err.message || "Failed to get sign-in challenge");
      }
      const { message } = await nonceRes.json();

      // Step 3: sign
      const signature = await wallet.signMessage(address, message);
      if (!signature) return;

      // Step 4: verify + login
      const loginRes = await fetch("/api/auth/wallet-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, signature }),
      });
      if (!loginRes.ok) {
        const err = await loginRes.json().catch(() => ({}));
        throw new Error(err.message || "Wallet login failed");
      }
      const data = await loginRes.json();
      setToken(data.token);
      setSuccess(true);

      // Redirect after 3 seconds
      setTimeout(() => {
        onLogin(data.user);
        setLocation("/dashboard");
      }, 3000);
    } catch (err: any) {
      setConnectedAddress("");
      toast({ title: "Login failed", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="relative w-full max-w-sm">

        {/* Heading */}
        <div className="text-center mb-8">
          <h1
            className="text-2xl font-bold mb-1"
            style={{
              fontFamily: "'Sora', sans-serif",
              background: "linear-gradient(135deg, #C2D2FF, #5B8CFF)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            Welcome Back
          </h1>
          <p style={{ color: "rgba(194,210,255,0.5)", fontSize: "0.875rem" }}>
            Connect your wallet to sign in
          </p>
        </div>

        {/* Card */}
        <div
          className="rounded-2xl p-6 space-y-4"
          style={{
            background: "rgba(10, 14, 30, 0.75)",
            backdropFilter: "blur(24px) saturate(1.5)",
            WebkitBackdropFilter: "blur(24px) saturate(1.5)",
            border: "1px solid rgba(91, 140, 255, 0.20)",
            boxShadow: "0 0 0 1px rgba(91,140,255,0.06) inset, 0 20px 60px rgba(0,0,0,0.5), 0 0 100px rgba(91,140,255,0.05)",
          }}
        >
          {/* Wallet address display field */}
          <div>
            <div
              className="text-xs font-medium mb-1.5"
              style={{ color: "rgba(194,210,255,0.6)", letterSpacing: "0.05em" }}
            >
              Wallet Address
            </div>
            <div
              className="w-full h-10 rounded-xl px-3 flex items-center gap-2 text-sm"
              style={{
                background: "rgba(0,20,40,0.6)",
                border: `1px solid ${connectedAddress ? "rgba(91,140,255,0.35)" : "rgba(91,140,255,0.12)"}`,
                transition: "border-color 0.3s",
              }}
            >
              {connectedAddress ? (
                <>
                  <span
                    className="truncate flex-1"
                    style={{ color: "rgba(194,210,255,0.85)", fontFamily: "monospace", fontSize: "0.78rem" }}
                  >
                    {connectedAddress}
                  </span>
                  <span
                    className="shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full"
                    style={{ background: "rgba(91,140,255,0.15)", color: TEAL, border: "1px solid rgba(91,140,255,0.3)" }}
                  >
                    Connected
                  </span>
                </>
              ) : (
                <span style={{ color: "rgba(194,210,255,0.25)" }}>Not connected</span>
              )}
            </div>
          </div>

          {/* Success state */}
          {success ? (
            <div
              className="w-full py-3 rounded-xl flex items-center justify-center gap-2.5 text-sm font-bold"
              style={{
                background: "rgba(91,140,255,0.10)",
                border: "1px solid rgba(91,140,255,0.35)",
                color: TEAL,
                letterSpacing: "0.04em",
              }}
            >
              <Loader2 size={16} className="animate-spin" />
              Verified — redirecting to dashboard…
            </div>
          ) : (
            <button
              type="button"
              onClick={handleWalletLogin}
              disabled={loading}
              className="w-full py-3 rounded-xl font-bold transition-all duration-200 disabled:opacity-60 flex items-center justify-center gap-2.5"
              style={{
                background: "linear-gradient(135deg, #5B8CFF, #3D5CE0)",
                color: "#060814",
                fontSize: "1rem",
                letterSpacing: "0.04em",
                boxShadow: "0 0 24px rgba(91,140,255,0.4), 0 4px 16px rgba(0,0,0,0.4)",
              }}
            >
              {loading ? (
                <>
                  <Loader2 size={17} className="animate-spin" />
                  Connecting…
                </>
              ) : (
                <>
                  <Wallet size={17} />
                  Connect Wallet
                </>
              )}
            </button>
          )}

          {wallet.error && !success && (
            <div
              className="p-2.5 rounded-xl text-xs"
              style={{
                background: "rgba(255,80,80,0.08)",
                border: "1px solid rgba(255,80,80,0.25)",
                color: "rgba(255,160,160,0.9)",
              }}
            >
              {wallet.error}
            </div>
          )}

          <div className="text-center text-sm" style={{ color: "rgba(194,210,255,0.4)" }}>
            Don't have an account?{" "}
            <Link href="/register" style={{ color: TEAL, fontWeight: 600 }} className="hover:underline">
              Register
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
