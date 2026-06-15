import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { ArrowLeft, Bell, Pin, X, ChevronRight, ChevronLeft, Info, CheckCircle2, AlertTriangle, AlertOctagon, Megaphone, Sparkles, RotateCcw, Inbox } from "lucide-react";

const PAGE_SIZE = 10;

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

const TYPE_STYLES: Record<Notice["type"], { color: string; bg: string; border: string; Icon: any; label: string }> = {
  info:         { color: "#00FF94", bg: "rgba(0,255,148,0.10)",  border: "rgba(0,255,148,0.28)",  Icon: Info,         label: "Info" },
  success:      { color: "#34d399", bg: "rgba(52,211,153,0.10)",  border: "rgba(52,211,153,0.30)",  Icon: CheckCircle2, label: "Success" },
  warning:      { color: "#fbbf24", bg: "rgba(251,191,36,0.10)",  border: "rgba(251,191,36,0.30)",  Icon: AlertTriangle,label: "Warning" },
  critical:     { color: "#f87171", bg: "rgba(248,113,113,0.10)", border: "rgba(248,113,113,0.30)", Icon: AlertOctagon, label: "Critical" },
  announcement: { color: "#a78bfa", bg: "rgba(167,139,250,0.10)", border: "rgba(167,139,250,0.30)", Icon: Megaphone,    label: "Announcement" },
  promo:        { color: "#f472b6", bg: "rgba(244,114,182,0.10)", border: "rgba(244,114,182,0.30)", Icon: Sparkles,     label: "Promo" },
};

const DISMISSED_KEY = "uranaz_dismissed_notices";
function getDismissed(): number[] {
  try { return JSON.parse(localStorage.getItem(DISMISSED_KEY) || "[]"); } catch { return []; }
}
function saveDismissed(ids: number[]) {
  localStorage.setItem(DISMISSED_KEY, JSON.stringify(ids));
}

