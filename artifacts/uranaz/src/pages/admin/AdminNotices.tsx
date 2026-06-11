import { useState, useEffect } from "react";
import { Plus, Pencil, Trash2, ToggleLeft, ToggleRight, Save, X, Pin, Bell, Eye, EyeOff, Info, CheckCircle2, AlertTriangle, AlertOctagon, Megaphone, Sparkles } from "lucide-react";

const TEAL = "#5B8CFF";
const GLASS = { background: "rgba(10,14,30,0.65)", backdropFilter: "blur(14px)", border: "1px solid rgba(91,140,255,0.10)" } as const;
const INPUT_CLS = "w-full rounded-xl px-3 py-2.5 text-sm outline-none transition-all";
const INPUT_STYLE = { background: "rgba(3,12,26,0.7)", border: "1px solid rgba(91,140,255,0.18)", color: "rgba(194,210,255,0.9)" };

type NoticeType = "info" | "success" | "warning" | "critical" | "announcement" | "promo";
type NoticePriority = "low" | "normal" | "high" | "urgent";
type NoticeAudience = "all" | "active" | "inactive" | "admin";

interface Notice {
  id: number;
  title: string;
  message: string;
  type: NoticeType;
  priority: NoticePriority;
  icon: string;
  ctaLabel: string;
  ctaUrl: string;
  audience: NoticeAudience;
  active: boolean;
  pinned: boolean;
  dismissible: boolean;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
  viewCount: number;
  audienceSize: number;
  unreadCount: number;
}

const TYPE_META: Record<NoticeType, { color: string; bg: string; border: string; Icon: any; label: string }> = {
  info:         { color: "#5B8CFF", bg: "rgba(91,140,255,0.10)",  border: "rgba(91,140,255,0.28)",  Icon: Info,         label: "Info" },
  success:      { color: "#34d399", bg: "rgba(52,211,153,0.10)",  border: "rgba(52,211,153,0.30)",  Icon: CheckCircle2, label: "Success" },
  warning:      { color: "#fbbf24", bg: "rgba(251,191,36,0.10)",  border: "rgba(251,191,36,0.30)",  Icon: AlertTriangle,label: "Warning" },
  critical:     { color: "#f87171", bg: "rgba(248,113,113,0.10)", border: "rgba(248,113,113,0.30)", Icon: AlertOctagon, label: "Critical" },
  announcement: { color: "#a78bfa", bg: "rgba(167,139,250,0.10)", border: "rgba(167,139,250,0.30)", Icon: Megaphone,    label: "Announcement" },
  promo:        { color: "#f472b6", bg: "rgba(244,114,182,0.10)", border: "rgba(244,114,182,0.30)", Icon: Sparkles,     label: "Promo" },
};

const PRIORITY_META: Record<NoticePriority, { color: string; bg: string }> = {
  low:    { color: "rgba(194,210,255,0.5)", bg: "rgba(194,210,255,0.05)" },
  normal: { color: TEAL,                    bg: "rgba(91,140,255,0.08)" },
  high:   { color: "#fbbf24",               bg: "rgba(251,191,36,0.10)" },
  urgent: { color: "#f87171",               bg: "rgba(248,113,113,0.12)" },
};

const AUDIENCE_LABEL: Record<NoticeAudience, string> = {
  all: "All users",
  active: "Active users only",
  inactive: "Inactive users only",
  admin: "Admins only",
};

const BLANK_NOTICE = {
  title: "",
  message: "",
  type: "info" as NoticeType,
  priority: "normal" as NoticePriority,
  icon: "",
  ctaLabel: "",
  ctaUrl: "",
  audience: "all" as NoticeAudience,
  active: true,
  pinned: false,
  dismissible: true,
  startsAt: "",
  endsAt: "",
};

