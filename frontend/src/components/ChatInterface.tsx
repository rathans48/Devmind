"use client";

import ReactMarkdown from 'react-markdown';
import FileUpload, { type UploadedImage } from "@/components/FileUpload";
import { useAgentStream } from "@/hooks/useAgentStream";
import {
  Bug,
  FileText,
  Loader2,
  MessageSquareText,
  Search,
  Send,
  Square,
  Terminal,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

type SlashCommand = "review" | "explain" | "document" | "debug";

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  command?: SlashCommand;
  timestamp: Date;
}

const SLASH_COMMANDS: {
  id: SlashCommand;
  label: string;
  description: string;
  icon: typeof Search;
}[] = [
  {
    id: "review",
    label: "/review",
    description: "Run a quality review on generated code",
    icon: Search,
  },
  {
    id: "explain",
    label: "/explain",
    description: "Explain code behavior and design choices",
    icon: MessageSquareText,
  },
  {
    id: "document",
    label: "/document",
    description: "Generate documentation and inline comments",
    icon: FileText,
  },
  {
    id: "debug",
    label: "/debug",
    description: "Analyze errors from screenshots or logs",
    icon: Bug,
  },
];

function extractCommand(input: string): {
  command: SlashCommand | null;
  prompt: string;
} {
  const match = input.trim().match(/^\/(review|explain|document|debug)\b\s*(.*)$/i);
  if (!match) {
    return { command: null, prompt: input.trim() };
  }

  return {
    command: match[1].toLowerCase() as SlashCommand,
    prompt: match[2].trim(),
  };
}

