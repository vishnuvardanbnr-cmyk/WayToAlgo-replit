import { useGetTeam, useGetTeamStats, useGetReferralLink } from "@workspace/api-client-react";
import { Users, ChevronDown, ChevronRight, Copy, CheckCircle, Link as LinkIcon, Share2 } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

const TEAL = "#00FF94";
const GLASS = { background: "rgba(10,14,30,0.65)", backdropFilter: "blur(14px)", border: "1px solid rgba(0,255,148,0.10)" } as const;

const levelCommissions: Record<number, string> = {
  1: "20%", 2: "10%", 3: "10%", 4: "4%", 5: "4%", 6: "4%", 7: "4%", 8: "4%", 9: "4%", 10: "4%",
};
const levelUnlockRequirements: Record<number, number> = {
  1: 0, 2: 1000, 3: 3000, 4: 10000, 5: 10000, 6: 10000, 7: 10000, 8: 10000, 9: 10000, 10: 10000,
};

export default function Team({ user }: { user: any }) {
  const { data: team, isLoading: loadingTeam } = useGetTeam();
  const { data: stats, isLoading: loadingStats } = useGetTeamStats();
  const { data: referral } = useGetReferralLink();
  const { toast } = useToast();
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [expanded, setExpanded] = useState<number[]>([1]);

  const copyLink = async () => {
    if (!referral?.referralLink) return;
    await navigator.clipboard.writeText(referral.referralLink);
    setCopiedLink(true);
    toast({ title: "Copied!", description: "Referral link copied to clipboard" });
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const copyCode = async () => {
    if (!referral?.referralCode) return;
    await navigator.clipboard.writeText(referral.referralCode);
    setCopiedCode(true);
    toast({ title: "Copied!", description: "Referral code copied" });
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const shareWhatsApp = () => {
    if (!referral?.referralLink) return;
    const msg = encodeURIComponent(
      `🚀 Join WaytoAlgo and start earning daily returns!\n\nUse my referral link to sign up:\n${referral.referralLink}\n\nMy referral code: ${referral.referralCode}`
    );
    window.open(`https://wa.me/?text=${msg}`, "_blank");
  };

  const shareNative = async () => {
    if (!referral?.referralLink) return;
    if (navigator.share) {
      await navigator.share({
        title: "Join WaytoAlgo",
        text: `Use my referral code ${referral.referralCode} to sign up and earn daily returns!`,
        url: referral.referralLink,
      });
    } else {
      await copyLink();
    }
  };

  const toggleLevel = (level: number) =>
    setExpanded(prev => prev.includes(level) ? prev.filter(l => l !== level) : [...prev, level]);

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
        My Team
      </h1>

      {/* Referral Link Card */}
      {referral && (
        <div
          className="rounded-2xl overflow-hidden relative"
          style={{
            background: "linear-gradient(155deg, rgba(4,16,32,0.97) 0%, rgba(2,10,22,0.97) 100%)",
            border: "1px solid rgba(0,255,148,0.18)",
            boxShadow: "0 0 40px rgba(0,255,148,0.07)",
          }}
        >
          <div className="h-0.5 w-full" style={{ background: "linear-gradient(90deg, transparent, #00FF94, transparent)" }} />
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ background: "radial-gradient(ellipse at top right, rgba(0,255,148,0.08) 0%, transparent 60%)" }}
          />
          <div className="relative p-5 space-y-4">
            {/* Header */}
            <div className="flex items-center gap-2.5">
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center"
                style={{ background: "rgba(0,255,148,0.12)", border: "1px solid rgba(0,255,148,0.22)" }}
              >
                <LinkIcon size={14} style={{ color: TEAL }} />
              </div>
              <span
                className="font-bold text-xs tracking-widest uppercase"
                style={{ color: "rgba(176,255,224,0.55)", fontFamily: "'Sora', sans-serif" }}
              >
                Your Referral
              </span>
            </div>

            {/* User ID / Referral ID hero */}
            <div
              className="rounded-2xl py-4 px-4 text-center"
              style={{
                background: "linear-gradient(135deg, rgba(0,255,148,0.08), rgba(0,204,119,0.03))",
                border: "1px solid rgba(0,255,148,0.18)",
              }}
            >
              <div className="text-xs uppercase tracking-widest mb-1.5" style={{ color: "rgba(176,255,224,0.38)" }}>
                Your User ID (Ref ID)
              </div>
              <div
                className="font-black text-4xl"
                style={{ color: TEAL, fontFamily: "'Sora', sans-serif", textShadow: "0 0 28px rgba(0,255,148,0.45)" }}
              >
                {referral.referralCode}
              </div>
              <button
                onClick={copyCode}
                className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg mt-3 transition-all"
                style={copiedCode
                  ? { background: "rgba(52,211,153,0.12)", border: "1px solid rgba(52,211,153,0.25)", color: "#34d399" }
                  : { background: "rgba(0,255,148,0.08)", border: "1px solid rgba(0,255,148,0.18)", color: TEAL }
                }
              >
                {copiedCode ? <><CheckCircle size={11} /> Copied</> : <><Copy size={11} /> Copy ID</>}
              </button>
            </div>

            {/* Referral Link */}
            <div>
              <div className="text-xs mb-1.5" style={{ color: "rgba(176,255,224,0.38)" }}>Referral Link</div>
              <div
                className="flex items-center gap-2 rounded-xl px-4 py-3"
                style={{ background: "rgba(0,10,24,0.7)", border: "1px solid rgba(0,255,148,0.14)" }}
              >
                <span
                  className="flex-1 text-xs font-mono truncate"
                  style={{ color: "rgba(176,255,224,0.5)" }}
                >
                  {referral.referralLink}
                </span>
                <button
                  onClick={copyLink}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-all shrink-0"
                  style={copiedLink
                    ? { background: "rgba(52,211,153,0.12)", border: "1px solid rgba(52,211,153,0.25)", color: "#34d399" }
                    : { background: "rgba(0,255,148,0.08)", border: "1px solid rgba(0,255,148,0.18)", color: TEAL }
                  }
                >
                  {copiedLink ? <><CheckCircle size={11} /> Copied</> : <><Copy size={11} /> Copy</>}
                </button>
              </div>
            </div>

            {/* Share buttons */}
            <div className="flex gap-2.5">
              {/* WhatsApp */}
              <button
                onClick={shareWhatsApp}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-sm transition-all active:scale-[0.97]"
                style={{
                  background: "linear-gradient(135deg, #25D366, #1da851)",
                  color: "#fff",
                  boxShadow: "0 0 18px rgba(37,211,102,0.28)",
                }}
              >
                {/* WhatsApp SVG icon */}
                <svg width="16" height="16" viewBox="0 0 32 32" fill="currentColor">
                  <path d="M16 .5C7.44.5.5 7.44.5 16c0 2.82.74 5.47 2.03 7.77L.5 31.5l8.01-2.1A15.45 15.45 0 0016 31.5C24.56 31.5 31.5 24.56 31.5 16S24.56.5 16 .5zm0 28.3a13.2 13.2 0 01-6.73-1.84l-.48-.29-4.76 1.25 1.27-4.64-.32-.5A13.23 13.23 0 1116 28.8zm7.27-9.9c-.4-.2-2.35-1.16-2.71-1.29-.37-.13-.63-.2-.9.2-.26.4-1.03 1.29-1.27 1.56-.23.26-.47.3-.87.1-.4-.2-1.68-.62-3.2-1.98-1.18-1.05-1.98-2.35-2.21-2.75-.23-.4-.02-.62.17-.82.18-.18.4-.47.6-.7.2-.23.26-.4.4-.66.13-.26.06-.5-.03-.7-.1-.2-.9-2.16-1.23-2.96-.32-.78-.65-.67-.9-.68l-.76-.01c-.27 0-.7.1-1.06.5s-1.4 1.37-1.4 3.33 1.43 3.86 1.63 4.13c.2.26 2.82 4.3 6.83 6.03.96.41 1.7.66 2.28.84.96.3 1.83.26 2.52.16.77-.12 2.35-.96 2.68-1.88.33-.93.33-1.72.23-1.89-.1-.16-.36-.26-.76-.46z"/>
                </svg>
                Share on WhatsApp
              </button>

              {/* Native share / copy fallback */}
              <button
                onClick={shareNative}
                className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl font-semibold text-sm transition-all active:scale-[0.97]"
                style={{
                  background: "rgba(0,255,148,0.08)",
                  border: "1px solid rgba(0,255,148,0.2)",
                  color: TEAL,
                }}
              >
                <Share2 size={14} />
                Share
              </button>
            </div>

            {/* Hint */}
            <p className="text-xs" style={{ color: "rgba(176,255,224,0.28)" }}>
              Share your link or code to earn referral commissions on every investment your team makes.
            </p>
          </div>
        </div>
      )}

      {/* Stats grid */}
      {loadingStats ? (
        <div className="grid grid-cols-2 gap-3">
          {[1,2,3,4].map(i => <div key={i} className="rounded-xl h-20 animate-pulse" style={{ background: "rgba(0,255,148,0.04)", border: "1px solid rgba(0,255,148,0.08)" }} />)}
        </div>
      ) : stats && (
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "Total Members",    value: stats.totalMembers },
            { label: "Direct Referrals", value: stats.directReferrals },
            { label: "Active Members",   value: stats.activeMembers },
            { label: "Levels Unlocked",  value: `${stats.levelsUnlocked} / 10` },
          ].map(item => (
            <div key={item.label} className="rounded-xl p-4" style={GLASS}>
              <div className="text-xl font-bold" style={{ color: TEAL }}>{item.value}</div>
              <div className="text-xs mt-0.5" style={{ color: "rgba(176,255,224,0.4)" }}>{item.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Team business hero */}
      {stats && (
        <div
          className="rounded-2xl p-5 relative overflow-hidden"
          style={{
            background: "linear-gradient(135deg, rgba(0,255,148,0.10), rgba(0,204,119,0.05))",
            border: "1px solid rgba(0,255,148,0.22)",
          }}
        >
          <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at top right, rgba(0,255,148,0.14) 0%, transparent 60%)" }} />
          <div className="relative">
            <div className="text-xs tracking-widest uppercase mb-1" style={{ color: "rgba(176,255,224,0.45)" }}>Total Team Business</div>
            <div
              className="text-3xl font-black"
              style={{
                fontFamily: "'Sora', sans-serif",
                background: "linear-gradient(135deg, #B0FFE0, #00FF94)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              ${stats.totalTeamBusiness.toFixed(2)}
            </div>
            <div className="mt-3">
              <div className="flex justify-between text-xs mb-1.5" style={{ color: "rgba(176,255,224,0.4)" }}>
                <span>Level {stats.levelsUnlocked} → Level {Math.min(stats.levelsUnlocked + 1, 10)}</span>
                {(stats.nextLevelRequirement ?? 0) > 0 && (
                  <span>${stats.totalTeamBusiness.toFixed(0)} / ${(stats.nextLevelRequirement ?? 0).toLocaleString()}</span>
                )}
              </div>
              <div className="w-full rounded-full h-2" style={{ background: "rgba(0,255,148,0.08)" }}>
                <div
                  className="h-2 rounded-full uranus-progress"
                  style={{ width: `${Math.min(100, stats.nextLevelProgress ?? 0)}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      )}


      {/* Team members by level */}
      {loadingTeam ? (
        <div className="space-y-3">
          {[1,2].map(i => <div key={i} className="rounded-xl h-16 animate-pulse" style={{ background: "rgba(0,255,148,0.04)", border: "1px solid rgba(0,255,148,0.08)" }} />)}
        </div>
      ) : (
        <div>
          <h2 className="font-semibold text-sm mb-3" style={{ color: "rgba(176,255,224,0.75)" }}>Team Members</h2>
          {!team?.levels?.length ? (
            <div className="rounded-xl p-8 text-center" style={GLASS}>
              <Users size={32} className="mx-auto mb-2" style={{ color: "rgba(176,255,224,0.2)" }} />
              <p className="text-sm" style={{ color: "rgba(176,255,224,0.35)" }}>No team members yet</p>
              <p className="text-xs mt-1" style={{ color: "rgba(176,255,224,0.25)" }}>Share your referral link to build your team</p>
            </div>
          ) : (
            <div className="space-y-2">
              {team.levels.map(({ level, members, totalBusiness }) => (
                <div
                  key={level}
                  className="rounded-xl overflow-hidden"
                  style={GLASS}
                >
                  <button
                    data-testid={`button-level-${level}`}
                    onClick={() => toggleLevel(level)}
                    className="w-full flex items-center justify-between px-4 py-3.5 transition-all"
                    style={{ background: "transparent" }}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold"
                        style={{
                          background: "rgba(0,255,148,0.12)",
                          border: "1px solid rgba(0,255,148,0.2)",
                          color: TEAL,
                        }}
                      >
                        L{level}
                      </div>
                      <div className="text-left">
                        <div className="text-sm font-semibold" style={{ color: "rgba(176,255,224,0.8)" }}>
                          {members.length} member{members.length !== 1 ? "s" : ""}
                        </div>
                        <div className="text-xs" style={{ color: "rgba(176,255,224,0.35)" }}>
                          Business: ${totalBusiness.toFixed(2)}
                        </div>
                      </div>
                    </div>
                    {expanded.includes(level)
                      ? <ChevronDown size={16} style={{ color: "rgba(176,255,224,0.3)" }} />
                      : <ChevronRight size={16} style={{ color: "rgba(176,255,224,0.3)" }} />
                    }
                  </button>
                  {expanded.includes(level) && members.length > 0 && (
                    <div style={{ borderTop: "1px solid rgba(0,255,148,0.07)" }}>
                      {members.map((member, idx) => (
                        <div
                          key={member.id}
                          data-testid={`row-member-${member.id}`}
                          className="px-4 py-3 flex items-center justify-between"
                          style={{ borderTop: idx > 0 ? "1px solid rgba(0,255,148,0.05)" : "none" }}
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                              style={{
                                background: "rgba(0,255,148,0.08)",
                                border: "1px solid rgba(0,255,148,0.15)",
                                color: TEAL,
                              }}
                            >
                              {member.name.charAt(0)}
                            </div>
                            <div>
                              <div className="text-sm font-medium" style={{ color: "rgba(176,255,224,0.8)" }}>{member.name}</div>
                              <div className="text-xs" style={{ color: "rgba(176,255,224,0.35)" }}>
                                {member.directReferrals} referrals · {member.isActive ? "Active" : "Inactive"}
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-semibold" style={{ color: "rgba(176,255,224,0.75)" }}>
                              ${member.totalInvested.toFixed(0)}
                            </div>
                            <div className="text-xs" style={{ color: "rgba(176,255,224,0.3)" }}>invested</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
