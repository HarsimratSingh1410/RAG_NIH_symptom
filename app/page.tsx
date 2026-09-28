"use client";

import { useChat } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import { useState, useRef, useEffect, useCallback } from "react";
import type { FormEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const SUGGESTIONS = [
  "What are the early symptoms of type 2 diabetes?",
  "What causes high blood pressure?",
  "How is anemia diagnosed?",
  "What are symptoms of an ear infection?",
  "How can I prevent kidney stones?",
  "What are complications of asthma?",
];

/**
 * In AI SDK v5+, messages no longer have a `content` string.
 * The text lives in `parts` (alongside tool calls, etc.), so we join the text parts.
 */
function getMessageText(message: UIMessage): string {
  return message.parts
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("");
}

function TypingIndicator({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 px-4 py-3 msg-assistant max-w-[80%] animate-fade-in-up">
      <span className="typing-dot" />
      <span className="typing-dot" />
      <span className="typing-dot" />
      {label && (
        <span className="text-xs ml-1" style={{ color: "var(--text-muted)" }}>
          {label}
        </span>
      )}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API not available
    }
  }, [text]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="copy-btn"
      aria-label="Copy message"
      title="Copy to clipboard"
    >
      {copied ? "✓ Copied" : "📋 Copy"}
    </button>
  );
}