function renderMessageContent(content: string) {
  return (
    <div className="text-sm text-zinc-300 leading-relaxed max-w-none space-y-2">
      <ReactMarkdown
        components={{
          // Render structured heading weights instead of raw markdown symbols
          h1: ({ ...props }) => <h1 className="text-base font-bold text-zinc-100 mt-4 mb-2 first:mt-0" {...props} />,
          h2: ({ ...props }) => <h2 className="text-sm font-bold text-zinc-200 mt-3 mb-1 first:mt-0" {...props} />,
          h3: ({ ...props }) => <h3 className="text-xs font-semibold text-zinc-300 mt-2 mb-1" {...props} />,
          
          // Map baseline text lines
          p: ({ ...props }) => <p className="mb-1.5 last:mb-0 text-zinc-300" {...props} />,
          
          // Format bullet lists and sequential instruction arrays
          ul: ({ ...props }) => <ul className="list-disc pl-5 mb-2 space-y-1 text-zinc-300" {...props} />,
          ol: ({ ...props }) => <ol className="list-decimal pl-5 mb-2 space-y-1 text-zinc-300" {...props} />,
          li: ({ ...props }) => <li className="text-zinc-300" {...props} />,
          
          // Render evaluation metrics and performance complexity tables
          table: ({ ...props }) => <div className="overflow-x-auto my-3"><table className="w-full text-xs text-left border-collapse border border-zinc-800" {...props} /></div>,
          thead: ({ ...props }) => <thead className="bg-zinc-900/50 text-zinc-400 font-semibold" {...props} />,
          th: ({ ...props }) => <th className="border border-zinc-800 px-3 py-2 text-zinc-400 font-medium" {...props} />,
          td: ({ ...props }) => <td className="border border-zinc-800 px-3 py-1.5 text-zinc-300 font-mono" {...props} />,
          
          // Beautifully isolate single code variables vs full syntax fence blocks
          code: ({ node, inline, className, children, ...props }: any) => {
            return inline ? (
              <code className="bg-zinc-800 text-zinc-200 px-1 py-0.5 rounded text-xs font-mono" {...props}>
                {children}
              </code>
            ) : (
              <pre className="bg-zinc-950 p-3 rounded-lg border border-zinc-800 my-2 overflow-x-auto w-full font-mono">
                <code className="text-xs text-emerald-400 block whitespace-pre" {...props}>
                  {String(children).trim()}
                </code>
              </pre>
            );
          }
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

export default function ChatInterface() {
  const {
    isStreaming,
    isLoading,
    activeNode,
    latestArtifact,
    startStream,
    abort,
  } = useAgentStream();

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "system",
      content:
        "DevMind Studio ready. Type a prompt or use /review, /explain, /document, /debug.",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [uploadedImage, setUploadedImage] = useState<UploadedImage | null>(null);
  const [showCommandMenu, setShowCommandMenu] = useState(false);
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const filteredCommands = useMemo(() => {
    if (!input.startsWith("/")) return SLASH_COMMANDS;
    const query = input.slice(1).toLowerCase();
    return SLASH_COMMANDS.filter(
      (command) =>
        command.id.includes(query) || command.label.slice(1).includes(query),
    );
  }, [input]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, latestArtifact, isLoading]);

  const submitPrompt = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;

    const { command, prompt } = extractCommand(trimmed);
    const userContent = command
      ? `${command.toUpperCase()}${prompt ? `: ${prompt}` : ""}`
      : trimmed;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: userContent,
      command: command ?? undefined,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setShowCommandMenu(false);

    const formData = new FormData();
    formData.append("prompt", prompt || trimmed);
    if (command) {
      formData.append("command", command);
    }
    if (uploadedImage) {
      formData.append("image_base64", uploadedImage.base64);
      formData.append("image_mime", uploadedImage.mimeType);
      formData.append("image_name", uploadedImage.name);
    }

    const result = await startStream(formData);

    if (result.error) {
      setMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          role: "system",
          content: `Stream error: ${result.error}`,
          timestamp: new Date(),
        },
      ]);
      return;
    }

    if (result.latestArtifact) {
      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: result.latestArtifact ?? "",
          timestamp: new Date(),
        },
      ]);
    }
  }, [input, isStreaming, startStream, uploadedImage]);

  const applyCommand = useCallback((command: SlashCommand) => {
    setInput(`/${command} `);
    setShowCommandMenu(false);
    inputRef.current?.focus();
  }, []);

  const onInputKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (showCommandMenu && filteredCommands.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedCommandIndex((prev) =>
          prev + 1 >= filteredCommands.length ? 0 : prev + 1,
        );
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedCommandIndex((prev) =>
          prev - 1 < 0 ? filteredCommands.length - 1 : prev - 1,
        );
        return;
      }
      if (event.key === "Tab" || event.key === "Enter") {
        event.preventDefault();
        applyCommand(filteredCommands[selectedCommandIndex].id);
        return;
      }
      if (event.key === "Escape") {
        setShowCommandMenu(false);
        return;
      }
    }

    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submitPrompt();
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col rounded-xl border border-zinc-800 bg-zinc-950 shadow-2xl shadow-black/40">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400">
            <Terminal className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-zinc-100 sm:text-base">
              DevMind Developer Studio
            </h2>
            <p className="text-xs text-zinc-500">
              Agent stream · POST /api/agent/stream
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs">
          {(isLoading || isStreaming) && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-emerald-300">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {isLoading ? "Connecting" : "Streaming"}
            </span>
          )}
          {activeNode && (
            <span className="rounded-full border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-zinc-300">
              Node: <span className="font-mono text-emerald-300">{activeNode}</span>
            </span>
          )}
        </div>
      </header>

      <div className="grid min-h-0 flex-1 gap-4 overflow-hidden p-4 sm:grid-cols-[minmax(0,1fr)_280px] sm:p-6">
        <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/40">
          <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
            {messages.map((message) =>
              <article
                key={message.id}
                className={[
                  "rounded-lg border px-4 py-3",
                  message.role === "user"
                    ? "ml-4 border-emerald-500/20 bg-emerald-500/5 sm:ml-12"
                    : message.role === "assistant"
                      ? "mr-4 border-zinc-700 bg-zinc-950/80 sm:mr-12"
                      : "border-zinc-800 bg-zinc-900/70 text-zinc-400",
                ].join(" ")}
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                    {message.role}
                    {message.command ? ` · /${message.command}` : ""}
                  </span>
                  <time className="text-[10px] text-zinc-600" suppressHydrationWarning>
                    {message.timestamp.toLocaleTimeString()}
                  </time>
                </div>
                <div className="text-zinc-200">{renderMessageContent(message.content)}</div>
              </article>
            )}

            {isStreaming && latestArtifact && (
              <article className="mr-4 rounded-lg border border-zinc-700 bg-zinc-950/80 px-4 py-3 sm:mr-12">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                    assistant · streaming
                  </span>
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-400" />
                </div>
                <div className="text-zinc-200">
                  {renderMessageContent(latestArtifact)}
                </div>
              </article>
            )}

            <div ref={messagesEndRef} />
          </div>

          <div className="relative border-t border-zinc-800 p-3 sm:p-4">
            {showCommandMenu && filteredCommands.length > 0 && (
              <div
                role="listbox"
                className="absolute bottom-full left-3 right-3 z-20 mb-2 overflow-hidden rounded-lg border border-zinc-700 bg-zinc-950 shadow-xl sm:left-4 sm:right-4"
              >
                {filteredCommands.map((command, index) => {
                  const Icon = command.icon;
                  return (
                    <button
                      key={command.id}
                      type="button"
                      role="option"
                      aria-selected={index === selectedCommandIndex}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        applyCommand(command.id);
                      }}
                      className={[
                        "flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors",
                        index === selectedCommandIndex
                          ? "bg-emerald-500/15 text-emerald-200"
                          : "text-zinc-300 hover:bg-zinc-900",
                      ].join(" ")}
                    >
                      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>
                        <span className="block text-sm font-medium">{command.label}</span>
                        <span className="block text-xs text-zinc-500">
                          {command.description}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                rows={2}
                disabled={isStreaming}
                placeholder="Enter a prompt or type / for commands…"
                onChange={(event) => {
                  const value = event.target.value;
                  setInput(value);
                  setShowCommandMenu(value.startsWith("/"));
                  setSelectedCommandIndex(0);
                }}
                onKeyDown={onInputKeyDown}
                className="min-h-[3rem] flex-1 resize-none rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 font-mono text-sm text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-emerald-500/60 disabled:cursor-not-allowed disabled:opacity-60"
              />

              {isStreaming ? (
                <button
                  type="button"
                  onClick={abort}
                  aria-label="Stop streaming"
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-red-500/40 bg-red-500/10 text-red-300 transition-colors hover:bg-red-500/20"
                >
                  <Square className="h-4 w-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void submitPrompt()}
                  disabled={!input.trim() || isLoading}
                  aria-label="Send prompt"
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-emerald-500 text-zinc-950 transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Send className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </section>

        <aside className="flex min-h-0 flex-col gap-4 overflow-y-auto">
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Error Screenshot
            </h3>
            <FileUpload
              value={uploadedImage}
              onChange={setUploadedImage}
              disabled={isStreaming}
            />
          </div>

          <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Slash Commands
            </h3>
            <ul className="space-y-2 text-xs text-zinc-400">
              {SLASH_COMMANDS.map((command) => (
                <li key={command.id}>
                  <button
                    type="button"
                    onClick={() => applyCommand(command.id)}
                    className="font-mono text-emerald-300 hover:text-emerald-200"
                  >
                    {command.label}
                  </button>
                  <span className="ml-2 text-zinc-500">{command.description}</span>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
