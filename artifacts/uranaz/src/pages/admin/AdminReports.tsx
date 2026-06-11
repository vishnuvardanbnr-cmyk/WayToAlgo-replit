import { useEffect, useState } from "react";
import {
  ArrowDownToLine, ArrowUpFromLine, Wallet as WalletIcon, Search, X,
  ChevronLeft, ChevronRight, ExternalLink, Calendar, Download, ShieldCheck,
  ArrowLeftRight, TrendingUp, PlusCircle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const TEAL = "#5B8CFF";
const GLASS = { background: "rgba(10,14,30,0.65)", backdropFilter: "blur(14px)", border: "1px solid rgba(91,140,255,0.10)" } as const;
const INPUT_STYLE = { background: "rgba(0,15,30,0.7)", border: "1px solid rgba(91,140,255,0.18)", color: "rgba(194,210,255,0.9)" };

type TabKey = "deposits" | "withdrawals" | "wallet-changes" | "p2p" | "income" | "balance-adjustments";

const tabs: Array<{ key: TabKey; label: string; icon: any; endpoint: string }> = [
  { key: "deposits",             label: "Deposits",           icon: ArrowDownToLine,  endpoint: "/api/admin/reports/deposits" },
  { key: "withdrawals",          label: "Withdrawals",        icon: ArrowUpFromLine,  endpoint: "/api/admin/reports/withdrawals" },
  { key: "wallet-changes",       label: "Wallet Changes",     icon: WalletIcon,       endpoint: "/api/admin/reports/wallet-changes" },
  { key: "p2p",                  label: "P2P Transfers",      icon: ArrowLeftRight,   endpoint: "/api/admin/reports/p2p" },
  { key: "income",               label: "Income",             icon: TrendingUp,       endpoint: "/api/admin/reports/income" },
  { key: "balance-adjustments",  label: "Admin Adjustments",  icon: PlusCircle,       endpoint: "/api/admin/reports/balance-adjustments" },
];

const STATUS_COLORS: Record<string, { color: string; bg: string }> = {
  credited:   { color: "#34d399", bg: "rgba(52,211,153,0.10)" },
  approved:   { color: "#34d399", bg: "rgba(52,211,153,0.10)" },
  pending:    { color: "#fbbf24", bg: "rgba(251,191,36,0.10)" },
  sweeping:   { color: TEAL,      bg: "rgba(91,140,255,0.10)" },
  processing: { color: TEAL,      bg: "rgba(91,140,255,0.10)" },
  rejected:   { color: "#f87171", bg: "rgba(248,113,113,0.10)" },
  failed:     { color: "#f87171", bg: "rgba(248,113,113,0.10)" },
};

const INCOME_TYPE_COLORS: Record<string, { color: string; bg: string; label: string }> = {
  daily_return:      { color: "#34d399", bg: "rgba(52,211,153,0.10)",  label: "Daily Return" },
  level_commission:  { color: TEAL,      bg: "rgba(91,140,255,0.10)",  label: "Level Comm." },
  spot_referral:     { color: "#fbbf24", bg: "rgba(251,191,36,0.10)",  label: "Spot Referral" },
  rank_bonus:        { color: "#a78bfa", bg: "rgba(167,139,250,0.10)", label: "Rank Bonus" },
};

function getToken() { return localStorage.getItem("waytoalgo_token") || ""; }

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function fmtMoney(n: number | undefined | null) {
  return `$${Number(n ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function shortAddr(addr: string | null | undefined) {
  if (!addr) return "—";
  return addr.length > 14 ? `${addr.slice(0, 8)}…${addr.slice(-6)}` : addr;
}

function StatCard({ label, value, sub, color = TEAL }: any) {
  return (
    <div className="rounded-xl p-3 sm:p-4" style={GLASS}>
      <div className="text-[11px] uppercase tracking-wider" style={{ color: "rgba(194,210,255,0.40)", letterSpacing: "0.08em" }}>{label}</div>
      <div className="font-bold text-base sm:text-lg mt-1" style={{ color }}>{value ?? "—"}</div>
      {sub && <div className="text-[11px] mt-0.5" style={{ color: "rgba(194,210,255,0.45)" }}>{sub}</div>}
    </div>
  );
}

function Pill({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <span className="text-[10px] sm:text-[11px] font-semibold px-2 py-0.5 rounded-full capitalize whitespace-nowrap" style={{ background: bg, color, border: `1px solid ${color}33` }}>
      {label}
    </span>
  );
}

function downloadCSV(filename: string, rows: any[]) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const escape = (v: any) => {
    if (v === null || v === undefined) return "";
    const s = String(v).replace(/"/g, '""');
    return /[",\n]/.test(s) ? `"${s}"` : s;
  };
  const csv = [headers.join(","), ...rows.map(r => headers.map(h => escape(r[h])).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function TxLink({ hash }: { hash: string }) {
  return (
    <a href={`https://bscscan.com/tx/${hash}`} target="_blank" rel="noopener noreferrer"
      className="inline-flex items-center gap-1 font-mono text-[11px] transition-opacity hover:opacity-70"
      style={{ color: TEAL }}>
      {shortAddr(hash)} <ExternalLink size={10} />
    </a>
  );
}

