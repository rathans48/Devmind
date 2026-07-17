"use client";

import React, { useState } from 'react';
import { 
  Terminal, 
  Code2, 
  AlertTriangle, 
  HelpCircle, 
  FileCode, 
  Search, 
  ShieldAlert, 
  RefreshCw, 
  Copy, 
  Check 
} from 'lucide-react';

// ==========================================
// 1. 💀 LOADING SKELETON (Zero Layout Shift Agentic Style)
// ==========================================
export function AgentWorkflowSkeleton() {
  return (
    <div className="w-full max-w-4xl mx-auto p-4 sm:p-6 bg-[#16161A] border border-zinc-850 rounded-xl space-y-5 animate-pulse my-4 mr-4 sm:mr-12">
      {/* Active Node Pipeline Tracker */}
      <div className="flex items-center justify-between border-b border-zinc-800/60 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="h-4 bg-zinc-800 w-24 rounded-md"></div>
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-zinc-800/40 border border-zinc-800">
            <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-ping"></div>
            <div className="h-3 bg-zinc-700 w-16 rounded"></div>
          </div>
        </div>
        <div className="h-3 bg-zinc-800 w-12 rounded"></div>
      </div>
      
      {/* Simulated Stream Output Frames */}
      <div className="space-y-3">
        <div className="h-4 bg-zinc-800 w-11/12 rounded-md"></div>
        <div className="h-4 bg-zinc-800 w-full rounded-md"></div>
        
        {/* Mocked Code Block Block Container Frame */}
        <div className="bg-zinc-950/40 border border-zinc-850 rounded-lg p-4 space-y-2 font-mono my-3">
          <div className="h-3 bg-zinc-800/70 w-1/4 rounded"></div>
          <div className="h-3 bg-zinc-800/50 w-3/5 rounded pl-4"></div>
          <div className="h-3 bg-zinc-800/70 w-1/2 rounded pl-2"></div>
        </div>
        
        <div className="h-4 bg-zinc-800 w-4/5 rounded-md"></div>
      </div>

      {/* 🧠 Live LangGraph Step Progress Footer */}
      <div className="pt-2 flex flex-wrap items-center justify-between gap-3 text-[11px] text-zinc-500 border-t border-zinc-800/40">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 font-mono">
          <span className="text-emerald-400 font-medium flex items-center gap-1">
            <Code2 size={12} className="animate-spin" /> Code Agent
          </span>
          <span className="text-zinc-700">➔</span>
          <span className="text-zinc-800">Reviewer</span>
          <span className="text-zinc-700">➔</span>
          <span className="text-zinc-800">Debugger</span>
        </div>
        <div className="h-3 bg-zinc-800 w-20 rounded font-mono"></div>
      </div>
    </div>
  );
}

// ==========================================
// 2. 🌌 EMPTY STATE (Interactive Command shortcuts Dashboard)
// ==========================================
interface EmptyStateProps {
  onCommandClick: (command: string) => void;
}

