import { useEffect, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { ArrowLeft, Bell, Pin, X, ExternalLink, Info, CheckCircle2, AlertTriangle, AlertOctagon, Megaphone, Sparkles, Clock, Tag, RotateCcw } from "lucide-react";

const TEAL = "#00FF94";

interface Notice {
  id: number;
  title: string;
  message: string;
  type: "info" | "success" | "warning" | "critical" | "announcement" | "promo";
  priority: "low" | "normal" | "high" | "urgent";
  icon: string;
  ctaLabel: string;
  ctaUrl: string;
  pinned: boolean;
  dismissible: boolean;
  createdAt: string;
}

const TYPE_STYLES: Record<Notice["type"], { color: string; bg: string; border: string; Icon: any; label: string; gradient: string }> = {
  info:         { color: "#00FF94", bg: "rgba(0,255,148,0.10)",  border: "rgba(0,255,148,0.30)",  Icon: Info,         label: "Info",         gradient: "linear-gradient(135deg, rgba(0,255,148,0.18), rgba(0,204,119,0.10))" },
  success:      { color: "#34d399", bg: "rgba(52,211,153,0.10)",  border: "rgba(52,211,153,0.32)",  Icon: CheckCircle2, label: "Success",      gradient: "linear-gradient(135deg, rgba(52,211,153,0.18), rgba(16,185,129,0.10))" },
  warning:      { color: "#fbbf24", bg: "rgba(251,191,36,0.10)",  border: "rgba(251,191,36,0.32)",  Icon: AlertTriangle,label: "Warning",      gradient: "linear-gradient(135deg, rgba(251,191,36,0.18), rgba(245,158,11,0.10))" },
  critical:     { color: "#f87171", bg: "rgba(248,113,113,0.10)", border: "rgba(248,113,113,0.32)", Icon: AlertOctagon, label: "Critical",     gradient: "linear-gradient(135deg, rgba(248,113,113,0.20), rgba(239,68,68,0.10))" },
  announcement: { color: "#a78bfa", bg: "rgba(167,139,250,0.10)", border: "rgba(167,139,250,0.32)", Icon: Megaphone,    label: "Announcement", gradient: "linear-gradient(135deg, rgba(167,139,250,0.18), rgba(139,92,246,0.10))" },
  promo:        { color: "#f472b6", bg: "rgba(244,114,182,0.10)", border: "rgba(244,114,182,0.32)", Icon: Sparkles,     label: "Promo",        gradient: "linear-gradient(135deg, rgba(244,114,182,0.18), rgba(236,72,153,0.10))" },
};

const PRIORITY_LABEL: Record<Notice["priority"], { color: string; bg: string; label: string }> = {
  low:    { color: "rgba(176,255,224,0.5)", bg: "rgba(176,255,224,0.06)", label: "Low" },
  normal: { color: TEAL,                    bg: "rgba(0,255,148,0.10)",  label: "Normal" },
  high:   { color: "#fbbf24",               bg: "rgba(251,191,36,0.12)",  label: "High" },
  urgent: { color: "#f87171",               bg: "rgba(248,113,113,0.14)", label: "Urgent" },
};

const DISMISSED_KEY = "uranaz_dismissed_notices";
function getDismissed(): number[] {
  try { return JSON.parse(localStorage.getItem(DISMISSED_KEY) || "[]"); } catch { return []; }
}
function saveDismissed(ids: number[]) {
  localStorage.setItem(DISMISSED_KEY, JSON.stringify(ids));
}

function fmtFull(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  return fmtFull(iso);
}

export default function NotificationDetail() {
  const [, params] = useRoute("/notifications/:id");
  const [, setLocation] = useLocation();
  const id = params?.id ? parseInt(params.id, 10) : null;

  const [notice, setNotice] = useState<Notice | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) { setNotFound(true); setLoading(false); return; }
    const load = async () => {
      try {
        const token = localStorage.getItem("waytoalgo_token");
        const headers = token ? { Authorization: `Bearer ${token}` } : {};
        const r = await fetch("/api/notices/active", { headers });
        if (!r.ok) { setNotFound(true); return; }
        const list: Notice[] = await r.json();
        const found = list.find(n => n.id === id);
        if (!found) { setNotFound(true); return; }
        setNotice(found);

        // Record server-side view (idempotent per user)
        fetch(`/api/notices/${found.id}/view`, { method: "POST", headers }).catch(() => {});

        // Auto-mark as read locally — opening a notice always counts as reading,
        // regardless of pinned/dismissible (those flags only control list behavior, not read state)
        const dismissed = getDismissed();
        if (!dismissed.includes(found.id)) {
          saveDismissed([...dismissed, found.id]);
        }
      } catch {
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  const dismissed = getDismissed();
  const isRead = notice ? dismissed.includes(notice.id) : false;

  const restore = () => {
    if (!notice) return;
    saveDismissed(dismissed.filter(x => x !== notice.id));
    setLocation("/notifications");
  };

  const dismiss = () => {
    if (!notice) return;
    saveDismissed(Array.from(new Set([...dismissed, notice.id])));
    setLocation("/notifications");
  };

  if (loading) {
    return (
      <div className="px-4 py-6 max-w-2xl mx-auto pb-24 md:pb-8">
        <div className="rounded-2xl h-64 animate-pulse" style={{ background: "rgba(0,255,148,0.04)", border: "1px solid rgba(0,255,148,0.08)" }} />
      </div>
    );
  }

  if (notFound || !notice) {
    return (
      <div className="px-4 py-6 max-w-2xl mx-auto pb-24 md:pb-8 space-y-5">
        <div className="flex items-center gap-3">
          <Link href="/notifications" className="w-9 h-9 rounded-xl flex items-center justify-center transition-all"
            style={{ background: "rgba(10,14,30,0.65)", backdropFilter: "blur(14px)", border: "1px solid rgba(0,255,148,0.10)" }}>
            <ArrowLeft size={16} style={{ color: TEAL }} />
          </Link>
          <h1 className="text-lg font-bold" style={{ color: "rgba(176,255,224,0.9)", fontFamily: "'Sora', sans-serif" }}>Not found</h1>
        </div>
        <div className="rounded-2xl p-10 text-center"
          style={{ background: "rgba(10,14,30,0.65)", border: "1px dashed rgba(0,255,148,0.12)" }}>
          <Bell size={28} className="mx-auto mb-3" style={{ color: "rgba(176,255,224,0.3)" }} />
          <div className="text-sm font-medium" style={{ color: "rgba(176,255,224,0.6)" }}>This notification no longer exists</div>
          <div className="text-xs mt-1" style={{ color: "rgba(176,255,224,0.35)" }}>It may have expired or been removed</div>
          <Link href="/notifications" className="inline-flex items-center gap-1.5 mt-5 px-4 py-2 rounded-xl text-sm font-semibold transition-all"
            style={{ background: "linear-gradient(135deg, #00FF94, #00CC77)", color: "#050C0A" }}>
            <ArrowLeft size={14} /> Back to Notifications
          </Link>
        </div>
      </div>
    );
  }

  const s = TYPE_STYLES[notice.type] ?? TYPE_STYLES.info;
  const pm = PRIORITY_LABEL[notice.priority] ?? PRIORITY_LABEL.normal;
  const Icon = s.Icon;
  const isExternal = /^https?:\/\//.test(notice.ctaUrl);

  return (
    <div className="px-4 py-6 max-w-2xl mx-auto space-y-5 pb-24 md:pb-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/notifications" className="w-9 h-9 rounded-xl flex items-center justify-center transition-all"
          style={{ background: "rgba(10,14,30,0.65)", backdropFilter: "blur(14px)", border: "1px solid rgba(0,255,148,0.10)" }}>
          <ArrowLeft size={16} style={{ color: TEAL }} />
        </Link>
        <div className="flex-1">
          <div className="text-[11px] uppercase tracking-wider font-semibold" style={{ color: "rgba(176,255,224,0.4)" }}>
            Notification
          </div>
          <div className="text-xs" style={{ color: "rgba(176,255,224,0.55)" }}>
            #{notice.id} · {timeAgo(notice.createdAt)}
          </div>
        </div>
      </div>

      {/* Hero card */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{
          background: "linear-gradient(155deg, rgba(4,16,32,0.97), rgba(2,10,22,0.97))",
          border: `1px solid ${s.border}`,
          boxShadow: `0 0 40px ${s.bg}, 0 20px 60px rgba(0,0,0,0.4)`,
        }}
      >
        {/* Type banner */}
        <div
          className="px-5 py-3 flex items-center justify-between"
          style={{ background: s.gradient, borderBottom: `1px solid ${s.border}` }}
        >
          <div className="flex items-center gap-2">
            <Icon size={14} style={{ color: s.color }} />
            <span className="text-xs font-bold uppercase tracking-wider" style={{ color: s.color }}>
              {s.label}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            {notice.pinned && (
              <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold flex items-center gap-1"
                style={{ background: "rgba(0,255,148,0.12)", color: TEAL, border: "1px solid rgba(0,255,148,0.28)" }}>
                <Pin size={9} /> Pinned
              </span>
            )}
            <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold capitalize"
              style={{ background: pm.bg, color: pm.color, border: `1px solid ${pm.color}50` }}>
              {pm.label} priority
            </span>
          </div>
        </div>

        {/* Body */}
        <div className="p-5 sm:p-6">
          <div className="flex items-start gap-4">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 text-2xl"
              style={{
                background: s.bg,
                border: `1px solid ${s.border}`,
                boxShadow: `0 0 24px ${s.bg}`,
              }}
            >
              {notice.icon ? notice.icon : <Icon size={24} style={{ color: s.color }} />}
            </div>
            <div className="flex-1 min-w-0">
              <h1
                className="text-xl sm:text-2xl font-bold leading-tight"
                style={{
                  color: "rgba(176,255,224,0.95)",
                  fontFamily: "'Sora', sans-serif",
                }}
              >
                {notice.title}
              </h1>
            </div>
          </div>

          {/* Message */}
          <div
            className="mt-5 text-sm sm:text-base leading-relaxed whitespace-pre-wrap"
            style={{ color: "rgba(176,255,224,0.78)" }}
          >
            {notice.message}
          </div>

          {/* CTA */}
          {notice.ctaLabel && notice.ctaUrl && (
            <div className="mt-6">
              {isExternal ? (
                <a
                  href={notice.ctaUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-6 py-3 rounded-xl text-sm font-bold transition-all"
                  style={{
                    background: `linear-gradient(135deg, ${s.color}, ${s.color}dd)`,
                    color: "#050C0A",
                    boxShadow: `0 0 24px ${s.bg}`,
                  }}
                >
                  {notice.ctaLabel}
                  <ExternalLink size={14} />
                </a>
              ) : (
                <Link
                  href={notice.ctaUrl}
                  className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-6 py-3 rounded-xl text-sm font-bold transition-all"
                  style={{
                    background: `linear-gradient(135deg, ${s.color}, ${s.color}dd)`,
                    color: "#050C0A",
                    boxShadow: `0 0 24px ${s.bg}`,
                  }}
                >
                  {notice.ctaLabel}
                  <ExternalLink size={14} />
                </Link>
              )}
            </div>
          )}
        </div>

        {/* Meta footer */}
        <div
          className="px-5 sm:px-6 py-4 grid grid-cols-2 sm:grid-cols-3 gap-4"
          style={{ borderTop: "1px solid rgba(0,255,148,0.08)", background: "rgba(2,8,18,0.6)" }}
        >
          <div>
            <div className="text-[10px] uppercase tracking-wider font-semibold flex items-center gap-1" style={{ color: "rgba(176,255,224,0.35)" }}>
              <Tag size={9} /> Type
            </div>
            <div className="text-xs font-semibold mt-1" style={{ color: s.color }}>{s.label}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider font-semibold flex items-center gap-1" style={{ color: "rgba(176,255,224,0.35)" }}>
              <AlertTriangle size={9} /> Priority
            </div>
            <div className="text-xs font-semibold mt-1 capitalize" style={{ color: pm.color }}>{pm.label}</div>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <div className="text-[10px] uppercase tracking-wider font-semibold flex items-center gap-1" style={{ color: "rgba(176,255,224,0.35)" }}>
              <Clock size={9} /> Posted
            </div>
            <div className="text-xs font-semibold mt-1" style={{ color: "rgba(176,255,224,0.7)" }}>{fmtFull(notice.createdAt)}</div>
          </div>
        </div>
      </div>

      {/* Actions row */}
      <div className="flex items-center gap-2">
        <Link
          href="/notifications"
          className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-1.5"
          style={{ background: "rgba(10,14,30,0.65)", backdropFilter: "blur(14px)", border: "1px solid rgba(0,255,148,0.18)", color: "rgba(176,255,224,0.7)" }}
        >
          <ArrowLeft size={14} /> Back
        </Link>
        {notice.dismissible && !notice.pinned && (
          isRead ? (
            <button
              onClick={restore}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-1.5"
              style={{ background: "rgba(0,255,148,0.10)", border: "1px solid rgba(0,255,148,0.28)", color: TEAL }}
            >
              <RotateCcw size={14} /> Mark Unread
            </button>
          ) : (
            <button
              onClick={dismiss}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-1.5"
              style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.22)", color: "rgba(248,113,113,0.85)" }}
            >
              <X size={14} /> Dismiss
            </button>
          )
        )}
      </div>
    </div>
  );
}
