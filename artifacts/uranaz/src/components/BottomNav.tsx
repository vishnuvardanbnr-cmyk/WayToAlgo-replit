import { useLocation, Link } from "wouter";
import { LayoutDashboard, TrendingUp, Wallet, Users, ClipboardList } from "lucide-react";

const navItems = [
  { path: "/dashboard",    icon: LayoutDashboard, label: "Home"         },
  { path: "/invest",       icon: TrendingUp,      label: "Invest"       },
  { path: "/wallet",       icon: Wallet,          label: "Wallet"       },
  { path: "/team",         icon: Users,           label: "Team"         },
  { path: "/transactions", icon: ClipboardList,   label: "Transactions" },
];

interface Props {
  isLoggedIn: boolean;
}

export default function BottomNav({ isLoggedIn }: Props) {
  const [location] = useLocation();

  if (!isLoggedIn) return null;

  return (
    <nav
      data-testid="bottom-nav"
      className="fixed bottom-0 left-0 right-0 z-40 bottom-nav-safe md:hidden"
      style={{
        background: "rgba(1, 10, 20, 0.90)",
        backdropFilter: "blur(24px) saturate(1.6)",
        WebkitBackdropFilter: "blur(24px) saturate(1.6)",
        borderTop: "1px solid rgba(91, 140, 255, 0.15)",
        boxShadow: "0 -4px 30px rgba(0,0,0,0.5), 0 -1px 0 rgba(0,255,148,0.08)",
      }}
    >
      <div className="flex items-center justify-around h-16">
        {navItems.map(({ path, icon: Icon, label }) => {
          const active = location === path || (path !== "/" && location.startsWith(path));
          return (
            <Link
              key={path}
              href={path}
              data-testid={`nav-${label.toLowerCase()}`}
              className="flex flex-col items-center gap-0.5 px-3 py-1 transition-all duration-200"
              style={{
                color: active ? "#00FF94" : "rgba(176,255,224,0.35)",
                textShadow: active ? "0 0 10px rgba(0,255,148,0.6)" : "none",
                filter: active ? "drop-shadow(0 0 6px rgba(0,255,148,0.5))" : "none",
              }}
            >
              <Icon size={20} strokeWidth={active ? 2.5 : 1.6} />
              <span className="text-[10px] font-medium tracking-wide">{label}</span>
              {active && (
                <div
                  className="absolute -bottom-0 w-8 h-0.5 rounded-full"
                  style={{
                    background: "linear-gradient(90deg, transparent, #00FF94, transparent)",
                    boxShadow: "0 0 8px rgba(0,255,148,0.8)",
                  }}
                />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
