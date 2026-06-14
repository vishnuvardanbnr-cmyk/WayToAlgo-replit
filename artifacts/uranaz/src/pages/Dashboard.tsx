import { useGetIncomeSummary, useListInvestments, useGetTeamStats, useGetMyRankProgress } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Users, DollarSign, Award, ArrowRight, Wallet, CheckCircle } from "lucide-react";
import { useEffect, useState } from "react";
import DashboardTokenCard from "@/components/DashboardTokenCard";
import DashboardCapBar from "@/components/DashboardCapBar";

const TEAL = "#5B8CFF";
const TEAL_DIM = "rgba(91,140,255,0.55)";

function StatCard({ label, value, sub, icon: Icon, accent }: any) {
  return (
    <div
      className="rounded-xl p-4 transition-all duration-200"
      style={{
        background: accent
          ? "linear-gradient(135deg, rgba(91,140,255,0.10), rgba(61,92,224,0.05))"
          : "rgba(10,14,30,0.65)",
        backdropFilter: "blur(12px)",
        border: accent
          ? "1px solid rgba(91,140,255,0.25)"
          : "1px solid rgba(91,140,255,0.10)",
        boxShadow: accent
          ? "0 0 20px rgba(91,140,255,0.08), inset 0 0 0 1px rgba(91,140,255,0.06)"
          : "0 4px 16px rgba(0,0,0,0.3)",
      }}
    >
      <div className="flex items-start justify-between mb-3">
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center"
          style={{
            background: accent ? "rgba(91,140,255,0.12)" : "rgba(255,255,255,0.04)",
            border: `1px solid ${accent ? "rgba(91,140,255,0.2)" : "rgba(255,255,255,0.06)"}`,
          }}
        >
          <Icon size={17} style={{ color: accent ? TEAL : "rgba(194,210,255,0.4)" }} />
        </div>
      </div>
      <div className="text-xl font-bold" style={{ color: "rgba(194,210,255,0.92)" }}>{value}</div>
      <div className="text-xs mt-0.5" style={{ color: "rgba(194,210,255,0.4)" }}>{label}</div>
      {sub && <div className="text-xs mt-1" style={{ color: TEAL_DIM }}>{sub}</div>}
    </div>
  );
}

