import { useListRanks, useGetMyRankProgress } from "@workspace/api-client-react";
import { Award, Gift, CheckCircle, TrendingUp, Users, Calendar } from "lucide-react";

const TEAL = "#00FF94";
const GREEN = "#34d399";

const rankGradients = [
  { from: "#b45309", to: "#d97706" },
  { from: "#6b7280", to: "#9ca3af" },
  { from: "#d97706", to: "#fbbf24" },
  { from: "#7c3aed", to: "#a78bfa" },
  { from: "#0891b2", to: "#00FF94" },
];

function fmtUsd(n: number) {
  const v = Number(n) || 0;
  return v % 1 === 0 ? `$${v.toLocaleString("en-US")}` : `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function ProgressBar({ label, current, required, icon }: { label: string; current: number; required: number; icon?: React.ReactNode }) {
  const pct = required > 0 ? Math.min(100, (current / required) * 100) : 100;
  const met = current + 1e-9 >= required;
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs flex items-center gap-1.5" style={{ color: "rgba(176,255,224,0.6)" }}>
          {icon}{label}
        </span>
        <span className="text-xs font-semibold" style={{ color: met ? GREEN : "rgba(176,255,224,0.85)" }}>
          {fmtUsd(current)} <span style={{ color: "rgba(176,255,224,0.35)" }}>/ {fmtUsd(required)}</span>
          {met && <CheckCircle size={11} className="inline ml-1 -mt-0.5" style={{ color: GREEN }} />}
        </span>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ background: "rgba(0,10,24,0.6)" }}>
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${pct}%`,
            background: met ? `linear-gradient(90deg, ${GREEN}, #10b981)` : `linear-gradient(90deg, ${TEAL}, #00CC77)`,
          }}
        />
      </div>
    </div>
  );
}

