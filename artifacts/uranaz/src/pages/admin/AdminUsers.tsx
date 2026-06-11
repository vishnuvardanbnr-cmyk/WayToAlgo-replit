import { useEffect, useMemo, useState } from "react";
import { useListAdminUsers, useUpdateAdminUser, getListAdminUsersQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  Users, Search, CheckCircle, XCircle, Shield, Pencil, X,
  Wallet, ArrowDownToLine, ArrowLeftRight, TrendingUp, Save, Ban, AlertTriangle,
} from "lucide-react";
import { Input } from "@/components/ui/input";

const TEAL = "#5B8CFF";
const RED = "#f87171";
const GREEN = "#34d399";
const AMBER = "#fbbf24";
const GLASS = { background: "rgba(10,14,30,0.65)", backdropFilter: "blur(14px)", border: "1px solid rgba(91,140,255,0.10)" } as const;
const INPUT_STYLE = { background: "rgba(0,15,30,0.7)", border: "1px solid rgba(91,140,255,0.18)", color: "rgba(194,210,255,0.9)" };

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

type AdminUser = {
  id: number; name: string; email: string; phone: string; country?: string | null;
  walletAddress?: string | null; referralCode: string;
  isAdmin: boolean; isActive: boolean; isBlocked: boolean;
  withdrawalBlocked: boolean; p2pBlocked: boolean; investmentBlocked: boolean;
  blockReason?: string | null;
  withdrawalBlockReason?: string | null;
  p2pBlockReason?: string | null;
  investmentBlockReason?: string | null;
  walletBalance: number; hyperCoinBalance: number;
  totalInvested: number; totalEarnings: number;
  currentLevel: number; createdAt: string;
};

