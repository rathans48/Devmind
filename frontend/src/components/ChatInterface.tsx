"use client";

import ReactMarkdown from 'react-markdown';
import FileUpload, { type UploadedImage } from "@/components/FileUpload";
import { useAgentStream } from "@/hooks/useAgentStream";
import { AgentWorkflowSkeleton, ChatEmptyState, ChatErrorState } from "./ChatFeedbackStates";
import {
  Bug,
  FileText,
  Loader2,
  MessageSquareText,
  Search,
  Send,
  Square,
  Terminal,
  SlidersHorizontal,
  X,
  BarChart3, // 🧠 INJECTED: Icons for your view tabs
  MessageSquare,
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

interface MetricSummary {
  queries_per_day: number;
  avg_latency_seconds: number;
  cost_per_query_usd: number;
  top_topics: { topic: string; count: number }[];
  queries_trend: { date: string; queries: number }[];
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
  if (!content) return null;

  return (
    <div className="text-sm text-zinc-300 leading-relaxed max-w-none space-y-2">
      <ReactMarkdown
        components={{
          h1: ({ node, ...props }) => <h1 className="text-base font-bold text-zinc-100 mt-4 mb-2 first:mt-0" {...props} />,
          h2: ({ node, ...props }) => <h2 className="text-sm font-bold text-zinc-200 mt-3 mb-1 first:mt-0" {...props} />,
          h3: ({ node, ...props }) => <h3 className="text-xs font-semibold text-zinc-300 mt-2 mb-1" {...props} />,
          p: ({ node, ...props }) => <p className="mb-1.5 last:mb-0 text-zinc-300" {...props} />,
          ul: ({ node, ...props }) => <ul className="list-disc pl-5 mb-2 space-y-1 text-zinc-300" {...props} />,
          ol: ({ node, ...props }) => <ol className="list-decimal pl-5 mb-2 space-y-1 text-zinc-300" {...props} />,
          li: ({ node, ...props }) => <li className="text-zinc-300" {...props} />,
          table: ({ node, ...props }) => <div className="overflow-x-auto my-3"><table className="w-full text-xs text-left border-collapse border border-zinc-800" {...props} /></div>,
          thead: ({ node, ...props }) => <thead className="bg-zinc-900/50 text-zinc-400 font-semibold" {...props} />,
          th: ({ node, ...props }) => <th className="border border-zinc-800 px-3 py-2 text-zinc-400 font-medium" {...props} />,
          td: ({ node, ...props }) => <td className="border border-zinc-800 px-3 py-1.5 text-zinc-300 font-mono" {...props} />,
          code: ({ node, className, children, ...props }: any) => {
            const match = /language-(\w+)/.exec(className || '');
            const isInline = !match && !String(children).includes('\n');
            
            return isInline ? (
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

  // 🧠 INJECTED STATE: Tracks active display viewport tab panel
  const [activeTab, setActiveTab] = useState<"studio" | "metrics">("studio");

  // 🧠 INJECTED STATE: Local cache data properties for inline dashboard tracking
  const [analyticsData, setAnalyticsData] = useState<MetricSummary | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [uploadedImage, setUploadedImage] = useState<UploadedImage | null>(null);
  const [showCommandMenu, setShowCommandMenu] = useState(false);
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);
  const [isMobilePanelOpen, setIsMobilePanelOpen] = useState(false);

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

  // Sync scroll positioning boundaries on active message arrays changes
  useEffect(() => {
    if (activeTab === "studio") {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, latestArtifact, isLoading, activeTab]);

  // 🧠 INJECTED EFFECT: Fetch real-time metrics dynamically whenever the user switches to the stats tab
  useEffect(() => {
    if (activeTab !== "metrics") return;

    const controller = new AbortController();
    setAnalyticsLoading(true);

    fetch('http://localhost:8000/api/analytics/summary', { signal: controller.signal })
      .then((res) => {
        if (!res.ok) {
          throw new Error(`HTTP network error! Status Code: ${res.status}`);
        }
        return res.json();
      })
      .then((data) => {
        setAnalyticsData(data);
        setAnalyticsLoading(false);
      })
      .catch((err) => {
        // Ignore intentional cleanup aborts when switching tabs rapidly
        if (err.name === 'AbortError') return;
        
        console.error("Failed to sync analytics metrics inside view panel:", err);
        setAnalyticsLoading(false);
      });

    return () => {
      controller.abort(); // Cancel the request out-of-band if the user switches tabs mid-flight
    };
  }, [activeTab]);

  const applyCommand = useCallback((command: SlashCommand) => {
    setInput(`/${command} `);
    setShowCommandMenu(false);
    setIsMobilePanelOpen(false);
    setTimeout(() => inputRef.current?.focus(), 10);
  }, []);

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

  const handleRemoveMessage = (idToRemove: string) => {
    setMessages((prev) => prev.filter((msg) => msg.id !== idToRemove));
  };

  const SidebarContent = () => (
    <>
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
                className="font-mono text-emerald-300 hover:text-emerald-200 outline-none"
              >
                {command.label}
              </button>
              <span className="ml-2 text-zinc-500">{command.description}</span>
            </li>
          ))}
        </ul>
      </div>
    </>
  );

  return (
    <div className="flex h-full min-h-0 flex-col rounded-xl border border-zinc-800 bg-zinc-950 shadow-2xl shadow-black/40 relative overflow-hidden">
      
      {/* 🏙️ FIXED HEADER AREA */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 px-4 py-3 sm:px-6 z-10 bg-zinc-950">
        <div className="flex items-center justify-between sm:justify-start gap-3 min-w-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400">
              <Terminal className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-zinc-100 truncate">
                DevMind Developer Studio
              </h2>
              <p className="text-[11px] text-zinc-500 font-mono truncate hidden sm:block">
                POST /api/agent/stream
              </p>
            </div>
          </div>
        </div>

        {/* 🧠 INJECTED TAB VIEW CONTROLS LAYER */}
        <div className="flex items-center justify-between sm:justify-end gap-4 w-full sm:w-auto">
          <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-850 p-1 rounded-lg shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab("studio")}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold tracking-wide transition-colors outline-none ${
                activeTab === "studio" 
                  ? "bg-emerald-500 text-zinc-950 font-bold" 
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <MessageSquare size={13} />
              Studio
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("metrics")}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold tracking-wide transition-colors outline-none ${
                activeTab === "metrics" 
                  ? "bg-emerald-500 text-zinc-950 font-bold" 
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <BarChart3 size={13} />
              Metrics
            </button>
          </div>

          <div className="flex items-center gap-2 text-xs shrink-0">
            {activeTab === "studio" && (isLoading || isStreaming) && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-emerald-300">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span className="hidden md:inline">{isLoading ? "Connecting" : "Streaming"}</span>
              </span>
            )}
            {activeTab === "studio" && activeNode && (
              <span className="rounded-full border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-zinc-300 text-[11px] font-mono">
                {activeNode}
              </span>
            )}
            
            {activeTab === "studio" && (
              <button
                type="button"
                onClick={() => setIsMobilePanelOpen(true)}
                className="sm:hidden flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-white"
              >
                <SlidersHorizontal className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* 🏜️ DYNAMIC PORT VIEW CONTROLLER GRID */}
      {activeTab === "studio" ? (
        /* ==========================================
           VIEW A: CORE AGENT STUDIO WORKSPACE
           ========================================== */
        <div className="grid min-h-0 flex-1 gap-4 overflow-hidden p-3 sm:p-6 sm:grid-cols-[minmax(0,1fr)_280px]">
          <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/40">
            <div className="flex-1 space-y-4 overflow-y-auto p-3 sm:p-5">
              
              {messages.length === 0 && !isLoading && !isStreaming && (
                <ChatEmptyState 
                  onCommandClick={(cmd) => applyCommand(cmd.replace("/", "") as SlashCommand)} 
                />
              )}

              {messages.map((message) => {
                if (message.role === "system" && message.id.startsWith("error-")) {
                  return (
                    <ChatErrorState 
                      key={message.id}
                      message={message.content.replace("Stream error: ", "")}
                      onRetry={() => handleRemoveMessage(message.id)}
                    />
                  );
                }

                return (
                  <article
                    key={message.id}
                    className={[
                      "rounded-lg border p-3 sm:px-4 sm:py-3",
                      message.role === "user"
                        ? "ml-2 border-emerald-500/20 bg-emerald-500/5 sm:ml-12"
                        : message.role === "assistant"
                          ? "mr-2 border-zinc-700 bg-zinc-950/80 sm:mr-12"
                          : "border-zinc-800 bg-zinc-900/70 text-zinc-400",
                    ].join(" ")}
                  >
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                        {message.role}
                        {message.command ? ` · /${message.command}` : ""}
                      </span>
                      <time className="text-[10px] text-zinc-600" suppressHydrationWarning>
                        {message.timestamp.toLocaleTimeString()}
                      </time>
                    </div>
                    <div className="text-zinc-200 overflow-x-auto">{renderMessageContent(message.content)}</div>
                  </article>
                );
              })}

              {isStreaming && latestArtifact && (
                <article className="mr-2 rounded-lg border border-zinc-700 bg-zinc-950/80 p-3 sm:px-4 sm:py-3 sm:mr-12">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                      assistant · streaming
                    </span>
                    <Loader2 className="h-3 w-3 animate-spin text-emerald-400" />
                  </div>
                  <div className="text-zinc-200 overflow-x-auto">
                    {renderMessageContent(latestArtifact)}
                  </div>
                </article>
              )}

              {(isLoading || (isStreaming && !latestArtifact)) && (
                <AgentWorkflowSkeleton />
              )}

              <div ref={messagesEndRef} />
            </div>

            <div className="relative border-t border-zinc-800 p-3 sm:p-4 bg-zinc-950/20">
              {showCommandMenu && filteredCommands.length > 0 && (
                <div
                  role="listbox"
                  className="absolute bottom-full left-2 right-2 z-20 mb-2 overflow-hidden rounded-lg border border-zinc-700 bg-zinc-950 shadow-xl sm:left-4 sm:right-4"
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
                  rows={1}
                  disabled={isStreaming}
                  placeholder="Enter prompt or type / for commands…"
                  onChange={(event) => {
                    const value = event.target.value;
                    setInput(value);
                    setShowCommandMenu(value.startsWith("/"));
                    setSelectedCommandIndex(0);
                  }}
                  onKeyDown={onInputKeyDown}
                  className="min-h-[2.5rem] max-h-32 flex-1 resize-none rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-sm text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-emerald-500/60 disabled:cursor-not-allowed disabled:opacity-60"
                />

                {isStreaming ? (
                  <button
                    type="button"
                    onClick={abort}
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-red-500/40 bg-red-500/10 text-red-300 transition-colors hover:bg-red-500/20"
                  >
                    <Square className="h-3.5 w-3.5" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void submitPrompt()}
                    disabled={!input.trim() || isLoading}
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500 text-zinc-950 transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Send className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          </section>

          <aside className="hidden sm:flex min-h-0 flex-col gap-4 overflow-y-auto">
            <SidebarContent />
          </aside>
        </div>
      ) : (
        /* ==========================================
           VIEW B: INLINE SYSTEM METRICS VIEW (Full Width)
           ========================================== */
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-[#0F0F11] font-sans">
          {analyticsLoading ? (
            /* Pulsing layout loading block */
            <div className="animate-pulse space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="bg-[#16161A] border border-zinc-850 p-5 rounded-xl h-24"></div>
                ))}
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-[#16161A] border border-zinc-850 p-6 rounded-xl h-64"></div>
                <div className="bg-[#16161A] border border-zinc-850 p-6 rounded-xl h-64"></div>
              </div>
            </div>
          ) : (
            /* Rendered Analytics Dashboard Canvas Layout */
            <div className="space-y-6">
              {/* Telemetry Summary Cards Row */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <div className="bg-[#16161A] border border-zinc-850 p-5 rounded-xl shadow-md">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">System Logs Volume</p>
                  <p className="text-2xl font-bold text-sky-400 mt-1.5">{analyticsData?.queries_per_day} <span className="text-xs text-zinc-600 font-normal">runs</span></p>
                </div>
                <div className="bg-[#16161A] border border-zinc-850 p-5 rounded-xl shadow-md">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Avg Graph Latency</p>
                  <p className="text-2xl font-bold text-emerald-400 mt-1.5">{analyticsData?.avg_latency_seconds}s</p>
                </div>
                <div className="bg-[#16161A] border border-zinc-850 p-5 rounded-xl shadow-md">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Burn Cost Per Token</p>
                  <p className="text-2xl font-bold text-amber-400 mt-1.5">${analyticsData?.cost_per_query_usd.toFixed(5)}</p>
                </div>
              </div>

              {/* Advanced Graphs Split Panel */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Agent Call Frequency Table Layout */}
                <div className="bg-[#16161A] border border-zinc-850 p-5 rounded-xl">
                  <h3 className="text-xs font-bold uppercase tracking-wide text-zinc-400 mb-4">Core Agent Dispatch Distribution</h3>
                  <div className="space-y-3.5">
                    {analyticsData?.top_topics.map((item, index) => (
                      <div key={index} className="flex items-center justify-between text-xs">
                        <span className="text-zinc-300 font-mono">{item.topic}</span>
                        <div className="flex items-center gap-3 w-3/5">
                          <div className="w-full bg-zinc-900 h-1.5 rounded-full overflow-hidden border border-zinc-850">
                            <div 
                              className="bg-indigo-500 h-full rounded-full" 
                              style={{ width: `${(item.count / (analyticsData.queries_per_day || 1)) * 100}%` }}
                            ></div>
                          </div>
                          <span className="text-zinc-500 font-mono w-6 text-right">{item.count}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Histogram Traffic Curve Layout */}
                <div className="bg-[#16161A] border border-zinc-850 p-5 rounded-xl flex flex-col justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wide text-zinc-400 mb-2">Weekly Pipeline Run Fluctuations</h3>
                  <div className="flex items-end justify-between h-32 pt-4 border-b border-zinc-850">
                    {analyticsData?.queries_trend.map((day, i) => (
                      <div key={i} className="flex flex-col items-center flex-1 group mx-1">
                        <div 
                          className="bg-sky-500/80 hover:bg-sky-400 transition-all rounded-t w-full max-w-[20px]"
                          style={{ height: `${(day.queries / 150) * 100}px` }}
                        ></div>
                        <span className="text-[9px] text-zinc-500 mt-2 font-mono">{day.date}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* MOBILE DRAW OVERLAY SHEET */}
      {isMobilePanelOpen && activeTab === "studio" && (
        <div className="sm:hidden fixed inset-0 z-50 flex flex-col justify-end bg-black/60 backdrop-blur-sm">
          <div className="flex-1" onClick={() => setIsMobilePanelOpen(false)} />
          <div className="bg-[#121215] border-t border-zinc-800 rounded-t-2xl p-4 space-y-4 max-h-[80vh] overflow-y-auto flex flex-col">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">Context & Tools</span>
              <button 
                type="button" 
                onClick={() => setIsMobilePanelOpen(false)}
                className="p-1 rounded bg-zinc-900 border border-zinc-800 text-zinc-400"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <SidebarContent />
          </div>
        </div>
      )}

    </div>
  );
}