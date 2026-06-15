import { useState } from "react";
import { useListIncome, useGetIncomeSummary, getListIncomeQueryKey } from "@workspace/api-client-react";
import { DollarSign, TrendingUp, Users, Award } from "lucide-react";

const TEAL = "#00FF94";
const GLASS = { background: "rgba(10,14,30,0.65)", backdropFilter: "blur(14px)", border: "1px solid rgba(0,255,148,0.10)" } as const;

const typeFilters = [
  { value: "",                label: "All" },
  { value: "daily_return",    label: "Daily Return" },
  { value: "spot_referral",   label: "Referral" },
  { value: "level_commission",label: "Commission" },
  { value: "rank_bonus",      label: "Rank Bonus" },
];

const typeIcons: Record<string, any> = {
  daily_return:     TrendingUp,
  spot_referral:    Users,
  level_commission: DollarSign,
  rank_bonus:       Award,
};

const typeColors: Record<string, string> = {
  daily_return:     "#34d399",
  spot_referral:    "#60a5fa",
  level_commission: "#c084fc",
  rank_bonus:       "#00FF94",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const TOKEN_TYPES = new Set(["daily_return", "level_commission"]);

function fmtAmount(type: string, amount: number) {
  return TOKEN_TYPES.has(type)
    ? `${amount.toFixed(4)} WTA`
    : `$${amount.toFixed(2)}`;
}

export default function Income() {
  const [type, setType] = useState("");
  const { data: summary, isLoading: sumLoading } = useGetIncomeSummary();
  const { data: incomeData, isLoading } = useListIncome(
    type ? { type: type as any, page: 1, limit: 50 } : { page: 1, limit: 50 },
    { query: { queryKey: getListIncomeQueryKey(type ? { type: type as any, page: 1, limit: 50 } : { page: 1, limit: 50 }) } }
  );

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
        Income Details
      </h1>

      {/* Hero card */}
      <div
        className="rounded-2xl p-5 relative overflow-hidden col-span-2"
        style={{
          background: "linear-gradient(135deg, rgba(0,255,148,0.12), rgba(0,204,119,0.06), rgba(0,180,100,0.05))",
          border: "1px solid rgba(0,255,148,0.28)",
          boxShadow: "0 0 40px rgba(0,255,148,0.08)",
        }}
      >
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: "radial-gradient(ellipse at top right, rgba(0,255,148,0.16) 0%, transparent 60%)" }}
        />
        <div className="relative">
          <div className="text-xs tracking-widest uppercase mb-1" style={{ color: "rgba(176,255,224,0.45)" }}>
            USDT Earnings
          </div>
          <div
            className="text-4xl font-black"
            data-testid="text-total-income"
            style={{
              fontFamily: "'Sora', sans-serif",
              background: "linear-gradient(135deg, #B0FFE0, #00FF94)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            ${sumLoading ? "—" : (summary?.totalEarnings ?? 0).toFixed(2)}
          </div>
          <div className="flex gap-4 mt-3 text-xs" style={{ color: "rgba(176,255,224,0.4)" }}>
            <span>Available: <span style={{ color: "rgba(176,255,224,0.8)", fontWeight: 600 }}>${summary?.availableBalance?.toFixed(2) ?? "—"}</span></span>
            <span>Withdrawn: <span style={{ color: "rgba(176,255,224,0.8)", fontWeight: 600 }}>${summary?.withdrawnTotal?.toFixed(2) ?? "—"}</span></span>
          </div>
        </div>
      </div>

      {/* Earnings cap progress */}
      {(() => {
        const cap = (summary as any)?.earningsCap;
        if (!cap || !cap.enabled || cap.cap == null) return null;
        const earned = Number(cap.earned ?? 0);
        const ceiling = Number(cap.cap ?? 0);
        const pct = ceiling > 0 ? Math.min(100, (earned / ceiling) * 100) : 0;
        const remaining = Number(cap.remaining ?? Math.max(0, ceiling - earned));
        const reached = !!cap.reached;
        const barColor = reached ? "#f87171" : pct >= 80 ? "#fbbf24" : "#34d399";
        return (
          <div className="rounded-2xl p-4" style={GLASS}>
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs tracking-wide uppercase" style={{ color: "rgba(176,255,224,0.45)" }}>
                Earnings Cap
              </div>
              <div
                className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                style={{ color: TEAL, background: "rgba(0,255,148,0.12)", border: "1px solid rgba(0,255,148,0.25)" }}
              >
                {Number(cap.multiplier ?? 0)}× INVESTED
              </div>
            </div>
            <div className="flex items-baseline justify-between mb-1.5">
              <div className="font-bold text-sm" style={{ color: "rgba(176,255,224,0.9)" }}>
                ${earned.toFixed(2)} <span style={{ color: "rgba(176,255,224,0.4)", fontWeight: 400 }}>of ${ceiling.toFixed(2)}</span>
              </div>
              <div className="text-xs" style={{ color: reached ? "#f87171" : "rgba(176,255,224,0.55)" }}>
                {reached ? "Cap reached" : `$${remaining.toFixed(2)} left`}
              </div>
            </div>
            <div className="h-2 rounded-full overflow-hidden" style={{ background: "rgba(0,255,148,0.12)" }}>
              <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: barColor }} />
            </div>
            <div className="text-[11px] mt-2" style={{ color: "rgba(176,255,224,0.4)" }}>
              Trading Profit + Team Benefit combined. Grow your direct team's volume past your own investment to unlock a higher cap.
            </div>
          </div>
        );
      })()}

      {/* Income type breakdown */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: "Daily Returns",    value: summary?.dailyReturnTotal,     type: "daily_return",     icon: TrendingUp, color: "#34d399" },
          { label: "Spot Referral",    value: summary?.spotReferralTotal,    type: "spot_referral",    icon: Users,      color: "#60a5fa" },
          { label: "Level Commission", value: summary?.levelCommissionTotal, type: "level_commission", icon: DollarSign, color: "#c084fc" },
          { label: "Rank Bonus",       value: summary?.rankBonusTotal,       type: "rank_bonus",       icon: Award,      color: TEAL     },
        ].map(item => (
          <div key={item.label} className="rounded-xl p-3" style={GLASS}>
            <div className="flex items-center gap-1.5 mb-1.5">
              <item.icon size={13} style={{ color: item.color }} />
              <div className="text-xs" style={{ color: "rgba(176,255,224,0.4)" }}>{item.label}</div>
            </div>
            <div className="font-bold text-sm" style={{ color: "rgba(176,255,224,0.85)" }}>
              {fmtAmount(item.type, item.value ?? 0)}
            </div>
          </div>
        ))}
      </div>

      {/* Filter pills */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {typeFilters.map(f => {
          const active = type === f.value;
          return (
            <button
              key={f.value}
              data-testid={`filter-${f.value || "all"}`}
              onClick={() => setType(f.value)}
              className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all"
              style={{
                background: active ? "linear-gradient(135deg, #00FF94, #00CC77)" : "rgba(10,14,30,0.65)",
                color: active ? "#050C0A" : "rgba(176,255,224,0.45)",
                border: active ? "none" : "1px solid rgba(0,255,148,0.12)",
                boxShadow: active ? "0 0 10px rgba(0,255,148,0.25)" : "none",
                fontWeight: active ? 700 : 500,
              }}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {/* Income list */}
      {isLoading ? (
        <div className="space-y-3">
          {[1,2,3,4].map(i => (
            <div key={i} className="rounded-xl h-16 animate-pulse" style={{ background: "rgba(0,255,148,0.04)", border: "1px solid rgba(0,255,148,0.08)" }} />
          ))}
        </div>
      ) : !incomeData?.records?.length ? (
        <div className="rounded-xl p-10 text-center" style={GLASS}>
          <DollarSign size={36} className="mx-auto mb-2" style={{ color: "rgba(176,255,224,0.2)" }} />
          <p className="text-sm" style={{ color: "rgba(176,255,224,0.35)" }}>No income records yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {incomeData.records.map(record => {
            const Icon = typeIcons[record.type] || DollarSign;
            const color = typeColors[record.type] || TEAL;
            return (
              <div
                key={record.id}
                data-testid={`row-income-${record.id}`}
                className="rounded-xl px-4 py-3.5 flex items-center justify-between transition-all"
                style={GLASS}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center"
                    style={{ background: "rgba(0,10,24,0.6)", border: `1px solid ${color}33` }}
                  >
                    <Icon size={16} style={{ color }} />
                  </div>
                  <div>
                    <div className="text-sm font-medium" style={{ color: "rgba(176,255,224,0.8)" }}>{record.description}</div>
                    {record.fromUserName && (
                      <div className="text-xs" style={{ color: "rgba(176,255,224,0.35)" }}>From: {record.fromUserName}</div>
                    )}
                    <div className="text-xs" style={{ color: "rgba(176,255,224,0.3)" }}>{formatDate(record.createdAt)}</div>
                  </div>
                </div>
                <div className="font-bold text-sm" style={{ color }}>+{fmtAmount(record.type, record.amount)}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
