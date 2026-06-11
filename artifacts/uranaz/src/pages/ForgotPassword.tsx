import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Mail, KeyRound, ShieldCheck } from "lucide-react";

const TEAL = "#5B8CFF";
const LABEL_STYLE = { color: "rgba(194,210,255,0.7)", fontSize: "0.8rem", letterSpacing: "0.05em" };
const INPUT_STYLE = { background: "rgba(0,20,40,0.6)", border: "1px solid rgba(91,140,255,0.18)", color: "rgba(194,210,255,0.9)" };
const CARD_STYLE = {
  background: "rgba(10, 14, 30, 0.75)",
  backdropFilter: "blur(24px) saturate(1.5)",
  WebkitBackdropFilter: "blur(24px) saturate(1.5)" as any,
  border: "1px solid rgba(91, 140, 255, 0.20)",
  boxShadow: "0 0 0 1px rgba(91,140,255,0.06) inset, 0 20px 60px rgba(0,0,0,0.5)",
};
const BTN_STYLE = {
  background: "linear-gradient(135deg, #5B8CFF, #3D5CE0)",
  color: "#060814",
  fontWeight: 700,
  letterSpacing: "0.04em",
  boxShadow: "0 0 20px rgba(91,140,255,0.35), 0 4px 16px rgba(0,0,0,0.4)",
};

type Step = "email" | "otp" | "password" | "done";

