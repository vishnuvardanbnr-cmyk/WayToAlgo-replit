import { ChevronLeft, ChevronRight } from "lucide-react";

const TEAL = "#00FF94";

interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPrev: () => void;
  onNext: () => void;
}

export default function Pagination({ page, totalPages, total, pageSize, onPrev, onNext }: PaginationProps) {
  if (totalPages <= 1) return null;

  const from = (page - 1) * pageSize + 1;
  const to   = Math.min(page * pageSize, total);

  return (
    <div className="flex items-center justify-between pt-1">
      {/* Count */}
      <span className="text-xs" style={{ color: "rgba(176,255,224,0.28)" }}>
        {from}–{to} of {total}
      </span>

      {/* Buttons */}
      <div className="flex items-center gap-2">
        <button
          onClick={onPrev}
          disabled={page <= 1}
          className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all disabled:opacity-30 disabled:cursor-not-allowed active:scale-[0.96]"
          style={{
            background: "rgba(10,14,30,0.7)",
            border: "1px solid rgba(0,255,148,0.12)",
            color: page > 1 ? TEAL : "rgba(176,255,224,0.25)",
          }}
        >
          <ChevronLeft size={13} />
          Prev
        </button>

        {/* Page indicator */}
        <div
          className="px-3 py-1.5 rounded-xl text-xs font-bold"
          style={{
            background: "linear-gradient(135deg, rgba(0,255,148,0.12), rgba(0,204,119,0.06))",
            border: "1px solid rgba(0,255,148,0.22)",
            color: TEAL,
            fontFamily: "'Sora', sans-serif",
            minWidth: "4rem",
            textAlign: "center",
          }}
        >
          {page} / {totalPages}
        </div>

        <button
          onClick={onNext}
          disabled={page >= totalPages}
          className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all disabled:opacity-30 disabled:cursor-not-allowed active:scale-[0.96]"
          style={{
            background: "rgba(10,14,30,0.7)",
            border: "1px solid rgba(0,255,148,0.12)",
            color: page < totalPages ? TEAL : "rgba(176,255,224,0.25)",
          }}
        >
          Next
          <ChevronRight size={13} />
        </button>
      </div>
    </div>
  );
}
