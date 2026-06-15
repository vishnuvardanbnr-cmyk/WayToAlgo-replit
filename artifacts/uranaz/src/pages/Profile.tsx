import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useSetupProfile, getGetMeQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Copy, Shield, ShieldCheck, X, Mail } from "lucide-react";
import { Link } from "wouter";

const TEAL = "#00FF94";
const GLASS = { background: "rgba(10,14,30,0.65)", backdropFilter: "blur(14px)", border: "1px solid rgba(0,255,148,0.10)" } as const;
const INPUT_STYLE = { background: "rgba(0,20,40,0.6)", border: "1px solid rgba(0,255,148,0.18)", color: "rgba(176,255,224,0.9)" };
const LABEL_STYLE = { color: "rgba(176,255,224,0.65)", fontSize: "0.8rem" };

const BEP20_REGEX = /^0x[a-fA-F0-9]{40}$/;

const schema = z.object({
  walletAddress: z.string()
    .min(1, "Wallet address is required")
    .regex(BEP20_REGEX, "Must be a valid BEP20 address (0x + 40 hex characters)"),
});

type FormData = z.infer<typeof schema>;

export default function Profile({ user, onUpdate }: { user: any; onUpdate: (u: any) => void }) {
  const setup = useSetupProfile();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [otpModalOpen, setOtpModalOpen] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [otpSending, setOtpSending] = useState(false);
  const [otpError, setOtpError] = useState("");
  const [pendingData, setPendingData] = useState<FormData | null>(null);

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      walletAddress: user?.walletAddress || "",
    },
  });

  const submitProfile = async (data: FormData, otp?: string) => {
    const body: any = { ...data, country: user?.country || "" };
    if (otp) body.otp = otp;
    const token = localStorage.getItem("waytoalgo_token");
    const r = await fetch("/api/auth/profile-setup", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const json = await r.json();
    if (!r.ok) {
      const err: any = new Error(json.message || "Failed to save");
      err.otpRequired = json.otpRequired === true;
      throw err;
    }
    return json;
  };

  const requestOtp = async () => {
    setOtpSending(true);
    setOtpError("");
    try {
      const r = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email, purpose: "wallet_update" }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.message || "Failed to send OTP");
      toast({ title: "OTP sent", description: `Check your email (${user.email})` });
    } catch (e: any) {
      setOtpError(e?.message || "Failed to send OTP");
    } finally {
      setOtpSending(false);
    }
  };

  const onSubmit = async (data: FormData) => {
    try {
      const updated = await submitProfile(data);
      await queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      onUpdate(updated);
      toast({ title: "Profile updated!" });
    } catch (err: any) {
      // Server tells us OTP is required for wallet change → open modal & send code
      if (err?.otpRequired) {
        setPendingData(data);
        setOtpCode("");
        setOtpError("");
        setOtpModalOpen(true);
        await requestOtp();
        return;
      }
      toast({ title: "Failed", description: err?.message, variant: "destructive" });
    }
  };

  const verifyOtpAndSubmit = async () => {
    if (!pendingData) return;
    if (!/^\d{6}$/.test(otpCode)) {
      setOtpError("Enter the 6-digit code from your email");
      return;
    }
    setOtpSending(true);
    setOtpError("");
    try {
      const updated = await submitProfile(pendingData, otpCode);
      await queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      onUpdate(updated);
      setOtpModalOpen(false);
      setPendingData(null);
      setOtpCode("");
      toast({ title: "Wallet address updated!", description: "OTP verified successfully" });
    } catch (err: any) {
      setOtpError(err?.message || "Invalid OTP");
    } finally {
      setOtpSending(false);
    }
  };

  const copyReferral = () => {
    navigator.clipboard.writeText(user?.referralCode || "");
    toast({ title: "Referral code copied!" });
  };

  return (
    <div className="px-4 py-6 max-w-2xl mx-auto space-y-6 pb-24 md:pb-8">
      <h1
        className="text-xl font-bold"
        style={{
          fontFamily: "'Sora', sans-serif",
          background: "linear-gradient(135deg, #B0FFE0, #00FF94)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          backgroundClip: "text",
        }}
      >
        My Profile
      </h1>

      {/* Avatar card */}
      <div
        className="rounded-2xl p-6 flex items-center gap-4 relative overflow-hidden"
        style={{
          background: "linear-gradient(135deg, rgba(0,255,148,0.10), rgba(0,204,119,0.05))",
          border: "1px solid rgba(0,255,148,0.22)",
        }}
      >
        <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at top right, rgba(0,255,148,0.12) 0%, transparent 60%)" }} />
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold shrink-0 relative"
          style={{
            background: "linear-gradient(135deg, rgba(0,255,148,0.20), rgba(0,204,119,0.10))",
            border: "2px solid rgba(0,255,148,0.45)",
            color: TEAL,
            boxShadow: "0 0 20px rgba(0,255,148,0.2)",
          }}
        >
          {user?.name?.charAt(0)?.toUpperCase()}
        </div>
        <div className="flex-1 min-w-0 relative">
          <div className="font-bold text-lg" data-testid="text-username" style={{ color: "rgba(176,255,224,0.92)" }}>{user?.name}</div>
          <div className="text-sm" style={{ color: "rgba(176,255,224,0.45)" }}>{user?.email}</div>
          <div className="text-sm" style={{ color: "rgba(176,255,224,0.35)" }}>{user?.phone}</div>
          {user?.isAdmin && (
            <div className="flex items-center gap-1 text-xs mt-1" style={{ color: "#f97316" }}>
              <Shield size={12} /> Admin
            </div>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: "Total Invested", value: `$${user?.totalInvested?.toFixed(2) || "0.00"}` },
          { label: "Total Earnings", value: `$${user?.totalEarnings?.toFixed(2) || "0.00"}` },
          { label: "Current Level",  value: `Level ${user?.currentLevel ?? 0}` },
          { label: "Member Since",   value: user?.createdAt ? new Date(user.createdAt).toLocaleDateString("en-US", { month: "short", year: "numeric" }) : "—" },
        ].map(item => (
          <div key={item.label} className="rounded-xl p-4" style={GLASS}>
            <div className="text-xs" style={{ color: "rgba(176,255,224,0.4)" }}>{item.label}</div>
            <div className="font-bold text-sm mt-1" style={{ color: "rgba(176,255,224,0.85)" }}>{item.value}</div>
          </div>
        ))}
      </div>

      {/* Referral Code */}
      <div className="rounded-xl p-4" style={GLASS}>
        <div className="text-xs mb-2" style={{ color: "rgba(176,255,224,0.4)" }}>Your Referral Code</div>
        <div className="flex items-center gap-3">
          <div
            className="flex-1 rounded-lg px-4 py-2.5 font-mono font-bold text-center tracking-widest"
            style={{
              background: "rgba(0,10,24,0.6)",
              border: "1px solid rgba(0,255,148,0.18)",
              color: TEAL,
              fontFamily: "'Sora', monospace",
              letterSpacing: "0.12em",
            }}
          >
            {user?.referralCode}
          </div>
          <button
            data-testid="button-copy-referral"
            onClick={copyReferral}
            className="w-10 h-10 rounded-lg flex items-center justify-center"
            style={{
              background: "rgba(0,255,148,0.08)",
              border: "1px solid rgba(0,255,148,0.2)",
              color: TEAL,
            }}
          >
            <Copy size={16} />
          </button>
        </div>
      </div>


      {/* Links */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { href: "/terms",   label: "Terms & Conditions" },
          { href: "/privacy", label: "Privacy Policy" },
        ].map(item => (
          <Link key={item.href} href={item.href}>
            <div
              className="rounded-xl p-4 text-sm font-medium cursor-pointer transition-all"
              style={{ ...GLASS, color: "rgba(176,255,224,0.6)" }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(0,255,148,0.25)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(0,255,148,0.10)"; }}
            >
              {item.label}
            </div>
          </Link>
        ))}
      </div>

      {/* OTP modal */}
      {otpModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(6,8,20,0.85)", backdropFilter: "blur(8px)" }}
          onClick={(e) => { if (e.target === e.currentTarget && !otpSending) setOtpModalOpen(false); }}
        >
          <div
            className="w-full max-w-sm rounded-2xl p-6 relative"
            style={{
              background: "linear-gradient(155deg, rgba(4,16,32,0.97), rgba(2,10,22,0.97))",
              border: "1px solid rgba(0,255,148,0.30)",
              boxShadow: "0 30px 80px rgba(0,0,0,0.6), 0 0 40px rgba(0,255,148,0.15)",
            }}
          >
            <button
              onClick={() => { if (!otpSending) setOtpModalOpen(false); }}
              className="absolute top-3 right-3 p-1.5 rounded-lg"
              style={{ color: "rgba(176,255,224,0.4)" }}
            >
              <X size={16} />
            </button>

            <div className="text-center mb-5">
              <div
                className="w-14 h-14 rounded-full mx-auto flex items-center justify-center mb-3"
                style={{
                  background: "rgba(0,255,148,0.12)",
                  border: "1px solid rgba(0,255,148,0.35)",
                  boxShadow: "0 0 24px rgba(0,255,148,0.25)",
                }}
              >
                <Mail size={22} style={{ color: TEAL }} />
              </div>
              <h3 className="font-bold text-lg" style={{ color: "rgba(176,255,224,0.95)", fontFamily: "'Sora', sans-serif" }}>
                Verify Wallet Change
              </h3>
              <p className="text-xs mt-1" style={{ color: "rgba(176,255,224,0.55)" }}>
                We sent a 6-digit code to <span style={{ color: TEAL }}>{user?.email}</span>
              </p>
            </div>

            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={otpCode}
              onChange={(e) => { setOtpCode(e.target.value.replace(/\D/g, "")); setOtpError(""); }}
              placeholder="000000"
              className="w-full px-4 py-3 rounded-xl text-center text-xl font-bold tracking-[0.4em] outline-none"
              style={{
                background: "rgba(0,10,24,0.8)",
                border: `1px solid ${otpError ? "rgba(248,113,113,0.4)" : "rgba(0,255,148,0.25)"}`,
                color: TEAL,
                fontFamily: "'Sora', monospace",
              }}
              autoFocus
            />

            {otpError && (
              <p className="text-xs mt-2 text-center" style={{ color: "#f87171" }}>{otpError}</p>
            )}

            <button
              onClick={verifyOtpAndSubmit}
              disabled={otpSending || otpCode.length !== 6}
              className="w-full mt-4 py-2.5 rounded-xl font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: "linear-gradient(135deg, #00FF94, #00CC77)",
                color: "#050C0A",
                boxShadow: "0 0 16px rgba(0,255,148,0.35)",
              }}
            >
              {otpSending ? "Verifying…" : "Verify & Update Wallet"}
            </button>

            <button
              onClick={requestOtp}
              disabled={otpSending}
              className="w-full mt-2 py-2 rounded-xl text-xs font-semibold transition-all disabled:opacity-50"
              style={{ background: "transparent", color: "rgba(176,255,224,0.6)" }}
            >
              Didn't get the code? Resend
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