function EmptyState({
  onSuggestionClick,
  disabled,
}: {
  onSuggestionClick: (text: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 py-12 animate-fade-in-up">
      {/* Logo */}
      <div className="logo-pulse mb-6">
        <div
          className="w-20 h-20 rounded-2xl flex items-center justify-center text-4xl"
          style={{
            background:
              "linear-gradient(135deg, rgba(6,182,212,0.15), rgba(139,92,246,0.15))",
            border: "1px solid rgba(6,182,212,0.2)",
          }}
        >
          🏥
        </div>
      </div>

      <h1 className="text-2xl sm:text-3xl font-bold gradient-text mb-2">
        Symptom-Info Assistant
      </h1>
      <p
        className="text-center max-w-md mb-8 leading-relaxed"
        style={{ color: "var(--text-secondary)", fontSize: "0.9375rem" }}
      >
        Ask me about symptoms, causes, treatments, and prevention — powered by
        NIH-curated medical sources.
      </p>

      {/* Suggestion chips */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg w-full">
        {SUGGESTIONS.map((s, i) => (
          <button
            key={i}
            type="button"
            disabled={disabled}
            className="suggestion-chip animate-fade-in-up text-left"
            style={{ animationDelay: `${i * 80}ms` }}
            onClick={() => onSuggestionClick(s)}
          >
            <span className="mr-1.5 opacity-60">💬</span> {s}
          </button>
        ))}
      </div>

      {/* Disclaimer */}
      <p
        className="text-center mt-10 text-xs max-w-sm leading-relaxed"
        style={{ color: "var(--text-muted)" }}
      >
        ⚕️ This assistant provides general information, not medical advice.
        Always consult a healthcare professional.
      </p>
    </div>
  );
}

export default function Chat() {
  // AI SDK v5+: useChat no longer manages the input value or handleSubmit.
  // We keep the input in our own state and send with `sendMessage`.
  const { messages, sendMessage, status, error } = useChat();
  const [input, setInput] = useState("");
  const [isErrorDismissed, setIsErrorDismissed] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isLoading = status === "streaming" || status === "submitted";

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

  // Focus the input on mount and whenever a response finishes
  // (the input is disabled while loading, which drops focus).
  useEffect(() => {
    if (!isLoading) {
      inputRef.current?.focus();
    }
  }, [isLoading]);

  const submitText = useCallback(
    (raw: string) => {
      const text = raw.trim();
      if (!text || isLoading) return;
      setIsErrorDismissed(false);
      void sendMessage({ text });
      setInput("");
    },
    [isLoading, sendMessage]
  );

  const handleSubmit = useCallback(
    (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      submitText(input);
    },
    [input, submitText]
  );

  const handleSuggestionClick = useCallback(
    (text: string) => {
      submitText(text);
    },
    [submitText]
  );

  const isEmergency = (text: string) =>
    text.startsWith("🚨") || text.toUpperCase().startsWith("EMERGENCY");

  const lastMessage = messages[messages.length - 1];
  const lastText = lastMessage ? getMessageText(lastMessage) : "";
  // Show the typing dots while waiting for the first text, including while
  // the assistant is running the retrieval tool (no text yet).
  const showTyping =
    isLoading &&
    (!lastMessage || lastMessage.role === "user" || !lastText);
  // The assistant has started a tool call (the NIH search) but has no text yet.
  const isSearching =
    isLoading &&
    lastMessage?.role === "assistant" &&
    !lastText &&
    lastMessage.parts.some(
      (p) => p.type.startsWith("tool-") || p.type === "dynamic-tool"
    );
  // The reply finished but contained no text: tell the user instead of
  // showing nothing.
  const noAnswer =
    status === "ready" && lastMessage?.role === "assistant" && !lastText;

  return (
    <main
      className="flex flex-col h-screen"
      style={{ background: "var(--bg-primary)" }}
    >
      {/* Header */}
      <header
        className="flex items-center gap-3 px-4 sm:px-6 py-3 glass-card"
        style={{
          borderRadius: 0,
          borderTop: "none",
          borderLeft: "none",
          borderRight: "none",
          position: "sticky",
          top: 0,
          zIndex: 50,
        }}
      >
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center text-lg"
          style={{
            background:
              "linear-gradient(135deg, rgba(6,182,212,0.2), rgba(139,92,246,0.2))",
            border: "1px solid rgba(6,182,212,0.15)",
          }}
        >
          🏥
        </div>
        <div>
          <h1 className="text-sm font-semibold gradient-text">
            Symptom-Info Assistant
          </h1>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            Powered by NIH medical sources
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span
            className="inline-block w-2 h-2 rounded-full"
            style={{
              background: isLoading ? "var(--accent-primary)" : "#22c55e",
              boxShadow: isLoading
                ? "0 0 6px var(--accent-primary)"
                : "0 0 6px #22c55e",
            }}
          />
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            {isLoading ? "Thinking..." : "Online"}
          </span>
        </div>
      </header>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4">
        {messages.length === 0 ? (
          <EmptyState
            onSuggestionClick={handleSuggestionClick}
            disabled={isLoading}
          />
        ) : (
          <div className="max-w-3xl mx-auto space-y-4">
            {messages.map((m, idx) => {
              const text = getMessageText(m);
              if (!text) return null;

              const isUser = m.role === "user";
              const emergency = !isUser && isEmergency(text);

              return (
                <div
                  key={m.id}
                  className={`flex ${
                    isUser ? "justify-end" : "justify-start"
                  } animate-fade-in-up`}
                  style={{ animationDelay: `${idx * 30}ms` }}
                >
                  <div
                    className={`msg-wrapper relative group ${
                      isUser ? "" : "flex flex-col gap-1.5"
                    }`}
                    style={{ maxWidth: "82%" }}
                  >
                    {!isUser && (
                      <div
                        className="flex items-center gap-1.5 mb-1"
                        style={{
                          color: "var(--text-muted)",
                          fontSize: "0.7rem",
                        }}
                      >
                        <span>🏥</span>
                        <span>Assistant</span>
                      </div>
                    )}

                    <div
                      className={`px-4 py-3 text-sm leading-relaxed ${
                        isUser
                          ? "msg-user"
                          : emergency
                          ? "msg-emergency"
                          : "msg-assistant"
                      }`}
                    >
                      {isUser ? (
                        <span>{text}</span>
                      ) : (
                        <div className="markdown-content">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {text}
                          </ReactMarkdown>
                        </div>
                      )}
                    </div>

                    {!isUser && (
                      <div className="flex justify-end mt-1">
                        <CopyButton text={text} />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {showTyping && (
              <div className="flex justify-start">
                <TypingIndicator
                  label={isSearching ? "Searching NIH sources…" : undefined}
                />
              </div>
            )}

            {noAnswer && (
              <div className="flex justify-start">
                <div className="msg-assistant px-4 py-3 text-sm max-w-[80%]">
                  The assistant did not return an answer. Please try again.
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Error banner */}
      {error && !isErrorDismissed && (
        <div className="px-4 sm:px-6 pb-2 max-w-3xl mx-auto w-full">
          <div className="error-banner px-4 py-3 flex items-center justify-between animate-fade-in-up">
            <span className="text-sm">
              ⚠️ {error.message || "Something went wrong. Please try again."}
            </span>
            <button
              type="button"
              onClick={() => setIsErrorDismissed(true)}
              className="text-xs px-3 py-1 rounded-lg hover:bg-red-500/20 transition-colors"
              style={{ color: "#fca5a5" }}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Input area */}
      <div
        className="px-4 sm:px-6 py-4"
        style={{
          borderTop: "1px solid var(--border-color)",
          background: "var(--bg-secondary)",
        }}
      >
        <form
          id="chat-form"
          onSubmit={handleSubmit}
          className="max-w-3xl mx-auto flex gap-3"
        >
          <input
            ref={inputRef}
            id="chat-input"
            className="chat-input flex-1 px-4 py-3"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Describe your symptoms or ask a medical question..."
            disabled={isLoading}
            autoComplete="off"
          />
          <button
            type="submit"
            id="send-button"
            className="send-btn px-5 py-3 text-sm"
            disabled={isLoading || !input.trim()}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
            <span className="hidden sm:inline">Send</span>
          </button>
        </form>
        <p
          className="text-center mt-2 text-xs max-w-3xl mx-auto"
          style={{ color: "var(--text-muted)" }}
        >
          ⚕️ For informational purposes only — not medical advice
        </p>
      </div>
    </main>
  );
}