export function ChatEmptyState({ onCommandClick }: EmptyStateProps) {
  const quickActions = [
    { cmd: '/debug', desc: 'Fix compiler errors, stack exceptions, or layout visual bugs', icon: Terminal, color: 'text-amber-400 border-amber-500/10 bg-amber-500/[0.02] hover:border-amber-500/30' },
    { cmd: '/review', desc: 'Run complete structural security, performance, & quality gate audits', icon: Search, color: 'text-emerald-400 border-emerald-500/10 bg-emerald-500/[0.02] hover:border-emerald-500/30' },
    { cmd: '/explain', desc: 'Break down multi-file computational logic and execution step-by-step', icon: HelpCircle, color: 'text-sky-400 border-sky-500/10 bg-sky-500/[0.02] hover:border-sky-500/30' },
    { cmd: '/document', desc: 'Generate high-fidelity structured technical Markdown documentation modules', icon: FileCode, color: 'text-indigo-400 border-indigo-500/10 bg-indigo-500/[0.02] hover:border-indigo-500/30' },
  ];

  return (
    <div className="w-full max-w-3xl mx-auto text-center py-12 px-4 sm:px-6 flex flex-col items-center justify-center min-h-[65vh]">
      <div className="bg-gradient-to-b from-indigo-500/10 to-transparent p-4 rounded-2xl border border-indigo-500/10 mb-6 group hover:border-indigo-500/20 transition-all duration-300">
        <Code2 size={36} className="text-indigo-400 group-hover:scale-110 transition-transform duration-300" />
      </div>
      
      <h2 className="text-xl sm:text-2xl font-bold text-zinc-100 tracking-tight">DevMind Engine Active</h2>
      <p className="text-zinc-400 text-xs sm:text-sm max-w-md mt-2 mb-8 leading-relaxed">
        Production-grade multi-agent coding assistant. Attach UI error logs, upload snippets, or trigger structural core routing micro-commands below.
      </p>

      {/* Fully Mobile-Responsive Action Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full text-left">
        {quickActions.map((action) => {
          const Icon = action.icon;
          return (
            <button
              key={action.cmd}
              type="button"
              onClick={() => onCommandClick(action.cmd)}
              className={`p-4 border rounded-xl transition-all duration-200 hover:-translate-y-0.5 hover:bg-zinc-900/50 text-zinc-300 hover:text-white flex items-start gap-3.5 group outline-none focus:ring-1 focus:ring-zinc-700 ${action.color}`}
            >
              <div className="p-2 rounded-lg bg-zinc-950/60 border border-zinc-800/40 shrink-0 group-hover:scale-105 transition-transform">
                <Icon size={16} />
              </div>
              <div className="space-y-0.5 min-w-0">
                <span className="font-mono font-bold text-sm tracking-wide block">{action.cmd}</span>
                <span className="text-xs text-zinc-400 group-hover:text-zinc-300 transition-colors block leading-normal line-clamp-2 sm:line-clamp-none">
                  {action.desc}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ==========================================
// 3. ⚠️ DEFENSIVE ERROR DIAGNOSTIC CARD
// ==========================================
interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
}

export function ChatErrorState({ message, onRetry }: ErrorStateProps) {
  const [copied, setCopied] = useState(false);
  const isQuotaExhausted = message?.includes('429') || message?.toLowerCase().includes('quota');

  const handleCopyLogs = async () => {
    try {
      await navigator.clipboard.writeText(message || '');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy exception stream trace:", err);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto my-4 p-4 sm:p-5 bg-zinc-950 border border-red-900/30 rounded-xl flex flex-col sm:flex-row items-start gap-4 shadow-xl shadow-black/20">
      {/* Error Variant Status Icon */}
      <div className={`p-2.5 rounded-lg shrink-0 mx-auto sm:mx-0 ${
        isQuotaExhausted ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
      }`}>
        {isQuotaExhausted ? <ShieldAlert size={18} /> : <AlertTriangle size={18} />}
      </div>
      
      {/* Context Diagnostic Body */}
      <div className="flex-1 space-y-2 w-full text-center sm:text-left min-w-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <h4 className="text-sm font-semibold text-zinc-200">
            {isQuotaExhausted ? 'API Rate Quota Exhausted (429)' : 'LangGraph Execution Gate Blocked'}
          </h4>
          
          {/* Action Tools Bar */}
          {message && (
            <button
              type="button"
              onClick={handleCopyLogs}
              className="inline-flex items-center justify-center gap-1.5 text-[11px] font-medium text-zinc-500 hover:text-zinc-300 transition-colors border border-zinc-800 hover:border-zinc-700 bg-zinc-900/30 px-2 py-1 rounded-md mx-auto sm:mx-0 font-mono"
            >
              {copied ? (
                <>
                  <Check size={12} className="text-emerald-400" /> Copied Trace
                </>
              ) : (
                <>
                  <Copy size={12} /> Copy Error String
                </>
              )}
            </button>
          )}
        </div>

        {/* Scrollable Trace Context Container */}
        <p className="text-xs text-red-400/90 leading-relaxed font-mono bg-red-950/[0.15] p-3 rounded-lg border border-red-950/50 text-left max-h-36 overflow-y-auto w-full break-words">
          {message || 'An unexpected upstream channel disconnect terminated the session checkpointer lifecycle.'}
        </p>
        
        {/* Interactive Control Retry Link Trigger */}
        {onRetry && (
          <div className="pt-1 flex justify-center sm:justify-start">
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-400 hover:text-white transition-colors bg-zinc-900 border border-zinc-800 px-3 py-1.5 rounded-lg shadow-sm hover:border-zinc-700 outline-none focus:ring-1 focus:ring-zinc-700"
            >
              <RefreshCw size={12} /> Dismiss & Clear Session
            </button>
          </div>
        )}
      </div>
    </div>
  );
}