const TEMPLATES: { name: string; emoji: string; data: Partial<typeof BLANK_NOTICE> }[] = [
  { name: "Maintenance",      emoji: "⚙️", data: { title: "Scheduled Maintenance",   message: "Platform will be under maintenance for ~30 minutes.",                    type: "warning",      priority: "high",   icon: "⚙️",  pinned: true } },
  { name: "Welcome",          emoji: "👋", data: { title: "Welcome to WaytoAlgo", message: "Glad to have you on board. Explore your dashboard and start earning.", type: "success",      priority: "normal", icon: "👋",  ctaLabel: "Explore", ctaUrl: "/dashboard" } },
  { name: "Promo",            emoji: "🎉", data: { title: "Limited-Time Bonus",       message: "Invest this week and get a special launch bonus!",                     type: "promo",        priority: "high",   icon: "🎉",  ctaLabel: "Invest Now", ctaUrl: "/invest" } },
  { name: "Critical Update",  emoji: "🚨", data: { title: "Important Notice",         message: "Please update your wallet address before the next payout cycle.",       type: "critical",     priority: "urgent", icon: "🚨",  pinned: true, ctaLabel: "Update", ctaUrl: "/profile" } },
  { name: "Announcement",     emoji: "📢", data: { title: "New Feature Available",    message: "We've launched a brand-new dashboard. Check it out!",                   type: "announcement", priority: "normal", icon: "📢" } },
];

