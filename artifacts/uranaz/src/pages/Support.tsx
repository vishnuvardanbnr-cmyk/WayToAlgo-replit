import { useState, useEffect, useRef, useCallback } from "react";
import { MessageCircle, Plus, Send, ChevronLeft, Clock, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
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
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

interface Ticket { id: number; subject: string; status: string; createdAt: string; updatedAt: string; }
interface Message { id: number; ticketId: number; senderName: string; isAdmin: boolean; message: string; createdAt: string; }

export default function Support({ user }: { user: any }) {
  const { toast } = useToast();
  const [view, setView] = useState<"list" | "chat" | "new">("list");
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [activeTicket, setActiveTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [newSubject, setNewSubject] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [creating, setCreating] = useState(false);
  const [loadingTickets, setLoadingTickets] = useState(true);
  const [wsReady, setWsReady] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadTickets = useCallback(async () => {
    try {
      const res = await fetch("/api/support/tickets", { headers: { Authorization: `Bearer ${getToken()}` } });
      if (res.ok) setTickets(await res.json());
    } finally {
      setLoadingTickets(false);
    }
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
        setTickets(prev => prev.map(t => t.id === data.ticket.id ? data.ticket : t));
      }
    };

    return () => { ws.close(); };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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

  const createTicket = async () => {
    if (!newSubject.trim()) { toast({ title: "Subject required", variant: "destructive" }); return; }
    setCreating(true);
    try {
      const res = await fetch("/api/support/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ subject: newSubject, message: newMessage }),
      });
      if (!res.ok) throw new Error((await res.json()).message);
      const ticket = await res.json();
      setTickets(prev => [ticket, ...prev]);
      setNewSubject(""); setNewMessage("");
      toast({ title: "Ticket created!", description: "Our support team will respond shortly." });
      openTicket(ticket);
    } catch (err: any) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="px-4 py-6 max-w-2xl mx-auto pb-24 md:pb-8 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {(view === "chat" || view === "new") && (
            <button onClick={() => { setView("list"); setActiveTicket(null); }} style={{ color: "rgba(194,210,255,0.5)" }}>
              <ChevronLeft size={20} />
            </button>
          )}
          <h1 className="text-xl font-bold" style={{
            fontFamily: "'Sora', sans-serif",
            background: "linear-gradient(135deg, #C2D2FF, #5B8CFF)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
          }}>
            {view === "list" ? "Support" : view === "new" ? "New Ticket" : activeTicket?.subject}
          </h1>
        </div>
        {view === "list" && (
          <button
            onClick={() => setView("new")}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold"
            style={{ background: "linear-gradient(135deg, #5B8CFF, #3D5CE0)", color: "#060814" }}
          >
            <Plus size={15} /> New Ticket
          </button>
        )}
      </div>

      {/* LIST VIEW */}
      {view === "list" && (
        <>
          {loadingTickets ? (
            <div className="space-y-3">
              {[1,2,3].map(i => <div key={i} className="h-16 rounded-xl animate-pulse" style={{ background: "rgba(91,140,255,0.04)", border: "1px solid rgba(91,140,255,0.08)" }} />)}
            </div>
          ) : tickets.length === 0 ? (
            <div className="rounded-2xl p-12 text-center" style={GLASS}>
              <MessageCircle size={36} className="mx-auto mb-3" style={{ color: "rgba(194,210,255,0.2)" }} />
              <p className="font-semibold text-sm" style={{ color: "rgba(194,210,255,0.5)" }}>No support tickets yet</p>
              <p className="text-xs mt-1" style={{ color: "rgba(194,210,255,0.3)" }}>Create a ticket and our team will help you</p>
            </div>
          ) : (
            <div className="space-y-2">
              {tickets.map(ticket => {
                const cfg = statusConfig[ticket.status] || statusConfig.open;
                return (
                  <button
                    key={ticket.id}
                    onClick={() => openTicket(ticket)}
                    className="w-full text-left rounded-xl px-4 py-3.5 flex items-center gap-3 transition-all"
                    style={{ ...GLASS }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = "rgba(91,140,255,0.22)")}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = "rgba(91,140,255,0.10)")}
                  >
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: cfg.bg, border: `1px solid ${cfg.color}33` }}>
                      <cfg.icon size={16} style={{ color: cfg.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold truncate" style={{ color: "rgba(194,210,255,0.85)" }}>{ticket.subject}</div>
                      <div className="text-xs" style={{ color: "rgba(194,210,255,0.35)" }}>{formatDate(ticket.updatedAt)}</div>
                    </div>
                    <span className="text-xs font-semibold px-2 py-1 rounded-full shrink-0" style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.color}33` }}>
                      {cfg.label}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* NEW TICKET VIEW */}
      {view === "new" && (
        <div className="rounded-2xl p-5 space-y-4" style={GLASS}>
          <div>
            <label className="text-xs font-medium block mb-1.5" style={{ color: "rgba(194,210,255,0.5)" }}>Subject *</label>
            <input
              type="text"
              value={newSubject}
              onChange={e => setNewSubject(e.target.value)}
              placeholder="Describe your issue briefly"
              className="w-full rounded-xl px-3 py-2.5 text-sm focus:outline-none"
              style={{ background: "rgba(0,20,40,0.7)", border: "1px solid rgba(91,140,255,0.18)", color: "rgba(194,210,255,0.9)" }}
            />
          </div>
          <div>
            <label className="text-xs font-medium block mb-1.5" style={{ color: "rgba(194,210,255,0.5)" }}>Message (Optional)</label>
            <textarea
              value={newMessage}
              onChange={e => setNewMessage(e.target.value)}
              rows={4}
              placeholder="Provide more details..."
              className="w-full rounded-xl px-3 py-2.5 text-sm focus:outline-none resize-none"
              style={{ background: "rgba(0,20,40,0.7)", border: "1px solid rgba(91,140,255,0.18)", color: "rgba(194,210,255,0.9)" }}
            />
          </div>
          <button
            onClick={createTicket}
            disabled={creating}
            className="w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-60"
            style={{ background: "linear-gradient(135deg, #5B8CFF, #3D5CE0)", color: "#060814", boxShadow: "0 0 20px rgba(91,140,255,0.3)" }}
          >
            {creating ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            {creating ? "Creating..." : "Submit Ticket"}
          </button>
        </div>
      )}

      {/* CHAT VIEW */}
      {view === "chat" && activeTicket && (
        <div className="flex flex-col" style={{ height: "calc(100vh - 220px)", minHeight: "400px" }}>
          {/* Status badge */}
          <div className="flex items-center gap-2 mb-3">
            {(() => { const cfg = statusConfig[activeTicket.status] || statusConfig.open; return (
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.color}33` }}>
                {cfg.label}
              </span>
            ); })()}
            <span className="text-xs" style={{ color: "rgba(194,210,255,0.3)" }}>Ticket #{activeTicket.id}</span>
            <div className="ml-auto flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full" style={{ background: wsReady ? "#34d399" : "#6b7280" }} />
              <span className="text-xs" style={{ color: "rgba(194,210,255,0.3)" }}>{wsReady ? "Live" : "Connecting..."}</span>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto space-y-3 pr-1 mb-3">
            {messages.length === 0 && (
              <div className="text-center py-8">
                <p className="text-xs" style={{ color: "rgba(194,210,255,0.3)" }}>No messages yet. Start the conversation!</p>
              </div>
            )}
            {messages.map(msg => (
              <div key={msg.id} className={`flex ${msg.isAdmin ? "justify-start" : "justify-end"}`}>
                <div
                  className="max-w-xs rounded-2xl px-4 py-2.5 text-sm"
                  style={msg.isAdmin
                    ? { background: "rgba(91,140,255,0.10)", border: "1px solid rgba(91,140,255,0.18)", color: "rgba(194,210,255,0.9)", borderBottomLeftRadius: "4px" }
                    : { background: "linear-gradient(135deg, rgba(91,140,255,0.22), rgba(61,92,224,0.15))", border: "1px solid rgba(91,140,255,0.25)", color: "#C2D2FF", borderBottomRightRadius: "4px" }
                  }
                >
                  {msg.isAdmin && (
                    <div className="text-xs font-bold mb-1" style={{ color: TEAL }}>Support Team</div>
                  )}
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
              This ticket is closed
            </div>
          ) : (
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                placeholder="Type a message..."
                className="flex-1 rounded-xl px-4 py-2.5 text-sm focus:outline-none"
                style={{ background: "rgba(0,20,40,0.7)", border: "1px solid rgba(91,140,255,0.18)", color: "rgba(194,210,255,0.9)" }}
              />
              <button
                onClick={sendMessage}
                disabled={!input.trim() || !wsReady}
                className="w-11 h-11 rounded-xl flex items-center justify-center transition-all disabled:opacity-40"
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