export default function AdminUsers() {
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const { data: users, isLoading } = useListAdminUsers();
  const queryClient = useQueryClient();

  const userList: AdminUser[] = (users as any)?.users ?? [];
  const filtered = useMemo(() => userList.filter(u =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    u.phone.includes(search) ||
    u.referralCode.toLowerCase().includes(search.toLowerCase())
  ), [userList, search]);

  const blockedCount = userList.filter(u => !u.isActive || u.withdrawalBlocked || u.p2pBlocked || u.investmentBlocked).length;

  return (
    <div className="px-4 py-6 max-w-4xl mx-auto space-y-5 pb-24 md:pb-8">
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
            Manage Users
          </h1>
          <p className="text-xs" style={{ color: "rgba(194,210,255,0.4)" }}>
            Edit profile · block withdrawals · block P2P · adjust balances
          </p>
        </div>
      </div>

      {/* Stat strip */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl p-3 text-center" style={GLASS}>
          <div className="text-lg font-bold" style={{ color: TEAL }}>{(users as any)?.total ?? userList.length}</div>
          <div className="text-xs" style={{ color: "rgba(194,210,255,0.4)" }}>Total</div>
        </div>
        <div className="rounded-xl p-3 text-center" style={GLASS}>
          <div className="text-lg font-bold" style={{ color: GREEN }}>{userList.filter(u => u.isActive).length}</div>
          <div className="text-xs" style={{ color: "rgba(194,210,255,0.4)" }}>Active</div>
        </div>
        <div className="rounded-xl p-3 text-center" style={GLASS}>
          <div className="text-lg font-bold" style={{ color: blockedCount > 0 ? AMBER : "rgba(194,210,255,0.5)" }}>{blockedCount}</div>
          <div className="text-xs" style={{ color: "rgba(194,210,255,0.4)" }}>Restricted</div>
        </div>
      </div>

      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "rgba(194,210,255,0.35)" }} />
        <Input
          data-testid="input-search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search name, email, phone, referral…"
          className="pl-9"
          style={INPUT_STYLE}
        />
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1,2,3,4].map(i => <div key={i} className="rounded-xl h-20 animate-pulse" style={{ background: "rgba(91,140,255,0.04)", border: "1px solid rgba(91,140,255,0.08)" }} />)}
        </div>
      ) : !filtered.length ? (
        <div className="rounded-xl p-8 text-center" style={GLASS}>
          <Users size={32} className="mx-auto mb-2" style={{ color: "rgba(194,210,255,0.2)" }} />
          <p className="text-sm" style={{ color: "rgba(194,210,255,0.35)" }}>No users found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(user => {
            const restricted = !user.isActive || user.withdrawalBlocked || user.p2pBlocked || user.investmentBlocked;
            return (
              <button
                key={user.id}
                data-testid={`row-user-${user.id}`}
                onClick={() => setEditing(user)}
                className="w-full text-left rounded-xl p-4 transition-all hover:brightness-110"
                style={GLASS}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center font-bold shrink-0"
                      style={{
                        background: "rgba(91,140,255,0.10)",
                        border: "1px solid rgba(91,140,255,0.2)",
                        color: TEAL,
                      }}
                    >
                      {user.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <div className="font-semibold text-sm truncate" style={{ color: "rgba(194,210,255,0.85)" }}>{user.name}</div>
                        {user.isAdmin && <Shield size={12} style={{ color: "#f97316" }} className="shrink-0" />}
                      </div>
                      <div className="text-xs truncate" style={{ color: "rgba(194,210,255,0.4)" }}>{user.email}</div>
                      <div className="text-xs" style={{ color: "rgba(194,210,255,0.3)" }}>{user.phone} · {user.country || "—"}</div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    {user.isBlocked ? (
                      <span className="flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full"
                        style={{ background: "rgba(248,113,113,0.15)", border: "1px solid rgba(248,113,113,0.4)", color: RED }}>
                        <Ban size={11} /> Blocked
                      </span>
                    ) : (
                      <span
                        className="flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full"
                        style={user.isActive ? {
                          background: "rgba(52,211,153,0.10)", border: "1px solid rgba(52,211,153,0.25)", color: GREEN,
                        } : {
                          background: "rgba(251,191,36,0.10)", border: "1px solid rgba(251,191,36,0.25)", color: AMBER,
                        }}
                      >
                        {user.isActive ? <CheckCircle size={11} /> : <XCircle size={11} />}
                        {user.isActive ? "Active" : "Inactive"}
                      </span>
                    )}
                    {restricted && !user.isBlocked && (
                      <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full"
                        style={{ background: "rgba(251,191,36,0.10)", border: "1px solid rgba(251,191,36,0.25)", color: AMBER }}>
                        <AlertTriangle size={10} />
                        {[user.withdrawalBlocked && "WD", user.p2pBlocked && "P2P", user.investmentBlocked && "INV"].filter(Boolean).join(" ")}
                      </span>
                    )}
                  </div>
                </div>
                <div
                  className="grid grid-cols-4 gap-2 mt-3 pt-3 text-center"
                  style={{ borderTop: "1px solid rgba(91,140,255,0.07)" }}
                >
                  <div>
                    <div className="font-semibold text-xs" style={{ color: "rgba(194,210,255,0.8)" }}>${user.walletBalance.toFixed(2)}</div>
                    <div className="text-[10px]" style={{ color: "rgba(194,210,255,0.35)" }}>USDT</div>
                  </div>
                  <div>
                    <div className="font-semibold text-xs" style={{ color: "rgba(194,210,255,0.8)" }}>${user.totalInvested.toFixed(0)}</div>
                    <div className="text-[10px]" style={{ color: "rgba(194,210,255,0.35)" }}>Invested</div>
                  </div>
                  <div>
                    <div className="font-semibold text-xs" style={{ color: "rgba(194,210,255,0.8)" }}>L{user.currentLevel}</div>
                    <div className="text-[10px]" style={{ color: "rgba(194,210,255,0.35)" }}>Level</div>
                  </div>
                  <div className="flex items-center justify-center">
                    <span className="flex items-center gap-1 text-xs font-semibold" style={{ color: TEAL }}>
                      <Pencil size={11} /> Edit
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {editing && (
        <EditUserDrawer
          user={editing}
          onClose={() => setEditing(null)}
          onSaved={async (updated?: AdminUser) => {
            if (updated) setEditing(updated);
            await queryClient.refetchQueries({ queryKey: getListAdminUsersQueryKey(), exact: false });
            if (!updated) setEditing(null);
          }}
        />
      )}
    </div>
  );
}

/* ───────────────────────── Edit Drawer ───────────────────────── */

function EditUserDrawer({ user, onClose, onSaved }: { user: AdminUser; onClose: () => void; onSaved: (updated?: AdminUser) => void }) {
  const { toast } = useToast();
  const updateUser = useUpdateAdminUser();

  const [tab, setTab] = useState<"profile" | "access" | "balance">("profile");

  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [phone, setPhone] = useState(user.phone);
  const [country, setCountry] = useState(user.country ?? "");
  const [walletAddress, setWalletAddress] = useState(user.walletAddress ?? "");

  const [isActive, setIsActive] = useState(user.isActive);
  const [isBlocked, setIsBlocked] = useState(user.isBlocked);
  const [isAdmin, setIsAdmin] = useState(user.isAdmin);
  const [withdrawalBlocked, setWithdrawalBlocked] = useState(user.withdrawalBlocked);
  const [p2pBlocked, setP2pBlocked] = useState(user.p2pBlocked);
  const [investmentBlocked, setInvestmentBlocked] = useState(user.investmentBlocked);
  const [blockReason, setBlockReason] = useState(user.blockReason ?? "");
  const [withdrawalBlockReason, setWithdrawalBlockReason] = useState(user.withdrawalBlockReason ?? "");
  const [p2pBlockReason, setP2pBlockReason] = useState(user.p2pBlockReason ?? "");
  const [investmentBlockReason, setInvestmentBlockReason] = useState(user.investmentBlockReason ?? "");

  const [currentLevel, setCurrentLevel] = useState(user.currentLevel.toString());
  const [liveUser, setLiveUser] = useState(user);

  const [addBalModal, setAddBalModal] = useState(false);
  const [addBalCurrency, setAddBalCurrency] = useState<"usdt" | "hypercoin">("usdt");
  const [addBalAmount, setAddBalAmount] = useState("");
  const [addBalNote, setAddBalNote] = useState("");
  const [addBalLoading, setAddBalLoading] = useState(false);

  // Lock background scroll
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  function getToken() { return localStorage.getItem("waytoalgo_token") || ""; }

  async function handleSave() {
    const body: Record<string, unknown> = {};
    if (name !== user.name) body.name = name.trim();
    if (email !== user.email) body.email = email.trim();
    if (phone !== user.phone) body.phone = phone.trim();
    if ((country || null) !== (user.country || null)) body.country = country.trim() || null;
    if ((walletAddress || null) !== (user.walletAddress || null)) body.walletAddress = walletAddress.trim() || null;
    if (isActive !== user.isActive) body.isActive = isActive;
    if (isBlocked !== user.isBlocked) body.isBlocked = isBlocked;
    if (isAdmin !== user.isAdmin) body.isAdmin = isAdmin;
    if (withdrawalBlocked !== user.withdrawalBlocked) body.withdrawalBlocked = withdrawalBlocked;
    if (p2pBlocked !== user.p2pBlocked) body.p2pBlocked = p2pBlocked;
    if (investmentBlocked !== user.investmentBlocked) body.investmentBlocked = investmentBlocked;
    if ((blockReason || null) !== (user.blockReason || null)) body.blockReason = blockReason.trim() || null;
    if ((withdrawalBlockReason || null) !== (user.withdrawalBlockReason || null)) body.withdrawalBlockReason = withdrawalBlockReason.trim() || null;
    if ((p2pBlockReason || null) !== (user.p2pBlockReason || null)) body.p2pBlockReason = p2pBlockReason.trim() || null;
    if ((investmentBlockReason || null) !== (user.investmentBlockReason || null)) body.investmentBlockReason = investmentBlockReason.trim() || null;
    const lvl = parseInt(currentLevel, 10);
    if (!Number.isNaN(lvl) && lvl !== user.currentLevel) body.currentLevel = lvl;

    if (Object.keys(body).length === 0) {
      toast({ title: "No changes to save" });
      return;
    }

    try {
      const updated = await updateUser.mutateAsync({ id: user.id, data: body as any });
      toast({ title: "User updated" });
      onSaved(updated as unknown as AdminUser);
    } catch (err: any) {
      toast({
        title: "Update failed",
        description: err?.response?.data?.message ?? err?.message ?? "Try again",
        variant: "destructive",
      });
    }
  }

  async function handleAddBalance() {
    const amt = parseFloat(addBalAmount);
    if (!amt || amt <= 0) { toast({ title: "Enter a valid positive amount", variant: "destructive" }); return; }
    setAddBalLoading(true);
    try {
      const r = await fetch(`/api/admin/users/${user.id}/add-balance`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ currency: addBalCurrency, amount: amt, note: addBalNote.trim() || undefined }),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.message || "Failed"); }
      const updated = await r.json();
      setLiveUser(updated as AdminUser);
      toast({ title: "Balance added", description: `+${amt} ${addBalCurrency === "usdt" ? "USDT" : "HC"} credited` });
      setAddBalModal(false);
      setAddBalAmount("");
      setAddBalNote("");
      onSaved(updated as AdminUser);
    } catch (err: any) {
      toast({ title: "Failed", description: err?.message ?? "Try again", variant: "destructive" });
    } finally {
      setAddBalLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center" style={{ background: "rgba(0,5,15,0.75)", backdropFilter: "blur(6px)" }} onClick={onClose}>
      <div
        data-testid="drawer-edit-user"
        onClick={e => e.stopPropagation()}
        className="w-full md:max-w-lg max-h-[92vh] md:max-h-[85vh] rounded-t-2xl md:rounded-2xl overflow-hidden flex flex-col"
        style={{
          background: "rgba(5,15,28,0.96)",
          border: "1px solid rgba(91,140,255,0.18)",
          boxShadow: "0 -10px 60px rgba(91,140,255,0.10)",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid rgba(91,140,255,0.10)" }}>
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center font-bold shrink-0"
              style={{ background: "rgba(91,140,255,0.10)", border: "1px solid rgba(91,140,255,0.25)", color: TEAL }}
            >
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="font-semibold text-sm truncate" style={{ color: "rgba(194,210,255,0.9)" }}>{user.name}</div>
              <div className="text-xs truncate" style={{ color: "rgba(194,210,255,0.4)" }}>{user.email}</div>
            </div>
          </div>
          <button
            data-testid="button-close-drawer"
            onClick={onClose}
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}
          >
            <X size={16} style={{ color: "rgba(194,210,255,0.7)" }} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-3 pt-3">
          {([
            { id: "profile", label: "Profile" },
            { id: "access", label: "Access" },
            { id: "balance", label: "Balance" },
          ] as const).map(t => (
            <button
              key={t.id}
              data-testid={`tab-${t.id}`}
              onClick={() => setTab(t.id)}
              className="flex-1 text-xs font-semibold py-2 rounded-lg transition-all"
              style={tab === t.id ? {
                background: "rgba(91,140,255,0.15)",
                border: "1px solid rgba(91,140,255,0.35)",
                color: TEAL,
              } : {
                background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.05)",
                color: "rgba(194,210,255,0.55)",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {tab === "profile" && (
            <>
              <Field label="Full name">
                <Input data-testid="input-name" value={name} onChange={e => setName(e.target.value)} style={INPUT_STYLE} />
              </Field>
              <Field label="Email">
                <Input data-testid="input-email" value={email} onChange={e => setEmail(e.target.value)} style={INPUT_STYLE} type="email" />
              </Field>
              <Field label="Phone">
                <Input data-testid="input-phone" value={phone} onChange={e => setPhone(e.target.value)} style={INPUT_STYLE} />
              </Field>
              <Field label="Country">
                <Input data-testid="input-country" value={country} onChange={e => setCountry(e.target.value)} style={INPUT_STYLE} />
              </Field>
              <Field label="Withdrawal wallet (BEP20)" hint="Leave empty to clear. Format: 0x… 42 chars">
                <Input data-testid="input-wallet" value={walletAddress} onChange={e => setWalletAddress(e.target.value)} style={INPUT_STYLE} placeholder="0x…" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <ReadOnly label="Referral code" value={user.referralCode} />
                <ReadOnly label="Joined" value={formatDate(user.createdAt)} />
              </div>
            </>
          )}

          {tab === "access" && (
            <>
              <Toggle
                testId="toggle-blocked"
                label="Block Account"
                description="Blocked accounts cannot log in at all. Use this to suspend access entirely."
                icon={<Ban size={14} />}
                value={isBlocked}
                onChange={setIsBlocked}
              />
              <Toggle
                testId="toggle-active"
                label="Active Member"
                description="Marks this account as an active investing member. Does not affect login ability."
                icon={<CheckCircle size={14} />}
                value={isActive}
                onChange={setIsActive}
                positive
              />
              <div>
                <Toggle
                  testId="toggle-wd-blocked"
                  label="Block withdrawals"
                  description="User can browse but cannot submit any new withdrawal request."
                  icon={<ArrowDownToLine size={14} />}
                  value={withdrawalBlocked}
                  onChange={setWithdrawalBlocked}
                />
                {withdrawalBlocked && (
                  <div className="mt-2 ml-1">
                    <p className="text-[10px] mb-1" style={{ color: "rgba(194,210,255,0.4)" }}>Reason shown to user (optional)</p>
                    <input
                      data-testid="input-withdrawal-block-reason"
                      value={withdrawalBlockReason}
                      onChange={e => setWithdrawalBlockReason(e.target.value)}
                      className="w-full rounded-lg px-3 py-2 text-xs focus:outline-none"
                      style={INPUT_STYLE}
                      placeholder="e.g. Pending KYC verification"
                    />
                  </div>
                )}
              </div>
              <div>
                <Toggle
                  testId="toggle-p2p-blocked"
                  label="Block P2P transfers"
                  description="User cannot send USDT or HYPERCOIN to other users."
                  icon={<ArrowLeftRight size={14} />}
                  value={p2pBlocked}
                  onChange={setP2pBlocked}
                />
                {p2pBlocked && (
                  <div className="mt-2 ml-1">
                    <p className="text-[10px] mb-1" style={{ color: "rgba(194,210,255,0.4)" }}>Reason shown to user (optional)</p>
                    <input
                      data-testid="input-p2p-block-reason"
                      value={p2pBlockReason}
                      onChange={e => setP2pBlockReason(e.target.value)}
                      className="w-full rounded-lg px-3 py-2 text-xs focus:outline-none"
                      style={INPUT_STYLE}
                      placeholder="e.g. Suspicious activity detected"
                    />
                  </div>
                )}
              </div>
              <div>
                <Toggle
                  testId="toggle-invest-blocked"
                  label="Block new investments"
                  description="User cannot start new investment plans. Existing plans keep paying."
                  icon={<TrendingUp size={14} />}
                  value={investmentBlocked}
                  onChange={setInvestmentBlocked}
                />
                {investmentBlocked && (
                  <div className="mt-2 ml-1">
                    <p className="text-[10px] mb-1" style={{ color: "rgba(194,210,255,0.4)" }}>Reason shown to user (optional)</p>
                    <input
                      data-testid="input-investment-block-reason"
                      value={investmentBlockReason}
                      onChange={e => setInvestmentBlockReason(e.target.value)}
                      className="w-full rounded-lg px-3 py-2 text-xs focus:outline-none"
                      style={INPUT_STYLE}
                      placeholder="e.g. Account under review"
                    />
                  </div>
                )}
              </div>
              <Toggle
                testId="toggle-admin"
                label="Admin access"
                description="Grants full access to the admin dashboard."
                icon={<Shield size={14} />}
                value={isAdmin}
                onChange={setIsAdmin}
                warning
              />
            </>
          )}

          {tab === "balance" && (
            <>
              {/* Balance cards */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl p-3" style={{ background: "rgba(0,15,30,0.5)", border: "1px solid rgba(91,140,255,0.12)" }}>
                  <div className="text-[10px] uppercase tracking-wide mb-1" style={{ color: "rgba(194,210,255,0.4)" }}>Deposit Balance (USDT)</div>
                  <div className="text-lg font-bold" style={{ color: TEAL }}>${liveUser.walletBalance.toFixed(2)}</div>
                </div>
                <div className="rounded-xl p-3" style={{ background: "rgba(0,15,30,0.5)", border: "1px solid rgba(91,140,255,0.12)" }}>
                  <div className="text-[10px] uppercase tracking-wide mb-1" style={{ color: "rgba(194,210,255,0.4)" }}>Earnings Balance (USDT)</div>
                  <div className="text-lg font-bold" style={{ color: GREEN }}>${liveUser.totalEarnings.toFixed(2)}</div>
                </div>
                <div className="rounded-xl p-3" style={{ background: "rgba(0,15,30,0.5)", border: "1px solid rgba(167,139,250,0.18)" }}>
                  <div className="text-[10px] uppercase tracking-wide mb-1" style={{ color: "rgba(194,210,255,0.4)" }}>HyperCoin Balance</div>
                  <div className="text-lg font-bold" style={{ color: "#a78bfa" }}>{liveUser.hyperCoinBalance.toFixed(4)} HC</div>
                </div>
                <div className="rounded-xl p-3" style={{ background: "rgba(0,15,30,0.4)", border: "1px solid rgba(91,140,255,0.08)" }}>
                  <div className="text-[10px] uppercase tracking-wide mb-1" style={{ color: "rgba(194,210,255,0.4)" }}>Total Invested</div>
                  <div className="text-lg font-bold" style={{ color: "rgba(194,210,255,0.85)" }}>${liveUser.totalInvested.toFixed(2)}</div>
                </div>
              </div>

              {/* Add Balance button */}
              <button
                type="button"
                onClick={() => { setAddBalModal(true); setAddBalAmount(""); setAddBalNote(""); setAddBalCurrency("usdt"); }}
                className="w-full py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all"
                style={{ background: "linear-gradient(135deg, rgba(91,140,255,0.18), rgba(91,140,255,0.08))", border: "1px solid rgba(91,140,255,0.4)", color: TEAL }}
              >
                <Wallet size={14} /> Add Balance
              </button>

              {/* Current level */}
              <Field label="Current level">
                <Input
                  data-testid="input-level"
                  type="number"
                  step="1"
                  min="0"
                  value={currentLevel}
                  onChange={e => setCurrentLevel(e.target.value)}
                  style={INPUT_STYLE}
                />
              </Field>
            </>
          )}

          {/* Add Balance Modal */}
          {addBalModal && (
            <div
              className="fixed inset-0 z-[60] flex items-center justify-center"
              style={{ background: "rgba(0,5,15,0.8)", backdropFilter: "blur(8px)" }}
              onClick={() => setAddBalModal(false)}
            >
              <div
                className="w-full max-w-sm mx-4 rounded-2xl p-5 space-y-4"
                style={{ background: "rgba(5,15,28,0.98)", border: "1px solid rgba(91,140,255,0.22)", boxShadow: "0 0 40px rgba(91,140,255,0.12)" }}
                onClick={e => e.stopPropagation()}
              >
                <div>
                  <div className="font-bold text-sm mb-0.5" style={{ color: "rgba(194,210,255,0.9)" }}>Add Balance</div>
                  <div className="text-[11px]" style={{ color: "rgba(194,210,255,0.45)" }}>to {liveUser.name}</div>
                </div>

                <div>
                  <label className="text-xs font-semibold block mb-1.5" style={{ color: "rgba(194,210,255,0.6)" }}>Balance Type</label>
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      { val: "usdt" as const, label: "Deposit Balance (USDT)", color: TEAL },
                      { val: "hypercoin" as const, label: "HyperCoin Balance", color: "#a78bfa" },
                    ]).map(opt => (
                      <button
                        key={opt.val}
                        type="button"
                        onClick={() => setAddBalCurrency(opt.val)}
                        className="py-2 px-3 rounded-xl text-xs font-semibold transition-all text-left"
                        style={addBalCurrency === opt.val ? {
                          background: `${opt.color}18`,
                          border: `1px solid ${opt.color}55`,
                          color: opt.color,
                        } : {
                          background: "rgba(255,255,255,0.03)",
                          border: "1px solid rgba(255,255,255,0.08)",
                          color: "rgba(194,210,255,0.5)",
                        }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold block mb-1.5" style={{ color: "rgba(194,210,255,0.6)" }}>
                    Amount ({addBalCurrency === "usdt" ? "USDT" : "HC"})
                  </label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="0.00"
                    value={addBalAmount}
                    onChange={e => setAddBalAmount(e.target.value)}
                    style={INPUT_STYLE}
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold block mb-1.5" style={{ color: "rgba(194,210,255,0.6)" }}>Note (optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. Bonus credit, manual adjustment…"
                    value={addBalNote}
                    onChange={e => setAddBalNote(e.target.value)}
                    className="w-full rounded-xl px-3 py-2 text-xs focus:outline-none"
                    style={INPUT_STYLE}
                  />
                </div>

                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setAddBalModal(false)}
                    className="flex-1 py-2.5 rounded-xl text-sm font-medium"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(194,210,255,0.6)" }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleAddBalance}
                    disabled={addBalLoading}
                    className="flex-1 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50 transition-all"
                    style={{ background: "linear-gradient(135deg, #5B8CFF, #3D5CE0)", color: "#060814" }}
                  >
                    {addBalLoading ? "Adding…" : "Add Balance"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-5 py-4" style={{ borderTop: "1px solid rgba(91,140,255,0.10)" }}>
          <button
            data-testid="button-cancel"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(194,210,255,0.7)" }}
          >
            Cancel
          </button>
          <button
            data-testid="button-save"
            onClick={handleSave}
            disabled={updateUser.isPending}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, rgba(91,140,255,0.25), rgba(91,140,255,0.10))", border: "1px solid rgba(91,140,255,0.45)", color: TEAL }}
          >
            <Save size={14} />
            {updateUser.isPending ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ──────────── Small bits ──────────── */

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-semibold mb-1.5 block" style={{ color: "rgba(194,210,255,0.65)" }}>{label}</label>
      {children}
      {hint && <p className="text-[10px] mt-1" style={{ color: "rgba(194,210,255,0.35)" }}>{hint}</p>}
    </div>
  );
}

function ReadOnly({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl px-3 py-2" style={{ background: "rgba(0,15,30,0.4)", border: "1px solid rgba(91,140,255,0.08)" }}>
      <div className="text-[10px] uppercase tracking-wide" style={{ color: "rgba(194,210,255,0.35)" }}>{label}</div>
      <div className="text-sm font-medium truncate" style={{ color: "rgba(194,210,255,0.85)" }}>{value}</div>
    </div>
  );
}

function Toggle({
  testId, label, description, icon, value, onChange, positive, warning,
}: {
  testId: string; label: string; description?: string; icon?: React.ReactNode;
  value: boolean; onChange: (v: boolean) => void; positive?: boolean; warning?: boolean;
}) {
  // For "positive" toggles (like "Account active"), ON is good (teal/green).
  // For block toggles, ON means blocked → red. For admin, ON means admin → amber.
  const onColor = positive ? GREEN : warning ? AMBER : RED;
  const onBg = positive ? "rgba(52,211,153,0.18)" : warning ? "rgba(251,191,36,0.18)" : "rgba(248,113,113,0.18)";
  const onBorder = positive ? "rgba(52,211,153,0.45)" : warning ? "rgba(251,191,36,0.45)" : "rgba(248,113,113,0.45)";

  return (
    <div className="rounded-xl p-3 flex items-start gap-3" style={GLASS}>
      {icon && (
        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
          style={{ background: value ? onBg : "rgba(91,140,255,0.06)", border: `1px solid ${value ? onBorder : "rgba(91,140,255,0.15)"}`, color: value ? onColor : "rgba(194,210,255,0.5)" }}>
          {icon}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold" style={{ color: "rgba(194,210,255,0.9)" }}>{label}</div>
        {description && <div className="text-[11px] mt-0.5" style={{ color: "rgba(194,210,255,0.45)" }}>{description}</div>}
      </div>
      <button
        data-testid={testId}
        onClick={() => onChange(!value)}
        role="switch"
        aria-checked={value}
        className="relative w-11 h-6 rounded-full transition-all shrink-0"
        style={{
          background: value ? onBg : "rgba(255,255,255,0.06)",
          border: `1px solid ${value ? onBorder : "rgba(255,255,255,0.10)"}`,
        }}
      >
        <span
          className="absolute top-0.5 w-4 h-4 rounded-full transition-all"
          style={{
            left: value ? "22px" : "2px",
            background: value ? onColor : "rgba(194,210,255,0.5)",
            boxShadow: value ? `0 0 8px ${onColor}` : "none",
          }}
        />
      </button>
    </div>
  );
}
