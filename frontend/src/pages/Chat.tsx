import { useEffect, useRef, useState } from "react";
import { useParams, useOutletContext } from "react-router";
import { toast } from "react-toastify";
import { Send, Loader, CheckCircle, BarChart3 } from "lucide-react";
import * as api from "../lib/api";
import { ApiError } from "../lib/api";
import type {
  Message,
  Signal,
  AudienceEstimate,
  ConversationDetail,
} from "../lib/types";
import { SignalCard } from "../components/SignalCard";
import type { ConversationOutletContext } from "./ConversationLayout";

type Status = "BUILDING" | "CONFIRMED" | "SIZED";

export default function ChatPage() {
  const { id } = useParams<{ id: string }>();
  const { refreshList } = useOutletContext<ConversationOutletContext>();

  const [messages, setMessages] = useState<Message[]>([]);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [status, setStatus] = useState<Status>("BUILDING");
  const [estimate, setEstimate] = useState<AudienceEstimate | null>(null);

  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingConv, setLoadingConv] = useState(true);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load conversation on mount / id change
  useEffect(() => {
    if (!id) return;
    setLoadingConv(true);
    api
      .getConversation(id)
      .then((conv: ConversationDetail) => {
        setMessages(conv.messages);
        setSignals(conv.signals);
        setStatus(conv.status);
        setEstimate(conv.estimate);
      })
      .catch((err) => {
        if (!(err instanceof ApiError && err.status === 401)) {
          toast.error("Failed to load conversation");
        }
      })
      .finally(() => setLoadingConv(false));
  }, [id]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend(content: string) {
    if (!id || !content.trim() || sending) return;

    // Optimistic: add user message immediately
    const tempMsg: Message = {
      id: `temp-${Date.now()}`,
      conversationId: id,
      role: "USER",
      content: content.trim(),
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempMsg]);
    setInput("");
    setSending(true);

    try {
      const res = await api.sendMessage(id, content.trim());

      // Replace temp message with real one, add assistant reply
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== tempMsg.id),
        // The user message from the server isn't returned separately,
        // but our temp message content is correct — keep it with a real-looking id
        { ...tempMsg, id: `user-${Date.now()}` },
        res.message,
      ]);
      setSignals(res.signals);
      setStatus(res.status);
      if (res.estimate) {
        setEstimate(res.estimate);
      }

      // Refresh sidebar (title may have been generated)
      refreshList();
    } catch (err) {
      // Remove optimistic message on failure
      setMessages((prev) => prev.filter((m) => m.id !== tempMsg.id));
      setInput(content);
      const msg =
        err instanceof ApiError ? err.message : "Failed to send message";
      toast.error(msg);
    } finally {
      setSending(false);
    }
  }

  function handleConfirm() {
    handleSend("I confirm these signals");
  }

  function handleEstimate() {
    handleSend("Yes, estimate the audience size");
  }

  if (loadingConv) {
    return (
      <div className="page-center">
        <Loader size={24} className="spin" />
      </div>
    );
  }

  // ── Active conversation ──
  return (
    <div className="chat-layout">
      {/* ── Messages Panel ── */}
      <div className="chat-messages-panel">
        <div className="chat-messages">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`chat-bubble ${msg.role === "USER" ? "user" : "assistant"}`}
            >
              <div className="chat-bubble-role">
                {msg.role === "USER" ? "You" : "Agent"}
              </div>
              <div className="chat-bubble-content">{msg.content}</div>
            </div>
          ))}
          {sending && (
            <div className="chat-bubble assistant">
              <div className="chat-bubble-role">Agent</div>
              <div className="chat-bubble-content">
                <Loader size={16} className="spin" /> Thinking...
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* ── Input ── */}
        <div className="chat-input-row">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend(input);
              }
            }}
            placeholder="Describe your target audience..."
            disabled={sending}
          />
          <button
            onClick={() => handleSend(input)}
            disabled={sending || !input.trim()}
            title="Send"
          >
            <Send size={18} />
          </button>
        </div>
      </div>

      {/* ── Signals Panel ── */}
      <div className="signals-panel">
        <h3>Signals</h3>

        {signals.length === 0 && (
          <p className="signals-empty">
            No signals yet. Describe your target audience above.
          </p>
        )}

        <div className="signal-list">
          {signals.map((s) => (
            <SignalCard key={s.id} signal={s} />
          ))}
        </div>

        {/* ── Action Buttons ── */}
        <div className="signal-actions">
          {status === "BUILDING" && signals.length > 0 && (
            <button
              className="action-btn"
              onClick={handleConfirm}
              disabled={sending}
            >
              <CheckCircle size={16} />
              Confirm Signals
            </button>
          )}

          {status === "CONFIRMED" && (
            <button
              className="action-btn"
              onClick={handleEstimate}
              disabled={sending}
            >
              <BarChart3 size={16} />
              Estimate Audience
            </button>
          )}
        </div>

        {/* ── Estimate Result ── */}
        {status === "SIZED" && estimate && (
          <div className="estimate-result">
            <h4>Audience Estimate</h4>
            <div className="estimate-range">
              {formatNumber(estimate.estimateLow)} –{" "}
              {formatNumber(estimate.estimateHigh)}
            </div>
            <p className="estimate-reasoning">{estimate.reasoning}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toLocaleString();
}