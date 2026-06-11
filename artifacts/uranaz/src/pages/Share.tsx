import { useGetReferralLink } from "@workspace/api-client-react";
import { Copy, Users, DollarSign, CheckCircle } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

const TEAL = "#5B8CFF";
const GLASS = { background: "rgba(10,14,30,0.65)", backdropFilter: "blur(14px)", border: "1px solid rgba(91,140,255,0.10)" } as const;

export default function Share() {
  const { data: referral, isLoading } = useGetReferralLink();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const copyLink = async () => {
    if (!referral?.referralLink) return;
    await navigator.clipboard.writeText(referral.referralLink);
    setCopied(true);
    toast({ title: "Copied!", description: "Referral link copied to clipboard" });
    setTimeout(() => setCopied(false), 2000);
  };

  const copyCode = async () => {
    if (!referral?.referralCode) return;
    await navigator.clipboard.writeText(referral.referralCode);
    toast({ title: "Copied!", description: "Referral code copied" });
  };

  if (isLoading) {
    return (
      <div className="px-4 py-6 max-w-2xl mx-auto space-y-4 pb-24 md:pb-8">
        {[1,2,3].map(i => <div key={i} className="rounded-xl h-24 animate-pulse" style={{ background: "rgba(91,140,255,0.04)", border: "1px solid rgba(91,140,255,0.08)" }} />)}
      </div>
    );
  }

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
        Share &amp; Earn
      </h1>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl p-4" style={GLASS}>
          <div className="flex items-center gap-2 mb-2">
            <Users size={15} style={{ color: TEAL }} />
            <span className="text-xs" style={{ color: "rgba(194,210,255,0.4)" }}>Total Referrals</span>
          </div>
          <div className="text-2xl font-bold" data-testid="text-referral-count" style={{ color: "rgba(194,210,255,0.9)" }}>
            {referral?.totalReferrals ?? 0}
          </div>
        </div>
        <div className="rounded-xl p-4" style={GLASS}>
          <div className="flex items-center gap-2 mb-2">
            <DollarSign size={15} style={{ color: TEAL }} />
            <span className="text-xs" style={{ color: "rgba(194,210,255,0.4)" }}>Spot Commission</span>
          </div>
          <div className="text-2xl font-bold" style={{ color: "rgba(194,210,255,0.9)" }}>
            ${referral?.spotCommissionEarned?.toFixed(2) ?? "0.00"}
          </div>
        </div>
      </div>

      {/* Referral Code */}
      <div className="rounded-xl p-5" style={GLASS}>
        <h2 className="text-sm font-semibold mb-3" style={{ color: "rgba(194,210,255,0.75)" }}>Your Referral Code</h2>
        <div className="flex items-center gap-3">
          <div
            className="flex-1 rounded-xl px-4 py-3 font-mono font-bold text-center tracking-widest text-lg"
            data-testid="text-referral-code"
            style={{
              background: "rgba(0,10,24,0.6)",
              border: "1px solid rgba(91,140,255,0.18)",
              color: TEAL,
              fontFamily: "'Sora', monospace",
              letterSpacing: "0.15em",
            }}
          >
            {referral?.referralCode ?? "—"}
          </div>
          <button
            data-testid="button-copy-code"
            onClick={copyCode}
            className="w-12 h-12 rounded-xl flex items-center justify-center transition-all"
            style={{
              background: "rgba(91,140,255,0.08)",
              border: "1px solid rgba(91,140,255,0.22)",
              color: TEAL,
            }}
          >
            <Copy size={18} />
          </button>
        </div>
      </div>

      {/* Referral Link */}
      <div className="rounded-xl p-5" style={GLASS}>
        <h2 className="text-sm font-semibold mb-3" style={{ color: "rgba(194,210,255,0.75)" }}>Your Referral Link</h2>
        <div
          className="rounded-xl px-4 py-3 text-xs break-all mb-3"
          data-testid="text-referral-link"
          style={{
            background: "rgba(0,10,24,0.6)",
            border: "1px solid rgba(91,140,255,0.12)",
            color: "rgba(194,210,255,0.45)",
          }}
        >
          {referral?.referralLink ?? "—"}
        </div>
        <button
          data-testid="button-copy-link"
          onClick={copyLink}
          className="w-full py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all"
          style={copied ? {
            background: "rgba(52,211,153,0.10)",
            border: "1px solid rgba(52,211,153,0.25)",
            color: "#34d399",
          } : {
            background: "linear-gradient(135deg, #5B8CFF, #3D5CE0)",
            color: "#060814",
            fontWeight: 700,
            boxShadow: "0 0 16px rgba(91,140,255,0.3)",
          }}
        >
          {copied
            ? <><CheckCircle size={16} /> Copied!</>
            : <><Copy size={16} /> Copy Referral Link</>
          }
        </button>
      </div>

      {/* How it works */}
      <div className="rounded-xl p-5" style={GLASS}>
        <h2 className="text-sm font-semibold mb-4" style={{ color: "rgba(194,210,255,0.75)" }}>How Referral Works</h2>
        <div className="space-y-4">
          {[
            { step: 1, title: "Share your link",       desc: "Send your referral link to friends and family" },
            { step: 2, title: "They register & invest", desc: "Your referral signs up and makes an investment" },
            { step: 3, title: "Earn 5% instantly",     desc: "Receive 5% spot commission on their investment amount" },
            { step: 4, title: "Level commissions",     desc: "Earn from up to 8 levels of your network over time" },
          ].map(item => (
            <div key={item.step} className="flex items-start gap-3">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                style={{
                  background: "rgba(91,140,255,0.12)",
                  border: "1px solid rgba(91,140,255,0.22)",
                  color: TEAL,
                }}
              >
                {item.step}
              </div>
              <div>
                <div className="text-sm font-medium" style={{ color: "rgba(194,210,255,0.8)" }}>{item.title}</div>
                <div className="text-xs mt-0.5" style={{ color: "rgba(194,210,255,0.4)" }}>{item.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Commission rates */}
      <div
        className="rounded-xl p-5 relative overflow-hidden"
        style={{
          background: "linear-gradient(135deg, rgba(91,140,255,0.09), rgba(100,60,200,0.06))",
          border: "1px solid rgba(91,140,255,0.18)",
        }}
      >
        <h2 className="text-sm font-semibold mb-3" style={{ color: "rgba(194,210,255,0.8)" }}>Commission Rates</h2>
        <div className="space-y-2.5">
          <div className="flex justify-between text-sm">
            <span style={{ color: "rgba(194,210,255,0.45)" }}>Spot Referral Commission</span>
            <span className="font-bold" style={{ color: TEAL }}>5%</span>
          </div>
          {[
            { level: "Level 1",    rate: "20%",    days: "80 days" },
            { level: "Level 2",    rate: "10%",    days: "80 days" },
            { level: "Level 3",    rate: "10%",    days: "60 days" },
            { level: "Levels 4–8", rate: "4% each", days: "60 days" },
          ].map(item => (
            <div key={item.level} className="flex justify-between text-sm">
              <span style={{ color: "rgba(194,210,255,0.45)" }}>{item.level}</span>
              <span style={{ color: "rgba(194,210,255,0.8)", fontWeight: 600 }}>
                {item.rate} <span style={{ color: "rgba(194,210,255,0.3)", fontSize: "0.75rem" }}>({item.days})</span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
