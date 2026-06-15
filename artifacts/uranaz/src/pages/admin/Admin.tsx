import { useGetAdminStats } from "@workspace/api-client-react";
import { Users, TrendingUp, Wallet, DollarSign, Shield, Activity } from "lucide-react";

const TEAL = "#00FF94";
const GLASS = { background: "rgba(10,14,30,0.65)", backdropFilter: "blur(14px)", border: "1px solid rgba(0,255,148,0.10)" } as const;

function StatCard({ label, value, icon: Icon, accent }: { label: string; value: string | number | undefined; icon: any; accent?: string }) {
  return (
    <div className="rounded-xl p-4 transition-all" style={GLASS}>
      <div
        className="w-9 h-9 rounded-lg flex items-center justify-center mb-3"
        style={{
          background: accent ? `${accent}1A` : "rgba(0,255,148,0.10)",
          border: `1px solid ${accent ? `${accent}40` : "rgba(0,255,148,0.18)"}`,
        }}
      >
        <Icon size={17} style={{ color: accent ?? TEAL }} />
      </div>
      <div className="text-2xl font-bold" style={{ color: "rgba(176,255,224,0.9)" }}>{value ?? "—"}</div>
      <div className="text-xs mt-0.5" style={{ color: "rgba(176,255,224,0.4)" }}>{label}</div>
    </div>
  );
}

export default function Admin() {
  const { data: stats, isLoading } = useGetAdminStats();

  return (
    <div className="px-4 md:px-8 py-6 max-w-5xl mx-auto space-y-6 pb-24 md:pb-8">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1
            className="text-xl md:text-2xl font-bold"
            style={{
              fontFamily: "'Sora', sans-serif",
              background: "linear-gradient(135deg, #B0FFE0, #00FF94)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            Admin Dashboard
          </h1>
          <p className="text-sm" style={{ color: "rgba(176,255,224,0.4)" }}>
            WaytoAlgo platform overview
          </p>
        </div>
        <div
          className="hidden sm:flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full font-semibold shrink-0"
          style={{
            background: "rgba(249,115,22,0.10)",
            border: "1px solid rgba(249,115,22,0.22)",
            color: "#f97316",
          }}
        >
          <Shield size={11} /> ADMIN
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[1,2,3,4,5,6,7,8].map(i => (
            <div key={i} className="rounded-xl h-24 animate-pulse" style={{ background: "rgba(0,255,148,0.04)", border: "1px solid rgba(0,255,148,0.08)" }} />
          ))}
        </div>
      ) : (
        <>
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: "rgba(176,255,224,0.45)" }}>
              Activity
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard label="Total Users"          value={stats?.totalUsers}          icon={Users} />
              <StatCard label="Active Users"         value={stats?.activeUsers}         icon={Activity} accent="#34d399" />
              <StatCard label="Active Investments"   value={stats?.activeInvestments}   icon={TrendingUp} />
              <StatCard label="Pending Withdrawals"  value={stats?.pendingWithdrawals}  icon={Wallet} accent="#fbbf24" />
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: "rgba(176,255,224,0.45)" }}>
              Volume
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard label="Total Invested"    value={`$${stats?.totalInvested?.toFixed(0) ?? "—"}`}     icon={DollarSign} />
              <StatCard label="Total Withdrawn"   value={`$${stats?.totalWithdrawn?.toFixed(0) ?? "—"}`}    icon={Wallet} />
              <StatCard label="Commissions Paid"  value={`$${stats?.totalCommissionsPaid?.toFixed(0) ?? "—"}`} icon={DollarSign} accent="#a78bfa" />
              <StatCard label="New Users Today"   value={stats?.newUsersToday}                               icon={Users} accent="#34d399" />
            </div>
          </div>

          <div className="rounded-xl p-4 flex items-start gap-3" style={GLASS}>
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: "rgba(0,255,148,0.10)", border: "1px solid rgba(0,255,148,0.18)", color: TEAL }}
            >
              <Shield size={16} />
            </div>
            <div className="min-w-0 text-sm" style={{ color: "rgba(176,255,224,0.7)" }}>
              <span className="font-semibold" style={{ color: "rgba(176,255,224,0.9)" }}>Welcome, Admin.</span>{" "}
              Use the menu on the left to manage users, investments, withdrawals, support tickets, offers, notices, and platform settings.
            </div>
          </div>
        </>
      )}
    </div>
  );
}
