import { Link } from "wouter";
import SpaceBackground from "@/components/SpaceBackground";
import {
  TrendingUp, Building2, BarChart2, Coins, Shield, Users, Zap, Star,
  ArrowRight, CheckCircle, Flame, ArrowUpRight, Lock,
} from "lucide-react";

/* ─── Feature card ──────────────────────────────────────────── */
function FeatureCard({
  icon: Icon, title, desc, color,
}: { icon: any; title: string; desc: string; color: string }) {
  return (
    <div
      className="rounded-2xl p-5 flex flex-col gap-3 transition-all hover:scale-[1.02]"
      style={{
        background: "rgba(10,14,30,0.65)",
        backdropFilter: "blur(14px)",
        border: `1px solid ${color}22`,
        boxShadow: `0 4px 24px rgba(0,0,0,0.35), 0 0 40px ${color}08`,
      }}
    >
      <div
        className="w-11 h-11 rounded-xl flex items-center justify-center"
        style={{ background: `${color}15`, border: `1px solid ${color}30` }}
      >
        <Icon size={20} style={{ color }} />
      </div>
      <div>
        <div className="font-bold text-sm mb-1" style={{ color: "rgba(200,240,255,0.90)" }}>{title}</div>
        <div className="text-xs leading-relaxed" style={{ color: "rgba(194,210,255,0.45)" }}>{desc}</div>
      </div>
    </div>
  );
}

/* ─── Step card ─────────────────────────────────────────────── */
function Step({ n, title, desc }: { n: number; title: string; desc: string }) {
  return (
    <div className="flex gap-4">
      <div className="shrink-0 flex flex-col items-center">
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-black"
          style={{
            background: "linear-gradient(135deg, #5B8CFF, #3D5CE0)",
            color: "#060814",
            fontFamily: "'Sora', sans-serif",
            boxShadow: "0 0 20px rgba(91,140,255,0.35)",
          }}
        >
          {n}
        </div>
        {n < 3 && <div className="w-px flex-1 mt-2" style={{ background: "rgba(91,140,255,0.18)", minHeight: 32 }} />}
      </div>
      <div className="pb-8">
        <div className="font-bold text-sm mb-1" style={{ color: "rgba(200,240,255,0.90)" }}>{title}</div>
        <div className="text-xs leading-relaxed" style={{ color: "rgba(194,210,255,0.45)" }}>{desc}</div>
      </div>
    </div>
  );
}

