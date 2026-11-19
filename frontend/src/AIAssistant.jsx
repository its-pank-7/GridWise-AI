
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Bot,
  Sparkles,
  Send,
  Plus,
  Zap,
  Activity,
  TrendingUp,
  IndianRupee,
  Lightbulb,
  User,
  AlertCircle,
  LoaderCircle,
  ArrowUp,
  ShieldCheck,
} from "lucide-react";
import { api, tok } from "./api.js";

const suggestions = [
  {
    icon: Activity,
    title: "Energy overview",
    prompt: "Summarize my current energy consumption and explain the important insights.",
  },
  {
    icon: AlertCircle,
    title: "Investigate anomalies",
    prompt: "Are there any unusual energy consumption patterns? Explain their possible causes.",
  },
  {
    icon: TrendingUp,
    title: "Forecast analysis",
    prompt: "Explain my next 24-hour energy forecast in simple language.",
  },
  {
    icon: IndianRupee,
    title: "Reduce electricity costs",
    prompt: "Suggest practical ways to reduce my electricity bill based on my energy data.",
  },
];

const welcomeMessage = {
  role: "assistant",
  content:
    "Hello! I'm your GridWise AI Copilot. I can help you understand energy consumption, investigate unusual patterns, explain forecasts and discover opportunities to improve energy efficiency.\n\nAsk me anything about your energy data.",
};

