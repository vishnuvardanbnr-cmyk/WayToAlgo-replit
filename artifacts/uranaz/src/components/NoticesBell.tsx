import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { Bell } from "lucide-react";

const TEAL = "#5B8CFF";

interface Notice {
  id: number;
  priority: "low" | "normal" | "high" | "urgent";
}

const DISMISSED_KEY = "uranaz_dismissed_notices";

function getDismissed(): number[] {
  try { return JSON.parse(localStorage.getItem(DISMISSED_KEY) || "[]"); } catch { return []; }
}

export default function NoticesBell() {
  const [location] = useLocation();
  const [notices, setNotices] = useState<Notice[]>([]);
  const [dismissed, setDismissed] = useState<number[]>(getDismissed());

  const load = async () => {
    try {
      const token = localStorage.getItem("waytoalgo_token");
      if (!token) return;
      const r = await fetch("/api/notices/active", { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) return;
      const data = await r.json();
      if (Array.isArray(data)) setNotices(data);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, []);

  // Re-read dismissed list whenever route changes (e.g. after visiting /notifications)
  useEffect(() => {
    setDismissed(getDismissed());
  }, [location]);

  const unreadCount = notices.filter(n => !dismissed.includes(n.id)).length;
  const hasUrgent = notices.some(n => n.priority === "urgent" && !dismissed.includes(n.id));
  const isActive = location === "/notifications";

  return (
    <Link
      href="/notifications"
      data-testid="link-notifications"
      className="w-8 h-8 rounded-full flex items-center justify-center transition-all relative"
      style={{
        background: isActive ? "rgba(91,140,255,0.14)" : "rgba(91,140,255,0.06)",
        border: `1px solid ${isActive ? "rgba(91,140,255,0.45)" : "rgba(91,140,255,0.18)"}`,
        color: isActive ? TEAL : "rgba(194,210,255,0.55)",
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLAnchorElement).style.color = TEAL;
        (e.currentTarget as HTMLAnchorElement).style.borderColor = "rgba(91,140,255,0.45)";
      }}
      onMouseLeave={e => {
        if (!isActive) {
          (e.currentTarget as HTMLAnchorElement).style.color = "rgba(194,210,255,0.55)";
          (e.currentTarget as HTMLAnchorElement).style.borderColor = "rgba(91,140,255,0.18)";
        }
      }}
    >
      <Bell size={15} />
      {unreadCount > 0 && (
        <span
          className="absolute -top-1 -right-1 min-w-[16px] h-4 rounded-full flex items-center justify-center text-[9px] font-bold px-1"
          style={{
            background: hasUrgent ? "#f87171" : "linear-gradient(135deg, #5B8CFF, #3D5CE0)",
            color: hasUrgent ? "#fff" : "#060814",
            boxShadow: hasUrgent
              ? "0 0 8px rgba(248,113,113,0.7)"
              : "0 0 8px rgba(91,140,255,0.6)",
            animation: hasUrgent ? "noticePulse 1.4s ease-in-out infinite" : undefined,
          }}
        >
          {unreadCount > 9 ? "9+" : unreadCount}
        </span>
      )}
      <style>{`@keyframes noticePulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.2); } }`}</style>
    </Link>
  );
}