function timeAgo(iso: string): string {
  const d = new Date(iso).getTime();
  const diff = Date.now() - d;
  const m = Math.floor(diff / 60000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

type Tab = "all" | "unread";

export default function Notifications() {
  const [, setLocation] = useLocation();
  const [notices, setNotices] = useState<Notice[]>([]);
  const [dismissed, setDismissed] = useState<number[]>(getDismissed());
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("all");
  const [page, setPage] = useState(1);
  const [markingAll, setMarkingAll] = useState(false);

  // Reset to first page when tab changes
  useEffect(() => { setPage(1); }, [tab]);

  const load = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("waytoalgo_token");
      const r = await fetch("/api/notices/active", { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (r.ok) {
        const data = await r.json();
        if (Array.isArray(data)) setNotices(data);
      }
    } catch {/* ignore */} finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const dismiss = (id: number) => {
    const next = Array.from(new Set([...dismissed, id]));
    setDismissed(next);
    saveDismissed(next);
  };
  const restore = (id: number) => {
    const next = dismissed.filter(x => x !== id);
    setDismissed(next);
    saveDismissed(next);
  };
  const dismissAll = async () => {
    if (markingAll) return;
    setMarkingAll(true);
    // Mark EVERY notice (including pinned + non-dismissible) as read locally so the badge clears
    const allIds = notices.map(n => n.id);
    const next = Array.from(new Set([...dismissed, ...allIds]));
    setDismissed(next);
    saveDismissed(next);
    // Sync server-side view state in one batch
    try {
      const token = localStorage.getItem("waytoalgo_token");
      await fetch("/api/notices/view-all", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
    } catch {/* ignore — local state already updated */}
    finally { setMarkingAll(false); }
  };
  const restoreAll = () => {
    setDismissed([]);
    saveDismissed([]);
  };

  const unreadCount = notices.filter(n => !dismissed.includes(n.id)).length;
  const filtered = tab === "unread"
    ? notices.filter(n => !dismissed.includes(n.id))
    : notices;

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const startIdx = (safePage - 1) * PAGE_SIZE;
  const visible = filtered.slice(startIdx, startIdx + PAGE_SIZE);

  return (
    <div className="px-4 py-6 max-w-2xl mx-auto space-y-5 pb-24 md:pb-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setLocation("/dashboard")}
          className="w-9 h-9 rounded-xl flex items-center justify-center transition-all"
          style={{ background: "rgba(10,14,30,0.65)", backdropFilter: "blur(14px)", border: "1px solid rgba(0,255,148,0.10)" }}
        >
          <ArrowLeft size={16} style={{ color: TEAL }} />
        </button>
        <div className="flex-1 min-w-0">
          <h1
            className="text-xl font-bold flex items-center gap-2"
            style={{
              fontFamily: "'Sora', sans-serif",
              background: "linear-gradient(135deg, #B0FFE0, #00FF94)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            <Bell size={18} style={{ color: TEAL }} />
            Notifications
          </h1>
          <p className="text-xs" style={{ color: "rgba(176,255,224,0.4)" }}>
            {notices.length} total · {unreadCount} unread
          </p>
        </div>
      </div>

      {/* Tabs + Actions */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex rounded-xl overflow-hidden" style={{ background: "rgba(10,14,30,0.65)", border: "1px solid rgba(0,255,148,0.10)" }}>
          {(["all", "unread"] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="px-4 py-2 text-xs font-semibold transition-all capitalize"
              style={{
                background: tab === t ? "rgba(0,255,148,0.14)" : "transparent",
                color: tab === t ? TEAL : "rgba(176,255,224,0.5)",
                borderRight: t === "all" ? "1px solid rgba(0,255,148,0.10)" : "none",
              }}
            >
              {t} {t === "unread" && unreadCount > 0 && (
                <span className="ml-1 px-1.5 py-0.5 rounded-full text-[9px]" style={{ background: TEAL, color: "#050C0A" }}>{unreadCount}</span>
              )}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        {unreadCount > 0 ? (
          <button
            onClick={dismissAll}
            disabled={markingAll}
            className="text-[11px] px-3 py-1.5 rounded-lg font-semibold transition-all flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: "rgba(0,255,148,0.06)", border: "1px solid rgba(0,255,148,0.18)", color: "rgba(176,255,224,0.65)" }}
          >
            <CheckCircle2 size={11} />
            {markingAll ? "Marking…" : "Mark all read"}
          </button>
        ) : dismissed.length > 0 && (
          <button
            onClick={restoreAll}
            className="text-[11px] px-3 py-1.5 rounded-lg font-semibold transition-all flex items-center gap-1.5"
            style={{ background: "rgba(0,255,148,0.06)", border: "1px solid rgba(0,255,148,0.18)", color: "rgba(176,255,224,0.65)" }}
          >
            <RotateCcw size={11} /> Restore all
          </button>
        )}
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="rounded-2xl h-24 animate-pulse" style={{ background: "rgba(0,255,148,0.04)", border: "1px solid rgba(0,255,148,0.08)" }} />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-2xl p-10 text-center" style={{ background: "rgba(10,14,30,0.65)", border: "1px dashed rgba(0,255,148,0.12)" }}>
          <div
            className="w-14 h-14 rounded-full mx-auto mb-3 flex items-center justify-center"
            style={{ background: "rgba(0,255,148,0.06)", border: "1px solid rgba(0,255,148,0.12)" }}
          >
            <Inbox size={22} style={{ color: "rgba(176,255,224,0.4)" }} />
          </div>
          <div className="text-sm font-medium mb-1" style={{ color: "rgba(176,255,224,0.65)" }}>
            {tab === "unread" ? "No unread notifications" : "No notifications yet"}
          </div>
          <div className="text-xs" style={{ color: "rgba(176,255,224,0.35)" }}>
            {tab === "unread" ? "You're all caught up" : "We'll let you know when something happens"}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map(n => {
            const s = TYPE_STYLES[n.type] ?? TYPE_STYLES.info;
            const Icon = s.Icon;
            const isUnread = !dismissed.includes(n.id);
            return (
              <Link
                key={n.id}
                href={`/notifications/${n.id}`}
                className="block rounded-2xl p-4 transition-all cursor-pointer"
                style={{
                  background: isUnread
                    ? `linear-gradient(155deg, rgba(4,16,32,0.97), rgba(2,10,22,0.97))`
                    : "rgba(10,14,30,0.5)",
                  border: `1px solid ${isUnread ? s.border : "rgba(0,255,148,0.07)"}`,
                  boxShadow: isUnread ? `0 0 24px ${s.bg}` : "none",
                }}
                onMouseEnter={(e: React.MouseEvent<HTMLElement>) => { (e.currentTarget as HTMLElement).style.borderColor = s.color; }}
                onMouseLeave={(e: React.MouseEvent<HTMLElement>) => { (e.currentTarget as HTMLElement).style.borderColor = isUnread ? s.border : "rgba(0,255,148,0.07)"; }}
              >
                <div className="flex items-start gap-3">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: s.bg, border: `1px solid ${s.border}` }}
                  >
                    {n.icon ? <span className="text-base">{n.icon}</span> : <Icon size={16} style={{ color: s.color }} />}
                  </div>

                  <div className="flex-1 min-w-0 pr-2">
                    <div className="flex items-center gap-1.5 flex-wrap mb-1">
                      {n.pinned && <Pin size={11} style={{ color: TEAL }} />}
                      <span className="font-bold text-sm" style={{ color: "rgba(176,255,224,0.95)" }}>{n.title}</span>
                      <span
                        className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold"
                        style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}` }}
                      >
                        {s.label}
                      </span>
                      {n.priority === "urgent" && (
                        <span
                          className="text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider"
                          style={{ background: "rgba(248,113,113,0.15)", color: "#f87171", border: "1px solid rgba(248,113,113,0.3)" }}
                        >
                          Urgent
                        </span>
                      )}
                      {!isUnread && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: "rgba(176,255,224,0.04)", color: "rgba(176,255,224,0.4)", border: "1px solid rgba(176,255,224,0.08)" }}>
                          Read
                        </span>
                      )}
                    </div>

                    <div className="text-sm leading-relaxed" style={{ color: "rgba(176,255,224,0.72)" }}>
                      {n.message}
                    </div>

                    <div className="flex items-center gap-3 mt-3 flex-wrap">
                      <span className="text-[11px]" style={{ color: "rgba(176,255,224,0.35)" }}>
                        {timeAgo(n.createdAt)}
                      </span>
                      <span
                        className="text-[11px] font-semibold flex items-center gap-1"
                        style={{ color: s.color }}
                      >
                        View details <ChevronRight size={11} />
                      </span>
                      <div className="flex-1" />
                      {n.dismissible && !n.pinned && (
                        isUnread ? (
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); dismiss(n.id); }}
                            className="text-[11px] flex items-center gap-1 px-2 py-1 rounded-lg transition-all cursor-pointer"
                            style={{ color: "rgba(176,255,224,0.4)", background: "rgba(176,255,224,0.04)" }}
                          >
                            <X size={11} /> Dismiss
                          </span>
                        ) : (
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); restore(n.id); }}
                            className="text-[11px] flex items-center gap-1 px-2 py-1 rounded-lg transition-all cursor-pointer"
                            style={{ color: "rgba(176,255,224,0.4)", background: "rgba(176,255,224,0.04)" }}
                          >
                            <RotateCcw size={11} /> Restore
                          </span>
                        )
                      )}
                    </div>
                  </div>
                  <ChevronRight size={16} className="flex-shrink-0 mt-3" style={{ color: "rgba(176,255,224,0.3)" }} />
                </div>
              </Link>
            );
          })}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between gap-2 pt-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={safePage <= 1}
                className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-semibold transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                style={{ background: "rgba(10,14,30,0.65)", border: "1px solid rgba(0,255,148,0.18)", color: "rgba(176,255,224,0.7)" }}
              >
                <ChevronLeft size={13} /> Prev
              </button>

              <div className="flex items-center gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(p => p === 1 || p === totalPages || Math.abs(p - safePage) <= 1)
                  .map((p, idx, arr) => (
                    <span key={p} className="flex items-center gap-1">
                      {idx > 0 && arr[idx - 1] !== p - 1 && (
                        <span className="text-[11px]" style={{ color: "rgba(176,255,224,0.3)" }}>···</span>
                      )}
                      <button
                        onClick={() => setPage(p)}
                        className="min-w-[30px] h-[30px] rounded-lg text-xs font-bold transition-all"
                        style={{
                          background: p === safePage ? "linear-gradient(135deg, #00FF94, #00CC77)" : "rgba(0,255,148,0.06)",
                          color: p === safePage ? "#050C0A" : "rgba(176,255,224,0.6)",
                          border: `1px solid ${p === safePage ? "transparent" : "rgba(0,255,148,0.18)"}`,
                          boxShadow: p === safePage ? "0 0 12px rgba(0,255,148,0.45)" : "none",
                        }}
                      >
                        {p}
                      </button>
                    </span>
                  ))}
              </div>

              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={safePage >= totalPages}
                className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-semibold transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                style={{ background: "rgba(10,14,30,0.65)", border: "1px solid rgba(0,255,148,0.18)", color: "rgba(176,255,224,0.7)" }}
              >
                Next <ChevronRight size={13} />
              </button>
            </div>
          )}

          {/* Range indicator */}
          {filtered.length > 0 && (
            <p className="text-[11px] text-center pt-1" style={{ color: "rgba(176,255,224,0.35)" }}>
              Showing {startIdx + 1}–{Math.min(startIdx + PAGE_SIZE, filtered.length)} of {filtered.length}
              {tab === "unread" ? " unread" : ""}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