export default function AIAssistant() {
  const [messages, setMessages] = useState([welcomeMessage]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  const authenticated = Boolean(tok.get());

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  async function sendMessage(text = input) {
    const message = text.trim();

    if (!message || sending) return;

    if (!tok.get()) {
      setError("Please sign in to use the account-connected AI assistant.");
      return;
    }

    const previousMessages = messages
      .filter((item) => item.role === "user" || item.role === "assistant")
      .slice(-8)
      .map(({ role, content }) => ({ role, content }));

    setMessages((previous) => [
      ...previous,
      { role: "user", content: message },
    ]);
    setInput("");
    setError("");
    setSending(true);

    try {
      const response = await api("/ai/chat", {
        method: "POST",
        body: {
          message,
          history: previousMessages.slice(-8),
        },
      });

      const data = await response.json();

      if (!data.answer) {
        throw new Error("The AI assistant returned an empty response.");
      }

      setMessages((previous) => [
        ...previous,
        {
          role: "assistant",
          content: data.answer,
          model: data.model,
        },
      ]);
    } catch (err) {
      setError(err.message || "Unable to contact GridWise AI. Please try again.");
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  function resetChat() {
    if (sending) return;
    setMessages([welcomeMessage]);
    setInput("");
    setError("");
    inputRef.current?.focus();
  }

  function handleKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  }

  return (
    <section className="ai-page">
      <div className="ai-heading">
        <div>
          <div className="ai-eyebrow">
            <Sparkles size={14} /> ENERGY INTELLIGENCE
          </div>
          <h1>GridWise AI Copilot</h1>
          <p>
            Your intelligent companion for understanding, analyzing and
            optimizing energy consumption.
          </p>
        </div>

        <button
          className="btn ghost ai-new-chat"
          onClick={resetChat}
          disabled={sending}
        >
          <Plus size={16} /> New conversation
        </button>
      </div>

      <div className="ai-workspace">
        <div className="ai-chat-panel">
          <div className="ai-chat-top">
            <div className="ai-agent">
              <div className="ai-agent-icon">
                <Bot size={22} />
                <span />
              </div>
              <div>
                <strong>GridWise Intelligence</strong>
                <small>
                  <span className="ai-online-dot" />
                  {authenticated ? "Account-connected assistant" : "Sign-in required"}
                </small>
              </div>
            </div>

            <div className="ai-secure-label">
              <ShieldCheck size={14} /> Context-aware
            </div>
          </div>

          {!authenticated && (
            <div className="ai-auth-notice">
              <AlertCircle size={18} />
              <div>
                <strong>Sign in to activate your AI assistant</strong>
                <p>
                  Your assistant needs an authenticated account to access
                  your organization's energy data.
                </p>
                <Link to="/login" className="btn primary">
                  Sign in
                </Link>
              </div>
            </div>
          )}

          <div className="ai-messages">
            {messages.length === 1 && (
              <div className="ai-welcome">
                <div className="ai-welcome-symbol">
                  <Sparkles size={26} />
                </div>
                <h2>Energy insights, made intelligent.</h2>
                <p>
                  Ask questions in natural language. I'll use the energy
                  context available to your account to help explain what is
                  happening and what you can do next.
                </p>

                <div className="ai-suggestions">
                  <span className="ai-suggestions-label">
                    SUGGESTED QUESTIONS
                  </span>

                  <div className="ai-suggestion-grid">
                    {suggestions.map((item) => {
                      const Icon = item.icon;

                      return (
                        <button
                          className="ai-suggestion"
                          key={item.title}
                          onClick={() => sendMessage(item.prompt)}
                          disabled={!authenticated || sending}
                        >
                          <Icon size={18} />
                          <span>{item.title}</span>
                          <ArrowUp size={14} className="ai-suggestion-arrow" />
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {messages.slice(1).map((message, index) => (
              <div
                className={`ai-message ${message.role === "user" ? "user-message" : "assistant-message"}`}
                key={`${index}-${message.role}`}
              >
                <div className="ai-message-avatar">
                  {message.role === "user" ? (
                    <User size={17} />
                  ) : (
                    <Bot size={18} />
                  )}
                </div>

                <div className="ai-message-content">
                  <div className="ai-message-name">
                    {message.role === "user" ? "You" : "GridWise AI"}
                  </div>
                  <div className="ai-bubble">{message.content}</div>
                </div>
              </div>
            ))}

            {sending && (
              <div className="ai-message assistant-message">
                <div className="ai-message-avatar">
                  <Bot size={18} />
                </div>
                <div className="ai-message-content">
                  <div className="ai-message-name">GridWise AI</div>
                  <div className="ai-thinking">
                    <LoaderCircle size={16} className="spin" />
                    Analyzing your energy context...
                  </div>
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {error && (
            <div className="ai-error">
              <AlertCircle size={16} />
              <span>{error}</span>
              <button onClick={() => setError("")} aria-label="Dismiss error">
                ×
              </button>
            </div>
          )}

          <form
            className="ai-composer"
            onSubmit={(event) => {
              event.preventDefault();
              sendMessage();
            }}
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                authenticated
                  ? "Ask GridWise anything about your energy..."
                  : "Sign in to start a conversation..."
              }
              rows={2}
              disabled={!authenticated || sending}
              maxLength={3000}
            />

            <div className="ai-composer-bottom">
              <span>
                <Zap size={13} /> Powered by GridWise AI
                <span className="ai-char-count">{input.length}/3000</span>
              </span>

              <button
                type="submit"
                className="ai-send"
                disabled={!authenticated || sending || !input.trim()}
                aria-label="Send message"
              >
                {sending ? (
                  <LoaderCircle size={18} className="spin" />
                ) : (
                  <Send size={17} />
                )}
              </button>
            </div>
          </form>

          <div className="ai-disclaimer">
            AI-generated insights are decision-support suggestions. Verify
            important findings against your actual energy records.
          </div>
        </div>

        <aside className="ai-side-panel">
          <div className="ai-side-card">
            <div className="ai-side-icon"><Activity size={19} /></div>
            <h3>Context-aware intelligence</h3>
            <p>
              Responses can use your dashboard summary, available forecasts,
              detected anomalies, recommendations and device information.
            </p>
          </div>

          <div className="ai-side-card">
            <div className="ai-side-icon"><Lightbulb size={19} /></div>
            <h3>What you can explore</h3>
            <ul>
              <li>Understand energy consumption</li>
              <li>Investigate unusual usage</li>
              <li>Interpret forecasts and costs</li>
              <li>Discover efficiency opportunities</li>
            </ul>
          </div>

          <div className="ai-side-note">
            <ShieldCheck size={17} />
            <div>
              <strong>Responsible AI</strong>
              <p>
                Forecasts and savings are estimates, not verified outcomes.
                The assistant cannot control physical devices.
              </p>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