function UserCell({ name, email, id }: { name: string; email: string; id: number }) {
  return (
    <div>
      <div className="font-medium text-xs sm:text-sm" style={{ color: "rgba(194,210,255,0.9)" }}>{name}</div>
      <div className="text-[11px]" style={{ color: "rgba(194,210,255,0.45)" }}>{email} <span style={{ color: "rgba(194,210,255,0.25)" }}>#{id}</span></div>
    </div>
  );
}

function Th({ children, className = "" }: any) {
  return <th className={`text-left px-3 py-2 font-semibold text-[10px] uppercase tracking-wider whitespace-nowrap ${className}`}>{children}</th>;
}
function Tr({ children, testId }: any) {
  return <tr data-testid={testId} className="border-t transition-colors hover:bg-white/[0.02]" style={{ borderColor: "rgba(91,140,255,0.06)" }}>{children}</tr>;
}
function Td({ children, className = "" }: any) {
  return <td className={`px-3 py-2.5 align-middle ${className}`}>{children}</td>;
}

export default function AdminReports() {
  const { toast } = useToast();
  const [tab, setTab] = useState<TabKey>("deposits");
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [status, setStatus] = useState<string>("");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [otpOnly, setOtpOnly] = useState(false);
  const [currency, setCurrency] = useState<string>("");
  const [incomeType, setIncomeType] = useState<string>("");

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const tabConfig = tabs.find(t => t.key === tab)!;

  useEffect(() => { setPage(1); setStatus(""); setSearch(""); setOtpOnly(false); setCurrency(""); setIncomeType(""); setData(null); }, [tab]);

  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ page: String(page), limit: String(limit) });
        if (status) params.set("status", status);
        if (search.trim()) params.set("search", search.trim());
        if (from) params.set("from", from);
        if (to) params.set("to", to);
        if (tab === "wallet-changes" && otpOnly) params.set("otpOnly", "true");
        if ((tab === "p2p" || tab === "balance-adjustments") && currency) params.set("currency", currency);
        if (tab === "income" && incomeType) params.set("type", incomeType);

        const r = await fetch(`${tabConfig.endpoint}?${params.toString()}`, {
          headers: { Authorization: `Bearer ${getToken()}` },
        });
        if (!r.ok) throw new Error(await r.text() || "Failed to load");
        const json = await r.json();
        if (!cancelled) setData(json);
      } catch (e: any) {
        if (!cancelled) toast({ title: "Failed to load", description: e?.message, variant: "destructive" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchData();
    return () => { cancelled = true; };
  }, [tab, page, status, search, from, to, otpOnly, currency, incomeType, tabConfig.endpoint]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / limit)) : 1;
  const summary = data?.summary;
  const rows: any[] = data?.rows ?? [];

  const statusOptions: Record<TabKey, string[]> = {
    deposits: ["", "credited", "pending", "sweeping", "failed"],
    withdrawals: ["", "pending", "processing", "approved", "rejected"],
    "wallet-changes": [],
    p2p: [],
    income: [],
    "balance-adjustments": [],
  };

  const handleExport = async () => {
    if (!rows.length) { toast({ title: "Nothing to export" }); return; }
    const params = new URLSearchParams({ page: "1", limit: "10000" });
    if (status) params.set("status", status);
    if (search.trim()) params.set("search", search.trim());
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (tab === "wallet-changes" && otpOnly) params.set("otpOnly", "true");
    if ((tab === "p2p" || tab === "balance-adjustments") && currency) params.set("currency", currency);
    if (tab === "income" && incomeType) params.set("type", incomeType);
    try {
      const r = await fetch(`${tabConfig.endpoint}?${params.toString()}`, { headers: { Authorization: `Bearer ${getToken()}` } });
      const json = await r.json();
      const ts = new Date().toISOString().slice(0, 10);
      downloadCSV(`uranus-${tab}-${ts}.csv`, json.rows ?? []);
      toast({ title: "Exported", description: `${json.rows?.length ?? 0} rows` });
    } catch (e: any) {
      toast({ title: "Export failed", description: e?.message, variant: "destructive" });
    }
  };

  return (
    <div className="px-4 py-6 max-w-5xl mx-auto space-y-5 pb-24 md:pb-8">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ fontFamily: "'Sora', sans-serif", background: "linear-gradient(135deg, #C2D2FF, #5B8CFF)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
            Reports
          </h1>
          <p className="text-sm" style={{ color: "rgba(194,210,255,0.4)" }}>Transaction history, income records & balance adjustments</p>
        </div>
        <button
          onClick={handleExport}
          data-testid="button-export-csv"
          className="flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-lg transition-all"
          style={{ background: "rgba(91,140,255,0.10)", border: "1px solid rgba(91,140,255,0.25)", color: TEAL }}
        >
          <Download size={13} /> Export CSV
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
        {tabs.map(t => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              data-testid={`tab-${t.key}`}
              onClick={() => setTab(t.key)}
              className="shrink-0 flex items-center gap-2 px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all"
              style={active ? {
                background: "linear-gradient(135deg, #5B8CFF, #3D5CE0)",
                color: "#060814",
                boxShadow: "0 0 14px rgba(91,140,255,0.25)",
              } : { ...GLASS, color: "rgba(194,210,255,0.55)" }}
            >
              <t.icon size={14} /> {t.label}
            </button>
          );
        })}
      </div>

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
          {tab === "deposits" && (<>
            <StatCard label="Total Deposits"  value={summary.totalCount}       sub={fmtMoney(summary.totalAmount)}    color={TEAL} />
            <StatCard label="Credited"        value={summary.creditedCount}    sub={fmtMoney(summary.creditedAmount)} color="#34d399" />
            <StatCard label="Pending"         value={summary.pendingCount}                                            color="#fbbf24" />
            <StatCard label="Failed"          value={summary.failedCount}                                            color="#f87171" />
          </>)}
          {tab === "withdrawals" && (<>
            <StatCard label="Total Requests"  value={summary.totalCount}       sub={fmtMoney(summary.totalRequested)}  color={TEAL} />
            <StatCard label="Approved"        value={summary.approvedCount}    sub={fmtMoney(summary.approvedAmount)}  color="#34d399" />
            <StatCard label="Pending"         value={summary.pendingCount}     sub={fmtMoney(summary.pendingAmount)}   color="#fbbf24" />
            <StatCard label="Processing/Rej." value={`${summary.processingCount}/${summary.rejectedCount}`}           color="rgba(194,210,255,0.7)" />
          </>)}
          {tab === "wallet-changes" && (<>
            <StatCard label="Total Events"    value={summary.totalCount}       color={TEAL} />
            <StatCard label="Distinct Users"  value={summary.distinctUsers}    color="#a78bfa" />
            <StatCard label="Updates"         value={summary.updateCount}      sub="(non-initial)" color="#fbbf24" />
            <StatCard label="OTP Verified"    value={summary.otpVerifiedCount} color="#34d399" />
          </>)}
          {tab === "p2p" && (<>
            <StatCard label="Total Transfers" value={summary.totalCount}       sub={fmtMoney(summary.totalAmount)} color={TEAL} />
            <StatCard label="USDT"            value={summary.usdtCount}                                           color="#34d399" />
            <StatCard label="HYPERCOIN"       value={summary.hyperCount}                                          color="#a78bfa" />
          </>)}
          {tab === "income" && (<>
            <StatCard label="Total Records"   value={summary.totalCount}           sub={fmtMoney(summary.totalAmount)}       color={TEAL} />
            <StatCard label="Daily Returns"   value={summary.dailyReturnCount}     sub={fmtMoney(summary.dailyReturnAmount)} color="#34d399" />
            <StatCard label="Level Comm."     value={summary.levelCommCount}       sub={fmtMoney(summary.levelCommAmount)}   color={TEAL} />
            <StatCard label="Referral/Rank"   value={summary.spotReferralCount + summary.rankBonusCount} sub={fmtMoney(summary.spotReferralAmount + summary.rankBonusAmount)} color="#fbbf24" />
          </>)}
          {tab === "balance-adjustments" && (<>
            <StatCard label="Total Records"   value={summary.totalCount}           color={TEAL} />
            <StatCard label="USDT Added"      value={summary.usdtCount}            sub={fmtMoney(summary.totalUsdtAmount)}  color="#34d399" />
            <StatCard label="HC Added"        value={summary.hyperCount}           sub={`${(Number(summary.totalHyperAmount) || 0).toFixed(4)} HC`} color="#a78bfa" />
          </>)}
        </div>
      )}

      {/* Filters */}
      <div className="rounded-xl p-3 sm:p-4 space-y-3" style={GLASS}>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex-1 min-w-[180px] relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "rgba(194,210,255,0.35)" }} />
            <input
              data-testid="input-search"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search user, email…"
              className="w-full text-xs pl-8 pr-8 py-2 rounded-lg outline-none"
              style={INPUT_STYLE}
            />
            {search && (
              <button onClick={() => { setSearch(""); setPage(1); }} className="absolute right-2 top-1/2 -translate-y-1/2" style={{ color: "rgba(194,210,255,0.4)" }}>
                <X size={13} />
              </button>
            )}
          </div>

          {statusOptions[tab].length > 0 && (
            <select
              data-testid="select-status"
              value={status}
              onChange={e => { setStatus(e.target.value); setPage(1); }}
              className="text-xs px-3 py-2 rounded-lg outline-none capitalize"
              style={INPUT_STYLE}
            >
              {statusOptions[tab].map(s => <option key={s || "all"} value={s}>{s || "All statuses"}</option>)}
            </select>
          )}

          {tab === "wallet-changes" && (
            <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: "rgba(194,210,255,0.65)" }}>
              <input type="checkbox" checked={otpOnly} onChange={e => { setOtpOnly(e.target.checked); setPage(1); }} style={{ accentColor: TEAL }} />
              OTP-verified only
            </label>
          )}

          {tab === "p2p" && (
            <select value={currency} onChange={e => { setCurrency(e.target.value); setPage(1); }} className="text-xs px-3 py-2 rounded-lg outline-none" style={INPUT_STYLE}>
              <option value="">All currencies</option>
              <option value="usdt">USDT</option>
              <option value="hypercoin">HYPERCOIN</option>
            </select>
          )}

          {tab === "income" && (
            <select value={incomeType} onChange={e => { setIncomeType(e.target.value); setPage(1); }} className="text-xs px-3 py-2 rounded-lg outline-none" style={INPUT_STYLE}>
              <option value="">All types</option>
              <option value="daily_return">Daily Return</option>
              <option value="level_commission">Level Commission</option>
              <option value="spot_referral">Spot Referral</option>
              <option value="rank_bonus">Rank Bonus</option>
            </select>
          )}

          {tab === "balance-adjustments" && (
            <select value={currency} onChange={e => { setCurrency(e.target.value); setPage(1); }} className="text-xs px-3 py-2 rounded-lg outline-none" style={INPUT_STYLE}>
              <option value="">All types</option>
              <option value="usdt">USDT</option>
              <option value="hypercoin">HyperCoin</option>
            </select>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5" style={{ color: "rgba(194,210,255,0.5)" }}>
            <Calendar size={12} /> <span className="text-[11px]">From</span>
          </div>
          <input type="date" value={from} onChange={e => { setFrom(e.target.value); setPage(1); }} className="text-xs px-2 py-1.5 rounded-lg outline-none" style={INPUT_STYLE} />
          <span className="text-[11px]" style={{ color: "rgba(194,210,255,0.4)" }}>To</span>
          <input type="date" value={to} onChange={e => { setTo(e.target.value); setPage(1); }} className="text-xs px-2 py-1.5 rounded-lg outline-none" style={INPUT_STYLE} />
          {(from || to) && (
            <button onClick={() => { setFrom(""); setTo(""); setPage(1); }} className="text-[11px] underline" style={{ color: "rgba(194,210,255,0.45)" }}>Clear dates</button>
          )}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-2">
          {[1,2,3,4,5].map(i => (
            <div key={i} className="rounded-xl h-16 animate-pulse" style={{ background: "rgba(91,140,255,0.04)", border: "1px solid rgba(91,140,255,0.06)" }} />
          ))}
        </div>
      ) : !rows.length ? (
        <div className="rounded-xl p-10 text-center" style={GLASS}>
          <tabConfig.icon size={36} className="mx-auto mb-3" style={{ color: "rgba(194,210,255,0.18)" }} />
          <p className="text-sm" style={{ color: "rgba(194,210,255,0.4)" }}>No records found for the current filters</p>
        </div>
      ) : (
        <div className="rounded-xl overflow-hidden" style={GLASS}>
          <div className="overflow-x-auto">
            <table className="w-full text-xs sm:text-sm">
              <thead>
                <tr style={{ background: "rgba(91,140,255,0.05)", color: "rgba(194,210,255,0.55)" }}>
                  {tab === "deposits" && (<><Th>User</Th><Th>Amount</Th><Th>Status</Th><Th className="hidden sm:table-cell">TX Hash</Th><Th>Created</Th></>)}
                  {tab === "withdrawals" && (<><Th>User</Th><Th>Amount</Th><Th>Wallet</Th><Th>Status</Th><Th className="hidden sm:table-cell">TX Hash</Th><Th>Requested</Th></>)}
                  {tab === "wallet-changes" && (<><Th>User</Th><Th>Old → New</Th><Th>Type</Th><Th>OTP</Th><Th className="hidden sm:table-cell">IP</Th><Th>When</Th></>)}
                  {tab === "p2p" && (<><Th>Sender</Th><Th>Recipient</Th><Th>Amount</Th><Th>Currency</Th><Th>When</Th></>)}
                  {tab === "income" && (<><Th>User</Th><Th>Type</Th><Th>Amount</Th><Th className="hidden sm:table-cell">Description</Th><Th className="hidden sm:table-cell">From</Th><Th>Date</Th></>)}
                  {tab === "balance-adjustments" && (<><Th>User</Th><Th>Type</Th><Th>Amount</Th><Th>Added By</Th><Th className="hidden sm:table-cell">Note</Th><Th>Date</Th></>)}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  if (tab === "deposits") {
                    const cfg = STATUS_COLORS[r.status] || { color: "rgba(194,210,255,0.6)", bg: "rgba(194,210,255,0.05)" };
                    return (
                      <Tr key={r.id} testId={`row-deposit-${r.id}`}>
                        <Td><UserCell name={r.userName} email={r.userEmail} id={r.userId} /></Td>
                        <Td><span className="font-bold" style={{ color: TEAL }}>{fmtMoney(r.amount)}</span></Td>
                        <Td><Pill label={r.status} color={cfg.color} bg={cfg.bg} /></Td>
                        <Td className="hidden sm:table-cell">{r.txHash ? <TxLink hash={r.txHash} /> : <span style={{ color: "rgba(194,210,255,0.3)" }}>—</span>}</Td>
                        <Td><span style={{ color: "rgba(194,210,255,0.55)" }}>{fmtDate(r.createdAt)}</span></Td>
                      </Tr>
                    );
                  }
                  if (tab === "withdrawals") {
                    const cfg = STATUS_COLORS[r.status] || { color: "rgba(194,210,255,0.6)", bg: "rgba(194,210,255,0.05)" };
                    return (
                      <Tr key={r.id} testId={`row-withdrawal-${r.id}`}>
                        <Td><UserCell name={r.userName} email={r.userEmail} id={r.userId} /></Td>
                        <Td><span className="font-bold" style={{ color: TEAL }}>{fmtMoney(r.amount)}</span></Td>
                        <Td><span className="font-mono text-[11px]" style={{ color: "rgba(194,210,255,0.7)" }}>{shortAddr(r.walletAddress)}</span></Td>
                        <Td><Pill label={r.status} color={cfg.color} bg={cfg.bg} /></Td>
                        <Td className="hidden sm:table-cell">{r.txHash ? <TxLink hash={r.txHash} /> : <span style={{ color: "rgba(194,210,255,0.3)" }}>—</span>}</Td>
                        <Td><span style={{ color: "rgba(194,210,255,0.55)" }}>{fmtDate(r.createdAt)}</span></Td>
                      </Tr>
                    );
                  }
                  if (tab === "p2p") {
                    const isUsdt = r.currency === "usdt";
                    return (
                      <Tr key={r.id} testId={`row-p2p-${r.id}`}>
                        <Td><UserCell name={r.senderName} email={r.senderEmail} id={r.senderId} /></Td>
                        <Td><UserCell name={r.recipientName} email={r.recipientEmail} id={r.recipientId} /></Td>
                        <Td><span className="font-bold" style={{ color: TEAL }}>{fmtMoney(r.amount)}</span></Td>
                        <Td><Pill label={isUsdt ? "USDT" : "HYPERCOIN"} color={isUsdt ? "#34d399" : "#a78bfa"} bg={isUsdt ? "rgba(52,211,153,0.10)" : "rgba(167,139,250,0.10)"} /></Td>
                        <Td><span style={{ color: "rgba(194,210,255,0.55)" }}>{fmtDate(r.createdAt)}</span></Td>
                      </Tr>
                    );
                  }
                  if (tab === "income") {
                    const tc = INCOME_TYPE_COLORS[r.type] || { color: "rgba(194,210,255,0.6)", bg: "rgba(194,210,255,0.05)", label: r.type };
                    return (
                      <Tr key={r.id} testId={`row-income-${r.id}`}>
                        <Td><UserCell name={r.userName} email={r.userEmail} id={r.userId} /></Td>
                        <Td><Pill label={tc.label} color={tc.color} bg={tc.bg} /></Td>
                        <Td><span className="font-bold" style={{ color: "#34d399" }}>+{fmtMoney(r.amount)}</span></Td>
                        <Td className="hidden sm:table-cell"><span className="text-[11px]" style={{ color: "rgba(194,210,255,0.5)" }}>{r.description}</span></Td>
                        <Td className="hidden sm:table-cell">
                          {r.fromUserName ? <span className="text-[11px]" style={{ color: "rgba(194,210,255,0.6)" }}>{r.fromUserName}</span> : <span style={{ color: "rgba(194,210,255,0.25)" }}>—</span>}
                          {r.level != null && <span className="ml-1 text-[10px]" style={{ color: "rgba(194,210,255,0.35)" }}>(L{r.level})</span>}
                        </Td>
                        <Td><span style={{ color: "rgba(194,210,255,0.55)" }}>{fmtDate(r.createdAt)}</span></Td>
                      </Tr>
                    );
                  }
                  if (tab === "balance-adjustments") {
                    const isUsdt = r.currency === "usdt";
                    return (
                      <Tr key={r.id} testId={`row-adj-${r.id}`}>
                        <Td><UserCell name={r.userName} email={r.userEmail} id={r.userId} /></Td>
                        <Td><Pill label={isUsdt ? "USDT" : "HyperCoin"} color={isUsdt ? "#34d399" : "#a78bfa"} bg={isUsdt ? "rgba(52,211,153,0.10)" : "rgba(167,139,250,0.10)"} /></Td>
                        <Td><span className="font-bold" style={{ color: "#34d399" }}>+{isUsdt ? fmtMoney(r.amount) : `${r.amount} HC`}</span></Td>
                        <Td><span className="text-[11px]" style={{ color: "rgba(194,210,255,0.65)" }}>{r.adminName}</span></Td>
                        <Td className="hidden sm:table-cell"><span className="text-[11px]" style={{ color: "rgba(194,210,255,0.45)" }}>{r.note || "—"}</span></Td>
                        <Td><span style={{ color: "rgba(194,210,255,0.55)" }}>{fmtDate(r.createdAt)}</span></Td>
                      </Tr>
                    );
                  }
                  // wallet-changes
                  return (
                    <Tr key={r.id} testId={`row-walletchange-${r.id}`}>
                      <Td><UserCell name={r.userName} email={r.userEmail} id={r.userId} /></Td>
                      <Td>
                        <div className="font-mono text-[11px] leading-snug" style={{ color: "rgba(194,210,255,0.65)" }}>
                          {r.isInitialSetup ? <span style={{ color: "rgba(194,210,255,0.4)" }}>(initial setup)</span> : <span>{shortAddr(r.oldAddress)}</span>}
                          <div style={{ color: TEAL }}>→ {shortAddr(r.newAddress)}</div>
                        </div>
                      </Td>
                      <Td>{r.isInitialSetup ? <Pill label="initial" color="rgba(194,210,255,0.55)" bg="rgba(194,210,255,0.05)" /> : <Pill label="updated" color="#fbbf24" bg="rgba(251,191,36,0.10)" />}</Td>
                      <Td>
                        {r.otpVerified
                          ? <span className="inline-flex items-center gap-1 text-[11px] font-semibold" style={{ color: "#34d399" }}><ShieldCheck size={11} /> verified</span>
                          : <span className="text-[11px]" style={{ color: "rgba(194,210,255,0.35)" }}>—</span>}
                      </Td>
                      <Td className="hidden sm:table-cell"><span className="font-mono text-[11px]" style={{ color: "rgba(194,210,255,0.5)" }}>{r.ipAddress || "—"}</span></Td>
                      <Td><span style={{ color: "rgba(194,210,255,0.55)" }}>{fmtDate(r.createdAt)}</span></Td>
                    </Tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between px-3 py-2.5" style={{ borderTop: "1px solid rgba(91,140,255,0.08)" }}>
            <div className="text-[11px]" style={{ color: "rgba(194,210,255,0.45)" }}>
              {data ? `Page ${page} / ${totalPages} — ${data.total} total` : "—"}
            </div>
            <div className="flex items-center gap-1.5">
              <button
                disabled={page <= 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                className="p-1.5 rounded-md disabled:opacity-30 transition-all"
                style={{ background: "rgba(91,140,255,0.08)", border: "1px solid rgba(91,140,255,0.18)", color: TEAL }}
              >
                <ChevronLeft size={14} />
              </button>
              {/* Page number buttons */}
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let p: number;
                if (totalPages <= 5) p = i + 1;
                else if (page <= 3) p = i + 1;
                else if (page >= totalPages - 2) p = totalPages - 4 + i;
                else p = page - 2 + i;
                return (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className="w-7 h-7 rounded-md text-[11px] font-semibold transition-all"
                    style={page === p ? {
                      background: "linear-gradient(135deg, #5B8CFF, #3D5CE0)",
                      color: "#060814",
                    } : {
                      background: "rgba(91,140,255,0.06)",
                      border: "1px solid rgba(91,140,255,0.15)",
                      color: "rgba(194,210,255,0.6)",
                    }}
                  >
                    {p}
                  </button>
                );
              })}
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                className="p-1.5 rounded-md disabled:opacity-30 transition-all"
                style={{ background: "rgba(91,140,255,0.08)", border: "1px solid rgba(91,140,255,0.18)", color: TEAL }}
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