export default function ForgotPassword() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const stepTitle: Record<Step, string> = {
    email: "Forgot Password",
    otp: "Verify Email",
    password: "New Password",
    done: "All Done",
  };
  const stepSub: Record<Step, string> = {
    email: "Enter your registered email to receive a reset code",
    otp: `Enter the 6-digit code sent to ${email}`,
    password: "Choose a new password for your account",
    done: "Your password has been reset successfully",
  };

  const handleSendOtp = async () => {
    if (!email || !/\S+@\S+\.\S+/.test(email)) {
      toast({ title: "Enter a valid email address", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, purpose: "password_reset" }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to send OTP");
      }
      setStep("otp");
      toast({ title: "Code sent!", description: `Check your inbox at ${email}` });
    } catch (err: any) {
      toast({ title: "Failed to send code", description: err?.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = () => {
    if (otp.length !== 6) {
      toast({ title: "Enter the 6-digit code", variant: "destructive" });
      return;
    }
    setStep("password");
  };

  const handleResetPassword = async () => {
    if (newPassword.length < 6) {
      toast({ title: "Password must be at least 6 characters", variant: "destructive" });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: "Passwords do not match", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp, newPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Reset failed");
      setStep("done");
    } catch (err: any) {
      toast({ title: "Reset failed", description: err?.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="relative w-full max-w-sm">
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
            {stepTitle[step]}
          </h1>
          <p style={{ color: "rgba(194,210,255,0.5)", fontSize: "0.875rem" }}>
            {stepSub[step]}
          </p>
        </div>

        <div className="rounded-2xl p-6" style={CARD_STYLE}>
          {step === "email" && (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium block mb-2" style={LABEL_STYLE}>Email Address</label>
                <Input
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleSendOtp()}
                  style={INPUT_STYLE}
                />
              </div>
              <button
                onClick={handleSendOtp}
                disabled={loading}
                className="w-full py-2.5 rounded-xl font-semibold transition-all duration-200 disabled:opacity-60 mt-2"
                style={BTN_STYLE}
              >
                {loading ? "Sending..." : "Send Reset Code"}
              </button>
              <div className="text-center text-sm" style={{ color: "rgba(194,210,255,0.4)" }}>
                <Link href="/login" style={{ color: TEAL, fontWeight: 600 }} className="hover:underline flex items-center justify-center gap-1.5">
                  <ArrowLeft size={13} /> Back to Sign In
                </Link>
              </div>
            </div>
          )}

          {step === "otp" && (
            <div className="space-y-5">
              <div
                className="flex items-center gap-3 p-3 rounded-xl"
                style={{ background: "rgba(91,140,255,0.06)", border: "1px solid rgba(91,140,255,0.14)" }}
              >
                <Mail size={18} style={{ color: TEAL, flexShrink: 0 }} />
                <p className="text-xs" style={{ color: "rgba(194,210,255,0.6)" }}>
                  Enter the 6-digit code sent to <span style={{ color: TEAL }}>{email}</span>
                </p>
              </div>
              <div>
                <label className="text-xs font-medium block mb-2" style={LABEL_STYLE}>Verification Code</label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={otp}
                  onChange={e => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="000000"
                  className="w-full rounded-xl px-3 py-3 text-center text-2xl font-bold tracking-[0.4em] focus:outline-none"
                  style={{
                    background: "rgba(0,20,40,0.7)",
                    border: "1px solid rgba(91,140,255,0.25)",
                    color: TEAL,
                    letterSpacing: "0.4em",
                  }}
                />
              </div>
              <button
                onClick={handleVerifyOtp}
                disabled={otp.length !== 6}
                className="w-full py-2.5 rounded-xl font-bold transition-all disabled:opacity-60"
                style={BTN_STYLE}
              >
                Verify Code
              </button>
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => { setStep("email"); setOtp(""); }}
                  className="flex items-center gap-1.5 text-xs"
                  style={{ color: "rgba(194,210,255,0.4)" }}
                >
                  <ArrowLeft size={12} /> Back
                </button>
                <button
                  type="button"
                  onClick={() => { setOtp(""); handleSendOtp(); }}
                  disabled={loading}
                  className="text-xs font-medium"
                  style={{ color: TEAL }}
                >
                  {loading ? "Sending..." : "Resend code"}
                </button>
              </div>
            </div>
          )}

          {step === "password" && (
            <div className="space-y-4">
              <div
                className="flex items-center gap-3 p-3 rounded-xl"
                style={{ background: "rgba(91,140,255,0.06)", border: "1px solid rgba(91,140,255,0.14)" }}
              >
                <KeyRound size={18} style={{ color: TEAL, flexShrink: 0 }} />
                <p className="text-xs" style={{ color: "rgba(194,210,255,0.6)" }}>
                  Choose a strong new password for <span style={{ color: TEAL }}>{email}</span>
                </p>
              </div>
              <div>
                <label className="text-xs font-medium block mb-2" style={LABEL_STYLE}>New Password</label>
                <Input
                  type="password"
                  placeholder="Min 6 characters"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  style={INPUT_STYLE}
                />
              </div>
              <div>
                <label className="text-xs font-medium block mb-2" style={LABEL_STYLE}>Confirm Password</label>
                <Input
                  type="password"
                  placeholder="Repeat new password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleResetPassword()}
                  style={INPUT_STYLE}
                />
              </div>
              <button
                onClick={handleResetPassword}
                disabled={loading}
                className="w-full py-2.5 rounded-xl font-bold transition-all disabled:opacity-60 mt-2"
                style={BTN_STYLE}
              >
                {loading ? "Resetting..." : "Reset Password"}
              </button>
              <button
                type="button"
                onClick={() => setStep("otp")}
                className="flex items-center justify-center gap-1.5 text-xs w-full"
                style={{ color: "rgba(194,210,255,0.4)" }}
              >
                <ArrowLeft size={12} /> Back
              </button>
            </div>
          )}

          {step === "done" && (
            <div className="space-y-5 text-center">
              <div
                className="flex flex-col items-center gap-3 p-4 rounded-xl"
                style={{ background: "rgba(91,140,255,0.06)", border: "1px solid rgba(91,140,255,0.18)" }}
              >
                <ShieldCheck size={36} style={{ color: TEAL }} />
                <p className="text-sm" style={{ color: "rgba(194,210,255,0.7)" }}>
                  Your password has been updated. You can now sign in with your new password.
                </p>
              </div>
              <button
                onClick={() => setLocation("/login")}
                className="w-full py-2.5 rounded-xl font-bold transition-all"
                style={BTN_STYLE}
              >
                Sign In
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
