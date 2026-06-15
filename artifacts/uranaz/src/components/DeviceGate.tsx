import { ReactNode } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { Monitor, Smartphone, Shield } from "lucide-react";

const TEAL = "#00FF94";

const PUBLIC_PATHS = ["/", "/login", "/register", "/terms", "/privacy"];

function isPublicPath(path: string) {
  return (
    PUBLIC_PATHS.includes(path) ||
    path.startsWith("/terms") ||
    path.startsWith("/privacy")
  );
}

function BlockShell({
  icon,
  title,
  message,
  hint,
  accent,
}: {
  icon: ReactNode;
  title: string;
  message: string;
  hint: string;
  accent: string;
}) {
  return (
    <div
      className="min-h-screen w-full flex items-center justify-center px-6 py-10"
      style={{ background: "#050C0A" }}
    >
      <div
        className="w-full max-w-md rounded-3xl p-8 text-center"
        style={{
          background: "rgba(10,14,30,0.85)",
          backdropFilter: "blur(14px)",
          border: `1px solid ${accent}40`,
          boxShadow: `0 0 60px ${accent}25`,
        }}
      >
        <div
          className="mx-auto mb-5 w-20 h-20 rounded-2xl flex items-center justify-center"
          style={{
            background: `linear-gradient(135deg, ${accent}30, ${accent}10)`,
            border: `1px solid ${accent}50`,
            boxShadow: `0 0 40px ${accent}40`,
          }}
        >
          {icon}
        </div>
        <h1
          className="text-2xl mb-2"
          style={{
            fontFamily: "'Sora',sans-serif",
            fontWeight: 800,
            color: accent,
            letterSpacing: "0.06em",
          }}
        >
          {title}
        </h1>
        <p className="text-sm text-white/85 leading-relaxed mb-3">{message}</p>
        <p className="text-xs text-white/50">{hint}</p>
        <div
          className="mt-6 pt-5 text-[11px] tracking-[0.2em] uppercase"
          style={{
            borderTop: `1px solid ${accent}25`,
            color: `${accent}99`,
            fontFamily: "'Sora',sans-serif",
          }}
        >
          WaytoAlgo
        </div>
      </div>
    </div>
  );
}

function DesktopOnlyBlock() {
  return (
    <BlockShell
      accent={TEAL}
      icon={
        <div className="relative">
          <Monitor className="w-9 h-9" style={{ color: TEAL }} />
          <Shield
            className="absolute -bottom-1 -right-1 w-4 h-4"
            style={{ color: "#fb923c" }}
          />
        </div>
      }
      title="DESKTOP ONLY"
      message="The admin control center is built for larger screens. Please open this account on a desktop or laptop to continue."
      hint="Tip: rotate to landscape on a tablet, or switch devices."
    />
  );
}

function MobileOnlyBlock() {
  return (
    <BlockShell
      accent={TEAL}
      icon={<Smartphone className="w-10 h-10" style={{ color: TEAL }} />}
      title="MOBILE ONLY"
      message="WaytoAlgo is a mobile-first investment app. Please open your account on your phone for the best experience."
      hint="Scan or open the link on your mobile device to continue."
    />
  );
}

export default function DeviceGate({
  user,
  path,
  children,
}: {
  user: any;
  path: string;
  children: ReactNode;
}) {
  const isMobile = useIsMobile();

  if (!user || isPublicPath(path)) return <>{children}</>;

  if (user.isAdmin) {
    return isMobile ? <DesktopOnlyBlock /> : <>{children}</>;
  }

  return isMobile ? <>{children}</> : <MobileOnlyBlock />;
}
