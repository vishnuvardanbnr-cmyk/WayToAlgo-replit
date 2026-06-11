import { useState, useEffect, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard, Users, TrendingUp, Wallet, FileText,
  Settings, MessageCircle, Award, Bell, Shield, Menu, X, ArrowLeft, Scale, Star, Gift,
} from "lucide-react";

const TEAL = "#5B8CFF";

const NAV_ITEMS = [
  { href: "/admin",              label: "Dashboard",         sub: "Overview & stats",            icon: LayoutDashboard },
  { href: "/admin/users",        label: "Manage Users",      sub: "Profiles, blocks, balances",  icon: Users },
  { href: "/admin/investments",  label: "Investments",       sub: "Active plans",                icon: TrendingUp },
  { href: "/admin/withdrawals",  label: "Withdrawals",       sub: "Approve / reject requests",   icon: Wallet },
  { href: "/admin/reports",      label: "Reports",           sub: "Deposits, withdrawals, wallets", icon: FileText },
  { href: "/admin/settings",     label: "Platform Settings", sub: "Configure platform",          icon: Settings },
  { href: "/admin/support",      label: "Support Tickets",   sub: "Manage user queries",         icon: MessageCircle },
  { href: "/admin/offers",       label: "Offers",            sub: "Create & manage offers",      icon: Award },
  { href: "/admin/notices",      label: "Notices",           sub: "Push announcements & alerts", icon: Bell },
  { href: "/admin/legal",        label: "Legal Content",     sub: "Terms & Privacy Policy",      icon: Scale },
  { href: "/admin/ranks",        label: "Rank Management",   sub: "Create & edit rank tiers",    icon: Star },
  { href: "/admin/rewards",      label: "Rewards Hub",       sub: "Eligible users & reward tracking", icon: Gift },
] as const;

function isActive(location: string, href: string) {
  if (href === "/admin") return location === "/admin";
  return location === href || location.startsWith(href + "/");
}

function NavList({ location, onNavigate }: { location: string; onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-1 px-3">
      {NAV_ITEMS.map(({ href, label, sub, icon: Icon }) => {
        const active = isActive(location, href);
        return (
          <Link key={href} href={href} onClick={onNavigate}>
            <div
              data-testid={`admin-nav-${href.replace(/\//g, "-")}`}
              className="group rounded-xl px-3 py-2.5 flex items-center gap-3 cursor-pointer transition-all"
              style={{
                background: active
                  ? "linear-gradient(135deg, rgba(91,140,255,0.18), rgba(91,140,255,0.06))"
                  : "transparent",
                border: active
                  ? "1px solid rgba(91,140,255,0.32)"
                  : "1px solid transparent",
                boxShadow: active ? "0 0 18px rgba(91,140,255,0.10)" : "none",
              }}
              onMouseEnter={(e) => {
                if (!active) (e.currentTarget as HTMLElement).style.background = "rgba(91,140,255,0.05)";
              }}
              onMouseLeave={(e) => {
                if (!active) (e.currentTarget as HTMLElement).style.background = "transparent";
              }}
            >
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                style={{
                  background: active ? "rgba(91,140,255,0.15)" : "rgba(91,140,255,0.06)",
                  border: `1px solid ${active ? "rgba(91,140,255,0.35)" : "rgba(91,140,255,0.12)"}`,
                  color: active ? TEAL : "rgba(194,210,255,0.55)",
                }}
              >
                <Icon size={15} />
              </div>
              <div className="min-w-0 flex-1">
                <div
                  className="text-sm font-semibold truncate"
                  style={{ color: active ? TEAL : "rgba(194,210,255,0.85)" }}
                >
                  {label}
                </div>
                <div className="text-[10px] truncate" style={{ color: "rgba(194,210,255,0.4)" }}>
                  {sub}
                </div>
              </div>
            </div>
          </Link>
        );
      })}
    </nav>
  );
}

