import { useState } from "react";
import {
  useListIncome,
  getListIncomeQueryKey,
} from "@workspace/api-client-react";
import Pagination from "@/components/Pagination";
import {
  DollarSign,
  TrendingUp,
  Users,
  Award,
  X,
  Hash,
  Calendar,
  ArrowDownLeft,
  Tag,
  Receipt,
} from "lucide-react";

const TEAL = "#00FF94";
const GLASS = {
  background: "rgba(10,14,30,0.65)",
  backdropFilter: "blur(14px)",
  border: "1px solid rgba(0,255,148,0.10)",
} as const;

const typeFilters = [
  { value: "",                 label: "All"        },
  { value: "daily_return",     label: "Daily"      },
  { value: "spot_referral",    label: "Referral"   },
  { value: "level_commission", label: "Commission" },
  { value: "rank_bonus",       label: "Rank Bonus" },
];

const typeConfig: Record<string, { icon: any; color: string; label: string }> = {
  daily_return:     { icon: TrendingUp, color: "#34d399", label: "Daily Return"      },
  spot_referral:    { icon: Users,      color: "#60a5fa", label: "Spot Referral"     },
  level_commission: { icon: DollarSign, color: "#c084fc", label: "Level Commission"  },
  rank_bonus:       { icon: Award,      color: TEAL,      label: "Rank Bonus"        },
};

