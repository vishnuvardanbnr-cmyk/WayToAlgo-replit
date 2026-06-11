import { useState, useEffect } from "react";
import Pagination from "@/components/Pagination";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useCreateInvestment, useListInvestments, getListInvestmentsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  TrendingUp, X, Calendar, DollarSign, Timer, Hash, AlertTriangle,
  Snowflake, Coins, Shield, Zap, ChevronRight,
} from "lucide-react";
import TokenPurchase from "@/components/TokenPurchase";

function getCoolingInfo(createdAt: string, coolingHours: number) {
  const msElapsed = Date.now() - new Date(createdAt).getTime();
  const msTotal   = coolingHours * 3_600_000;
  const msLeft    = msTotal - msElapsed;
  if (msLeft <= 0) return null;
  const h = Math.floor(msLeft / 3_600_000);
  const m = Math.floor((msLeft % 3_600_000) / 60_000);
  return { h, m, endsAt: new Date(new Date(createdAt).getTime() + msTotal) };
}

const TEAL = "#5B8CFF";

/* ── Investment Detail Modal ── */
function InvestmentDetailModal({ inv, coolingHours, onClose }: { inv: any; coolingHours: number; onClose: () => void }) {
  const progress = Math.max(2, ((inv.durationDays - inv.remainingDays) / inv.durationDays) * 100);
  const daysElapsed = inv.durationDays - inv.remainingDays;
  const cooling = getCoolingInfo(inv.createdAt, coolingHours);
  const isSafe = inv.investmentType === "safe";

  const rows = [
    { icon: Hash,        label: "Investment ID",    value: `#${String(inv.id).padStart(6, "0")}` },
    { icon: isSafe ? Shield : Zap, label: "Type",   value: isSafe ? "Safe Invest" : "Risky Invest" },
    { icon: Calendar,    label: "Start Date",       value: new Date(inv.startDate).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) },
    { icon: Calendar,    label: "End Date",         value: new Date(inv.endDate).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) },
    { icon: Timer,       label: "Duration",         value: `${inv.durationDays} days total` },
    { icon: Timer,       label: "Days Remaining",   value: `${inv.remainingDays} days` },
    { icon: DollarSign,  label: "Total Invested",   value: `$${inv.amount.toFixed(2)}` },
    ...(isSafe ? [
      { icon: Coins,     label: "Token Purchase (50%)", value: `$${(inv.tokenPurchaseAmount ?? inv.amount * 0.5).toFixed(2)}` },
      { icon: TrendingUp, label: "ROI Pool (50%)",  value: `$${(inv.amount - (inv.tokenPurchaseAmount ?? inv.amount * 0.5)).toFixed(2)}` },
    ] : []),
    { icon: TrendingUp,  label: "Earned So Far (USD est.)", value: `$${inv.earnedSoFar.toFixed(2)}` },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3"
      style={{ background: "rgba(6,8,20,0.92)", backdropFilter: "blur(12px)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-3xl overflow-hidden"
        style={{
          background: "linear-gradient(170deg, rgba(4,16,32,0.99) 0%, rgba(2,10,22,0.99) 100%)",
          border: `1px solid ${isSafe ? "rgba(52,211,153,0.2)" : "rgba(251,113,113,0.2)"}`,
          boxShadow: "0 8px 60px rgba(6,8,20,0.9)",
          maxHeight: "90dvh",
          overflowY: "auto",
        }}
        onClick={e => e.stopPropagation()}
      >
        <div className="h-0.5 w-full" style={{ background: `linear-gradient(90deg, transparent, ${isSafe ? "#34d399" : "#f87171"}, transparent)` }} />

        <div className="flex items-center justify-between px-5 pt-5 pb-4">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-2xl flex items-center justify-center"
              style={{ background: `linear-gradient(135deg, ${isSafe ? "rgba(52,211,153,0.18)" : "rgba(251,113,113,0.18)"}, rgba(91,140,255,0.06))`, border: `1px solid ${isSafe ? "rgba(52,211,153,0.28)" : "rgba(251,113,113,0.28)"}` }}
            >
              {isSafe ? <Shield size={17} style={{ color: "#34d399" }} /> : <Zap size={17} style={{ color: "#f87171" }} />}
            </div>
            <div>
              <div className="font-bold tracking-wide" style={{ color: "rgba(200,240,255,0.92)", fontFamily: "'Sora', sans-serif", fontSize: "0.8rem" }}>
                Investment Details
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: TEAL, boxShadow: `0 0 6px ${TEAL}` }} />
                <span className="text-xs font-semibold" style={{ color: TEAL }}>Active</span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{ background: "rgba(194,210,255,0.06)", border: "1px solid rgba(194,210,255,0.09)" }}
          >
            <X size={14} style={{ color: "rgba(194,210,255,0.45)" }} />
          </button>
        </div>

        <div
          className="mx-5 mb-4 rounded-2xl py-4 text-center"
          style={{ background: "linear-gradient(135deg, rgba(91,140,255,0.08), rgba(61,92,224,0.03))", border: "1px solid rgba(91,140,255,0.18)" }}
        >
          <div className="text-xs mb-1 uppercase tracking-widest" style={{ color: "rgba(194,210,255,0.35)" }}>Total Invested</div>
          <div className="font-black" style={{ fontFamily: "'Sora', sans-serif", fontSize: "2rem", color: TEAL, textShadow: `0 0 24px ${TEAL}50` }}>
            ${inv.amount.toFixed(2)}
          </div>
          <div className="text-xs mt-1" style={{ color: "rgba(194,210,255,0.4)" }}>
            {isSafe ? "50% WTA Tokens · 50% Daily ROI" : "100% Daily ROI"}
          </div>
        </div>

        {cooling && (
          <div className="mx-5 mb-4 flex items-start gap-2.5 px-4 py-3 rounded-xl"
            style={{ background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.3)" }}>
            <Snowflake size={14} className="shrink-0 mt-0.5" style={{ color: "rgba(251,191,36,0.9)" }} />
            <div>
              <div className="text-xs font-bold mb-0.5" style={{ color: "rgba(251,191,36,0.9)" }}>
                24h Cooling — {cooling.h}h {cooling.m}m remaining
              </div>
              <div className="text-xs leading-relaxed" style={{ color: "rgba(251,191,36,0.65)" }}>
                First payout after{" "}
                <strong style={{ color: "rgba(251,191,36,0.85)" }}>
                  {cooling.endsAt.toLocaleString("en-IN", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" })}
                </strong>.
              </div>
            </div>
          </div>
        )}

        <div className="px-5 mb-4">
          <div className="flex justify-between text-xs mb-1.5" style={{ color: "rgba(194,210,255,0.4)" }}>
            <span>Progress</span><span>{progress.toFixed(1)}%</span>
          </div>
          <div className="w-full rounded-full h-2" style={{ background: "rgba(91,140,255,0.08)" }}>
            <div className="h-2 rounded-full uranus-progress" style={{ width: `${progress}%` }} />
          </div>
          <div className="flex justify-between text-xs mt-1" style={{ color: "rgba(194,210,255,0.28)" }}>
            <span>Day {daysElapsed}</span><span>Day {inv.durationDays}</span>
          </div>
        </div>

        <div className="mx-5 h-px mb-1" style={{ background: "rgba(91,140,255,0.07)" }} />

        <div className="px-5 pb-6">
          {rows.map((row, i) => (
            <div key={row.label} className="flex items-center justify-between py-3"
              style={{ borderBottom: i < rows.length - 1 ? "1px solid rgba(91,140,255,0.05)" : "none" }}>
              <div className="flex items-center gap-2.5">
                <row.icon size={12} style={{ color: "rgba(194,210,255,0.28)" }} />
                <span className="text-xs" style={{ color: "rgba(194,210,255,0.42)" }}>{row.label}</span>
              </div>
              <span className="text-xs font-semibold" style={{ color: row.label.includes("Earned") ? "#34d399" : "rgba(200,240,255,0.85)", fontFamily: row.label === "Investment ID" ? "monospace" : "inherit" }}>
                {row.value}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Max Investment Limit Modal ── */
function MaxInvestmentModal({ currentTotal, remaining, maxTotal, onClose }: { currentTotal: number; remaining: number; maxTotal: number; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ background: "rgba(6,8,20,0.92)", backdropFilter: "blur(12px)" }}
      onClick={onClose}>
      <div className="w-full max-w-sm rounded-3xl overflow-hidden"
        style={{ background: "linear-gradient(170deg, rgba(4,16,32,0.99) 0%, rgba(2,10,22,0.99) 100%)", border: "1px solid rgba(255,100,100,0.25)", boxShadow: "0 8px 60px rgba(6,8,20,0.9)" }}
        onClick={e => e.stopPropagation()}>
        <div className="h-0.5 w-full" style={{ background: "linear-gradient(90deg, transparent, #ff6464, transparent)" }} />
        <div className="p-6 text-center">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ background: "rgba(255,100,100,0.1)", border: "1px solid rgba(255,100,100,0.25)" }}>
            <AlertTriangle size={26} style={{ color: "#ff6464" }} />
          </div>
          <h2 className="font-bold text-base mb-2" style={{ fontFamily: "'Sora', sans-serif", color: "rgba(200,240,255,0.92)" }}>
            Investment Limit Reached
          </h2>
          <p className="text-sm mb-5" style={{ color: "rgba(194,210,255,0.5)" }}>
            The maximum total investment per account is{" "}
            <span style={{ color: "#ff6464", fontWeight: 700 }}>${maxTotal.toLocaleString()}</span>.
          </p>
          <div className="rounded-2xl p-4 mb-5 text-left space-y-3"
            style={{ background: "rgba(255,100,100,0.05)", border: "1px solid rgba(255,100,100,0.15)" }}>
            <div className="flex justify-between text-sm">
              <span style={{ color: "rgba(194,210,255,0.45)" }}>Currently Active</span>
              <span style={{ color: "rgba(200,240,255,0.85)", fontWeight: 600 }}>${currentTotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span style={{ color: "rgba(194,210,255,0.45)" }}>Maximum Allowed</span>
              <span style={{ color: "rgba(200,240,255,0.85)", fontWeight: 600 }}>${maxTotal.toLocaleString()}</span>
            </div>
            <div className="h-px" style={{ background: "rgba(255,100,100,0.12)" }} />
            <div className="flex justify-between text-sm">
              <span style={{ color: "rgba(194,210,255,0.45)" }}>You Can Still Invest</span>
              <span style={{ color: remaining > 0 ? TEAL : "#ff6464", fontWeight: 700 }}>
                {remaining > 0 ? `$${remaining.toFixed(2)}` : "Nothing"}
              </span>
            </div>
          </div>
          <button onClick={onClose} className="w-full py-3 rounded-xl font-bold text-sm"
            style={{ background: "rgba(91,140,255,0.1)", border: "1px solid rgba(91,140,255,0.2)", color: TEAL }}>
            Got It
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Safe/Risky Type Selector ── */
function InvestTypeSelector({ value, onChange }: { value: "safe" | "risky"; onChange: (v: "safe" | "risky") => void }) {
  const options: { key: "safe" | "risky"; icon: typeof Shield; label: string; tag: string; color: string; glow: string; desc: string; split: string }[] = [
    {
      key: "safe",
      icon: Shield,
      label: "Safe Invest",
      tag: "Balanced",
      color: "#34d399",
      glow: "rgba(52,211,153,0.15)",
      desc: "Your capital is split equally",
      split: "50% WTA Tokens  +  50% Daily ROI",
    },
    {
      key: "risky",
      icon: Zap,
      label: "Risky Invest",
      tag: "Max Returns",
      color: "#f87171",
      glow: "rgba(248,113,113,0.15)",
      desc: "Full amount earns daily returns",
      split: "100% Daily ROI",
    },
  ];

  return (
    <div className="space-y-2.5">
      <div className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: "rgba(194,210,255,0.45)", letterSpacing: "0.1em" }}>
        Choose Investment Mode
      </div>
      {options.map(opt => {
        const selected = value === opt.key;
        return (
          <button
            key={opt.key}
            type="button"
            onClick={() => onChange(opt.key)}
            className="w-full text-left transition-all duration-200"
            style={{
              background: selected ? `linear-gradient(135deg, ${opt.glow}, rgba(6,8,20,0.6))` : "rgba(6,8,20,0.4)",
              border: `1.5px solid ${selected ? opt.color + "55" : "rgba(91,140,255,0.10)"}`,
              borderRadius: "1rem",
              padding: "1rem",
              boxShadow: selected ? `0 0 20px ${opt.glow}` : "none",
            }}
          >
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: selected ? `${opt.glow}` : "rgba(91,140,255,0.06)", border: `1px solid ${selected ? opt.color + "44" : "rgba(91,140,255,0.10)"}` }}
              >
                <opt.icon size={18} style={{ color: selected ? opt.color : "rgba(194,210,255,0.3)" }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-bold text-sm" style={{ color: selected ? opt.color : "rgba(194,210,255,0.7)", fontFamily: "'Sora', sans-serif" }}>
                    {opt.label}
                  </span>
                  <span
                    className="text-xs px-2 py-0.5 rounded-full font-semibold"
                    style={{ background: selected ? `${opt.color}22` : "rgba(91,140,255,0.08)", color: selected ? opt.color : "rgba(194,210,255,0.3)", border: `1px solid ${selected ? opt.color + "33" : "transparent"}` }}
                  >
                    {opt.tag}
                  </span>
                </div>
                <div className="text-xs" style={{ color: selected ? "rgba(194,210,255,0.55)" : "rgba(194,210,255,0.3)" }}>
                  {opt.split}
                </div>
              </div>
              <ChevronRight size={16} style={{ color: selected ? opt.color : "rgba(194,210,255,0.15)", flexShrink: 0 }} />
            </div>
          </button>
        );
      })}
    </div>
  );
}

const GLASS = {
  background: "rgba(10,14,30,0.65)",
  backdropFilter: "blur(14px)",
  border: "1px solid rgba(91,140,255,0.12)",
} as const;

const DEFAULT_MAX_TOTAL = 2000;
const DEFAULT_PLAN = { days: 300, min: 100, max: DEFAULT_MAX_TOTAL };

const schema = z.object({
  amount: z.coerce.number().min(100),
  investmentType: z.enum(["safe", "risky"]),
});

export default function Invest({ user }: { user: any }) {
  const [selectedInvestment, setSelectedInvestment] = useState<any>(null);
  const [limitModal, setLimitModal] = useState<{ currentTotal: number; remaining: number; maxTotal: number } | null>(null);
  const [maxTotalInvestment, setMaxTotalInvestment] = useState<number>(DEFAULT_MAX_TOTAL);
  const [plan, setPlan] = useState(DEFAULT_PLAN);
  const [coolingHours, setCoolingHours] = useState<number>(24);
  const [section, setSection] = useState<"invest" | "token">(
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("tab") === "token"
      ? "token"
      : "invest",
  );
  const createInvestment = useCreateInvestment();
  const { data: investments } = useListInvestments();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  useEffect(() => {
    fetch("/api/settings/public")
      .then(r => r.json())
      .then(d => {
        const maxT = typeof d.maxTotalInvestment === "number" ? d.maxTotalInvestment : DEFAULT_MAX_TOTAL;
        setMaxTotalInvestment(maxT);
        if (d.plan) setPlan({ ...d.plan, max: maxT });
        if (typeof d.coolingHours === "number") setCoolingHours(d.coolingHours);
      })
      .catch(() => {});
  }, []);

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { amount: plan.min, investmentType: "risky" },
  });

  const watchedAmount = form.watch("amount");
  const watchedType = form.watch("investmentType");

  const usdtBalance = user?.walletBalance ?? 0;

  // Derived split values for preview
  const tokenPortion = watchedType === "safe" ? (watchedAmount || 0) * 0.5 : 0;
  const roiPortion = (watchedAmount || 0) - tokenPortion;

  const onSubmit = async (data: z.infer<typeof schema>) => {
    try {
      await createInvestment.mutateAsync({ data: { amount: data.amount, investmentType: data.investmentType } as any });
      await queryClient.invalidateQueries({ queryKey: getListInvestmentsQueryKey() });
      toast({ title: "Investment created!", description: `$${data.amount} invested successfully` });
      form.reset({ amount: plan.min, investmentType: data.investmentType });
    } catch (err: any) {
      const errData = err?.data;
      if (errData?.code === "MAX_INVESTMENT_EXCEEDED") {
        setLimitModal({ currentTotal: errData.currentTotal ?? 0, remaining: errData.remaining ?? 0, maxTotal: errData.maxTotal ?? maxTotalInvestment });
        return;
      }
      toast({ title: "Investment failed", description: errData?.message || err?.message || "Please try again", variant: "destructive" });
    }
  };

  const activeInvestments = investments?.filter(i => i.status === "active") || [];
  const INVEST_PAGE_SIZE = 5;
  const [investPage, setInvestPage] = useState(1);
  const totalInvestPages = Math.max(1, Math.ceil(activeInvestments.length / INVEST_PAGE_SIZE));
  const paginatedInvestments = activeInvestments.slice((investPage - 1) * INVEST_PAGE_SIZE, investPage * INVEST_PAGE_SIZE);

  return (
    <div className="px-4 py-6 max-w-2xl mx-auto space-y-6 pb-24 md:pb-8">
      <h1
        className="text-xl font-bold"
        style={{ fontFamily: "'Sora', sans-serif", background: "linear-gradient(135deg, #C2D2FF, #5B8CFF)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}
      >
        {section === "invest" ? "Investment Plans" : "Buy Token"}
      </h1>

      {/* Section switcher */}
      <div className="flex gap-1.5 p-1 rounded-xl" style={{ background: "rgba(0,20,40,0.5)", border: "1px solid rgba(91,140,255,0.1)" }}>
        {([
          { key: "invest", label: "Investments", icon: TrendingUp },
          { key: "token", label: "Buy Token", icon: Coins },
        ] as const).map(s => (
          <button key={s.key} onClick={() => setSection(s.key)}
            className="flex-1 py-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5"
            style={{
              background: section === s.key ? "linear-gradient(135deg, rgba(91,140,255,0.22), rgba(91,140,255,0.08))" : "transparent",
              border: section === s.key ? "1px solid rgba(91,140,255,0.4)" : "1px solid transparent",
              color: section === s.key ? TEAL : "rgba(194,210,255,0.45)",
              letterSpacing: "0.04em",
            }}>
            <s.icon size={13} /> {s.label}
          </button>
        ))}
      </div>

      {section === "token" && <TokenPurchase user={user} />}

      {section === "invest" && (
        <>
          {/* Plan info card */}
          <div className="rounded-2xl p-5" style={{
            background: "linear-gradient(135deg, rgba(91,140,255,0.10), rgba(61,92,224,0.04))",
            border: "1px solid rgba(91,140,255,0.3)",
            boxShadow: "0 0 32px rgba(91,140,255,0.08)",
          }}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-xs uppercase tracking-widest mb-1" style={{ color: "rgba(194,210,255,0.4)" }}>Investment Plan</div>
                <div className="font-black text-lg" style={{ fontFamily: "'Sora', sans-serif", color: TEAL }}>Variable Token Returns</div>
                <div className="text-xs mt-0.5" style={{ color: "rgba(194,210,255,0.4)" }}>Earn WTA daily · rate depends on trading profit</div>
              </div>
              <div className="px-3 py-1.5 rounded-xl text-xs font-bold"
                style={{ background: "rgba(91,140,255,0.15)", border: "1px solid rgba(91,140,255,0.3)", color: TEAL }}>
                {plan.days} Days
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 mb-4">
              {[
                { label: "Min Amount", value: `$${plan.min.toLocaleString()}` },
                { label: "Max Amount", value: `$${plan.max.toLocaleString()}` },
              ].map(item => (
                <div key={item.label} className="rounded-xl p-3 text-center"
                  style={{ background: "rgba(0,20,40,0.5)", border: "1px solid rgba(91,140,255,0.12)" }}>
                  <div className="text-xs mb-1" style={{ color: "rgba(194,210,255,0.35)" }}>{item.label}</div>
                  <div className="font-bold text-sm" style={{ color: "rgba(194,210,255,0.85)" }}>{item.value}</div>
                </div>
              ))}
            </div>

            <div className="flex justify-between items-center px-3 py-2.5 rounded-xl"
              style={{ background: "rgba(91,140,255,0.06)", border: "1px solid rgba(91,140,255,0.10)" }}>
              <div className="text-xs" style={{ color: "rgba(194,210,255,0.4)" }}>Your USDT Balance</div>
              <div className="font-bold text-sm" style={{ color: TEAL }}>${usdtBalance.toFixed(2)}</div>
            </div>
          </div>

          {/* Invest Form */}
          <div className="rounded-2xl p-5" style={{ ...GLASS }}>
            <h2 className="font-semibold text-sm mb-5" style={{ color: "rgba(194,210,255,0.8)" }}>New Investment</h2>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">

                {/* Safe / Risky toggle */}
                <FormField control={form.control} name="investmentType" render={({ field }) => (
                  <FormItem>
                    <InvestTypeSelector value={field.value} onChange={field.onChange} />
                    <FormMessage />
                  </FormItem>
                )} />

                {/* Amount input */}
                <FormField control={form.control} name="amount" render={({ field }) => (
                  <FormItem>
                    <FormLabel style={{ color: "rgba(194,210,255,0.65)", fontSize: "0.8rem" }}>
                      Amount (USDT) — min ${plan.min.toLocaleString()}, max ${plan.max.toLocaleString()}
                    </FormLabel>
                    <FormControl>
                      <Input
                        data-testid="input-amount"
                        type="number" step="100" min={plan.min} max={plan.max}
                        {...field}
                        value={field.value === 0 || field.value === undefined ? "" : field.value}
                        onChange={e => {
                          if (e.target.value === "") field.onChange("");
                          else field.onChange(Number(e.target.value));
                        }}
                        style={{ background: "rgba(0,20,40,0.6)", border: "1px solid rgba(91,140,255,0.18)", color: "rgba(194,210,255,0.9)" }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                {/* Split preview */}
                {(watchedAmount || 0) >= plan.min && (
                  <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(91,140,255,0.15)" }}>
                    <div className="px-4 py-2.5 text-xs font-semibold uppercase tracking-widest"
                      style={{ background: "rgba(91,140,255,0.06)", color: "rgba(194,210,255,0.4)", borderBottom: "1px solid rgba(91,140,255,0.10)" }}>
                      Your Investment Breakdown
                    </div>
                    <div className="px-4 py-3 space-y-2.5" style={{ background: "rgba(4,12,26,0.5)" }}>
                      {watchedType === "safe" && (
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Coins size={12} style={{ color: "#34d399" }} />
                            <span className="text-xs" style={{ color: "rgba(194,210,255,0.5)" }}>WTA Token Purchase (50%)</span>
                          </div>
                          <span className="text-xs font-bold" style={{ color: "#34d399" }}>${tokenPortion.toFixed(2)}</span>
                        </div>
                      )}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <TrendingUp size={12} style={{ color: TEAL }} />
                          <span className="text-xs" style={{ color: "rgba(194,210,255,0.5)" }}>
                            Daily ROI Pool {watchedType === "safe" ? "(50%)" : "(100%)"}
                          </span>
                        </div>
                        <span className="text-xs font-bold" style={{ color: TEAL }}>${roiPortion.toFixed(2)}</span>
                      </div>
                      <div className="pt-1.5" style={{ borderTop: "1px solid rgba(91,140,255,0.08)" }}>
                        <div className="flex items-center justify-between">
                          <span className="text-xs" style={{ color: "rgba(194,210,255,0.35)" }}>Duration</span>
                          <span className="text-xs font-semibold" style={{ color: TEAL }}>{plan.days} days</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <button
                  data-testid="button-submit-invest"
                  type="submit"
                  disabled={createInvestment.isPending}
                  className="w-full py-3 rounded-xl font-bold transition-all disabled:opacity-60"
                  style={{
                    background: watchedType === "safe"
                      ? "linear-gradient(135deg, #34d399, #059669)"
                      : "linear-gradient(135deg, #f87171, #dc2626)",
                    color: "#fff",
                    letterSpacing: "0.04em",
                    boxShadow: watchedType === "safe"
                      ? "0 0 20px rgba(52,211,153,0.3)"
                      : "0 0 20px rgba(248,113,113,0.3)",
                  }}
                >
                  {createInvestment.isPending
                    ? "Processing..."
                    : `${watchedType === "safe" ? "Safe Invest" : "Risky Invest"} $${watchedAmount || 0}`}
                </button>
              </form>
            </Form>
          </div>

          {/* Active Investments */}
          {activeInvestments.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-sm" style={{ color: "rgba(194,210,255,0.75)" }}>Your Active Investments</h2>
                <span className="text-xs" style={{ color: "rgba(194,210,255,0.35)" }}>{activeInvestments.length} total</span>
              </div>
              <div className="space-y-3">
                {paginatedInvestments.map(inv => {
                  const cooling = getCoolingInfo(inv.createdAt, coolingHours);
                  const isSafe = (inv as any).investmentType === "safe";
                  const typeColor = isSafe ? "#34d399" : "#f87171";
                  return (
                    <div
                      key={inv.id}
                      data-testid={`card-investment-${inv.id}`}
                      className="rounded-xl p-4 cursor-pointer active:scale-[0.98] transition-transform"
                      style={{ ...GLASS, userSelect: "none" }}
                      onClick={() => setSelectedInvestment(inv)}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-lg flex items-center justify-center"
                            style={{ background: `${typeColor}18`, border: `1px solid ${typeColor}33` }}>
                            {isSafe ? <Shield size={11} style={{ color: typeColor }} /> : <Zap size={11} style={{ color: typeColor }} />}
                          </div>
                          <div>
                            <div className="font-semibold text-sm" style={{ color: "rgba(194,210,255,0.85)" }}>
                              ${inv.amount.toFixed(2)}
                            </div>
                            <div className="text-xs" style={{ color: typeColor, opacity: 0.8 }}>
                              {isSafe ? "Safe Invest" : "Risky Invest"}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {cooling && (
                            <span className="flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full font-semibold"
                              style={{ background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.3)", color: "rgba(251,191,36,0.9)" }}>
                              <Snowflake size={10} /> {cooling.h}h {cooling.m}m
                            </span>
                          )}
                          <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold"
                            style={{ background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.25)", color: "#34d399" }}>
                            Active
                          </span>
                        </div>
                      </div>

                      <div className="flex gap-3 mb-2.5 text-xs" style={{ color: "rgba(194,210,255,0.35)" }}>
                        <span>{inv.remainingDays}d left</span>
                        <span>·</span>
                        <span>Earned: <span style={{ color: "#34d399" }}>${inv.earnedSoFar.toFixed(2)}</span></span>
                      </div>

                      <div className="w-full rounded-full h-1.5" style={{ background: "rgba(91,140,255,0.08)" }}>
                        <div
                          className="h-1.5 rounded-full"
                          style={{
                            width: `${Math.max(2, ((inv.durationDays - inv.remainingDays) / inv.durationDays) * 100)}%`,
                            background: `linear-gradient(90deg, ${TEAL}, #3D5CE0)`,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {totalInvestPages > 1 && (
                <div className="mt-4">
                  <Pagination currentPage={investPage} totalPages={totalInvestPages} onPageChange={setInvestPage} />
                </div>
              )}
            </div>
          )}
        </>
      )}

      {selectedInvestment && (
        <InvestmentDetailModal
          inv={selectedInvestment}
          coolingHours={coolingHours}
          onClose={() => setSelectedInvestment(null)}
        />
      )}
      {limitModal && (
        <MaxInvestmentModal
          currentTotal={limitModal.currentTotal}
          remaining={limitModal.remaining}
          maxTotal={limitModal.maxTotal}
          onClose={() => setLimitModal(null)}
        />
      )}
    </div>
  );
}