function SidebarShell({ location, onNavigate }: { location: string; onNavigate?: () => void }) {
  return (
    <div className="flex flex-col h-full">
      {/* Brand */}
      <div className="px-5 pt-5 pb-4 flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{
            background: "linear-gradient(135deg, rgba(249,115,22,0.22), rgba(249,115,22,0.08))",
            border: "1px solid rgba(249,115,22,0.35)",
            boxShadow: "0 0 18px rgba(249,115,22,0.18)",
          }}
        >
          <Shield size={18} style={{ color: "#f97316" }} />
        </div>
        <div className="min-w-0">
          <div
            className="text-sm font-bold tracking-widest"
            style={{
              fontFamily: "'Sora', sans-serif",
              background: "linear-gradient(135deg, #C2D2FF, #5B8CFF)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            ADMIN PANEL
          </div>
          <div className="text-[10px]" style={{ color: "rgba(194,210,255,0.4)" }}>
            WaytoAlgo
          </div>
        </div>
      </div>

      <div
        className="mx-3 mb-3 h-px"
        style={{ background: "linear-gradient(90deg, transparent, rgba(91,140,255,0.18), transparent)" }}
      />

      {/* Items */}
      <div className="flex-1 overflow-y-auto pb-4">
        <NavList location={location} onNavigate={onNavigate} />
      </div>

      {/* Footer */}
      <div className="px-3 pb-4 pt-2" style={{ borderTop: "1px solid rgba(91,140,255,0.08)" }}>
        <Link href="/dashboard" onClick={onNavigate}>
          <div
            className="rounded-xl px-3 py-2.5 flex items-center gap-2 cursor-pointer transition-all"
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.06)",
              color: "rgba(194,210,255,0.6)",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = "rgba(91,140,255,0.25)";
              (e.currentTarget as HTMLElement).style.color = TEAL;
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.06)";
              (e.currentTarget as HTMLElement).style.color = "rgba(194,210,255,0.6)";
            }}
          >
            <ArrowLeft size={14} />
            <span className="text-xs font-semibold">Back to user site</span>
          </div>
        </Link>
      </div>
    </div>
  );
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [open, setOpen] = useState(false);

  // Close drawer on route change
  useEffect(() => { setOpen(false); }, [location]);

  // Lock scroll when mobile drawer open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  const currentItem = NAV_ITEMS.find(item => isActive(location, item.href));

  return (
    <div className="min-h-screen md:flex">
      {/* ───────── Desktop sidebar (fixed) ───────── */}
      <aside
        className="hidden md:flex fixed top-14 left-0 bottom-0 w-64 z-20 flex-col"
        style={{
          background: "rgba(2, 10, 20, 0.85)",
          backdropFilter: "blur(18px) saturate(1.5)",
          WebkitBackdropFilter: "blur(18px) saturate(1.5)",
          borderRight: "1px solid rgba(91,140,255,0.12)",
        }}
      >
        <SidebarShell location={location} />
      </aside>

      {/* ───────── Mobile top bar ───────── */}
      <div
        className="md:hidden sticky top-14 z-20 flex items-center gap-3 px-4 py-2.5"
        style={{
          background: "rgba(2, 10, 20, 0.92)",
          backdropFilter: "blur(16px) saturate(1.4)",
          WebkitBackdropFilter: "blur(16px) saturate(1.4)",
          borderBottom: "1px solid rgba(91,140,255,0.10)",
        }}
      >
        <button
          data-testid="button-admin-menu"
          onClick={() => setOpen(true)}
          className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{
            background: "rgba(91,140,255,0.10)",
            border: "1px solid rgba(91,140,255,0.22)",
            color: TEAL,
          }}
          aria-label="Open admin menu"
        >
          <Menu size={17} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] uppercase tracking-widest" style={{ color: "rgba(249,115,22,0.7)" }}>
            Admin Panel
          </div>
          <div className="text-sm font-bold truncate" style={{ color: "rgba(194,210,255,0.9)" }}>
            {currentItem?.label ?? "Dashboard"}
          </div>
        </div>
      </div>

      {/* ───────── Mobile drawer overlay ───────── */}
      {open && (
        <div
          className="md:hidden fixed inset-0 z-40"
          style={{ background: "rgba(0,5,15,0.75)", backdropFilter: "blur(4px)" }}
          onClick={() => setOpen(false)}
        />
      )}

      {/* ───────── Mobile drawer panel ───────── */}
      <aside
        data-testid="admin-drawer"
        className="md:hidden fixed top-0 left-0 bottom-0 w-72 z-50 flex flex-col transition-transform duration-300"
        style={{
          background: "rgba(2, 10, 20, 0.97)",
          backdropFilter: "blur(20px) saturate(1.6)",
          WebkitBackdropFilter: "blur(20px) saturate(1.6)",
          borderRight: "1px solid rgba(91,140,255,0.18)",
          boxShadow: "8px 0 40px rgba(0,0,0,0.6)",
          transform: open ? "translateX(0)" : "translateX(-100%)",
        }}
      >
        <button
          data-testid="button-close-admin-drawer"
          onClick={() => setOpen(false)}
          className="absolute top-3 right-3 w-8 h-8 rounded-lg flex items-center justify-center z-10"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.06)",
            color: "rgba(194,210,255,0.7)",
          }}
        >
          <X size={15} />
        </button>
        <SidebarShell location={location} onNavigate={() => setOpen(false)} />
      </aside>

      {/* ───────── Main content ───────── */}
      <main className="flex-1 md:ml-64 min-w-0">
        {children}
      </main>
    </div>
  );
}
