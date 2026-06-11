import { useListAdminInvestments } from "@workspace/api-client-react";
import { TrendingUp } from "lucide-react";

const TEAL = "#5B8CFF";
const GLASS = { background: "rgba(10,14,30,0.65)", backdropFilter: "blur(14px)", border: "1px solid rgba(91,140,255,0.10)" } as const;

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function AdminInvestments() {
  const { data, isLoading } = useListAdminInvestments();
  const investments = data?.investments ?? [];

  const totalInvested = investments.reduce((s, i) => s + i.amount, 0);
  const activeCount = investments.filter(i => i.status === "active").length;

  return (
    <div className="px-4 py-6 max-w-4xl mx-auto space-y-5 pb-24 md:pb-8">
      <div className="flex items-center gap-3">
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
          All Investments
        </h1>
        <span
          className="text-xs px-2.5 py-1 rounded-full font-semibold"
          style={{ background: "rgba(91,140,255,0.10)", border: "1px solid rgba(91,140,255,0.2)", color: TEAL }}
        >
          {data?.total ?? 0}
        </span>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total Invested", value: `$${totalInvested.toFixed(0)}`, color: TEAL },
          { label: "Active",         value: activeCount,                    color: "#34d399" },
          { label: "Completed",      value: investments.length - activeCount, color: "rgba(194,210,255,0.45)" },
        ].map(item => (
          <div key={item.label} className="rounded-xl p-4 text-center" style={GLASS}>
            <div className="font-bold text-lg" style={{ color: item.color }}>{item.value}</div>
            <div className="text-xs mt-0.5" style={{ color: "rgba(194,210,255,0.35)" }}>{item.label}</div>
          </div>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => (
            <div key={i} className="rounded-xl h-24 animate-pulse" style={{ background: "rgba(91,140,255,0.04)", border: "1px solid rgba(91,140,255,0.08)" }} />
          ))}
        </div>
      ) : !investments.length ? (
        <div className="rounded-xl p-8 text-center" style={GLASS}>
          <TrendingUp size={32} className="mx-auto mb-2" style={{ color: "rgba(194,210,255,0.2)" }} />
          <p className="text-sm" style={{ color: "rgba(194,210,255,0.35)" }}>No investments yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {investments.map(inv => (
            <div key={inv.id} data-testid={`row-investment-${inv.id}`} className="rounded-xl p-4" style={GLASS}>
              <div className="flex items-center justify-between mb-2">
                <div>
                  <div className="font-semibold text-sm" style={{ color: "rgba(194,210,255,0.85)" }}>{(inv as any).userName ?? `User #${inv.userId}`}</div>
                  <div className="text-xs capitalize" style={{ color: "rgba(194,210,255,0.4)" }}>
                    {inv.planTier.replace("tier", "Tier ")}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-bold" style={{ color: TEAL }}>${inv.amount.toFixed(2)}</div>
                  <span
                    className="text-xs px-2 py-0.5 rounded-full font-medium"
                    style={inv.status === "active" ? {
                      background: "rgba(52,211,153,0.10)",
                      border: "1px solid rgba(52,211,153,0.22)",
                      color: "#34d399",
                    } : {
                      background: "rgba(194,210,255,0.05)",
                      border: "1px solid rgba(194,210,255,0.10)",
                      color: "rgba(194,210,255,0.4)",
                    }}
                  >
                    {inv.status}
                  </span>
                </div>
              </div>
              <div
                className="grid grid-cols-4 gap-2 pt-2 text-center"
                style={{ borderTop: "1px solid rgba(91,140,255,0.07)" }}
              >
                {[
                  { label: "Daily", value: `${(inv.dailyRate * 100).toFixed(1)}%` },
                  { label: "Duration", value: `${inv.durationDays}d` },
                  { label: "Earned", value: `$${inv.earnedSoFar.toFixed(2)}` },
                  { label: "Started", value: formatDate(inv.startDate) },
                ].map(item => (
                  <div key={item.label}>
                    <div className="text-xs font-semibold" style={{ color: "rgba(194,210,255,0.75)" }}>{item.value}</div>
                    <div className="text-xs" style={{ color: "rgba(194,210,255,0.35)" }}>{item.label}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
