import { useState, useEffect, useRef, useCallback } from "react";
import { MessageCircle, ChevronLeft, Clock, CheckCircle, AlertCircle, Send, Loader2, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const TEAL = "#5B8CFF";
const GLASS = { background: "rgba(10,14,30,0.65)", backdropFilter: "blur(14px)", border: "1px solid rgba(91,140,255,0.10)" } as const;

function getToken() { return localStorage.getItem("waytoalgo_token") || ""; }

function getWsUrl() {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/api/ws?token=${getToken()}`;
}

const statusConfig: Record<string, { color: string; bg: string; label: string; icon: any }> = {
  open:        { color: TEAL,       bg: "rgba(91,140,255,0.10)",  label: "Open",        icon: AlertCircle },
  in_progress: { color: "#fbbf24",  bg: "rgba(251,191,36,0.10)",  label: "In Progress", icon: Clock },
  closed:      { color: "#6b7280",  bg: "rgba(107,114,128,0.10)", label: "Closed",      icon: CheckCircle },
};

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

interface Ticket { id: number; userId: number; userName: string; userEmail: string; subject: string; status: string; createdAt: string; updatedAt: string; }
interface Message { id: number; ticketId: number; senderName: string; isAdmin: boolean; message: string; createdAt: string; }

export default function AdminSupport() {
  const { toast } = useToast();
  const [view, setView] = useState<"list" | "chat">("list");
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [activeTicket, setActiveTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [wsReady, setWsReady] = useState(false);
  const [filter, setFilter] = useState<"all" | "open" | "in_progress" | "closed">("all");
  const wsRef = useRef<WebSocket | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadTickets = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/support/tickets", { headers: { Authorization: `Bearer ${getToken()}` } });
      if (res.ok) setTickets(await res.json());
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadTickets(); }, [loadTickets]);

  useEffect(() => {
    const ws = new WebSocket(getWsUrl());
    wsRef.current = ws;
    ws.onopen = () => setWsReady(true);
    ws.onclose = () => setWsReady(false);
    ws.onerror = () => setWsReady(false);
    ws.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.type === "joined") {
        setMessages(data.messages);
        setActiveTicket(data.ticket);
      }
      if (data.type === "message") {
        setMessages(prev => [...prev, data.message]);
      }
      if (data.type === "ticket_update") {
        setActiveTicket(data.ticket);
        setTickets(prev => prev.map(t => t.id === data.ticket.id ? { ...t, ...data.ticket } : t));
      }
    };
    return () => { ws.close(); };
  }, []);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const openTicket = (ticket: Ticket) => {
    setActiveTicket(ticket);
    setView("chat");
    setMessages([]);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "join", ticketId: ticket.id }));
    }
  };

  const sendMessage = () => {
    const text = input.trim();
    if (!text || !activeTicket || activeTicket.status === "closed") return;
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "message", ticketId: activeTicket.id, text }));
      setInput("");
    }
  };

  const updateStatus = async (status: string) => {
    if (!activeTicket) return;
    const res = await fetch(`/api/admin/support/tickets/${activeTicket.id}/status`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      const updated = await res.json();
      setActiveTicket(updated);
      setTickets(prev => prev.map(t => t.id === updated.id ? updated : t));
      toast({ title: `Ticket ${status}` });
    }
  };

  const filtered = filter === "all" ? tickets : tickets.filter(t => t.status === filter);
  const counts = { open: tickets.filter(t => t.status === "open").length, in_progress: tickets.filter(t => t.status === "in_progress").length };

  return (
    <div className="px-4 py-6 max-w-2xl mx-auto pb-24 md:pb-8 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        {view === "chat" && (
          <button onClick={() => { setView("list"); setActiveTicket(null); }} style={{ color: "rgba(194,210,255,0.5)" }}>
            <ChevronLeft size={20} />
          </button>
        )}
        <div className="flex-1">
          <h1 className="text-xl font-bold" style={{
            fontFamily: "'Sora', sans-serif",
            background: "linear-gradient(135deg, #C2D2FF, #5B8CFF)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
          }}>
            {view === "list" ? "Support Tickets" : activeTicket?.subject}
          </h1>
          {view === "list" && (
            <p className="text-xs mt-0.5" style={{ color: "rgba(194,210,255,0.35)" }}>
              {counts.open} open · {counts.in_progress} in progress
            </p>
          )}
        </div>
      </div>

      {/* LIST VIEW */}
      {view === "list" && (
        <>
          {/* Filter tabs */}
          <div className="flex gap-2 flex-wrap">
            {(["all", "open", "in_progress", "closed"] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                style={{
                  background: filter === f ? "rgba(91,140,255,0.15)" : "rgba(0,15,30,0.5)",
                  border: filter === f ? "1px solid rgba(91,140,255,0.35)" : "1px solid rgba(91,140,255,0.08)",
                  color: filter === f ? TEAL : "rgba(194,210,255,0.45)",
                }}
              >
                {f === "all" ? `All (${tickets.length})` : f === "in_progress" ? "In Progress" : f.charAt(0).toUpperCase() + f.slice(1)}
                {f === "open" && counts.open > 0 && (
                  <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 text-[10px] rounded-full font-bold" style={{ background: TEAL, color: "#060814" }}>
                    {counts.open}
                  </span>
                )}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-18 rounded-xl animate-pulse" style={{ background: "rgba(91,140,255,0.04)", border: "1px solid rgba(91,140,255,0.08)" }} />)}</div>
          ) : filtered.length === 0 ? (
            <div className="rounded-2xl p-12 text-center" style={GLASS}>
              <MessageCircle size={36} className="mx-auto mb-3" style={{ color: "rgba(194,210,255,0.2)" }} />
              <p className="text-sm" style={{ color: "rgba(194,210,255,0.4)" }}>No tickets here</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map(ticket => {
                const cfg = statusConfig[ticket.status] || statusConfig.open;
                return (
                  <button
                    key={ticket.id}
                    onClick={() => openTicket(ticket)}
                    className="w-full text-left rounded-xl px-4 py-3.5 transition-all"
                    style={{ ...GLASS }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = "rgba(91,140,255,0.22)")}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = "rgba(91,140,255,0.10)")}
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5" style={{ background: cfg.bg, border: `1px solid ${cfg.color}33` }}>
                        <cfg.icon size={16} style={{ color: cfg.color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-sm font-semibold truncate" style={{ color: "rgba(194,210,255,0.85)" }}>{ticket.subject}</span>
                          <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full shrink-0" style={{ background: cfg.bg, color: cfg.color }}>
                            {cfg.label}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs" style={{ color: "rgba(194,210,255,0.35)" }}>
                          <Users size={10} />
                          <span>{ticket.userName}</span>
                          <span>·</span>
                          <span>{ticket.userEmail}</span>
                        </div>
                        <div className="text-xs mt-0.5" style={{ color: "rgba(194,210,255,0.25)" }}>
                          Updated {formatDate(ticket.updatedAt)}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* CHAT VIEW */}
      {view === "chat" && activeTicket && (
        <div className="flex flex-col" style={{ height: "calc(100vh - 240px)", minHeight: "400px" }}>
          {/* Ticket info + actions */}
          <div className="rounded-xl px-4 py-3 mb-3 flex items-center justify-between flex-wrap gap-2" style={{ background: "rgba(0,15,30,0.5)", border: "1px solid rgba(91,140,255,0.08)" }}>
            <div>
              <div className="text-xs" style={{ color: "rgba(194,210,255,0.4)" }}>{activeTicket.userName} · {activeTicket.userEmail}</div>
              <div className="flex items-center gap-2 mt-1">
                {(() => { const cfg = statusConfig[activeTicket.status]; return (
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.color}33` }}>
                    {cfg.label}
                  </span>
                ); })()}
                <div className="flex items-center gap-1">
                  <div className="w-1.5 h-1.5 rounded-full" style={{ background: wsReady ? "#34d399" : "#6b7280" }} />
                  <span className="text-xs" style={{ color: "rgba(194,210,255,0.3)" }}>{wsReady ? "Live" : "Offline"}</span>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              {activeTicket.status !== "in_progress" && activeTicket.status !== "closed" && (
                <button onClick={() => updateStatus("in_progress")} className="text-xs px-2.5 py-1.5 rounded-lg font-medium" style={{ background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.3)", color: "#fbbf24" }}>
                  In Progress
                </button>
              )}
              {activeTicket.status !== "closed" && (
                <button onClick={() => updateStatus("closed")} className="text-xs px-2.5 py-1.5 rounded-lg font-medium" style={{ background: "rgba(107,114,128,0.12)", border: "1px solid rgba(107,114,128,0.3)", color: "#9ca3af" }}>
                  Close
                </button>
              )}
              {activeTicket.status === "closed" && (
                <button onClick={() => updateStatus("open")} className="text-xs px-2.5 py-1.5 rounded-lg font-medium" style={{ background: "rgba(91,140,255,0.10)", border: "1px solid rgba(91,140,255,0.25)", color: TEAL }}>
                  Reopen
                </button>
              )}
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto space-y-3 pr-1 mb-3">
            {messages.length === 0 && (
              <div className="text-center py-8">
                <p className="text-xs" style={{ color: "rgba(194,210,255,0.3)" }}>No messages yet</p>
              </div>
            )}
            {messages.map(msg => (
              <div key={msg.id} className={`flex ${msg.isAdmin ? "justify-end" : "justify-start"}`}>
                <div
                  className="max-w-xs rounded-2xl px-4 py-2.5 text-sm"
                  style={msg.isAdmin
                    ? { background: "linear-gradient(135deg, rgba(91,140,255,0.22), rgba(61,92,224,0.15))", border: "1px solid rgba(91,140,255,0.25)", color: "#C2D2FF", borderBottomRightRadius: "4px" }
                    : { background: "rgba(91,140,255,0.06)", border: "1px solid rgba(91,140,255,0.12)", color: "rgba(194,210,255,0.85)", borderBottomLeftRadius: "4px" }
                  }
                >
                  <div className="text-xs font-bold mb-1" style={{ color: msg.isAdmin ? TEAL : "rgba(194,210,255,0.55)" }}>
                    {msg.isAdmin ? "You (Admin)" : msg.senderName}
                  </div>
                  <p style={{ wordBreak: "break-word" }}>{msg.message}</p>
                  <div className="text-xs mt-1 opacity-50">{formatTime(msg.createdAt)}</div>
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          {activeTicket.status === "closed" ? (
            <div className="rounded-xl p-3 text-center text-sm" style={{ background: "rgba(107,114,128,0.10)", border: "1px solid rgba(107,114,128,0.2)", color: "rgba(194,210,255,0.4)" }}>
              Ticket is closed — reopen to reply
            </div>
          ) : (
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                placeholder="Reply to user..."
                className="flex-1 rounded-xl px-4 py-2.5 text-sm focus:outline-none"
                style={{ background: "rgba(0,20,40,0.7)", border: "1px solid rgba(91,140,255,0.18)", color: "rgba(194,210,255,0.9)" }}
              />
              <button
                onClick={sendMessage}
                disabled={!input.trim() || !wsReady}
                className="w-11 h-11 rounded-xl flex items-center justify-center disabled:opacity-40"
                style={{ background: "linear-gradient(135deg, #5B8CFF, #3D5CE0)", color: "#060814" }}
              >
                <Send size={16} />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