/* ─── Main ──────────────────────────────────────────────────── */
export default function Landing() {
  return (
    <div className="min-h-screen relative overflow-x-hidden" style={{ background: "#060814" }}>
      <SpaceBackground />

      {/* ── Nav bar ───────────────────────────────────────────── */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-5 max-w-6xl mx-auto">
        <div
          className="text-lg font-black tracking-wider"
          style={{
            fontFamily: "'Sora', sans-serif",
            background: "linear-gradient(135deg, #C2D2FF, #5B8CFF, #C2D2FF)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}
        >
          WaytoAlgo
        </div>
        <div className="flex items-center gap-3">
          <Link href="/login">
            <button
              className="px-4 py-2 rounded-xl text-sm font-semibold transition-all hover:brightness-125"
              style={{ color: "rgba(194,210,255,0.7)", border: "1px solid rgba(91,140,255,0.18)", background: "rgba(91,140,255,0.05)" }}
            >
              Sign In
            </button>
          </Link>
          <Link href="/register">
            <button
              className="px-4 py-2 rounded-xl text-sm font-bold transition-all hover:brightness-110"
              style={{ background: "linear-gradient(135deg, #5B8CFF, #3D5CE0)", color: "#060814" }}
            >
              Get Started
            </button>
          </Link>
        </div>
      </nav>

      {/* ── Hero ──────────────────────────────────────────────── */}
      <section className="relative z-10 px-4 pt-12 pb-20 text-center max-w-4xl mx-auto">

        {/* Badge */}
        <div className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 mb-8"
          style={{
            background: "rgba(91,140,255,0.08)",
            border: "1px solid rgba(91,140,255,0.25)",
          }}
        >
          <Star size={12} style={{ color: "#5B8CFF" }} fill="#5B8CFF" />
          <span className="text-xs font-semibold tracking-wide" style={{ color: "#5B8CFF" }}>
            Now Live — Automated Strategies Open to Everyone
          </span>
          <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "#5B8CFF" }} />
        </div>

        {/* Headline */}
        <h1 className="text-4xl sm:text-6xl font-black leading-tight mb-6" style={{ fontFamily: "'Sora', sans-serif" }}>
          <span style={{ color: "rgba(200,240,255,0.92)" }}>Put Your Capital</span>
          <br />
          <span style={{
            background: "linear-gradient(135deg, #C2D2FF 0%, #5B8CFF 40%, #C2D2FF 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
            filter: "drop-shadow(0 0 30px rgba(91,140,255,0.35))",
          }}>
            on Autopilot
          </span>
        </h1>

        {/* Subtext */}
        <p className="text-base sm:text-lg max-w-2xl mx-auto mb-10 leading-relaxed" style={{ color: "rgba(194,210,255,0.55)" }}>
          WaytoAlgo runs data-driven, risk-managed trading strategies across global markets — so your portfolio keeps working every trading day.
          Earn up to <strong style={{ color: "#5B8CFF" }}>0.8% in daily returns</strong>, track every payout in real time, and withdraw whenever you choose.
        </p>

        {/* CTA buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link href="/register">
            <button
              className="flex items-center justify-center gap-2 px-8 py-3.5 rounded-xl font-bold text-base transition-all hover:brightness-110 hover:scale-[1.02] w-full sm:w-auto"
              style={{
                background: "linear-gradient(135deg, #5B8CFF, #3D5CE0)",
                color: "#060814",
                boxShadow: "0 0 30px rgba(91,140,255,0.30), 0 4px 16px rgba(0,0,0,0.4)",
              }}
            >
              Start Investing Now
              <ArrowRight size={16} />
            </button>
          </Link>
          <Link href="/login">
            <button
              data-testid="button-login-hero"
              className="px-8 py-3.5 rounded-xl font-semibold text-base transition-all hover:brightness-125 w-full sm:w-auto"
              style={{
                background: "rgba(91,140,255,0.06)",
                border: "1px solid rgba(91,140,255,0.22)",
                color: "rgba(194,210,255,0.80)",
              }}
            >
              Sign In
            </button>
          </Link>
        </div>
      </section>

      {/* ── Markets ───────────────────────────────────────────── */}
      <section className="relative z-10 px-4 pb-20 max-w-6xl mx-auto">
        <div className="text-center mb-10">
          <div className="text-xs font-semibold tracking-widest uppercase mb-2" style={{ color: "rgba(91,140,255,0.5)" }}>
            How We Generate Returns
          </div>
          <h2 className="text-2xl sm:text-3xl font-black" style={{ fontFamily: "'Sora', sans-serif", color: "rgba(200,240,255,0.90)" }}>
            Strategies Across Four Markets
          </h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <FeatureCard icon={Building2} title="Real Estate" desc="Income-generating property positions selected for stable, long-horizon yield." color="#5B8CFF" />
          <FeatureCard icon={BarChart2} title="Stocks" desc="Data-driven equity allocations rebalanced to capture momentum and limit drawdown." color="#C2D2FF" />
          <FeatureCard icon={TrendingUp} title="Forex" desc="Round-the-clock currency strategies governed by strict, rules-based risk controls." color="#34d399" />
          <FeatureCard icon={Coins} title="Crypto" desc="Systematic digital-asset trading that turns volatility into disciplined entries and exits." color="#b87fff" />
        </div>
      </section>

      {/* ── Native Token ──────────────────────────────────────── */}
      <section className="relative z-10 px-4 pb-20 max-w-6xl mx-auto">
        <div className="text-center mb-10">
          <div className="text-xs font-semibold tracking-widest uppercase mb-2" style={{ color: "rgba(91,140,255,0.5)" }}>
            Native Token
          </div>
          <h2 className="text-2xl sm:text-3xl font-black" style={{ fontFamily: "'Sora', sans-serif", color: "rgba(200,240,255,0.90)" }}>
            A Token Engineered to Only Climb
          </h2>
          <p className="text-sm sm:text-base max-w-2xl mx-auto mt-3 leading-relaxed" style={{ color: "rgba(194,210,255,0.55)" }}>
            Our BEP-20 token runs on a reserve-backed floor price that ratchets upward with demand.
            By design, the floor <strong style={{ color: "#34d399" }}>can only rise — it never drops.</strong>
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-6 items-stretch">
          {/* Mechanism */}
          <div className="rounded-2xl p-6 sm:p-8" style={{ background: "rgba(10,14,30,0.65)", backdropFilter: "blur(14px)", border: "1px solid rgba(91,140,255,0.13)" }}>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: "rgba(91,140,255,0.12)", border: "1px solid rgba(91,140,255,0.30)" }}>
                <Coins size={20} style={{ color: "#5B8CFF" }} />
              </div>
              <div>
                <div className="font-bold text-sm" style={{ color: "rgba(200,240,255,0.92)" }}>WaytoAlgo Token</div>
                <div className="text-xs" style={{ color: "rgba(194,210,255,0.45)" }}>BEP-20 · On-chain · Reserve-backed</div>
              </div>
            </div>
            <div className="flex flex-col gap-4">
              {[
                { icon: TrendingUp, color: "#34d399", title: "Floor price only moves up", desc: "Every purchase lifts the floor. The contract has no mechanism to lower it — so the price never drops below its previous floor." },
                { icon: Shield, color: "#5B8CFF", title: "Backed by a growing reserve", desc: "Each buy adds USDT to an on-chain reserve, increasing the real backing behind every token in circulation." },
                { icon: Flame, color: "#b87fff", title: "Revenue-funded buybacks", desc: "A share of platform profits automatically buys back tokens, adding constant demand that pushes the floor higher." },
                { icon: Lock, color: "#C2D2FF", title: "Transparent & verifiable", desc: "Supply, reserve and price live fully on-chain on BSC — anyone can verify them at any time." },
              ].map(row => {
                const Icon = row.icon;
                return (
                  <div key={row.title} className="flex gap-3">
                    <div className="w-8 h-8 rounded-lg shrink-0 flex items-center justify-center" style={{ background: `${row.color}15`, border: `1px solid ${row.color}30` }}>
                      <Icon size={15} style={{ color: row.color }} />
                    </div>
                    <div>
                      <div className="font-semibold text-sm" style={{ color: "rgba(200,240,255,0.88)" }}>{row.title}</div>
                      <div className="text-xs leading-relaxed mt-0.5" style={{ color: "rgba(194,210,255,0.45)" }}>{row.desc}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Upward chart */}
          <div className="rounded-2xl p-6 sm:p-8 flex flex-col" style={{ background: "linear-gradient(170deg, rgba(52,211,153,0.06) 0%, rgba(10,14,30,0.80) 100%)", border: "1px solid rgba(52,211,153,0.18)" }}>
            <div className="flex items-center justify-between mb-4">
              <div className="text-xs font-semibold tracking-widest uppercase" style={{ color: "rgba(194,210,255,0.5)" }}>
                Floor Price
              </div>
              <div className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold" style={{ background: "rgba(52,211,153,0.12)", border: "1px solid rgba(52,211,153,0.30)", color: "#34d399" }}>
                <ArrowUpRight size={12} /> Only Up
              </div>
            </div>

            <svg viewBox="0 0 300 170" className="w-full" style={{ flex: 1, minHeight: 160 }} preserveAspectRatio="none" aria-hidden="true">
              <defs>
                <linearGradient id="tokenFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#34d399" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="#34d399" stopOpacity="0" />
                </linearGradient>
              </defs>
              {[40, 75, 110, 145].map(y => (
                <line key={y} x1="0" y1={y} x2="300" y2={y} stroke="rgba(91,140,255,0.08)" strokeWidth="1" />
              ))}
              <path d="M5,155 L5,150 L55,150 L55,125 L100,125 L100,100 L145,100 L145,78 L190,78 L190,55 L240,55 L240,35 L295,35 L295,155 Z" fill="url(#tokenFill)" />
              <path d="M5,150 L55,150 L55,125 L100,125 L100,100 L145,100 L145,78 L190,78 L190,55 L240,55 L240,35 L295,35" fill="none" stroke="#34d399" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
              <circle cx="295" cy="35" r="4" fill="#34d399" />
            </svg>

            <p className="text-xs leading-relaxed mt-4" style={{ color: "rgba(194,210,255,0.4)" }}>
              Illustrative of the mechanism. The contract floor is monotonic — it ratchets up with demand and buybacks, and is engineered never to fall.
            </p>
          </div>
        </div>

        {/* Token highlights */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6">
          <FeatureCard icon={TrendingUp} title="Price Only Goes Up" desc="A monotonic floor that ratchets higher with demand — and never drops." color="#34d399" />
          <FeatureCard icon={Shield} title="Reserve-Backed" desc="Every token is backed by a growing on-chain USDT reserve." color="#5B8CFF" />
          <FeatureCard icon={Flame} title="Revenue Buybacks" desc="Platform profits fund continuous buybacks that lift the floor." color="#b87fff" />
          <FeatureCard icon={Coins} title="Buy & Sell Anytime" desc="Trade directly from your wallet — fully on-chain, no lock-in." color="#C2D2FF" />
        </div>
      </section>

      {/* ── Why choose us ─────────────────────────────────────── */}
      <section className="relative z-10 px-4 pb-20 max-w-6xl mx-auto">
        <div className="grid sm:grid-cols-3 gap-4">
          {[
            { icon: Shield, title: "Secured Platform", desc: "Bank-grade encryption, layered authentication, and continuous monitoring protect every account and wallet.", color: "#5B8CFF" },
            { icon: Users, title: "Team Rewards", desc: "Grow your network and earn across 8 levels — a 5% direct bonus plus tiered rewards as your team expands.", color: "#34d399" },
            { icon: Zap, title: "Daily Payouts", desc: "Returns are credited every trading day. Request a withdrawal anytime, processed within 24–48 hours.", color: "#b87fff" },
          ].map(c => (
            <FeatureCard key={c.title} icon={c.icon} title={c.title} desc={c.desc} color={c.color} />
          ))}
        </div>
      </section>

      {/* ── How it works ──────────────────────────────────────── */}
      <section className="relative z-10 px-4 pb-24 max-w-4xl mx-auto">
        <div className="text-center mb-10">
          <div className="text-xs font-semibold tracking-widest uppercase mb-2" style={{ color: "rgba(91,140,255,0.5)" }}>
            Get Started
          </div>
          <h2 className="text-2xl sm:text-3xl font-black" style={{ fontFamily: "'Sora', sans-serif", color: "rgba(200,240,255,0.90)" }}>
            Three Steps to Begin
          </h2>
        </div>

        <div
          className="rounded-2xl p-6 sm:p-8"
          style={{
            background: "rgba(10,14,30,0.65)",
            backdropFilter: "blur(14px)",
            border: "1px solid rgba(91,140,255,0.13)",
          }}
        >
          <div className="max-w-md mx-auto">
            <Step n={1} title="Create Your Account" desc="Register in minutes, verify your email, and finish a short profile setup." />
            <Step n={2} title="Fund & Choose a Plan" desc="Deposit USDT (from $100) and pick the strategy plan that fits your goals." />
            <Step n={3} title="Earn Every Trading Day" desc="Watch returns of 0.6%–0.8% land daily, and grow faster by inviting your network." />
          </div>

          {/* Investment highlights */}
          <div className="mt-6 pt-6 border-t border-[rgba(91,140,255,0.10)] grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              "From $100 to start",
              "5% direct referral bonus",
              "8-level team rewards",
              "BEP-20 USDT payouts",
              "No lock-in period",
              "Returns every trading day",
            ].map(item => (
              <div key={item} className="flex items-center gap-2">
                <CheckCircle size={13} style={{ color: "#34d399", shrink: 0 }} />
                <span className="text-xs" style={{ color: "rgba(194,210,255,0.55)" }}>{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Bottom CTA ────────────────────────────────────────── */}
      <section className="relative z-10 px-4 pb-20 max-w-3xl mx-auto text-center">
        <div
          className="rounded-3xl px-6 py-12"
          style={{
            background: "linear-gradient(170deg, rgba(91,140,255,0.07) 0%, rgba(10,14,30,0.80) 100%)",
            border: "1px solid rgba(91,140,255,0.20)",
            boxShadow: "0 0 80px rgba(91,140,255,0.06)",
          }}
        >
          <h2
            className="text-2xl sm:text-3xl font-black mb-4"
            style={{
              fontFamily: "'Sora', sans-serif",
              background: "linear-gradient(135deg, #C2D2FF, #5B8CFF)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            Start Growing Your Portfolio Today
          </h2>
          <p className="text-sm mb-8 max-w-md mx-auto" style={{ color: "rgba(194,210,255,0.50)" }}>
            Create your free WaytoAlgo account and let disciplined, automated strategies do the work.
          </p>
          <Link href="/register">
            <button
              className="inline-flex items-center gap-2 px-10 py-3.5 rounded-xl font-bold text-base transition-all hover:brightness-110 hover:scale-[1.02]"
              style={{
                background: "linear-gradient(135deg, #5B8CFF, #3D5CE0)",
                color: "#060814",
                boxShadow: "0 0 30px rgba(91,140,255,0.30), 0 4px 16px rgba(0,0,0,0.4)",
              }}
            >
              Create Free Account
              <ArrowRight size={16} />
            </button>
          </Link>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────────── */}
      <footer
        className="relative z-10 px-6 py-8 max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4"
        style={{ borderTop: "1px solid rgba(91,140,255,0.08)" }}
      >
        <div
          className="text-sm font-black tracking-wider"
          style={{
            fontFamily: "'Sora', sans-serif",
            background: "linear-gradient(135deg, #C2D2FF, #5B8CFF)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}
        >
          WaytoAlgo
        </div>
        <div className="flex items-center gap-5 text-xs" style={{ color: "rgba(194,210,255,0.35)" }}>
          <Link href="/about"><span className="hover:text-teal-300 transition-colors cursor-pointer">About</span></Link>
          <Link href="/terms"><span className="hover:text-teal-300 transition-colors cursor-pointer">Terms & Conditions</span></Link>
          <Link href="/privacy"><span className="hover:text-teal-300 transition-colors cursor-pointer">Privacy Policy</span></Link>
        </div>
        <div className="text-xs" style={{ color: "rgba(194,210,255,0.25)" }}>
          © {new Date().getFullYear()} WaytoAlgo. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