function formatDate(iso: string, full = false) {
  const d = new Date(iso);
  return full
    ? d.toLocaleString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function shortId(id: string | number) {
  return String(id).slice(0, 8).toUpperCase();
}

const TOKEN_TYPES = new Set(["daily_return", "level_commission"]);

function fmtAmount(type: string, amount: number) {
  return TOKEN_TYPES.has(type)
    ? `${amount.toFixed(4)} WTA`
    : `$${amount.toFixed(2)}`;
}

/* ─────────────────────────────────────────
   DETAIL MODAL
───────────────────────────────────────── */
function TxDetailModal({ record, onClose }: { record: any; onClose: () => void }) {
  const cfg = typeConfig[record.type] || { icon: DollarSign, color: TEAL, label: record.type };

  const rows = [
    { icon: Hash,          label: "Transaction ID", value: `#${shortId(record.id)}`,         mono: true  },
    { icon: Tag,           label: "Type",           value: cfg.label,                        mono: false },
    { icon: Calendar,      label: "Date & Time",    value: formatDate(record.createdAt, true), mono: false },
    { icon: DollarSign,    label: "Amount",         value: `+${fmtAmount(record.type, record.amount)}`,  mono: false },
    ...(record.description
      ? [{ icon: Receipt, label: "Description", value: record.description, mono: false }]
      : []),
    ...(record.fromUserName
      ? [{ icon: Users, label: "From", value: record.fromUserName, mono: false }]
      : []),
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3"
      style={{ background: "rgba(6,8,20,0.88)", backdropFilter: "blur(10px)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-3xl overflow-hidden"
        style={{
          background: "linear-gradient(170deg, rgba(4,16,32,0.99) 0%, rgba(2,10,22,0.99) 100%)",
          border: "1px solid rgba(0,255,148,0.16)",
          boxShadow: "0 8px 60px rgba(6,8,20,0.9), 0 0 0 1px rgba(0,255,148,0.06)",
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Top accent bar */}
        <div
          className="h-0.5 w-full"
          style={{ background: `linear-gradient(90deg, transparent, ${cfg.color}, transparent)` }}
        />

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-2xl flex items-center justify-center"
              style={{
                background: `linear-gradient(135deg, ${cfg.color}20, ${cfg.color}08)`,
                border: `1px solid ${cfg.color}30`,
                boxShadow: `0 0 16px ${cfg.color}15`,
              }}
            >
              <cfg.icon size={17} style={{ color: cfg.color }} />
            </div>
            <div>
              <div
                className="font-bold tracking-wide"
                style={{ color: "rgba(200,240,255,0.92)", fontFamily: "'Sora', sans-serif", fontSize: "0.78rem" }}
              >
                Transaction Details
              </div>
              <div className="flex items-center gap-1.5 mt-1">
                <div
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: cfg.color, boxShadow: `0 0 6px ${cfg.color}` }}
                />
                <span className="text-xs font-semibold" style={{ color: cfg.color }}>{cfg.label}</span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl flex items-center justify-center transition-all hover:brightness-125"
            style={{ background: "rgba(176,255,224,0.06)", border: "1px solid rgba(176,255,224,0.09)" }}
          >
            <X size={14} style={{ color: "rgba(176,255,224,0.45)" }} />
          </button>
        </div>

        {/* Amount hero */}
        <div
          className="mx-5 mb-5 rounded-2xl py-5 text-center"
          style={{
            background: `linear-gradient(135deg, ${cfg.color}10, ${cfg.color}04)`,
            border: `1px solid ${cfg.color}20`,
          }}
        >
          <div className="text-xs mb-2 uppercase tracking-widest" style={{ color: "rgba(176,255,224,0.35)" }}>
            Amount Received
          </div>
          <div
            className="font-black"
            style={{
              fontFamily: "'Sora', sans-serif",
              fontSize: "1.75rem",
              color: cfg.color,
              letterSpacing: "-0.01em",
              textShadow: `0 0 24px ${cfg.color}50`,
            }}
          >
            +{fmtAmount(record.type, record.amount)}
          </div>
        </div>

        {/* Divider */}
        <div className="mx-5 mb-4 h-px" style={{ background: "rgba(0,255,148,0.07)" }} />

        {/* Detail rows */}
        <div className="px-5 pb-6 space-y-0">
          {rows.map((row, i) => (
            <div
              key={row.label}
              className="flex items-center justify-between py-3"
              style={{ borderBottom: i < rows.length - 1 ? "1px solid rgba(0,255,148,0.05)" : "none" }}
            >
              <div className="flex items-center gap-2.5">
                <row.icon size={12} style={{ color: "rgba(176,255,224,0.28)" }} />
                <span className="text-xs" style={{ color: "rgba(176,255,224,0.42)" }}>{row.label}</span>
              </div>
              <span
                className="text-xs font-semibold text-right max-w-[55%] break-all leading-relaxed"
                style={{
                  color: row.label === "Amount"         ? cfg.color
                       : row.label === "Transaction ID" ? "rgba(176,255,224,0.55)"
                       : "rgba(200,240,255,0.85)",
                  fontFamily: row.mono ? "monospace" : "inherit",
                }}
              >
                {row.value}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────
   MAIN PAGE
───────────────────────────────────────── */
const PAGE_SIZE = 10;

export default function Transactions() {
  const [typeFilter, setTypeFilter] = useState("");
  const [page, setPage]             = useState(1);
  const [selected, setSelected]     = useState<any>(null);

  const params = typeFilter
    ? { type: typeFilter as any, page, limit: PAGE_SIZE }
    : { page, limit: PAGE_SIZE };

  const { data: incomeData, isLoading } = useListIncome(
    params,
    { query: { queryKey: getListIncomeQueryKey(params) } }
  );

  const total      = incomeData?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function changeFilter(f: string) {
    setTypeFilter(f);
    setPage(1);
  }

  return (
    <div className="px-4 py-6 max-w-2xl mx-auto space-y-5 pb-28 md:pb-8">
      {/* Header */}
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
        Transactions
      </h1>

      {/* Filter grid */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { value: "",                 label: "All",        icon: DollarSign, color: TEAL      },
          { value: "daily_return",     label: "Daily",      icon: TrendingUp, color: "#34d399" },
          { value: "spot_referral",    label: "Referral",   icon: Users,      color: "#60a5fa" },
          { value: "level_commission", label: "Commission", icon: DollarSign, color: "#c084fc" },
          { value: "rank_bonus",       label: "Rank Bonus", icon: Award,      color: TEAL      },
        ].map(f => {
          const active = typeFilter === f.value;
          return (
            <button
              key={f.value}
              onClick={() => changeFilter(f.value)}
              className="flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-xl text-xs font-semibold transition-all active:scale-[0.97]"
              style={active ? {
                background: `linear-gradient(135deg, ${f.color}22, ${f.color}0d)`,
                border: `1px solid ${f.color}50`,
                color: f.color,
                boxShadow: `0 0 14px ${f.color}20`,
              } : {
                background: "rgba(10,14,30,0.55)",
                border: "1px solid rgba(0,255,148,0.09)",
                color: "rgba(176,255,224,0.38)",
              }}
            >
              <f.icon size={11} style={active ? { color: f.color } : { color: "rgba(176,255,224,0.28)" }} />
              {f.label}
            </button>
          );
        })}
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-3">
          {[1,2,3,4,5].map(i => (
            <div
              key={i}
              className="rounded-2xl h-[76px] animate-pulse"
              style={{ background: "rgba(0,255,148,0.04)", border: "1px solid rgba(0,255,148,0.07)" }}
            />
          ))}
        </div>
      ) : !incomeData?.records?.length ? (
        <div className="rounded-2xl p-14 text-center" style={GLASS}>
          <ArrowDownLeft size={36} className="mx-auto mb-3" style={{ color: "rgba(176,255,224,0.12)" }} />
          <p className="text-sm" style={{ color: "rgba(176,255,224,0.28)" }}>No transactions yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {incomeData.records.map(record => {
            const cfg = typeConfig[record.type] || { icon: DollarSign, color: TEAL, label: record.type };
            return (
              <button
                key={record.id}
                onClick={() => setSelected(record)}
                className="w-full rounded-2xl px-4 py-4 flex items-center gap-3.5 text-left transition-all hover:brightness-110 active:scale-[0.99]"
                style={{ ...GLASS, cursor: "pointer" }}
              >
                {/* Icon */}
                <div
                  className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0"
                  style={{
                    background: `linear-gradient(135deg, ${cfg.color}18, ${cfg.color}08)`,
                    border: `1px solid ${cfg.color}30`,
                    boxShadow: `0 0 14px ${cfg.color}12`,
                  }}
                >
                  <cfg.icon size={17} style={{ color: cfg.color }} />
                </div>

                {/* Middle content */}
                <div className="flex-1 min-w-0">
                  {/* Type label */}
                  <div
                    className="text-xs font-bold uppercase tracking-wider mb-0.5"
                    style={{ color: cfg.color, letterSpacing: "0.06em" }}
                  >
                    {cfg.label}
                  </div>
                  {/* Description — single truncated line */}
                  {record.description && (
                    <div
                      className="text-sm font-medium truncate leading-snug"
                      style={{ color: "rgba(176,255,224,0.75)" }}
                    >
                      {record.description}
                    </div>
                  )}
                  {/* From user + date row */}
                  <div className="flex items-center gap-1.5 mt-1">
                    {record.fromUserName && (
                      <>
                        <span className="text-xs" style={{ color: "rgba(176,255,224,0.38)" }}>
                          {record.fromUserName}
                        </span>
                        <span style={{ color: "rgba(176,255,224,0.18)" }}>·</span>
                      </>
                    )}
                    <span className="text-xs" style={{ color: "rgba(176,255,224,0.3)" }}>
                      {formatDate(record.createdAt)}
                    </span>
                  </div>
                </div>

                {/* Amount */}
                <div className="shrink-0 text-right">
                  <div
                    className="font-black text-base"
                    style={{
                      color: cfg.color,
                      fontFamily: "'Sora', sans-serif",
                      textShadow: `0 0 12px ${cfg.color}40`,
                    }}
                  >
                    +{fmtAmount(record.type, record.amount)}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      <Pagination
        page={page}
        totalPages={totalPages}
        total={total}
        pageSize={PAGE_SIZE}
        onPrev={() => setPage(p => Math.max(1, p - 1))}
        onNext={() => setPage(p => Math.min(totalPages, p + 1))}
      />

      {/* Detail modal */}
      {selected && (
        <TxDetailModal record={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
