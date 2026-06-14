import { Gauge, TrendingUp, Lock, CheckCircle2 } from "lucide-react";

const TEAL = "#5B8CFF";
const GREEN = "rgb(52,211,153)";
const AMBER = "rgb(251,191,36)";

export interface EarningsCap {
  enabled: boolean;
  multiplier: number;
  personalInvested: number;
  directVolume: number;
  earned: number;
  cap: number | null;
  remaining: number | null;
  reached: boolean;
}

const fmt = (n: number) =>
  n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function DashboardCapBar({ cap }: { cap?: EarningsCap | null }) {
  // Only meaningful once the user has a personal investment and the cap is enabled.
  if (!cap || !cap.enabled || cap.cap == null || cap.personalInvested <= 0) return null;

  const pct = cap.cap > 0 ? Math.min(100, Math.max(0, (cap.earned / cap.cap) * 100)) : 0;
  const reached = cap.reached || pct >= 100;
  const isBoosted = cap.directVolume > cap.personalInvested;
  const barColor = reached ? AMBER : GREEN;

  // Progress of direct-team volume toward the user's own investment (unlocks the boosted tier).
  const boostPct = cap.personalInvested > 0
    ? Math.min(100, Math.max(0, (cap.directVolume / cap.personalInvested) * 100))
    : 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-sm tracking-wide" style={{ color: "rgba(194,210,255,0.8)" }}>
          Earnings Cap
        </h2>
      </div>

      <div className="rounded-2xl p-5" style={{
        background: "rgba(10,14,30,0.65)",
        backdropFilter: "blur(14px)",
        border: "1px solid rgba(91,140,255,0.12)",
      }}>
        {/* header: icon + eligible multiplier badge */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-2xl flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, rgba(91,140,255,0.18), rgba(91,140,255,0.06))", border: "1px solid rgba(91,140,255,0.28)" }}
            >
              <Gauge size={18} style={{ color: TEAL }} />
            </div>
            <div>
              <div className="font-bold tracking-wide" style={{ color: "rgba(200,240,255,0.92)", fontFamily: "'Sora', sans-serif", fontSize: "0.85rem" }}>
                Total Earning Limit
              </div>
              <div className="text-xs mt-0.5" style={{ color: "rgba(194,210,255,0.4)" }}>
                ROI + level income ceiling
              </div>
            </div>
          </div>
          <div
            className="px-3 py-1.5 rounded-xl font-black text-lg"
            style={{
              fontFamily: "'Sora', sans-serif",
              color: isBoosted ? GREEN : TEAL,
              background: isBoosted ? "rgba(52,211,153,0.10)" : "rgba(91,140,255,0.10)",
              border: `1px solid ${isBoosted ? "rgba(52,211,153,0.3)" : "rgba(91,140,255,0.3)"}`,
            }}
            title={isBoosted ? "Boosted cap unlocked" : "Standard cap"}
          >
            {cap.multiplier}x
          </div>
        </div>

        {/* progress bar: earned / cap */}
        <div className="mb-1.5 flex items-end justify-between">
          <div>
            <span className="text-xl font-black" style={{ color: reached ? AMBER : "rgba(200,240,255,0.92)", fontFamily: "'Sora', sans-serif" }}>
              ${fmt(cap.earned)}
            </span>
            <span className="text-xs ml-1" style={{ color: "rgba(194,210,255,0.4)" }}>
              / ${fmt(cap.cap)}
            </span>
          </div>
          <span className="text-xs font-semibold" style={{ color: reached ? AMBER : GREEN }}>
            {pct.toFixed(1)}%
          </span>
        </div>
        <div className="h-2.5 rounded-full overflow-hidden" style={{ background: "rgba(91,140,255,0.1)" }}>
          <div style={{ width: `${pct}%`, height: "100%", background: barColor, transition: "width 0.3s", boxShadow: `0 0 10px ${barColor}` }} />
        </div>

        {/* remaining / reached footer */}
        <div className="mt-2.5 flex items-center gap-1.5 text-xs">
          {reached ? (
            <>
              <CheckCircle2 size={12} style={{ color: AMBER }} />
              <span style={{ color: AMBER }}>Cap reached — re-invest to keep earning.</span>
            </>
          ) : (
            <>
              <TrendingUp size={12} style={{ color: GREEN }} />
              <span style={{ color: "rgba(194,210,255,0.55)" }}>
                <span style={{ color: GREEN, fontWeight: 600 }}>${fmt(cap.remaining ?? 0)}</span> left to earn (at {cap.multiplier}× your ${fmt(cap.personalInvested)} invested)
              </span>
            </>
          )}
        </div>

        {/* unlock-3x hint when not yet boosted */}
        {!isBoosted && (
          <div className="mt-3 rounded-xl p-3" style={{ background: "rgba(52,211,153,0.05)", border: "1px solid rgba(52,211,153,0.15)" }}>
            <div className="flex items-center gap-1.5 text-xs mb-2" style={{ color: "rgba(194,210,255,0.6)" }}>
              <Lock size={12} style={{ color: GREEN }} />
              Unlock a higher cap: grow your direct team's investment past your own
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(52,211,153,0.12)" }}>
              <div style={{ width: `${boostPct}%`, height: "100%", background: GREEN, transition: "width 0.3s" }} />
            </div>
            <div className="mt-1.5 flex justify-between text-xs" style={{ color: "rgba(194,210,255,0.4)" }}>
              <span>Team: ${fmt(cap.directVolume)}</span>
              <span>You: ${fmt(cap.personalInvested)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