function getToken(): string | null {
  return localStorage.getItem("waytoalgo_token");
}
function authHeaders() {
  return { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` };
}

export default function AdminNotices() {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | "new" | null>(null);
  const [form, setForm] = useState(BLANK_NOTICE);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/notices", { headers: authHeaders() });
      const data = await r.json();
      setNotices(Array.isArray(data) ? data : []);
    } catch {
      setNotices([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openNew = () => { setForm(BLANK_NOTICE); setEditingId("new"); setError(""); };
  const openEdit = (n: Notice) => {
    setForm({
      title: n.title, message: n.message, type: n.type, priority: n.priority,
      icon: n.icon, ctaLabel: n.ctaLabel, ctaUrl: n.ctaUrl, audience: n.audience,
      active: n.active, pinned: n.pinned, dismissible: n.dismissible,
      startsAt: n.startsAt ?? "", endsAt: n.endsAt ?? "",
    });
    setEditingId(n.id);
    setError("");
  };

  const applyTemplate = (tpl: typeof TEMPLATES[0]) => {
    setForm({ ...BLANK_NOTICE, ...tpl.data } as typeof BLANK_NOTICE);
  };

  const handleSave = async () => {
    if (!form.title.trim())   { setError("Title is required"); return; }
    if (!form.message.trim()) { setError("Message is required"); return; }
    setSaving(true);
    setError("");
    try {
      const body = {
        ...form,
        startsAt: form.startsAt || null,
        endsAt: form.endsAt || null,
      };
      let r;
      if (editingId === "new") {
        r = await fetch("/api/admin/notices", { method: "POST", headers: authHeaders(), body: JSON.stringify(body) });
      } else {
        r = await fetch(`/api/admin/notices/${editingId}`, { method: "PUT", headers: authHeaders(), body: JSON.stringify(body) });
      }
      if (!r.ok) throw new Error(await r.text());
      setEditingId(null);
      await load();
    } catch (e: any) {
      setError(e.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (n: Notice, field: "active" | "pinned") => {
    await fetch(`/api/admin/notices/${n.id}`, { method: "PUT", headers: authHeaders(), body: JSON.stringify({ [field]: !n[field] }) });
    await load();
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this notice? This cannot be undone.")) return;
    await fetch(`/api/admin/notices/${id}`, { method: "DELETE", headers: authHeaders() });
    await load();
  };

  const isEditing = editingId !== null;
  const meta = TYPE_META[form.type];
  const PreviewIcon = meta.Icon;

  return (
    <div className="px-4 py-6 max-w-2xl mx-auto space-y-5 pb-24 md:pb-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <h1
            className="text-xl font-bold"
            style={{
              fontFamily: "'Sora', sans-serif",
              background: "linear-gradient(135deg, #C2D2FF, #5B8CFF)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            Manage Notices
          </h1>
          <p className="text-xs" style={{ color: "rgba(194,210,255,0.4)" }}>
            Push announcements, alerts and promos to your users
          </p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all"
          style={{ background: "linear-gradient(135deg, #5B8CFF, #3D5CE0)", color: "#060814" }}
        >
          <Plus size={15} /> New Notice
        </button>
      </div>

      {/* Edit / Create form */}
      {isEditing && (
        <div
          className="rounded-2xl p-5 space-y-4"
          style={{
            background: "linear-gradient(155deg, rgba(4,16,32,0.97), rgba(2,10,22,0.97))",
            border: "1px solid rgba(91,140,255,0.22)",
          }}
        >
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-sm" style={{ color: TEAL }}>
              {editingId === "new" ? "Create New Notice" : "Edit Notice"}
            </h2>
            <button onClick={() => setEditingId(null)} className="p-1.5 rounded-lg" style={{ color: "rgba(194,210,255,0.4)" }}>
              <X size={16} />
            </button>
          </div>

          {error && (
            <div className="text-xs px-3 py-2 rounded-xl" style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)", color: "rgba(248,113,113,0.85)" }}>
              {error}
            </div>
          )}

          {/* Quick templates */}
          {editingId === "new" && (
            <div>
              <div className="text-xs mb-1.5" style={{ color: "rgba(194,210,255,0.4)" }}>Quick start (template):</div>
              <div className="flex flex-wrap gap-1.5">
                {TEMPLATES.map(t => (
                  <button
                    key={t.name}
                    type="button"
                    onClick={() => applyTemplate(t)}
                    className="text-xs px-2.5 py-1 rounded-lg transition-all flex items-center gap-1.5"
                    style={{ background: "rgba(91,140,255,0.06)", border: "1px solid rgba(91,140,255,0.12)", color: "rgba(194,210,255,0.65)" }}
                  >
                    <span>{t.emoji}</span> {t.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Live preview */}
          <div
            className="rounded-xl p-3"
            style={{
              background: `linear-gradient(90deg, ${meta.bg}, transparent 60%)`,
              border: `1px solid ${meta.border}`,
            }}
          >
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                   style={{ background: meta.bg, border: `1px solid ${meta.border}` }}>
                {form.icon ? <span className="text-sm">{form.icon}</span> : <PreviewIcon size={14} style={{ color: meta.color }} />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {form.pinned && <Pin size={10} style={{ color: TEAL }} />}
                  <span className="font-bold text-sm" style={{ color: "rgba(194,210,255,0.95)" }}>
                    {form.title || "Notice title preview"}
                  </span>
                  {form.priority === "urgent" && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider"
                          style={{ background: "rgba(248,113,113,0.15)", color: "#f87171", border: "1px solid rgba(248,113,113,0.3)" }}>
                      Urgent
                    </span>
                  )}
                </div>
                <div className="text-xs mt-0.5 leading-relaxed" style={{ color: "rgba(194,210,255,0.65)" }}>
                  {form.message || "Notice body message preview…"}
                </div>
              </div>
            </div>
          </div>

          {/* Title + icon */}
          <div className="grid grid-cols-[64px,1fr] gap-3">
            <div>
              <label className="text-xs block mb-1.5" style={{ color: "rgba(194,210,255,0.5)" }}>Icon</label>
              <input className={INPUT_CLS} style={{ ...INPUT_STYLE, textAlign: "center", fontSize: "1.4rem", padding: "6px" }}
                placeholder="🔔" maxLength={4}
                value={form.icon} onChange={e => setForm(f => ({ ...f, icon: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs block mb-1.5" style={{ color: "rgba(194,210,255,0.5)" }}>Title *</label>
              <input className={INPUT_CLS} style={INPUT_STYLE} placeholder="e.g. Scheduled Maintenance"
                value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
            </div>
          </div>

          <div>
            <label className="text-xs block mb-1.5" style={{ color: "rgba(194,210,255,0.5)" }}>Message *</label>
            <textarea className={INPUT_CLS} style={{ ...INPUT_STYLE, minHeight: "80px", resize: "vertical" }}
              placeholder="Detailed message for your users…"
              value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))} />
          </div>

          {/* Type chips */}
          <div>
            <label className="text-xs block mb-1.5" style={{ color: "rgba(194,210,255,0.5)" }}>Type</label>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(TYPE_META) as NoticeType[]).map(t => {
                const m = TYPE_META[t];
                const TIcon = m.Icon;
                const selected = form.type === t;
                return (
                  <button key={t} type="button"
                    onClick={() => setForm(f => ({ ...f, type: t }))}
                    className="text-xs px-2.5 py-1.5 rounded-lg transition-all flex items-center gap-1.5"
                    style={{
                      background: selected ? m.bg : "rgba(91,140,255,0.04)",
                      border: `1px solid ${selected ? m.border : "rgba(91,140,255,0.10)"}`,
                      color: selected ? m.color : "rgba(194,210,255,0.5)",
                    }}>
                    <TIcon size={12} /> {m.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Priority + audience */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs block mb-1.5" style={{ color: "rgba(194,210,255,0.5)" }}>Priority</label>
              <div className="flex flex-wrap gap-1">
                {(Object.keys(PRIORITY_META) as NoticePriority[]).map(p => {
                  const pm = PRIORITY_META[p];
                  const sel = form.priority === p;
                  return (
                    <button key={p} type="button" onClick={() => setForm(f => ({ ...f, priority: p }))}
                      className="text-xs px-2 py-1 rounded-lg transition-all capitalize flex-1"
                      style={{
                        background: sel ? pm.bg : "rgba(91,140,255,0.04)",
                        border: `1px solid ${sel ? pm.color : "rgba(91,140,255,0.10)"}`,
                        color: sel ? pm.color : "rgba(194,210,255,0.5)",
                        fontWeight: sel ? 600 : 400,
                      }}>
                      {p}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <label className="text-xs block mb-1.5" style={{ color: "rgba(194,210,255,0.5)" }}>Audience</label>
              <select className={INPUT_CLS} style={INPUT_STYLE}
                value={form.audience}
                onChange={e => setForm(f => ({ ...f, audience: e.target.value as NoticeAudience }))}>
                {(Object.keys(AUDIENCE_LABEL) as NoticeAudience[]).map(a => (
                  <option key={a} value={a} style={{ background: "#060814" }}>{AUDIENCE_LABEL[a]}</option>
                ))}
              </select>
            </div>
          </div>

          {/* CTA */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs block mb-1.5" style={{ color: "rgba(194,210,255,0.5)" }}>CTA Button Label</label>
              <input className={INPUT_CLS} style={INPUT_STYLE} placeholder="e.g. Learn More"
                value={form.ctaLabel} onChange={e => setForm(f => ({ ...f, ctaLabel: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs block mb-1.5" style={{ color: "rgba(194,210,255,0.5)" }}>CTA URL</label>
              <input className={INPUT_CLS} style={INPUT_STYLE} placeholder="/dashboard or https://…"
                value={form.ctaUrl} onChange={e => setForm(f => ({ ...f, ctaUrl: e.target.value }))} />
            </div>
          </div>

          {/* Schedule */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs block mb-1.5" style={{ color: "rgba(194,210,255,0.5)" }}>Starts (optional)</label>
              <input type="datetime-local" className={INPUT_CLS} style={INPUT_STYLE}
                value={form.startsAt ?? ""} onChange={e => setForm(f => ({ ...f, startsAt: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs block mb-1.5" style={{ color: "rgba(194,210,255,0.5)" }}>Ends (optional)</label>
              <input type="datetime-local" className={INPUT_CLS} style={INPUT_STYLE}
                value={form.endsAt ?? ""} onChange={e => setForm(f => ({ ...f, endsAt: e.target.value }))} />
            </div>
          </div>

          {/* Toggles */}
          <div className="space-y-2">
            {[
              { key: "active" as const, label: "Active",      sub: "Visible to users when on" },
              { key: "pinned" as const, label: "Pinned",      sub: "Sticks to the top, ignores dismissals" },
              { key: "dismissible" as const, label: "Dismissible", sub: "Users can hide this notice" },
            ].map(t => (
              <div key={t.key}
                className="flex items-center justify-between px-3 py-2.5 rounded-xl"
                style={{ background: "rgba(91,140,255,0.05)", border: "1px solid rgba(91,140,255,0.10)" }}>
                <div>
                  <div className="text-sm font-medium" style={{ color: "rgba(194,210,255,0.8)" }}>{t.label}</div>
                  <div className="text-xs" style={{ color: "rgba(194,210,255,0.35)" }}>{t.sub}</div>
                </div>
                <button type="button" onClick={() => setForm(f => ({ ...f, [t.key]: !f[t.key] }))} className="transition-all">
                  {form[t.key]
                    ? <ToggleRight size={32} style={{ color: TEAL }} />
                    : <ToggleLeft size={32} style={{ color: "rgba(194,210,255,0.2)" }} />}
                </button>
              </div>
            ))}
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-3 rounded-xl font-bold transition-all disabled:opacity-60 flex items-center justify-center gap-2"
            style={{ background: "linear-gradient(135deg, #5B8CFF, #3D5CE0)", color: "#060814", boxShadow: "0 0 20px rgba(91,140,255,0.25)" }}
          >
            <Save size={15} />
            {saving ? "Saving…" : editingId === "new" ? "Publish Notice" : "Save Changes"}
          </button>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2].map(i => (
            <div key={i} className="rounded-2xl h-24 animate-pulse" style={{ background: "rgba(91,140,255,0.04)", border: "1px solid rgba(91,140,255,0.08)" }} />
          ))}
        </div>
      ) : notices.length === 0 ? (
        <div className="rounded-2xl p-8 text-center" style={{ background: "rgba(10,14,30,0.65)", border: "1px dashed rgba(91,140,255,0.12)" }}>
          <Bell size={28} className="mx-auto mb-3" style={{ color: "rgba(194,210,255,0.3)" }} />
          <div className="text-sm font-medium mb-1" style={{ color: "rgba(194,210,255,0.6)" }}>No notices yet</div>
          <div className="text-xs" style={{ color: "rgba(194,210,255,0.3)" }}>Click "New Notice" to create your first one</div>
        </div>
      ) : (
        <div className="space-y-3">
          {notices.map(n => {
            const m = TYPE_META[n.type];
            const NIcon = m.Icon;
            const pm = PRIORITY_META[n.priority];
            return (
              <div key={n.id}
                className="rounded-2xl p-4"
                style={{
                  background: n.active
                    ? "linear-gradient(155deg, rgba(4,16,32,0.97), rgba(2,10,22,0.97))"
                    : "rgba(10,14,30,0.5)",
                  border: n.active ? `1px solid ${m.border}` : "1px solid rgba(91,140,255,0.07)",
                }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-base flex-shrink-0"
                         style={{ background: m.bg, border: `1px solid ${m.border}` }}>
                      {n.icon ? n.icon : <NIcon size={16} style={{ color: m.color }} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {n.pinned && <Pin size={11} style={{ color: TEAL }} />}
                        <div className="font-bold text-sm truncate" style={{ color: "rgba(194,210,255,0.9)" }}>{n.title}</div>
                      </div>
                      <div className="text-xs mt-0.5 line-clamp-2" style={{ color: "rgba(194,210,255,0.5)" }}>{n.message}</div>
                      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                              style={{ background: m.bg, color: m.color, border: `1px solid ${m.border}` }}>
                          {m.label}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium capitalize"
                              style={{ background: pm.bg, color: pm.color, border: `1px solid ${pm.color}40` }}>
                          {n.priority}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                              style={{ background: "rgba(194,210,255,0.05)", color: "rgba(194,210,255,0.5)", border: "1px solid rgba(194,210,255,0.10)" }}>
                          {AUDIENCE_LABEL[n.audience]}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                              style={{
                                background: n.active ? "rgba(52,211,153,0.10)" : "rgba(194,210,255,0.05)",
                                color: n.active ? "rgba(52,211,153,0.85)" : "rgba(194,210,255,0.3)",
                                border: `1px solid ${n.active ? "rgba(52,211,153,0.22)" : "rgba(194,210,255,0.08)"}`,
                              }}>
                          {n.active ? "Active" : "Paused"}
                        </span>
                        {n.endsAt && (
                          <span className="text-[10px]" style={{ color: "rgba(194,210,255,0.30)" }}>
                            ends {new Date(n.endsAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>

                      {/* View stats */}
                      <div className="grid grid-cols-3 gap-2 mt-3">
                        <div className="rounded-lg px-2 py-1.5 text-center"
                             style={{ background: "rgba(52,211,153,0.06)", border: "1px solid rgba(52,211,153,0.18)" }}>
                          <div className="text-[9px] uppercase tracking-wider font-semibold flex items-center justify-center gap-1"
                               style={{ color: "rgba(52,211,153,0.7)" }}>
                            <Eye size={9} /> Viewed
                          </div>
                          <div className="text-sm font-bold mt-0.5" style={{ color: "#34d399" }}>
                            {n.viewCount}
                          </div>
                        </div>
                        <div className="rounded-lg px-2 py-1.5 text-center"
                             style={{ background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.18)" }}>
                          <div className="text-[9px] uppercase tracking-wider font-semibold flex items-center justify-center gap-1"
                               style={{ color: "rgba(251,191,36,0.7)" }}>
                            <EyeOff size={9} /> Unread
                          </div>
                          <div className="text-sm font-bold mt-0.5" style={{ color: "#fbbf24" }}>
                            {n.unreadCount}
                          </div>
                        </div>
                        <div className="rounded-lg px-2 py-1.5 text-center"
                             style={{ background: "rgba(91,140,255,0.06)", border: "1px solid rgba(91,140,255,0.18)" }}>
                          <div className="text-[9px] uppercase tracking-wider font-semibold"
                               style={{ color: "rgba(91,140,255,0.7)" }}>
                            Audience
                          </div>
                          <div className="text-sm font-bold mt-0.5" style={{ color: TEAL }}>
                            {n.audienceSize}
                          </div>
                        </div>
                      </div>

                      {/* Progress bar */}
                      {n.audienceSize > 0 && (
                        <div className="mt-2">
                          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(194,210,255,0.06)" }}>
                            <div className="h-full rounded-full transition-all"
                                 style={{
                                   width: `${Math.min(100, (n.viewCount / n.audienceSize) * 100)}%`,
                                   background: "linear-gradient(90deg, #34d399, #5B8CFF)",
                                 }} />
                          </div>
                          <div className="text-[10px] mt-1" style={{ color: "rgba(194,210,255,0.4)" }}>
                            {Math.round((n.viewCount / n.audienceSize) * 100)}% reach
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => handleToggle(n, "pinned")}
                      className="p-2 rounded-lg transition-all" title={n.pinned ? "Unpin" : "Pin"}
                      style={{ background: n.pinned ? "rgba(91,140,255,0.12)" : "rgba(91,140,255,0.06)", border: "1px solid rgba(91,140,255,0.10)" }}>
                      <Pin size={13} style={{ color: n.pinned ? TEAL : "rgba(194,210,255,0.3)" }} />
                    </button>
                    <button onClick={() => handleToggle(n, "active")}
                      className="p-2 rounded-lg transition-all" title={n.active ? "Pause" : "Activate"}
                      style={{ background: "rgba(91,140,255,0.06)", border: "1px solid rgba(91,140,255,0.10)" }}>
                      {n.active
                        ? <ToggleRight size={14} style={{ color: TEAL }} />
                        : <ToggleLeft size={14} style={{ color: "rgba(194,210,255,0.3)" }} />}
                    </button>
                    <button onClick={() => openEdit(n)}
                      className="p-2 rounded-lg transition-all"
                      style={{ background: "rgba(91,140,255,0.06)", border: "1px solid rgba(91,140,255,0.10)" }}>
                      <Pencil size={13} style={{ color: TEAL }} />
                    </button>
                    <button onClick={() => handleDelete(n.id)}
                      className="p-2 rounded-lg transition-all"
                      style={{ background: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.10)" }}>
                      <Trash2 size={13} style={{ color: "rgba(248,113,113,0.7)" }} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