export default function Ranks({ user: _user }: { user: any }) {
  const { data: ranks, isLoading: loadingRanks } = useListRanks();
  const { data: progress } = useGetMyRankProgress() as { data: any };

  const currentRankNumber = progress?.currentRank?.rankNumber ?? 0;
  const target = progress?.nextRank ?? progress?.currentRank;
  const prog = progress?.progress;
  const schedule = progress?.schedule;

  const legLabels: Record<string, string> = { top: "Top Leg (cap)", second: "Second Leg (cap)", rest: "Other Legs (cap)" };

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
        Ranks & Rewards
      </h1>

      {/* Current Status hero */}
      <div
        className="rounded-2xl p-5 relative overflow-hidden"
        style={{
          background: "linear-gradient(135deg, rgba(0,255,148,0.12), rgba(0,180,100,0.06))",
          border: "1px solid rgba(0,255,148,0.28)",
        }}
      >
        <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at top right, rgba(0,255,148,0.16) 0%, transparent 60%)" }} />
        <div className="relative">
          <div className="text-xs tracking-widest uppercase mb-1" style={{ color: "rgba(176,255,224,0.45)" }}>Your Current Rank</div>
          <div
            className="text-2xl font-black mb-1"
            data-testid="text-current-rank"
            style={{ fontFamily: "'Sora', sans-serif", color: "rgba(176,255,224,0.92)" }}
          >
            {progress?.currentRank?.name ?? "Unranked"}
          </div>
          {progress?.nextRank && (
            <div className="text-sm" style={{ color: "rgba(176,255,224,0.45)" }}>
              Next: <span style={{ color: "rgba(176,255,224,0.85)", fontWeight: 600 }}>{progress.nextRank.name}</span>
              {" "}— <span style={{ color: TEAL }}>{progress.nextRank.reward}</span>
            </div>
          )}
        </div>
      </div>

      {/* Active reward schedule */}
      {schedule && (
        <div className="rounded-2xl p-5" style={{ background: "rgba(52,211,153,0.05)", border: "1px solid rgba(52,211,153,0.22)" }}>
          <div className="flex items-center gap-2 mb-3">
            <Gift size={16} style={{ color: GREEN }} />
            <span className="text-sm font-bold" style={{ color: "rgba(52,211,153,0.95)" }}>Reward Schedule</span>
            {schedule.status === "completed" && (
              <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: "rgba(52,211,153,0.12)", border: "1px solid rgba(52,211,153,0.3)", color: GREEN }}>Completed</span>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2 mb-3">
            {[
              { label: "Per Month", value: fmtUsd(schedule.monthlyAmount) },
              { label: "Paid", value: `${schedule.monthsPaid} / ${schedule.totalMonths}` },
              { label: "Total", value: fmtUsd(schedule.monthlyAmount * schedule.totalMonths) },
            ].map(item => (
              <div key={item.label} className="rounded-lg p-2.5 text-center" style={{ background: "rgba(0,10,24,0.45)", border: "1px solid rgba(52,211,153,0.1)" }}>
                <div className="font-bold text-sm" style={{ color: GREEN }}>{item.value}</div>
                <div className="text-[10px]" style={{ color: "rgba(176,255,224,0.4)" }}>{item.label}</div>
              </div>
            ))}
          </div>
          <div className="h-2 rounded-full overflow-hidden mb-2" style={{ background: "rgba(0,10,24,0.6)" }}>
            <div className="h-full rounded-full" style={{ width: `${schedule.totalMonths > 0 ? Math.min(100, (schedule.monthsPaid / schedule.totalMonths) * 100) : 0}%`, background: `linear-gradient(90deg, ${GREEN}, #10b981)` }} />
          </div>
          {schedule.status === "active" && schedule.nextPayoutAt && (
            <div className="text-xs flex items-center gap-1.5" style={{ color: "rgba(176,255,224,0.5)" }}>
              <Calendar size={12} /> Next payout: <strong style={{ color: "rgba(176,255,224,0.8)" }}>{new Date(schedule.nextPayoutAt).toLocaleDateString()}</strong>
            </div>
          )}
          <p className="text-[11px] mt-2" style={{ color: "rgba(176,255,224,0.4)" }}>Rewards are credited to your Withdraw Wallet each month.</p>
        </div>
      )}

      {/* Progress toward next/target rank */}
      {target && prog && (
        <div className="rounded-2xl p-5 space-y-4" style={{ background: "rgba(10,14,30,0.65)", backdropFilter: "blur(14px)", border: "1px solid rgba(0,255,148,0.12)" }}>
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold" style={{ color: "rgba(176,255,224,0.9)" }}>
              {progress?.nextRank ? `Progress to ${target.name}` : `${target.name} Requirements`}
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "rgba(0,255,148,0.08)", border: "1px solid rgba(0,255,148,0.18)", color: TEAL }}>
              Rank #{target.rankNumber}
            </span>
          </div>
          <div className="space-y-3.5">
            <ProgressBar label="Self Investment" current={prog.self?.current ?? 0} required={prog.self?.required ?? 0} icon={<TrendingUp size={12} />} />
            <ProgressBar label="Direct Business" current={prog.direct?.current ?? 0} required={prog.direct?.required ?? 0} icon={<Users size={12} />} />
            {(prog.legs ?? []).map((leg: any) => (
              <ProgressBar key={leg.band} label={legLabels[leg.band] ?? leg.band} current={leg.current ?? 0} required={leg.required ?? 0} />
            ))}
          </div>
          <p className="text-[11px]" style={{ color: "rgba(176,255,224,0.35)" }}>
            Team business uses balanced legs: top {target.legTopPct}%, second {target.legSecondPct}%, other legs {target.legRestPct}% of the requirement.
          </p>
        </div>
      )}

      {/* All rank cards */}
      {loadingRanks ? (
        <div className="space-y-3">
          {[1,2,3].map(i => (
            <div key={i} className="rounded-xl h-28 animate-pulse" style={{ background: "rgba(0,255,148,0.04)", border: "1px solid rgba(0,255,148,0.08)" }} />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {ranks?.map((rank: any, idx: number) => {
            const isAchieved = rank.rankNumber <= currentRankNumber;
            const isCurrent = rank.rankNumber === currentRankNumber + 1;
            const grad = rankGradients[idx] || rankGradients[0];
            return (
              <div
                key={rank.id}
                data-testid={`card-rank-${rank.rankNumber}`}
                className="rounded-2xl p-5 transition-all"
                style={{
                  background: isCurrent
                    ? "linear-gradient(135deg, rgba(0,255,148,0.10), rgba(0,204,119,0.05))"
                    : "rgba(10,14,30,0.65)",
                  backdropFilter: "blur(14px)",
                  border: isCurrent
                    ? "1px solid rgba(0,255,148,0.35)"
                    : isAchieved
                    ? "1px solid rgba(52,211,153,0.25)"
                    : "1px solid rgba(0,255,148,0.08)",
                  boxShadow: isCurrent ? "0 0 24px rgba(0,255,148,0.10)" : "none",
                }}
              >
                <div className="flex items-start gap-4">
                  <div
                    className="w-12 h-12 rounded-2xl flex items-center justify-center text-white font-bold text-lg shrink-0"
                    style={{
                      background: `linear-gradient(135deg, ${grad.from}, ${grad.to})`,
                      boxShadow: `0 0 16px ${grad.to}40`,
                    }}
                  >
                    {rank.rankNumber}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold" style={{ color: "rgba(176,255,224,0.9)" }}>{rank.name}</span>
                      {isAchieved && <CheckCircle size={14} style={{ color: GREEN }} />}
                      {isCurrent && (
                        <span
                          className="text-xs px-2 py-0.5 rounded-full font-semibold"
                          style={{ background: "rgba(0,255,148,0.10)", border: "1px solid rgba(0,255,148,0.2)", color: TEAL }}
                        >
                          Next Goal
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-3 gap-y-0.5 text-xs mt-1.5" style={{ color: "rgba(176,255,224,0.45)" }}>
                      <span>Self ≥ {fmtUsd(rank.selfInvestmentMin)}</span>
                      <span>Direct ≥ {fmtUsd(rank.directBusinessMin)}</span>
                      <span>Team ≥ {fmtUsd(rank.teamBusinessMin)}</span>
                    </div>
                    <div
                      className="mt-2 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold"
                      style={{ background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.18)", color: GREEN }}
                    >
                      <Gift size={11} /> {fmtUsd(rank.rewardMonthlyAmount)}/mo × {rank.rewardMonths} mo
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
