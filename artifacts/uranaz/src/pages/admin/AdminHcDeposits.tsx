import { useState, useEffect, useCallback } from "react";
import {
  CircleDollarSign, Clock, CheckCircle, XCircle, RefreshCw, Eye, X, Check, Ban, Trash2,
} from "lucide-react";

const TEAL = "#00FF94";
const PURPLE = "#b87fff";
const GLASS = {
  background: "rgba(10,14,30,0.65)",
  backdropFilter: "blur(14px)",
  border: "1px solid rgba(0,255,148,0.10)",
} as const;

function getToken() {
  return localStorage.getItem("waytoalgo_token") || "";
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

const STATUS_CFG: Record<string, { color: string; icon: any; label: string }> = {
  pending:  { color: "#fbbf24", icon: Clock,       label: "Pending"  },
  approved: { color: "#34d399", icon: CheckCircle,  label: "Approved" },
  rejected: { color: "#f87171", icon: XCircle,      label: "Rejected" },
};

interface HcRequest {
  id: number;
  userId: number;
  userName: string;
  userEmail: string;
  referralCode: string;
  screenshotUrl: string;
  status: string;
  amount: string | null;
  note: string | null;
  createdAt: string;
  processedAt: string | null;
}

function ScreenshotModal({ url, onClose }: { url: string; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,5,15,0.92)", backdropFilter: "blur(10px)" }}
      onClick={onClose}
    >
      <div className="relative max-w-lg w-full" onClick={e => e.stopPropagation()}>
        <button
          onClick={onClose}
          className="absolute -top-3 -right-3 w-8 h-8 rounded-full flex items-center justify-center z-10"
          style={{ background: "rgba(10,14,30,0.95)", border: "1px solid rgba(0,255,148,0.25)", color: TEAL }}
        >
          <X size={14} />
        </button>
        <img src={url} alt="Transfer screenshot" className="w-full rounded-2xl" style={{ border: "1px solid rgba(184,127,255,0.3)" }} />
      </div>
    </div>
  );
}

