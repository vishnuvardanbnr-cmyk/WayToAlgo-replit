import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useListWithdrawals, useCreateWithdrawal, useGetIncomeSummary, getListWithdrawalsQueryKey, getGetIncomeSummaryQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Wallet, Clock, CheckCircle, XCircle, AlertCircle, Mail, ArrowLeft, ExternalLink, Loader2 } from "lucide-react";

const TEAL = "#5B8CFF";
const GLASS = { background: "rgba(10,14,30,0.65)", backdropFilter: "blur(14px)", border: "1px solid rgba(91,140,255,0.12)" } as const;
const INPUT_STYLE = { background: "rgba(0,20,40,0.6)", border: "1px solid rgba(91,140,255,0.18)", color: "rgba(194,210,255,0.9)" };

const BEP20_REGEX = /^0x[a-fA-F0-9]{40}$/;

const schema = z.object({
  amount: z.coerce.number().positive("Amount must be positive"),
  walletAddress: z.string()
    .min(1, "Wallet address is required")
    .regex(BEP20_REGEX, "Must be a valid BEP20 address (0x + 40 hex characters)"),
});

const statusConfig: Record<string, { icon: any; color: string; bg: string; label: string }> = {
  pending:    { icon: Clock,       color: "#fbbf24", bg: "rgba(251,191,36,0.10)",   label: "Pending"    },
  processing: { icon: Loader2,     color: "#5B8CFF", bg: "rgba(91,140,255,0.10)",   label: "Processing" },
  approved:   { icon: CheckCircle, color: "#34d399", bg: "rgba(52,211,153,0.10)",   label: "Approved"   },
  rejected:   { icon: XCircle,     color: "#f87171", bg: "rgba(248,113,113,0.10)",  label: "Rejected"   },
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function getToken() {
  return localStorage.getItem("waytoalgo_token") || "";
}

async function checkOtpRequired(): Promise<{ withdrawalOtp: boolean }> {
  const res = await fetch("/api/auth/otp-required");
  if (!res.ok) return { withdrawalOtp: false };
  return res.json();
}

async function sendWithdrawalOtp(email: string): Promise<void> {
  const res = await fetch("/api/auth/send-otp", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
    body: JSON.stringify({ email, purpose: "withdrawal" }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || "Failed to send OTP");
  }
}

type FeeConfig = { withdrawFeeFlat: number; withdrawFeePercent: number; withdrawFeeMode: string };

function calcWithdrawFee(amount: number, cfg: FeeConfig | null): number {
  if (!cfg) return 0;
  return amount < 100 ? cfg.withdrawFeeFlat : amount * cfg.withdrawFeePercent;
}

export default function Withdrawals({ user }: { user: any }) {
  const { data: withdrawals, isLoading } = useListWithdrawals();
  const { data: summary } = useGetIncomeSummary();
  const createWithdrawal = useCreateWithdrawal();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [feeConfig, setFeeConfig] = useState<FeeConfig | null>(null);

  useEffect(() => {
    fetch("/api/fee-config").then(r => r.json()).then(setFeeConfig).catch(() => {});
  }, []);

  const [step, setStep] = useState<"form" | "otp">("form");
  const [otp, setOtp] = useState("");
  const [sending, setSending] = useState(false);
  const [pendingData, setPendingData] = useState<z.infer<typeof schema> | null>(null);

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: { amount: 0, walletAddress: user?.walletAddress || "" },
  });

  const watchedAmount = form.watch("amount");

  const handleFormSubmit = async (data: z.infer<typeof schema>) => {
    try {
      const { withdrawalOtp } = await checkOtpRequired();
      if (withdrawalOtp) {
        setSending(true);
        try {
          await sendWithdrawalOtp(user?.email);
          setPendingData(data);
          setStep("otp");
          toast({ title: "OTP sent!", description: `Check your email ${user?.email}` });
        } catch (err: any) {
          toast({ title: "Failed to send OTP", description: err?.message, variant: "destructive" });
        } finally {
          setSending(false);
        }
      } else {
        await createWithdrawal.mutateAsync({ data });
        await queryClient.invalidateQueries({ queryKey: getListWithdrawalsQueryKey() });
        await queryClient.invalidateQueries({ queryKey: getGetIncomeSummaryQueryKey() });
        toast({ title: "Withdrawal requested!", description: "Your request is being processed" });
        form.reset({ amount: 0, walletAddress: user?.walletAddress || "" });
      }
    } catch (err: any) {
      toast({ title: "Failed", description: err?.message || "Could not submit withdrawal", variant: "destructive" });
    }
  };

  const handleOtpSubmit = async () => {
    if (!pendingData) return;
    if (otp.length !== 6) {
      toast({ title: "Enter the 6-digit OTP", variant: "destructive" });
      return;
    }
    try {
      await createWithdrawal.mutateAsync({ data: { ...pendingData, otp } as any });
      await queryClient.invalidateQueries({ queryKey: getListWithdrawalsQueryKey() });
      await queryClient.invalidateQueries({ queryKey: getGetIncomeSummaryQueryKey() });
      toast({ title: "Withdrawal requested!", description: "Your request is being processed" });
      form.reset({ amount: 0, walletAddress: user?.walletAddress || "" });
      setStep("form");
      setOtp("");
      setPendingData(null);
    } catch (err: any) {
      toast({ title: "Failed", description: err?.message || "Invalid OTP or request failed", variant: "destructive" });
    }
  };

  const handleResend = async () => {
    if (!user?.email) return;
    setSending(true);
    try {
      await sendWithdrawalOtp(user.email);
      toast({ title: "OTP resent!", description: "Check your inbox" });
    } catch (err: any) {
      toast({ title: "Failed", description: err?.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="px-4 py-6 max-w-2xl mx-auto space-y-6 pb-24 md:pb-8">
      <h1
        className="text-xl font-bold"
        style={{
          fontFamily: "'Sora', sans-serif",
          background: "linear-gradient(135deg, #C2D2FF, #5B8CFF)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          backgroundClip: "text",
        }}
      >
        Withdrawals
      </h1>

      {/* Balance hero */}
      <div
        className="rounded-2xl p-5 relative overflow-hidden"
        style={{
          background: "linear-gradient(135deg, rgba(91,140,255,0.12), rgba(61,92,224,0.05))",
          border: "1px solid rgba(91,140,255,0.28)",
          boxShadow: "0 0 30px rgba(91,140,255,0.07)",
        }}
      >
        <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at top right, rgba(91,140,255,0.14) 0%, transparent 60%)" }} />
        <div className="relative">
          <div className="text-xs tracking-widest uppercase mb-1" style={{ color: "rgba(194,210,255,0.45)" }}>
            Available for Withdrawal
          </div>
          <div
            className="text-4xl font-black"
            data-testid="text-available-balance"
            style={{
              fontFamily: "'Sora', sans-serif",
              background: "linear-gradient(135deg, #C2D2FF, #5B8CFF)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            ${summary?.availableBalance?.toFixed(2) ?? "0.00"}
          </div>
          <div className="flex gap-4 mt-3 text-xs" style={{ color: "rgba(194,210,255,0.4)" }}>
            <span>Pending: <span style={{ color: "rgba(194,210,255,0.8)", fontWeight: 600 }}>${summary?.pendingWithdrawal?.toFixed(2) ?? "0.00"}</span></span>
            <span>Total Withdrawn: <span style={{ color: "rgba(194,210,255,0.8)", fontWeight: 600 }}>${summary?.withdrawnTotal?.toFixed(2) ?? "0.00"}</span></span>
          </div>
        </div>
      </div>

      {/* Request Form / OTP Step */}
      <div className="rounded-2xl p-5" style={GLASS}>
        {step === "form" ? (
          <>
            <h2 className="font-semibold text-sm mb-4" style={{ color: "rgba(194,210,255,0.8)" }}>Request Withdrawal</h2>
            <div
              className="flex items-start gap-2 rounded-lg p-3 mb-4"
              style={{ background: "rgba(91,140,255,0.05)", border: "1px solid rgba(91,140,255,0.14)" }}
            >
              <AlertCircle size={14} className="shrink-0 mt-0.5" style={{ color: TEAL }} />
              <p className="text-xs" style={{ color: "rgba(194,210,255,0.5)" }}>
                Withdrawals are processed within 24–48 hours. Minimum withdrawal amount is $10.
              </p>
            </div>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-4">
                <FormField control={form.control} name="amount" render={({ field }) => (
                  <FormItem>
                    <FormLabel style={{ color: "rgba(194,210,255,0.65)", fontSize: "0.8rem" }}>Amount (USDT)</FormLabel>
                    <FormControl>
                      <Input data-testid="input-withdraw-amount" type="number" min="10" step="0.01" placeholder="Enter amount" {...field} style={INPUT_STYLE} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                {/* Fee breakdown */}
                {feeConfig && watchedAmount > 0 && (() => {
                  const fee = calcWithdrawFee(Number(watchedAmount), feeConfig);
                  const mode = feeConfig.withdrawFeeMode;
                  const youReceive = mode === "deduct_from_amount" ? Number(watchedAmount) - fee : Number(watchedAmount);
                  const balanceDebit = mode === "deduct_from_balance" ? Number(watchedAmount) + fee : Number(watchedAmount);
                  return (
                    <div className="rounded-xl px-4 py-3 space-y-1.5" style={{ background: "rgba(91,140,255,0.04)", border: "1px solid rgba(91,140,255,0.10)" }}>
                      <div className="flex justify-between text-xs" style={{ color: "rgba(194,210,255,0.5)" }}>
                        <span>Withdrawal fee</span>
                        <span style={{ color: "#f87171" }}>−${fee.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-xs" style={{ color: "rgba(194,210,255,0.5)" }}>
                        <span>Balance debited</span>
                        <span style={{ color: "rgba(194,210,255,0.8)" }}>${balanceDebit.toFixed(2)}</span>
                      </div>
                      <div className="h-px" style={{ background: "rgba(91,140,255,0.08)" }} />
                      <div className="flex justify-between text-sm font-bold">
                        <span style={{ color: "rgba(194,210,255,0.7)" }}>You receive</span>
                        <span style={{ color: "#34d399" }}>${youReceive.toFixed(2)} USDT</span>
                      </div>
                    </div>
                  );
                })()}

                <FormField control={form.control} name="walletAddress" render={({ field }) => (
                  <FormItem>
                    <FormLabel style={{ color: "rgba(194,210,255,0.65)", fontSize: "0.75rem" }}>USDT Wallet Address (BEP-20)</FormLabel>
                    <FormControl>
                      <Input
                        data-testid="input-withdraw-wallet"
                        placeholder="0x0000000000000000000000000000000000000000"
                        {...field}
                        style={INPUT_STYLE}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <button
                  data-testid="button-submit-withdrawal"
                  type="submit"
                  disabled={createWithdrawal.isPending || sending}
                  className="w-full py-2.5 rounded-xl font-bold transition-all disabled:opacity-60"
                  style={{
                    background: "linear-gradient(135deg, #5B8CFF, #3D5CE0)",
                    color: "#060814",
                    letterSpacing: "0.04em",
                    boxShadow: "0 0 20px rgba(91,140,255,0.3)",
                  }}
                >
                  {sending ? "Sending OTP..." : createWithdrawal.isPending ? "Submitting..." : "Request Withdrawal"}
                </button>
              </form>
            </Form>
          </>
        ) : (
          <div className="space-y-5">
            <h2 className="font-semibold text-sm" style={{ color: "rgba(194,210,255,0.8)" }}>Email Verification</h2>
            <div
              className="flex items-center gap-3 p-3 rounded-xl"
              style={{ background: "rgba(91,140,255,0.06)", border: "1px solid rgba(91,140,255,0.14)" }}
            >
              <Mail size={18} style={{ color: TEAL, flexShrink: 0 }} />
              <p className="text-xs" style={{ color: "rgba(194,210,255,0.6)" }}>
                Enter the 6-digit code sent to <span style={{ color: TEAL }}>{user?.email}</span>
              </p>
            </div>

            <div>
              <label className="text-xs font-medium block mb-2" style={{ color: "rgba(194,210,255,0.5)" }}>Verification Code</label>
              <input
                data-testid="input-withdrawal-otp"
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={otp}
                onChange={e => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000"
                className="w-full rounded-xl px-3 py-3 text-center text-2xl font-bold focus:outline-none"
                style={{
                  background: "rgba(0,20,40,0.7)",
                  border: "1px solid rgba(91,140,255,0.25)",
                  color: TEAL,
                  letterSpacing: "0.4em",
                }}
              />
            </div>

            <div className="rounded-xl p-3" style={{ background: "rgba(0,15,30,0.5)", border: "1px solid rgba(91,140,255,0.08)" }}>
              <div className="text-xs" style={{ color: "rgba(194,210,255,0.5)" }}>Withdrawal amount:</div>
              <div className="text-lg font-bold" style={{ color: TEAL }}>${pendingData?.amount?.toFixed(2)} USDT</div>
            </div>

            <button
              data-testid="button-verify-withdrawal-otp"
              onClick={handleOtpSubmit}
              disabled={createWithdrawal.isPending || otp.length !== 6}
              className="w-full py-2.5 rounded-xl font-bold transition-all disabled:opacity-60"
              style={{
                background: "linear-gradient(135deg, #5B8CFF, #3D5CE0)",
                color: "#060814",
                letterSpacing: "0.04em",
                boxShadow: "0 0 20px rgba(91,140,255,0.3)",
              }}
            >
              {createWithdrawal.isPending ? "Processing..." : "Confirm Withdrawal"}
            </button>

            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => { setStep("form"); setOtp(""); }}
                className="flex items-center gap-1.5 text-xs"
                style={{ color: "rgba(194,210,255,0.4)" }}
              >
                <ArrowLeft size={12} /> Back
              </button>
              <button
                type="button"
                onClick={handleResend}
                disabled={sending}
                className="text-xs font-medium"
                style={{ color: TEAL }}
              >
                {sending ? "Sending..." : "Resend code"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* History */}
      <div>
        <h2 className="font-semibold text-sm mb-3" style={{ color: "rgba(194,210,255,0.75)" }}>Withdrawal History</h2>
        {isLoading ? (
          <div className="space-y-3">
            {[1,2,3].map(i => <div key={i} className="rounded-xl h-16 animate-pulse" style={{ background: "rgba(91,140,255,0.04)", border: "1px solid rgba(91,140,255,0.08)" }} />)}
          </div>
        ) : !withdrawals?.length ? (
          <div className="rounded-xl p-8 text-center" style={GLASS}>
            <Wallet size={32} className="mx-auto mb-2" style={{ color: "rgba(194,210,255,0.2)" }} />
            <p className="text-sm" style={{ color: "rgba(194,210,255,0.35)" }}>No withdrawal history yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {withdrawals.map(w => {
              const status = (w as any).status || "pending";
              const cfg = statusConfig[status] || statusConfig.pending;
              const txHash = (w as any).txHash as string | null;
              return (
                <div
                  key={w.id}
                  data-testid={`row-withdrawal-${w.id}`}
                  className="rounded-xl px-4 py-3.5"
                  style={GLASS}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 shrink-0 rounded-lg flex items-center justify-center" style={{ background: cfg.bg, border: `1px solid ${cfg.color}33` }}>
                        <cfg.icon size={16} style={{ color: cfg.color }} className={status === "processing" ? "animate-spin" : ""} />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold" style={{ color: "rgba(194,210,255,0.85)" }}>${w.amount.toFixed(2)} USDT</div>
                        <div className="text-xs" style={{ color: "rgba(194,210,255,0.35)" }}>{formatDate(w.createdAt)}</div>
                        <div className="text-xs truncate max-w-36" style={{ color: "rgba(194,210,255,0.3)" }}>{w.walletAddress}</div>
                      </div>
                    </div>
                    <span
                      className="shrink-0 text-xs font-semibold px-2 py-1 rounded-full"
                      style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.color}33` }}
                    >
                      {cfg.label}
                    </span>
                  </div>
                  {txHash && (
                    <a
                      href={`https://bscscan.com/tx/${txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 mt-2 pt-2 text-xs font-mono"
                      style={{ borderTop: "1px solid rgba(91,140,255,0.08)", color: "#5B8CFF" }}
                    >
                      <ExternalLink size={10} />
                      TX: {txHash.slice(0, 18)}…{txHash.slice(-6)}
                    </a>
                  )}
                  {status === "rejected" && (w as any).note && (
                    <div
                      className="flex items-start gap-2 mt-2 pt-2 rounded-lg px-3 py-2"
                      style={{ borderTop: "1px solid rgba(248,113,113,0.12)", background: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.15)" }}
                    >
                      <AlertCircle size={12} className="shrink-0 mt-0.5" style={{ color: "#f87171" }} />
                      <p className="text-xs leading-relaxed" style={{ color: "rgba(248,113,113,0.85)" }}>
                        {(w as any).note}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
