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
  BarChart3,
  MessageSquare,
  Zap,
  Clock,
  DollarSign,
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

// Session-level cost tracker (ambient, shown in chat sidebar)
interface SessionStats {
  totalTokens: number;
  estimatedCostUsd: number;
  queryCount: number;
}

const SLASH_COMMANDS: {
  id: SlashCommand;
  label: string;
  description: string;
  icon: typeof Search;
}[] = [
  { id: "review",   label: "/review",   description: "Run a quality review on generated code",      icon: Search },
  { id: "explain",  label: "/explain",  description: "Explain code behavior and design choices",    icon: MessageSquareText },
  { id: "document", label: "/document", description: "Generate documentation and inline comments",  icon: FileText },
  { id: "debug",    label: "/debug",    description: "Analyze errors from screenshots or logs",     icon: Bug },
];

function extractCommand(input: string): { command: SlashCommand | null; prompt: string } {
  const match = input.trim().match(/^\/(review|explain|document|debug)\b\s*(.*)$/i);
  if (!match) return { command: null, prompt: input.trim() };
  return { command: match[1].toLowerCase() as SlashCommand, prompt: match[2].trim() };
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
          p:  ({ node, ...props }) => <p className="mb-1.5 last:mb-0 text-zinc-300" {...props} />,
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
              <code className="bg-zinc-800 text-zinc-200 px-1 py-0.5 rounded text-xs font-mono" {...props}>{children}</code>
            ) : (
              <pre className="bg-zinc-950 p-3 rounded-lg border border-zinc-800 my-2 overflow-x-auto w-full font-mono">
                <code className="text-xs text-emerald-400 block whitespace-pre" {...props}>{String(children).trim()}</code>
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

// ---------------------------------------------------------------------------
// AMBIENT SESSION STATS BAR — shown inside the chat sidebar, not a full tab
// ---------------------------------------------------------------------------
function SessionStatsBar({ stats }: { stats: SessionStats }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">
        This Session
      </h3>
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-xs text-zinc-500">
            <MessageSquare className="h-3 w-3" /> Queries
          </span>
          <span className="text-xs font-mono font-semibold text-zinc-200">
            {stats.queryCount}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-xs text-zinc-500">
            <Zap className="h-3 w-3" /> Tokens
          </span>
          <span className="text-xs font-mono font-semibold text-zinc-200">
            {stats.totalTokens.toLocaleString()}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-xs text-zinc-500">
            <DollarSign className="h-3 w-3" /> Est. Cost
          </span>
          <span className="text-xs font-mono font-semibold text-emerald-400">
            ${stats.estimatedCostUsd.toFixed(4)}
          </span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FULL ANALYTICS DASHBOARD — lives at /dashboard route (separate page).
// This component is the content rendered there, imported into this file only
// to keep the diff minimal. Move to app/dashboard/page.tsx when ready.
// ---------------------------------------------------------------------------
function AnalyticsDashboard({
  data,
  loading,
}: {
  data: MetricSummary | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="animate-pulse space-y-6 p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-zinc-900 border border-zinc-800 p-5 rounded-xl h-24" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-xl h-64" />
          <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-xl h-64" />
        </div>
      </div>
    );
  }

  const maxTrend = Math.max(...(data?.queries_trend.map((d) => d.queries) ?? [1]), 1);

  return (
    <div className="space-y-6 p-4 sm:p-6">

      {/* ── KPI row ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          {
            label: "Queries / Day",
            value: data?.queries_per_day ?? "—",
            suffix: "runs",
            color: "text-sky-400",
            icon: <BarChart3 className="h-4 w-4" />,
          },
          {
            label: "Avg Graph Latency",
            value: data ? `${data.avg_latency_seconds}s` : "—",
            suffix: "",
            color: "text-emerald-400",
            icon: <Clock className="h-4 w-4" />,
          },
          {
            label: "Cost / Query",
            value: data ? `$${data.cost_per_query_usd.toFixed(5)}` : "—",
            suffix: "",
            color: "text-amber-400",
            icon: <DollarSign className="h-4 w-4" />,
          },
        ].map((kpi) => (
          <div
            key={kpi.label}
            className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-5 flex items-start gap-3"
          >
            <span className={`mt-0.5 ${kpi.color}`}>{kpi.icon}</span>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1">
                {kpi.label}
              </p>
              <p className={`text-2xl font-bold font-mono ${kpi.color}`}>
                {kpi.value}
                {kpi.suffix && (
                  <span className="text-xs text-zinc-600 font-normal ml-1">{kpi.suffix}</span>
                )}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Charts row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Agent dispatch distribution */}
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-5">
          <h3 className="text-xs font-bold uppercase tracking-wide text-zinc-400 mb-4">
            Agent Dispatch Distribution
          </h3>
          <div className="space-y-3.5">
            {data?.top_topics.map((item, i) => (
              <div key={i} className="flex items-center gap-3 text-xs">
                <span className="text-zinc-300 font-mono w-24 shrink-0 truncate">
                  {item.topic}
                </span>
                <div className="flex-1 bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-indigo-500 h-full rounded-full transition-all"
                    style={{
                      width: `${(item.count / (data.queries_per_day || 1)) * 100}%`,
                    }}
                  />
                </div>
                <span className="text-zinc-500 font-mono w-5 text-right shrink-0">
                  {item.count}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Weekly trend bar chart */}
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-5">
          <h3 className="text-xs font-bold uppercase tracking-wide text-zinc-400 mb-4">
            Weekly Pipeline Runs
          </h3>
          <div className="flex items-end justify-between h-32 gap-1 border-b border-zinc-800 pb-0">
            {data?.queries_trend.map((day, i) => (
              <div key={i} className="flex flex-col items-center flex-1 group">
                <div
                  className="bg-sky-500/70 hover:bg-sky-400 transition-colors rounded-t w-full"
                  style={{ height: `${(day.queries / maxTrend) * 100}%` }}
                  title={`${day.queries} runs`}
                />
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-2">
            {data?.queries_trend.map((day, i) => (
              <span key={i} className="text-[9px] text-zinc-600 font-mono flex-1 text-center">
                {day.date}
              </span>
            ))}
          </div>
        </div>
      </div>

      <p className="text-[10px] text-zinc-600 text-center">
        Full analytics available at{" "}
        <a href="/dashboard" className="text-emerald-500 hover:underline">
          /dashboard
        </a>
        {" "}· Data refreshes on tab open
      </p>
    </div>
  );
}

// ===========================================================================
// MAIN COMPONENT
// ===========================================================================
export default function ChatInterface() {
  const { isStreaming, isLoading, activeNode, latestArtifact, startStream, abort } =
    useAgentStream();

  const [activeTab, setActiveTab] = useState<"studio" | "metrics">("studio");
  const [analyticsData, setAnalyticsData] = useState<MetricSummary | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  // Ambient session stats — updates after every completed query
  const [sessionStats, setSessionStats] = useState<SessionStats>({
    totalTokens: 0,
    estimatedCostUsd: 0,
    queryCount: 0,
  });

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
      (c) => c.id.includes(query) || c.label.slice(1).includes(query)
    );
  }, [input]);

  useEffect(() => {
    if (activeTab === "studio") {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, latestArtifact, isLoading, activeTab]);

  // Fetch analytics only when the metrics tab is opened
  useEffect(() => {
    if (activeTab !== "metrics") return;
    const controller = new AbortController();
    setAnalyticsLoading(true);

    let backendUrl = "http://localhost:8000";
    if (typeof window !== "undefined") {
      const host = window.location.hostname;
      if (host !== "localhost" && host !== "127.0.0.1") {
        backendUrl = `http://${host}:8000`;
      }
    }

    fetch(`${backendUrl}/api/analytics/summary`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => { setAnalyticsData(data); setAnalyticsLoading(false); })
      .catch((err) => {
        if (err.name === "AbortError") return;
        console.error("Analytics fetch failed:", err);
        setAnalyticsLoading(false);
      });

    return () => controller.abort();
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
    if (command) formData.append("command", command);
    if (uploadedImage) {
      formData.append("image_base64", uploadedImage.base64);
      formData.append("image_mime", uploadedImage.mimeType);
      formData.append("image_name", uploadedImage.name);
    }

    const result = await startStream(formData);

    if (result.error) {
      setMessages((prev) => [
        ...prev,
        { id: `error-${Date.now()}`, role: "system", content: `Stream error: ${result.error}`, timestamp: new Date() },
      ]);
      return;
    }

    if (result.latestArtifact) {
      setMessages((prev) => [
        ...prev,
        { id: `assistant-${Date.now()}`, role: "assistant", content: result.latestArtifact ?? "", timestamp: new Date() },
      ]);

      // Rough token estimate (4 chars ≈ 1 token) for ambient display.
      // Replace with actual token counts from your streaming response headers when available.
      const promptTokens = Math.ceil((prompt || trimmed).length / 4);
      const responseTokens = Math.ceil((result.latestArtifact?.length ?? 0) / 4);
      const totalNew = promptTokens + responseTokens;
      const costNew = totalNew * 0.000002; // gpt-4o-mini rate, update to match your model

      setSessionStats((prev) => ({
        totalTokens: prev.totalTokens + totalNew,
        estimatedCostUsd: prev.estimatedCostUsd + costNew,
        queryCount: prev.queryCount + 1,
      }));
    }
  }, [input, isStreaming, startStream, uploadedImage]);

  const onInputKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (showCommandMenu && filteredCommands.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedCommandIndex((p) => (p + 1 >= filteredCommands.length ? 0 : p + 1));
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedCommandIndex((p) => (p - 1 < 0 ? filteredCommands.length - 1 : p - 1));
        return;
      }
      if (event.key === "Tab" || event.key === "Enter") {
        event.preventDefault();
        applyCommand(filteredCommands[selectedCommandIndex].id);
        return;
      }
      if (event.key === "Escape") { setShowCommandMenu(false); return; }
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submitPrompt();
    }
  };

  const handleRemoveMessage = (id: string) =>
    setMessages((prev) => prev.filter((m) => m.id !== id));

  // Sidebar is identical between Studio and the mobile sheet
  const SidebarContent = () => (
    <>
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Error Screenshot
        </h3>
        <FileUpload value={uploadedImage} onChange={setUploadedImage} disabled={isStreaming} />
      </div>

      <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Slash Commands
        </h3>
        <ul className="space-y-2 text-xs text-zinc-400">
          {SLASH_COMMANDS.map((cmd) => (
            <li key={cmd.id}>
              <button
                type="button"
                onClick={() => applyCommand(cmd.id)}
                className="font-mono text-emerald-300 hover:text-emerald-200 outline-none"
              >
                {cmd.label}
              </button>
              <span className="ml-2 text-zinc-500">{cmd.description}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Ambient session cost — replaces the full metrics tab in sidebar */}
      <SessionStatsBar stats={sessionStats} />
    </>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full min-h-0 flex-col rounded-xl border border-zinc-800 bg-zinc-950 shadow-2xl shadow-black/40 relative overflow-hidden">

      {/* ── HEADER ── */}
      <header className="flex items-center justify-between gap-3 border-b border-zinc-800 px-4 py-3 sm:px-6 z-10 bg-zinc-950 shrink-0">

        {/* Left: brand */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400">
            <Terminal className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-zinc-100 truncate leading-tight">
              DevMind Developer Studio
            </h2>
            <p className="text-[10px] text-zinc-500 font-mono hidden sm:block leading-tight">
              POST /api/agent/stream
            </p>
          </div>
        </div>

        {/* Right: status + tab toggle + mobile trigger */}
        <div className="flex items-center gap-2 shrink-0">

          {/* Streaming status — only visible in Studio tab */}
          {activeTab === "studio" && (isLoading || isStreaming) && (
            <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] text-emerald-300">
              <Loader2 className="h-3 w-3 animate-spin" />
              {isLoading ? "Connecting" : "Streaming"}
            </span>
          )}

          {/* Active node badge */}
          {activeTab === "studio" && activeNode && (
            <span className="hidden md:inline-flex rounded-full border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-[10px] text-zinc-400 font-mono">
              {activeNode}
            </span>
          )}

          {/* Studio / Metrics tab toggle — kept in header per existing design,
              but Metrics now links to /dashboard for the full view */}
          <div className="flex items-center gap-0.5 bg-zinc-900 border border-zinc-800 p-0.5 rounded-lg">
            <button
              type="button"
              onClick={() => setActiveTab("studio")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors outline-none ${
                activeTab === "studio"
                  ? "bg-emerald-500 text-zinc-950"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <MessageSquare size={12} />
              Studio
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("metrics")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors outline-none ${
                activeTab === "metrics"
                  ? "bg-emerald-500 text-zinc-950"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <BarChart3 size={12} />
              Metrics
            </button>
          </div>

          {/* Mobile sidebar trigger — only in Studio */}
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
      </header>

      {/* ── BODY ── */}
      {activeTab === "studio" ? (

        /* VIEW A: STUDIO */
        <div className="grid min-h-0 flex-1 gap-4 overflow-hidden p-3 sm:p-4 sm:grid-cols-[minmax(0,1fr)_264px]">

          {/* Chat column */}
          <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/40">

            {/* Messages */}
            <div className="flex-1 space-y-4 overflow-y-auto p-3 sm:p-4">

              {messages.length === 0 && !isLoading && !isStreaming && (
                /* ── EMPTY STATE: compact, stays above the fold ── */
                <div className="flex flex-col items-center justify-center h-full min-h-[200px] gap-3 py-8 text-center">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <Terminal className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-zinc-300">DevMind is ready</p>
                    <p className="text-xs text-zinc-500 mt-1">
                      Type a prompt, use a slash command, or drop a screenshot to get started.
                    </p>
                  </div>
                  {/* Compact command hints — not a full 2×2 grid */}
                  <div className="flex flex-wrap justify-center gap-2 mt-2">
                    {SLASH_COMMANDS.map((cmd) => {
                      const Icon = cmd.icon;
                      return (
                        <button
                          key={cmd.id}
                          type="button"
                          onClick={() => applyCommand(cmd.id)}
                          className="flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-1.5 text-xs text-zinc-400 hover:border-emerald-500/40 hover:text-emerald-300 transition-colors font-mono"
                        >
                          <Icon className="h-3 w-3" />
                          {cmd.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
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
                        ? "ml-2 border-emerald-500/20 bg-emerald-500/5 sm:ml-10"
                        : message.role === "assistant"
                          ? "mr-2 border-zinc-700 bg-zinc-950/80 sm:mr-10"
                          : "border-zinc-800 bg-zinc-900/70 text-zinc-400",
                    ].join(" ")}
                  >
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                        {message.role}{message.command ? ` · /${message.command}` : ""}
                      </span>
                      <time className="text-[10px] text-zinc-600" suppressHydrationWarning>
                        {message.timestamp.toLocaleTimeString()}
                      </time>
                    </div>
                    <div className="text-zinc-200 overflow-x-auto">
                      {renderMessageContent(message.content)}
                    </div>
                  </article>
                );
              })}

              {isStreaming && latestArtifact && (
                <article className="mr-2 rounded-lg border border-zinc-700 bg-zinc-950/80 p-3 sm:px-4 sm:py-3 sm:mr-10">
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

              {(isLoading || (isStreaming && !latestArtifact)) && <AgentWorkflowSkeleton />}

              <div ref={messagesEndRef} />
            </div>

            {/* Input bar */}
            <div className="relative border-t border-zinc-800 p-3 sm:p-4 bg-zinc-950/20 shrink-0">
              {showCommandMenu && filteredCommands.length > 0 && (
                <div
                  role="listbox"
                  className="absolute bottom-full left-2 right-2 z-20 mb-2 overflow-hidden rounded-lg border border-zinc-700 bg-zinc-950 shadow-xl sm:left-4 sm:right-4"
                >
                  {filteredCommands.map((cmd, index) => {
                    const Icon = cmd.icon;
                    return (
                      <button
                        key={cmd.id}
                        type="button"
                        role="option"
                        aria-selected={index === selectedCommandIndex}
                        onMouseDown={(e) => { e.preventDefault(); applyCommand(cmd.id); }}
                        className={[
                          "flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors",
                          index === selectedCommandIndex
                            ? "bg-emerald-500/15 text-emerald-200"
                            : "text-zinc-300 hover:bg-zinc-900",
                        ].join(" ")}
                      >
                        <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>
                          <span className="block text-sm font-medium">{cmd.label}</span>
                          <span className="block text-xs text-zinc-500">{cmd.description}</span>
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
                  onChange={(e) => {
                    setInput(e.target.value);
                    setShowCommandMenu(e.target.value.startsWith("/"));
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

          {/* Sidebar — desktop only */}
          <aside className="hidden sm:flex min-h-0 flex-col gap-4 overflow-y-auto">
            <SidebarContent />
          </aside>
        </div>

      ) : (

        /* VIEW B: METRICS */
        <div className="flex-1 overflow-y-auto bg-zinc-950">
          {/* Banner nudging toward the real /dashboard route */}
          <div className="flex items-center justify-between gap-3 border-b border-zinc-800 px-5 py-2.5 bg-zinc-900/50">
            <p className="text-[11px] text-zinc-500">
              Showing summary · Full analytics live at{" "}
              <a href="/dashboard" className="text-emerald-400 hover:underline font-mono">
                /dashboard
              </a>
            </p>
            <a
              href="/dashboard"
              className="text-[11px] text-emerald-400 border border-emerald-500/30 rounded-md px-2.5 py-1 hover:bg-emerald-500/10 transition-colors shrink-0"
            >
              Open Dashboard ↗
            </a>
          </div>
          <AnalyticsDashboard data={analyticsData} loading={analyticsLoading} />
        </div>
      )}

      {/* ── MOBILE DRAWER ── */}
      {isMobilePanelOpen && activeTab === "studio" && (
        <div className="sm:hidden fixed inset-0 z-50 flex flex-col justify-end bg-black/60 backdrop-blur-sm">
          <div className="flex-1" onClick={() => setIsMobilePanelOpen(false)} />
          <div className="bg-zinc-950 border-t border-zinc-800 rounded-t-2xl p-4 space-y-4 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                Context & Tools
              </span>
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