function ApproveModal({ request, onClose, onDone }: { request: HcRequest; onClose: () => void; onDone: () => void }) {
  const [hcAmount, setHcAmount] = useState("");
  const [hcPrice, setHcPrice] = useState<number>(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/settings/public")
      .then(r => r.json())
      .then(d => setHcPrice(d.hyperCoinPrice ?? 1))
      .catch(() => {});
  }, []);

  const hcVal = parseFloat(hcAmount) || 0;
  const usdPreview = (hcVal * hcPrice).toFixed(2);

  async function handleApprove() {
    if (!hcVal || hcVal <= 0) { setError("Enter a valid positive WTA amount"); return; }
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/hc-deposits/${request.id}/approve`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ amount: hcVal }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed"); }
      onDone();
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to approve");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,5,15,0.88)", backdropFilter: "blur(10px)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-3xl overflow-hidden"
        style={{
          background: "linear-gradient(170deg, rgba(4,16,32,0.99) 0%, rgba(2,10,22,0.99) 100%)",
          border: "1px solid rgba(52,211,153,0.25)",
          boxShadow: "0 8px 60px rgba(6,8,20,0.9)",
        }}
        onClick={e => e.stopPropagation()}
      >
        <div className="h-0.5 w-full" style={{ background: "linear-gradient(90deg, transparent, #34d399, transparent)" }} />
        <div className="px-5 pt-5 pb-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ background: "rgba(52,211,153,0.12)", border: "1px solid rgba(52,211,153,0.3)" }}>
              <Check size={17} style={{ color: "#34d399" }} />
            </div>
            <div>
              <div className="text-sm font-bold" style={{ color: "rgba(200,240,255,0.92)", fontFamily: "'Sora', sans-serif" }}>Approve WTA Deposit</div>
              <div className="text-xs mt-0.5" style={{ color: "rgba(176,255,224,0.4)" }}>{request.userName} · {request.userEmail}</div>
            </div>
          </div>

          <div className="rounded-xl p-3 space-y-1.5" style={{ background: "rgba(184,127,255,0.06)", border: "1px solid rgba(184,127,255,0.16)" }}>
            <div className="flex justify-between text-xs">
              <span style={{ color: "rgba(176,255,224,0.4)" }}>User</span>
              <span className="font-bold" style={{ color: PURPLE }}>{request.userName}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span style={{ color: "rgba(176,255,224,0.4)" }}>Submitted</span>
              <span style={{ color: "rgba(176,255,224,0.7)" }}>{formatDate(request.createdAt)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span style={{ color: "rgba(176,255,224,0.4)" }}>WTA Rate</span>
              <span className="font-bold" style={{ color: TEAL }}>1 WTA = ${hcPrice.toFixed(4)} USDT</span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold mb-2" style={{ color: "rgba(176,255,224,0.6)" }}>
              WTA to Credit
            </label>
            <input
              type="number"
              min="0"
              step="0.000001"
              placeholder="e.g. 100"
              value={hcAmount}
              onChange={e => setHcAmount(e.target.value)}
              className="w-full rounded-xl px-3 py-2.5 text-sm focus:outline-none"
              style={{ background: "rgba(0,20,40,0.7)", border: "1px solid rgba(52,211,153,0.3)", color: "rgba(176,255,224,0.9)" }}
            />
            {hcVal > 0 && (
              <div className="mt-2 flex items-center justify-between px-1">
                <span className="text-xs" style={{ color: "rgba(176,255,224,0.4)" }}>USD value credited</span>
                <span className="text-xs font-bold" style={{ color: "#34d399" }}>${usdPreview} USDT</span>
              </div>
            )}
          </div>

          {error && <div className="text-xs text-center" style={{ color: "#f87171" }}>{error}</div>}

          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl text-xs font-bold"
              style={{ background: "rgba(176,255,224,0.06)", border: "1px solid rgba(176,255,224,0.12)", color: "rgba(176,255,224,0.6)" }}
            >
              Cancel
            </button>
            <button
              onClick={handleApprove}
              disabled={submitting}
              className="flex-1 py-2.5 rounded-xl text-xs font-bold transition-all"
              style={{
                background: "linear-gradient(135deg, #34d399, #10b981)",
                color: "#050C0A",
                opacity: submitting ? 0.6 : 1,
              }}
            >
              {submitting ? "Approving..." : "Approve & Credit"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

async function rejectRequest(id: number, note?: string): Promise<void> {
  const res = await fetch(`/api/admin/hc-deposits/${id}/reject`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
    body: JSON.stringify({ note: note || null }),
  });
  if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed"); }
}

export default function AdminHcDeposits() {
  const [requests, setRequests] = useState<HcRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "rejected">("all");
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const [approveTarget, setApproveTarget] = useState<HcRequest | null>(null);
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [oldImageCount, setOldImageCount] = useState<number>(0);
  const [clearing, setClearing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/hc-deposits", {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      setRequests(data);
    } catch {
      setRequests([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadOldCount = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/hc-deposits/old-images/count", {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const d = await res.json();
      setOldImageCount(d.count ?? 0);
    } catch {
      setOldImageCount(0);
    }
  }, []);

  async function handleClearOldImages() {
    if (oldImageCount === 0) return;
    const confirmed = window.confirm(
      `This will remove the screenshot images from ${oldImageCount} deposit record${oldImageCount !== 1 ? "s" : ""} older than 10 days.\n\nThe records and their status will remain — only the image data will be deleted to save database space.\n\nContinue?`
    );
    if (!confirmed) return;
    setClearing(true);
    try {
      const res = await fetch("/api/admin/hc-deposits/old-images", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const d = await res.json();
      alert(`Done — cleared images from ${d.cleared} record${d.cleared !== 1 ? "s" : ""}.`);
      await Promise.all([load(), loadOldCount()]);
    } catch {
      alert("Failed to clear old images. Please try again.");
    } finally {
      setClearing(false);
    }
  }

  useEffect(() => { load(); loadOldCount(); }, [load, loadOldCount]);

  const filtered = filter === "all" ? requests : requests.filter(r => r.status === filter);

  async function handleReject(req: HcRequest) {
    if (!confirm(`Reject WTA deposit request from ${req.userName}?`)) return;
    setRejectingId(req.id);
    try {
      await rejectRequest(req.id);
      await load();
    } catch (err: any) {
      alert(err.message || "Failed to reject");
    } finally {
      setRejectingId(null);
    }
  }

  const counts = {
    all: requests.length,
    pending: requests.filter(r => r.status === "pending").length,
    approved: requests.filter(r => r.status === "approved").length,
    rejected: requests.filter(r => r.status === "rejected").length,
  };

  return (
    <div className="px-4 py-6 max-w-4xl mx-auto space-y-5 pb-16">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
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
            WTA Deposits
          </h1>
          <p className="text-xs mt-1" style={{ color: "rgba(176,255,224,0.4)" }}>
            Review and credit WTA deposit requests
          </p>
        </div>
        <div className="flex items-center gap-2">
          {oldImageCount > 0 && (
            <button
              onClick={handleClearOldImages}
              disabled={clearing}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all hover:brightness-125"
              style={{
                background: "rgba(248,113,113,0.10)",
                border: "1px solid rgba(248,113,113,0.30)",
                color: "#f87171",
                opacity: clearing ? 0.5 : 1,
              }}
            >
              <Trash2 size={12} />
              {clearing ? "Clearing..." : `Clear Old Images (${oldImageCount})`}
            </button>
          )}
          <button
            onClick={() => { load(); loadOldCount(); }}
            className="w-9 h-9 rounded-xl flex items-center justify-center transition-all hover:brightness-125"
            style={{ background: "rgba(0,255,148,0.08)", border: "1px solid rgba(0,255,148,0.18)", color: TEAL }}
          >
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {(["all", "pending", "approved", "rejected"] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold capitalize transition-all"
            style={{
              background: filter === tab
                ? tab === "pending" ? "rgba(251,191,36,0.18)" : tab === "approved" ? "rgba(52,211,153,0.18)" : tab === "rejected" ? "rgba(248,113,113,0.18)" : "rgba(0,255,148,0.18)"
                : "rgba(176,255,224,0.05)",
              border: filter === tab
                ? tab === "pending" ? "1px solid rgba(251,191,36,0.4)" : tab === "approved" ? "1px solid rgba(52,211,153,0.4)" : tab === "rejected" ? "1px solid rgba(248,113,113,0.4)" : "1px solid rgba(0,255,148,0.4)"
                : "1px solid rgba(176,255,224,0.08)",
              color: filter === tab
                ? tab === "pending" ? "#fbbf24" : tab === "approved" ? "#34d399" : tab === "rejected" ? "#f87171" : TEAL
                : "rgba(176,255,224,0.45)",
            }}
          >
            {tab} ({counts[tab]})
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="text-center py-12">
          <RefreshCw size={24} className="mx-auto animate-spin mb-3" style={{ color: "rgba(176,255,224,0.3)" }} />
          <p className="text-xs" style={{ color: "rgba(176,255,224,0.3)" }}>Loading...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl p-12 text-center" style={GLASS}>
          <CircleDollarSign size={32} className="mx-auto mb-3" style={{ color: "rgba(176,255,224,0.15)" }} />
          <p className="text-sm" style={{ color: "rgba(176,255,224,0.3)" }}>No {filter !== "all" ? filter : ""} WTA deposit requests</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(req => {
            const cfg = STATUS_CFG[req.status] ?? STATUS_CFG.pending;
            const Icon = cfg.icon;
            return (
              <div
                key={req.id}
                className="rounded-2xl p-4"
                style={GLASS}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                      style={{ background: `${PURPLE}12`, border: `1px solid ${PURPLE}28` }}
                    >
                      <CircleDollarSign size={16} style={{ color: PURPLE }} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate" style={{ color: "rgba(176,255,224,0.85)" }}>
                        {req.userName}
                      </div>
                      <div className="text-xs truncate" style={{ color: "rgba(176,255,224,0.4)" }}>{req.userEmail}</div>
                      <div className="flex items-center gap-1.5 mt-1">
                        <Icon size={10} style={{ color: cfg.color }} />
                        <span className="text-xs font-semibold" style={{ color: cfg.color }}>{cfg.label}</span>
                        {req.amount && (
                          <>
                            <span style={{ color: "rgba(176,255,224,0.25)" }}>·</span>
                            <span className="text-xs font-bold" style={{ color: PURPLE }}>${parseFloat(req.amount).toFixed(2)} WTA</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="text-xs" style={{ color: "rgba(176,255,224,0.3)" }}>
                      {formatDate(req.createdAt)}
                    </div>
                    <div className="text-xs font-mono mt-0.5" style={{ color: "rgba(176,255,224,0.4)" }}>
                      {req.referralCode}
                    </div>
                  </div>
                </div>

                {req.note && (
                  <div className="mt-3 text-xs px-3 py-2 rounded-xl" style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.18)", color: "#f87171" }}>
                    Note: {req.note}
                  </div>
                )}

                <div className="flex items-center gap-2 mt-3">
                  {req.screenshotUrl ? (
                    <button
                      onClick={() => setScreenshotUrl(req.screenshotUrl)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all hover:brightness-125"
                      style={{ background: "rgba(0,255,148,0.08)", border: "1px solid rgba(0,255,148,0.18)", color: TEAL }}
                    >
                      <Eye size={12} />
                      Screenshot
                    </button>
                  ) : (
                    <span
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold"
                      style={{ background: "rgba(176,255,224,0.04)", border: "1px solid rgba(176,255,224,0.08)", color: "rgba(176,255,224,0.25)" }}
                    >
                      <Eye size={12} />
                      Image Cleared
                    </span>
                  )}

                  {req.status === "pending" && (
                    <>
                      <button
                        onClick={() => setApproveTarget(req)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all hover:brightness-125"
                        style={{ background: "rgba(52,211,153,0.12)", border: "1px solid rgba(52,211,153,0.3)", color: "#34d399" }}
                      >
                        <Check size={12} />
                        Approve
                      </button>
                      <button
                        onClick={() => handleReject(req)}
                        disabled={rejectingId === req.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all hover:brightness-125"
                        style={{ background: "rgba(248,113,113,0.10)", border: "1px solid rgba(248,113,113,0.28)", color: "#f87171", opacity: rejectingId === req.id ? 0.5 : 1 }}
                      >
                        <Ban size={12} />
                        {rejectingId === req.id ? "..." : "Reject"}
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {screenshotUrl && (
        <ScreenshotModal url={screenshotUrl} onClose={() => setScreenshotUrl(null)} />
      )}

      {approveTarget && (
        <ApproveModal
          request={approveTarget}
          onClose={() => setApproveTarget(null)}
          onDone={load}
        />
      )}
    </div>
  );
}