export default function Dashboard({ user }: { user: any }) {
  const { data: summary, isLoading: loadingSummary } = useGetIncomeSummary();
  const { data: investments, isLoading: loadingInv } = useListInvestments();
  const { data: teamStats } = useGetTeamStats();
  const { data: rankProgress } = useGetMyRankProgress();
  const [activeOffers, setActiveOffers] = useState<any[]>([]);
  const [detailOffer, setDetailOffer] = useState<any | null>(null);

  useEffect(() => {
    fetch("/api/offers/active")
      .then(r => r.json())
      .then(d => setActiveOffers(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, []);

  const activeInv = investments?.filter(i => i.status === "active") || [];

  return (
    <div className="px-4 py-6 max-w-2xl mx-auto space-y-6 pb-24 md:pb-8">

      {/* Welcome */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold" style={{ color: "rgba(194,210,255,0.6)" }}>Welcome back,</h1>
          <p
            className="text-xl font-bold"
            style={{
              fontFamily: "'Sora', sans-serif",
              background: "linear-gradient(135deg, #C2D2FF, #5B8CFF)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            {user?.name}
          </p>
        </div>
      </div>

      {/* Balance Card */}
      <div
        className="rounded-2xl p-6 relative overflow-hidden"
        style={{
          background: "linear-gradient(135deg, rgba(91,140,255,0.12) 0%, rgba(61,92,224,0.06) 50%, rgba(100,60,200,0.06) 100%)",
          border: "1px solid rgba(91,140,255,0.28)",
          boxShadow: "0 0 40px rgba(91,140,255,0.10), 0 8px 40px rgba(0,0,0,0.4)",
        }}
      >
        {/* Inner glow highlight */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: "radial-gradient(ellipse at top right, rgba(91,140,255,0.18) 0%, transparent 65%)",
          }}
        />
        {/* Ring arc decoration */}
        <div
          className="absolute -right-12 -top-12 w-40 h-40 rounded-full pointer-events-none"
          style={{
            border: "1px solid rgba(91,140,255,0.15)",
            boxShadow: "0 0 0 16px rgba(91,140,255,0.04), 0 0 0 32px rgba(91,140,255,0.02)",
          }}
        />
        <div className="relative">
          <div className="text-xs mb-1 tracking-widest uppercase" style={{ color: "rgba(194,210,255,0.5)" }}>
            Available Balance
          </div>
          <div
            className="text-4xl font-black mb-4"
            data-testid="text-balance"
            style={{
              fontFamily: "'Sora', sans-serif",
              background: "linear-gradient(135deg, #C2D2FF, #5B8CFF, #3D5CE0)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
              textShadow: "none",
            }}
          >
            ${loadingSummary ? "—" : (summary?.availableBalance ?? 0).toFixed(2)}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "USDT Earned",    value: summary?.usdtEarningsTotal, testId: "text-total-earnings", prefix: "$", suffix: "" },
              { label: "Total Withdrawn", value: summary?.withdrawnTotal,   testId: undefined,             prefix: "$", suffix: "" },
            ].map(item => (
              <div
                key={item.label}
                className="rounded-xl p-3"
                style={{
                  background: "rgba(0,10,20,0.4)",
                  border: "1px solid rgba(91,140,255,0.10)",
                }}
              >
                <div className="text-xs" style={{ color: "rgba(194,210,255,0.4)" }}>{item.label}</div>
                <div
                  className="font-bold text-sm mt-0.5"
                  data-testid={item.testId}
                  style={{ color: "rgba(194,210,255,0.85)" }}
                >
                  {item.prefix}{item.value?.toFixed(2) ?? "—"}
                </div>
              </div>
            ))}
          </div>
          {/* WTA row */}
          {(summary?.wtaEarningsTotal ?? 0) > 0 && (
            <div className="mt-2 rounded-xl p-3" style={{ background: "rgba(0,10,20,0.4)", border: "1px solid rgba(168,85,247,0.15)" }}>
              <div className="text-xs" style={{ color: "rgba(194,210,255,0.4)" }}>WTA Tokens Earned</div>
              <div className="font-bold text-sm mt-0.5" style={{ color: "#c084fc" }}>
                {summary?.wtaEarningsTotal?.toFixed(4)} WTA
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Total Invested"  value={`$${user?.totalInvested?.toFixed(2) || "0.00"}`} icon={Wallet} accent />
        <StatCard
          label="Daily Potential"
          icon={DollarSign}
          value={`$${(((summary as any)?.dailyPotential?.totalUsd) ?? 0).toFixed(2)}`}
          sub={`ROI $${(((summary as any)?.dailyPotential?.roiUsd) ?? 0).toFixed(2)} · Level $${(((summary as any)?.dailyPotential?.levelUsd) ?? 0).toFixed(2)}`}
          accent
        />
        <StatCard label="Team Members"  value={teamStats?.totalMembers ?? "—"} icon={Users} />
        <StatCard label="Current Level" value={`L${user?.currentLevel ?? 0}`}  icon={Award} accent />
      </div>

      {/* Earnings cap (2x / 3x) */}
      <DashboardCapBar cap={(summary as any)?.earningsCap} />

      {/* On-chain token */}
      <DashboardTokenCard />

      {/* Income Breakdown */}
      {summary && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-sm tracking-wide" style={{ color: "rgba(194,210,255,0.8)" }}>
              Income Breakdown
            </h2>
            <Link href="/income" className="text-xs flex items-center gap-1" style={{ color: TEAL }}>
              Details <ArrowRight size={12} />
            </Link>
          </div>
          <div
            className="rounded-xl overflow-hidden"
            style={{
              background: "rgba(10,14,30,0.65)",
              backdropFilter: "blur(12px)",
              border: "1px solid rgba(91,140,255,0.10)",
            }}
          >
            {[
              { label: "Daily Returns",    value: summary.dailyReturnTotal,    isWta: true  },
              { label: "Spot Referral",    value: summary.spotReferralTotal,   isWta: false },
              { label: "Level Commission", value: summary.levelCommissionTotal, isWta: true  },
              { label: "Rank Bonus",       value: summary.rankBonusTotal,       isWta: false },
            ].map((item, idx) => (
              <div
                key={item.label}
                className="flex items-center justify-between px-4 py-3"
                style={{
                  borderTop: idx > 0 ? "1px solid rgba(91,140,255,0.07)" : "none",
                }}
              >
                <div className="flex items-center gap-2">
                  <CheckCircle size={13} style={{ color: item.isWta ? "#c084fc" : TEAL }} />
                  <span className="text-sm" style={{ color: "rgba(194,210,255,0.7)" }}>{item.label}</span>
                </div>
                <span className="font-semibold text-sm" style={{ color: item.isWta ? "#c084fc" : "rgba(194,210,255,0.85)" }}>
                  {item.isWta
                    ? `${item.value.toFixed(4)} WTA`
                    : `$${item.value.toFixed(2)}`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Dynamic Offers */}
      {activeOffers.map(offer => {
        const selfInvested = user?.totalInvested ?? 0;
        const teamBusiness = teamStats?.totalTeamBusiness ?? 0;
        const legs = teamStats?.lugsStats ?? [];

        const fmtUsd = (v: number) => `$${v >= 1000 ? (v / 1000).toFixed(1) + "K" : v.toFixed(0)}`;

        const criteria = (offer.criteria as any[]).map(c => {
          let current = 0;
          if (c.type === "self_invest") current = selfInvested;
          else if (c.type === "team_business") current = teamBusiness;
          else if (c.type === "leg") current = legs.find((l: any) => l.lugIndex === c.legIndex)?.business ?? 0;
          return { label: c.label, current, target: c.target, fmt: fmtUsd };
        });

        const allDone = criteria.length > 0 && criteria.every(c => c.current >= c.target);

        const countdown = (() => {
          if (!offer.endDate) return null;
          const diffMs = new Date(offer.endDate).getTime() - Date.now();
          if (diffMs <= 0) return { expired: true, text: "Expired" };
          const d = Math.floor(diffMs / 86400000);
          const h = Math.floor((diffMs % 86400000) / 3600000);
          const m = Math.floor((diffMs % 3600000) / 60000);
          return { expired: false, text: `${d}d ${h}h ${m}m left` };
        })();

        return (
          <div
            key={offer.id}
            className="rounded-2xl overflow-hidden relative"
            style={{
              background: "linear-gradient(155deg, rgba(4,16,32,0.97) 0%, rgba(2,10,22,0.97) 100%)",
              border: "1px solid rgba(91,140,255,0.22)",
              boxShadow: "0 0 40px rgba(91,140,255,0.07)",
            }}
          >
            <div className="h-0.5 w-full" style={{ background: "linear-gradient(90deg, transparent, #5B8CFF, #a855f7, transparent)" }} />
            <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at top right, rgba(91,140,255,0.07) 0%, rgba(168,85,247,0.04) 50%, transparent 70%)" }} />

            <div className="relative p-5 space-y-4">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
                    style={{ background: "rgba(91,140,255,0.10)", border: "1px solid rgba(91,140,255,0.20)" }}
                  >
                    {offer.emoji}
                  </div>
                  <div>
                    <div
                      className="font-bold text-sm"
                      style={{
                        fontFamily: "'Sora', sans-serif",
                        background: "linear-gradient(135deg, #C2D2FF, #5B8CFF)",
                        WebkitBackgroundClip: "text",
                        WebkitTextFillColor: "transparent",
                        backgroundClip: "text",
                      }}
                    >
                      {offer.title}
                    </div>
                    {offer.subtitle && (
                      <div className="text-xs" style={{ color: "rgba(194,210,255,0.4)" }}>{offer.subtitle}</div>
                    )}
                  </div>
                </div>
                {allDone && (
                  <div
                    className="px-2.5 py-1 rounded-full text-xs font-bold"
                    style={{ background: "rgba(52,211,153,0.15)", border: "1px solid rgba(52,211,153,0.3)", color: "rgba(52,211,153,0.9)" }}
                  >
                    Qualified!
                  </div>
                )}
              </div>

              {/* Reward */}
              {offer.reward && (
                <div
                  className="px-3 py-2.5 rounded-xl"
                  style={{ background: "rgba(91,140,255,0.05)", border: "1px solid rgba(91,140,255,0.10)" }}
                >
                  <div className="text-xs mb-1" style={{ color: "rgba(194,210,255,0.4)" }}>🎁 Reward</div>
                  <div className="text-sm font-bold leading-snug" style={{ color: TEAL }}>{offer.reward}</div>
                </div>
              )}

              {/* Progress criteria */}
              {criteria.length > 0 && (
                <div className="space-y-3">
                  {criteria.map(c => {
                    const pct = Math.min(100, c.target > 0 ? (c.current / c.target) * 100 : 0);
                    const done = c.current >= c.target;
                    return (
                      <div key={c.label}>
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-1.5">
                            {done
                              ? <CheckCircle size={12} style={{ color: "rgba(52,211,153,0.85)" }} />
                              : <div className="w-3 h-3 rounded-full" style={{ border: "1.5px solid rgba(91,140,255,0.3)" }} />
                            }
                            <span className="text-xs font-medium" style={{ color: done ? "rgba(194,210,255,0.75)" : "rgba(194,210,255,0.5)" }}>
                              {c.label}
                            </span>
                          </div>
                          <span className="text-xs font-bold" style={{ color: done ? "rgba(52,211,153,0.9)" : TEAL }}>
                            {c.fmt(c.current)} <span style={{ color: "rgba(194,210,255,0.3)", fontWeight: 400 }}>/ {c.fmt(c.target)}</span>
                          </span>
                        </div>
                        <div className="w-full rounded-full h-1.5" style={{ background: "rgba(91,140,255,0.07)" }}>
                          <div
                            className="h-1.5 rounded-full transition-all duration-700"
                            style={{
                              width: `${pct}%`,
                              background: done
                                ? "linear-gradient(90deg, rgba(52,211,153,0.8), rgba(52,211,153,0.6))"
                                : "linear-gradient(90deg, #5B8CFF, #3D5CE0)",
                              boxShadow: done ? "0 0 8px rgba(52,211,153,0.4)" : "0 0 8px rgba(91,140,255,0.4)",
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Countdown + View Details row */}
              <div className="flex items-center gap-2">
                {countdown && (
                  <div
                    className="flex-1 flex items-center justify-between px-3 py-2 rounded-xl"
                    style={{
                      background: countdown.expired ? "rgba(248,113,113,0.07)" : "rgba(91,140,255,0.06)",
                      border: `1px solid ${countdown.expired ? "rgba(248,113,113,0.2)" : "rgba(91,140,255,0.12)"}`,
                    }}
                  >
                    <span className="text-xs" style={{ color: "rgba(194,210,255,0.45)" }}>
                      {countdown.expired ? "Offer ended" : "Offer ends"}
                    </span>
                    <span className="text-xs font-bold" style={{ color: countdown.expired ? "rgba(248,113,113,0.8)" : TEAL }}>
                      {countdown.text}
                    </span>
                  </div>
                )}
                <button
                  onClick={() => setDetailOffer({ offer, criteria, allDone, countdown })}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all"
                  style={{
                    background: "rgba(91,140,255,0.08)",
                    border: "1px solid rgba(91,140,255,0.18)",
                    color: TEAL,
                    whiteSpace: "nowrap",
                  }}
                >
                  View Details <ArrowRight size={11} />
                </button>
              </div>
            </div>
          </div>
        );
      })}

      {/* Offer Detail Modal */}
      {detailOffer && (() => {
        const { offer, criteria, allDone, countdown } = detailOffer;
        const completedCount = criteria.filter((c: any) => c.current >= c.target).length;
        const overallPct = criteria.length > 0 ? Math.round((completedCount / criteria.length) * 100) : 0;
        return (
          <div
            className="fixed inset-0 z-50 flex items-end justify-center"
            style={{ background: "rgba(6,8,20,0.85)", backdropFilter: "blur(6px)" }}
            onClick={() => setDetailOffer(null)}
          >
            <div
              className="w-full max-w-lg rounded-t-3xl overflow-hidden"
              style={{
                background: "linear-gradient(180deg, rgba(4,16,34,0.99) 0%, rgba(6,8,20,0.99) 100%)",
                border: "1px solid rgba(91,140,255,0.20)",
                borderBottom: "none",
                maxHeight: "90vh",
                overflowY: "auto",
              }}
              onClick={e => e.stopPropagation()}
            >
              {/* Drag handle */}
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 rounded-full" style={{ background: "rgba(91,140,255,0.2)" }} />
              </div>

              {/* Top accent */}
              <div className="h-0.5 w-full" style={{ background: "linear-gradient(90deg, transparent, #5B8CFF, #a855f7, transparent)" }} />

              <div className="p-6 space-y-5">
                {/* Header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-4">
                    <div
                      className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl flex-shrink-0"
                      style={{ background: "rgba(91,140,255,0.10)", border: "1px solid rgba(91,140,255,0.22)" }}
                    >
                      {offer.emoji}
                    </div>
                    <div>
                      <div
                        className="font-bold text-lg leading-tight"
                        style={{
                          fontFamily: "'Sora', sans-serif",
                          background: "linear-gradient(135deg, #C2D2FF, #5B8CFF)",
                          WebkitBackgroundClip: "text",
                          WebkitTextFillColor: "transparent",
                          backgroundClip: "text",
                        }}
                      >
                        {offer.title}
                      </div>
                      {offer.subtitle && (
                        <div className="text-sm mt-0.5" style={{ color: "rgba(194,210,255,0.45)" }}>{offer.subtitle}</div>
                      )}
                    </div>
                  </div>
                  {allDone && (
                    <div
                      className="px-3 py-1.5 rounded-full text-xs font-bold flex-shrink-0"
                      style={{ background: "rgba(52,211,153,0.15)", border: "1px solid rgba(52,211,153,0.3)", color: "rgba(52,211,153,0.9)" }}
                    >
                      ✓ Qualified!
                    </div>
                  )}
                </div>

                {/* Overall progress ring summary */}
                <div
                  className="flex items-center gap-4 px-4 py-3 rounded-2xl"
                  style={{ background: "rgba(91,140,255,0.04)", border: "1px solid rgba(91,140,255,0.10)" }}
                >
                  <div className="relative w-14 h-14 flex-shrink-0">
                    <svg className="w-14 h-14 -rotate-90" viewBox="0 0 56 56">
                      <circle cx="28" cy="28" r="22" fill="none" stroke="rgba(91,140,255,0.08)" strokeWidth="5" />
                      <circle
                        cx="28" cy="28" r="22" fill="none"
                        stroke={allDone ? "rgba(52,211,153,0.8)" : TEAL}
                        strokeWidth="5"
                        strokeLinecap="round"
                        strokeDasharray={`${2 * Math.PI * 22}`}
                        strokeDashoffset={`${2 * Math.PI * 22 * (1 - overallPct / 100)}`}
                        style={{ transition: "stroke-dashoffset 0.7s ease" }}
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-xs font-black" style={{ color: allDone ? "rgba(52,211,153,0.9)" : TEAL }}>{overallPct}%</span>
                    </div>
                  </div>
                  <div>
                    <div className="font-bold text-sm" style={{ color: "rgba(194,210,255,0.85)" }}>
                      {completedCount} of {criteria.length} criteria met
                    </div>
                    <div className="text-xs mt-0.5" style={{ color: "rgba(194,210,255,0.35)" }}>
                      {allDone ? "You qualify for this offer!" : `${criteria.length - completedCount} remaining to qualify`}
                    </div>
                  </div>
                </div>

                {/* Reward */}
                {offer.reward && (
                  <div
                    className="px-4 py-4 rounded-2xl"
                    style={{
                      background: "linear-gradient(135deg, rgba(91,140,255,0.08), rgba(61,92,224,0.04))",
                      border: "1px solid rgba(91,140,255,0.18)",
                    }}
                  >
                    <div className="text-xs font-medium mb-2 tracking-wide uppercase" style={{ color: "rgba(194,210,255,0.4)" }}>🎁 Your Reward</div>
                    <div className="text-base font-bold leading-snug" style={{ color: TEAL }}>{offer.reward}</div>
                  </div>
                )}

                {/* Criteria breakdown */}
                {criteria.length > 0 && (
                  <div>
                    <div className="text-xs font-medium mb-3 tracking-wide uppercase" style={{ color: "rgba(194,210,255,0.4)" }}>Requirements</div>
                    <div className="space-y-4">
                      {(criteria as any[]).map((c: any, i: number) => {
                        const pct = Math.min(100, c.target > 0 ? (c.current / c.target) * 100 : 0);
                        const done = c.current >= c.target;
                        return (
                          <div key={i}>
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <div
                                  className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                                  style={{
                                    background: done ? "rgba(52,211,153,0.15)" : "rgba(91,140,255,0.08)",
                                    border: `1.5px solid ${done ? "rgba(52,211,153,0.5)" : "rgba(91,140,255,0.25)"}`,
                                  }}
                                >
                                  {done
                                    ? <CheckCircle size={11} style={{ color: "rgba(52,211,153,0.9)" }} />
                                    : <span className="text-xs font-bold" style={{ color: "rgba(91,140,255,0.5)" }}>{i + 1}</span>
                                  }
                                </div>
                                <span className="text-sm font-medium" style={{ color: done ? "rgba(194,210,255,0.85)" : "rgba(194,210,255,0.55)" }}>
                                  {c.label}
                                </span>
                              </div>
                              <div className="text-right">
                                <span className="text-sm font-black" style={{ color: done ? "rgba(52,211,153,0.9)" : TEAL }}>
                                  {c.fmt(c.current)}
                                </span>
                                <span className="text-xs ml-1" style={{ color: "rgba(194,210,255,0.3)" }}>/ {c.fmt(c.target)}</span>
                              </div>
                            </div>
                            <div className="w-full rounded-full h-2" style={{ background: "rgba(91,140,255,0.07)" }}>
                              <div
                                className="h-2 rounded-full transition-all duration-700"
                                style={{
                                  width: `${pct}%`,
                                  background: done
                                    ? "linear-gradient(90deg, rgba(52,211,153,0.8), rgba(52,211,153,0.5))"
                                    : "linear-gradient(90deg, #5B8CFF, #3D5CE0)",
                                  boxShadow: done ? "0 0 10px rgba(52,211,153,0.35)" : "0 0 10px rgba(91,140,255,0.35)",
                                }}
                              />
                            </div>
                            <div className="flex justify-between mt-1">
                              <span className="text-xs" style={{ color: "rgba(194,210,255,0.2)" }}>0</span>
                              <span className="text-xs" style={{ color: "rgba(194,210,255,0.2)" }}>{c.fmt(c.target)}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Countdown */}
                {countdown && (
                  <div
                    className="flex items-center justify-between px-4 py-3 rounded-xl"
                    style={{
                      background: countdown.expired ? "rgba(248,113,113,0.07)" : "rgba(91,140,255,0.06)",
                      border: `1px solid ${countdown.expired ? "rgba(248,113,113,0.2)" : "rgba(91,140,255,0.12)"}`,
                    }}
                  >
                    <div>
                      <div className="text-xs" style={{ color: "rgba(194,210,255,0.4)" }}>{countdown.expired ? "This offer has ended" : "Time remaining"}</div>
                      <div className="font-black text-base mt-0.5" style={{ color: countdown.expired ? "rgba(248,113,113,0.8)" : TEAL }}>
                        {countdown.text}
                      </div>
                    </div>
                    {!countdown.expired && (
                      <div className="text-2xl">⏳</div>
                    )}
                  </div>
                )}

                {/* Close button */}
                <button
                  onClick={() => setDetailOffer(null)}
                  className="w-full py-3.5 rounded-2xl font-bold text-sm transition-all"
                  style={{
                    background: "rgba(91,140,255,0.08)",
                    border: "1px solid rgba(91,140,255,0.18)",
                    color: "rgba(194,210,255,0.7)",
                  }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Rank Progress */}
      {rankProgress?.nextRank && (
        <div
          className="rounded-2xl overflow-hidden relative"
          style={{
            background: "linear-gradient(155deg, rgba(4,16,32,0.95) 0%, rgba(2,10,22,0.95) 100%)",
            border: "1px solid rgba(91,140,255,0.16)",
            boxShadow: "0 0 40px rgba(91,140,255,0.06)",
          }}
        >
          {/* Top accent line */}
          <div className="h-0.5 w-full" style={{ background: "linear-gradient(90deg, transparent, #5B8CFF, transparent)" }} />

          {/* Ambient glow */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ background: "radial-gradient(ellipse at top right, rgba(91,140,255,0.07) 0%, transparent 65%)" }}
          />

          <div className="relative p-5">
            {/* Header row */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div
                  className="w-8 h-8 rounded-xl flex items-center justify-center"
                  style={{ background: "rgba(91,140,255,0.12)", border: "1px solid rgba(91,140,255,0.22)" }}
                >
                  <Award size={15} style={{ color: TEAL }} />
                </div>
                <span
                  className="font-bold text-xs tracking-widest uppercase"
                  style={{ color: "rgba(194,210,255,0.55)", fontFamily: "'Sora', sans-serif" }}
                >
                  Rank Progress
                </span>
              </div>
              <Link href="/ranks">
                <span className="flex items-center gap-1 text-xs font-semibold" style={{ color: TEAL }}>
                  Details <ArrowRight size={11} />
                </span>
              </Link>
            </div>

            {/* Current → Next rank journey */}
            <div className="flex items-center gap-3 mb-4">
              {/* Current rank */}
              <div className="flex-1 rounded-xl p-3 text-center"
                style={{ background: "rgba(0,10,24,0.6)", border: "1px solid rgba(91,140,255,0.08)" }}>
                <div className="text-xs mb-1" style={{ color: "rgba(194,210,255,0.32)" }}>Current</div>
                <div className="font-bold text-sm" style={{ color: "rgba(194,210,255,0.7)" }}>
                  {rankProgress.currentRank?.name ?? "Unranked"}
                </div>
              </div>

              {/* Arrow */}
              <div className="flex flex-col items-center gap-0.5 shrink-0">
                <ArrowRight size={16} style={{ color: "rgba(91,140,255,0.4)" }} />
              </div>

              {/* Next rank */}
              <div className="flex-1 rounded-xl p-3 text-center"
                style={{
                  background: "linear-gradient(135deg, rgba(91,140,255,0.10), rgba(61,92,224,0.05))",
                  border: "1px solid rgba(91,140,255,0.22)",
                  boxShadow: "0 0 16px rgba(91,140,255,0.06)",
                }}>
                <div className="text-xs mb-1" style={{ color: "rgba(194,210,255,0.38)" }}>Next Rank</div>
                <div className="font-bold text-sm" style={{ color: TEAL }}>
                  {rankProgress.nextRank.name}
                </div>
              </div>
            </div>

            {/* Reward banner */}
            <div
              className="flex items-center gap-2.5 rounded-xl px-4 py-3 mb-4"
              style={{ background: "rgba(91,140,255,0.05)", border: "1px solid rgba(91,140,255,0.12)" }}
            >
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: "rgba(91,140,255,0.12)", border: "1px solid rgba(91,140,255,0.2)" }}
              >
                <Award size={13} style={{ color: TEAL }} />
              </div>
              <div className="min-w-0">
                <div className="text-xs" style={{ color: "rgba(194,210,255,0.38)" }}>Reward upon achieving</div>
                <div className="font-bold text-sm truncate" style={{ color: TEAL }}>
                  {rankProgress.nextRank.reward}
                </div>
              </div>
            </div>

            {/* Criteria */}

            {/* CTA */}
            <Link href="/ranks">
              <button
                className="w-full py-2.5 rounded-xl text-sm font-bold transition-all"
                style={{
                  background: "linear-gradient(135deg, #5B8CFF, #3D5CE0)",
                  color: "#060814",
                  letterSpacing: "0.03em",
                  boxShadow: "0 0 20px rgba(91,140,255,0.25)",
                }}
              >
                View Full Rank Journey
              </button>
            </Link>
          </div>
        </div>
      )}

    </div>
  );
}
