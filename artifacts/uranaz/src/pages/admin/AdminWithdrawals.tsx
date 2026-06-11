import { useState } from "react";
import { useListAdminWithdrawals, useApproveWithdrawal, getListAdminWithdrawalsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Wallet, CheckCircle, XCircle, ExternalLink, Loader2, AlertCircle, MessageSquare } from "lucide-react";

const TEAL = "#5B8CFF";
const GLASS = { background: "rgba(10,14,30,0.65)", backdropFilter: "blur(14px)", border: "1px solid rgba(91,140,255,0.10)" } as const;

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const statusConfig: Record<string, { color: string; bg: string; label: string; icon: any }> = {
  pending:    { color: "#fbbf24", bg: "rgba(251,191,36,0.10)",  label: "Pending",    icon: AlertCircle },
  processing: { color: TEAL,      bg: "rgba(91,140,255,0.10)",  label: "Processing", icon: Loader2 },
  approved:   { color: "#34d399", bg: "rgba(52,211,153,0.10)",  label: "Approved",   icon: CheckCircle },
  rejected:   { color: "#f87171", bg: "rgba(248,113,113,0.10)", label: "Rejected",   icon: XCircle },
};

function getToken() {
  return localStorage.getItem("waytoalgo_token") || "";
}

export default function AdminWithdrawals() {
  const [filter, setFilter] = useState<"all" | "pending" | "processing" | "approved" | "rejected">("pending");
  const { data: withdrawals, isLoading } = useListAdminWithdrawals(
    filter === "all" ? undefined : { status: filter }
  );
  const approveWithdrawal = useApproveWithdrawal();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Rejection note state — keyed by withdrawal id
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [rejectLoading, setRejectLoading] = useState(false);

  const handleApprove = async (id: number) => {
    try {
      await approveWithdrawal.mutateAsync({ id });
      await queryClient.invalidateQueries({ queryKey: getListAdminWithdrawalsQueryKey() });
      toast({ title: "Processing withdrawal", description: "On-chain transaction initiated" });
    } catch (err: any) {
      toast({ title: "Failed", description: err?.message, variant: "destructive" });
    }
  };

  const startReject = (id: number) => {
    setRejectingId(id);
    setRejectNote("");
  };

  const cancelReject = () => {
    setRejectingId(null);
    setRejectNote("");
  };

  const confirmReject = async (id: number) => {
    setRejectLoading(true);
    try {
      await fetch(`/api/admin/withdrawals/${id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ note: rejectNote }),
      });
      await queryClient.invalidateQueries({ queryKey: getListAdminWithdrawalsQueryKey() });
      toast({ title: "Withdrawal rejected" });
      setRejectingId(null);
      setRejectNote("");
    } catch (err: any) {
      toast({ title: "Failed", description: err?.message, variant: "destructive" });
    } finally {
      setRejectLoading(false);
    }
  };

  const pendingCount = withdrawals?.filter(w => w.status === "pending").length ?? 0;
  const processingCount = withdrawals?.filter(w => (w as any).status === "processing").length ?? 0;

  return (
    <div className="px-4 py-6 max-w-4xl mx-auto space-y-5 pb-24 md:pb-8">
      <div className="flex items-center gap-3">
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
          Withdrawals
        </h1>
        {pendingCount > 0 && (
          <span className="text-xs px-2.5 py-1 rounded-full font-semibold"
            style={{ background: "rgba(251,191,36,0.10)", border: "1px solid rgba(251,191,36,0.22)", color: "#fbbf24" }}>
            {pendingCount} pending
          </span>
        )}
        {processingCount > 0 && (
          <span className="text-xs px-2.5 py-1 rounded-full font-semibold"
            style={{ background: "rgba(91,140,255,0.10)", border: "1px solid rgba(91,140,255,0.22)", color: TEAL }}>
            {processingCount} on-chain
          </span>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {(["all", "pending", "processing", "approved", "rejected"] as const).map(f => (
          <button
            key={f}
            data-testid={`filter-${f}`}
            onClick={() => setFilter(f)}
            className="shrink-0 px-3 py-2 rounded-lg text-xs font-medium transition-all capitalize"
            style={filter === f ? {
              background: "linear-gradient(135deg, #5B8CFF, #3D5CE0)",
              color: "#060814",
              fontWeight: 700,
            } : {
              ...GLASS,
              color: "rgba(194,210,255,0.45)",
            }}
          >
            {f}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => <div key={i} className="rounded-xl h-24 animate-pulse" style={{ background: "rgba(91,140,255,0.04)", border: "1px solid rgba(91,140,255,0.08)" }} />)}
        </div>
      ) : !withdrawals?.length ? (
        <div className="rounded-xl p-8 text-center" style={GLASS}>
          <Wallet size={32} className="mx-auto mb-2" style={{ color: "rgba(194,210,255,0.2)" }} />
          <p className="text-sm" style={{ color: "rgba(194,210,255,0.35)" }}>No {filter} withdrawals</p>
        </div>
      ) : (
        <div className="space-y-2">
          {withdrawals.map(w => {
            const cfg = statusConfig[(w as any).status] || statusConfig.pending;
            const txHash = (w as any).txHash;
            const processingError = (w as any).processingError;
            return (
              <div key={w.id} data-testid={`row-withdrawal-${w.id}`} className="rounded-xl p-4" style={GLASS}>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-sm" style={{ color: "rgba(194,210,255,0.85)" }}>
                      {(w as any).userName || "User"}
                    </div>
                    <div className="text-xs mt-0.5 font-mono truncate" style={{ color: "rgba(194,210,255,0.3)" }}>{w.walletAddress}</div>
                    {txHash && (
                      <a
                        href={`https://bscscan.com/tx/${txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs mt-1 font-mono"
                        style={{ color: TEAL }}
                      >
                        <ExternalLink size={10} />
                        {txHash.slice(0, 16)}…{txHash.slice(-8)}
                      </a>
                    )}
                    {processingError && !txHash && (
                      <div className="text-xs mt-1" style={{ color: "#f87171" }}>
                        Error: {processingError}
                      </div>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-bold" style={{ color: TEAL }}>${w.amount.toFixed(2)}</div>
                    <div className="text-xs" style={{ color: "rgba(194,210,255,0.35)" }}>{formatDate(w.createdAt)}</div>
                    <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full mt-1"
                      style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.color}33` }}>
                      {(w as any).status === "processing" && <Loader2 size={9} className="animate-spin" />}
                      {cfg.label}
                    </span>
                  </div>
                </div>

                {(w as any).status === "pending" ? (
                  <div className="pt-2" style={{ borderTop: "1px solid rgba(91,140,255,0.07)" }}>
                    {rejectingId === w.id ? (
                      <div className="space-y-2">
                        <div className="flex items-center gap-1.5 text-xs font-medium" style={{ color: "#f87171" }}>
                          <MessageSquare size={12} /> Rejection reason (shown to user)
                        </div>
                        <textarea
                          autoFocus
                          rows={2}
                          placeholder="e.g. Wallet address is invalid, please resubmit with a correct BEP-20 address."
                          value={rejectNote}
                          onChange={e => setRejectNote(e.target.value)}
                          className="w-full rounded-xl px-3 py-2 text-xs resize-none focus:outline-none"
                          style={{
                            background: "rgba(0,15,30,0.8)",
                            border: "1px solid rgba(248,113,113,0.3)",
                            color: "rgba(194,210,255,0.8)",
                          }}
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => confirmReject(w.id)}
                            disabled={rejectLoading}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold disabled:opacity-50"
                            style={{ background: "rgba(248,113,113,0.85)", color: "#fff" }}
                          >
                            {rejectLoading ? <Loader2 size={12} className="animate-spin" /> : <XCircle size={12} />}
                            Confirm Reject
                          </button>
                          <button
                            onClick={cancelReject}
                            className="px-4 py-2 rounded-lg text-xs font-medium"
                            style={{ background: "rgba(91,140,255,0.08)", border: "1px solid rgba(91,140,255,0.18)", color: "rgba(194,210,255,0.6)" }}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <button
                          data-testid={`button-approve-${w.id}`}
                          onClick={() => handleApprove(w.id)}
                          disabled={approveWithdrawal.isPending}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all disabled:opacity-50"
                          style={{ background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.2)", color: "#34d399" }}
                        >
                          <CheckCircle size={13} />
                          {approveWithdrawal.isPending ? "Sending…" : "Approve & Send"}
                        </button>
                        <button
                          data-testid={`button-reject-${w.id}`}
                          onClick={() => startReject(w.id)}
                          disabled={approveWithdrawal.isPending}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all disabled:opacity-50"
                          style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)", color: "#f87171" }}
                        >
                          <XCircle size={13} /> Reject
                        </button>
                      </div>
                    )}
                  </div>
                ) : (w as any).status === "processing" ? (
                  <div className="flex items-center gap-2 pt-2 text-xs"
                    style={{ borderTop: "1px solid rgba(91,140,255,0.07)", color: TEAL }}>
                    <Loader2 size={12} className="animate-spin" />
                    Sending on-chain… will update automatically
                  </div>
                ) : (
                  <div className="mt-2 pt-2 flex items-center gap-1.5 text-xs font-semibold"
                    style={{ borderTop: "1px solid rgba(91,140,255,0.07)", color: cfg.color }}>
                    <cfg.icon size={12} />
                    {cfg.label}{w.processedAt ? ` · ${formatDate(w.processedAt)}` : ""}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
