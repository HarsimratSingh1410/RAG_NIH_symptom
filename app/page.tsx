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
    <div className="flex items-center gap-3 px-5 py-3.5 msg-assistant max-w-[80%] animate-fade-in-up border border-[var(--border-gold)]">
      <div className="flex items-center gap-1.5">
        <span className="typing-dot" />
        <span className="typing-dot" />
        <span className="typing-dot" />
      </div>
      {label && (
        <span className="text-xs font-medium tracking-wide uppercase text-[var(--accent-primary)]">
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
    <div className="flex-1 flex flex-col items-center justify-center px-4 py-8 animate-fade-in-up max-w-4xl mx-auto w-full">
      {/* Luxury Crest Badge */}
      <div className="logo-pulse mb-6">
        <div className="w-20 h-20 rounded-2xl flex items-center justify-center bg-white shadow-xl border border-[var(--border-gold)] text-3xl">
          <span className="filter drop-shadow-sm">⚕️</span>
        </div>
      </div>

      <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-[var(--bg-tertiary)] border border-[var(--border-gold)] mb-3">
        <span className="w-2 h-2 rounded-full bg-[var(--accent-secondary)]" />
        <span className="text-xs font-semibold tracking-wider text-[var(--accent-primary)] uppercase">
          Clinical Intelligence Portal
        </span>
      </div>

      <h1 className="text-3xl sm:text-4xl font-serif font-bold text-[var(--accent-primary)] tracking-tight mb-3 text-center">
        Symptom-Info Assistant
      </h1>
      <p className="text-center max-w-lg mb-10 leading-relaxed text-[var(--text-secondary)] text-sm sm:text-base">
        Inquire about symptoms, clinical pathways, treatments, and prevention — curated from verified NIH medical literature.
      </p>

      {/* Suggestion cards */}
      <div className="w-full max-w-2xl">
        <div className="flex items-center justify-between mb-3 px-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Suggested Consultations
          </span>
          <span className="text-xs text-[var(--accent-secondary)] font-medium">
            Verified Knowledge Base
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          {SUGGESTIONS.map((s, i) => (
            <button
              key={i}
              type="button"
              disabled={disabled}
              className="suggestion-chip animate-fade-in-up text-left group flex items-start gap-3"
              style={{ animationDelay: `${i * 70}ms` }}
              onClick={() => onSuggestionClick(s)}
            >
              <span className="text-base group-hover:scale-110 transition-transform duration-200">
                🔍
              </span>
              <span className="flex-1">{s}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Advisory Note */}
      <div className="mt-12 p-4 rounded-xl bg-white border border-[var(--border-color)] max-w-md text-center shadow-sm">
        <p className="text-xs text-[var(--text-muted)] leading-relaxed">
          <strong className="text-[var(--accent-primary)] font-semibold">Medical Notice:</strong> Information provided is for general educational consultation and does not substitute professional medical diagnosis.
        </p>
      </div>
    </div>
  );
}

export default function Chat() {
  const { messages, sendMessage, status, error } = useChat();
  const [input, setInput] = useState("");
  const [isErrorDismissed, setIsErrorDismissed] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isLoading = status === "streaming" || status === "submitted";

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

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
  
  const showTyping =
    isLoading &&
    (!lastMessage || lastMessage.role === "user" || !lastText);

  const isSearching =
    isLoading &&
    lastMessage?.role === "assistant" &&
    !lastText &&
    lastMessage.parts.some(
      (p) => p.type.startsWith("tool-") || p.type === "dynamic-tool"
    );

  const noAnswer =
    status === "ready" && lastMessage?.role === "assistant" && !lastText;

  return (
    <main className="flex flex-col h-screen bg-[var(--bg-primary)]">
      {/* Editorial Header Panel */}
      <header className="px-6 py-4 bg-white/90 backdrop-blur-md border-b border-[var(--border-color)] shadow-xs sticky top-0 z-50">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border-gold)] flex items-center justify-center text-xl shadow-xs">
              🏥
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-semibold text-[var(--accent-primary)] tracking-tight">
                  Symptom-Info Assistant
                </h1>
                <span className="px-2 py-0.5 text-[10px] font-bold tracking-wider rounded-md bg-[var(--bg-tertiary)] text-[var(--accent-secondary)] border border-[var(--border-gold)] uppercase">
                  NIH Grounded
                </span>
              </div>
              <p className="text-xs text-[var(--text-muted)]">
                Clinical reference assistant powered by NIH databases
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--bg-primary)] border border-[var(--border-color)]">
            <span
              className="inline-block w-2 h-2 rounded-full transition-all duration-300"
              style={{
                background: isLoading ? "var(--accent-secondary)" : "#10b981",
                boxShadow: isLoading
                  ? "0 0 8px var(--accent-secondary)"
                  : "0 0 6px rgba(16, 185, 129, 0.4)",
              }}
            />
            <span className="text-xs font-medium text-[var(--text-secondary)]">
              {isLoading ? "Analyzing..." : "Ready"}
            </span>
          </div>
        </div>
      </header>

      {/* Workspace / Consultation Area */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6">
        {messages.length === 0 ? (
          <EmptyState disabled="{isLoading}" onSuggestionClick="{handleSuggestionClick}"/>
        ) : (
          <div className="max-w-3xl mx-auto space-y-6">
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
                    className={`msg-wrapper relative ${
                      isUser ? "" : "flex flex-col gap-1.5 w-full"
                    }`}
                    style={{ maxWidth: isUser ? "80%" : "100%" }}
                  >
                    {!isUser && (
                      <div className="flex items-center justify-between mb-1 px-1">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-md bg-[var(--accent-primary)] text-white text-[10px] flex items-center justify-center font-bold">
                            NIH
                          </span>
                          <span className="text-xs font-semibold tracking-wide uppercase text-[var(--accent-primary)]">
                            Clinical Response
                          </span>
                        </div>
                        <CopyButton text="{text}"/>
                      </div>
                    )}

                    <div
                      className={`px-5 py-4 text-sm leading-relaxed ${
                        isUser
                          ? "msg-user"
                          : emergency
                          ? "msg-emergency"
                          : "msg-assistant"
                      }`}
                    >
                      {isUser ? (
                        <div className="font-medium">{text}</div>
                      ) : (
                        <div className="markdown-content">
                          <ReactMarkdown remarkPlugins="{[remarkGfm]}">
                            {text}
                          </ReactMarkdown>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {showTyping && (
              <div className="flex justify-start">
                <TypingIndicator "Consulting : ? Databases…" NIH label="{isSearching" undefined}/>
              </div>
            )}

            {noAnswer && (
              <div className="flex justify-start">
                <div className="msg-assistant px-5 py-4 text-sm max-w-[80%] border-l-4 border-l-[var(--accent-secondary)]">
                  The assistant did not return an answer. Please try submitting your inquiry again.
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
            <span className="text-sm font-medium">
              ⚠️ {error.message || "Something went wrong. Please try again."}
            </span>
            <button
              type="button"
              onClick={() => setIsErrorDismissed(true)}
              className="text-xs px-3 py-1 rounded-lg bg-red-100 hover:bg-red-200 transition-colors text-red-900 font-medium"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Elevated Consultation Input Bar */}
      <div className="px-4 sm:px-6 py-4 bg-white border-t border-[var(--border-color)] shadow-lg">
        <form
          id="chat-form"
          onSubmit={handleSubmit}
          className="max-w-3xl mx-auto flex gap-3"
        >
          <input
            ref={inputRef}
            id="chat-input"
            className="chat-input flex-1 px-5 py-3.5"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Describe your symptoms or ask a medical query..."
            disabled={isLoading}
            autoComplete="off"
          />
          <button
            type="submit"
            id="send-button"
            className="send-btn px-6 py-3.5 text-sm"
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
            <span className="hidden sm:inline font-semibold">Consult</span>
          </button>
        </form>
        <div className="flex items-center justify-center gap-2 mt-2.5">
          <span className="text-[11px] text-[var(--text-muted)] font-medium">
            ⚕️ Non-diagnostic medical information tool — verify critical concerns with a physician
          </span>
        </div>
      </div>
    </main>
  );
}