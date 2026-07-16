"use client";

import { useCallback, useRef, useState } from "react";

const STREAM_URL = "http://localhost:8000/api/agent/stream";

export interface AgentStreamEvent {
  active_node?: string;
  latest_artifact?: string;
  raw?: string;
}

export interface AgentStreamResult {
  events: AgentStreamEvent[];
  activeNode: string | null;
  latestArtifact: string | null;
  error: string | null;
  aborted: boolean;
}

export interface UseAgentStreamReturn {
  isStreaming: boolean;
  isLoading: boolean;
  activeNode: string | null;
  latestArtifact: string | null;
  events: AgentStreamEvent[];
  error: string | null;
  startStream: (formData: FormData) => Promise<AgentStreamResult>;
  abort: () => void;
  reset: () => void;
}

function parseStreamPayload(raw: string): AgentStreamEvent | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === "[DONE]") return null;

  try {
    const parsed = JSON.parse(trimmed) as AgentStreamEvent;
    return parsed;
  } catch {
    return { raw: trimmed };
  }
}

function applyEvent(
  event: AgentStreamEvent,
  setActiveNode: (node: string | null) => void,
  setLatestArtifact: (artifact: string | null) => void,
) {
  if (event.active_node) {
    setActiveNode(event.active_node);
  }
  if (event.latest_artifact !== undefined) {
    setLatestArtifact(event.latest_artifact);
  }
}

export function useAgentStream(): UseAgentStreamReturn {
  const [isStreaming, setIsStreaming] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [activeNode, setActiveNode] = useState<string | null>(null);
  const [latestArtifact, setLatestArtifact] = useState<string | null>(null);
  const [events, setEvents] = useState<AgentStreamEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    setIsStreaming(false);
    setIsLoading(false);
    setActiveNode(null);
    setLatestArtifact(null);
    setEvents([]);
    setError(null);
  }, []);

  const abort = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);
    setIsLoading(false);
  }, []);

  const startStream = useCallback(async (formData: FormData): Promise<AgentStreamResult> => {
    abortRef.current?.abort();

    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    setIsStreaming(true);
    setError(null);
    setActiveNode(null);
    setLatestArtifact(null);
    setEvents([]);

    let nextActiveNode: string | null = null;
    let nextLatestArtifact: string | null = null;
    const nextEvents: AgentStreamEvent[] = [];
    let nextError: string | null = null;
    let aborted = false;

    try {
      const response = await fetch(STREAM_URL, {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Stream request failed (${response.status})`);
      }

      if (!response.body) {
        throw new Error("No response body received from agent stream");
      }

      setIsLoading(false);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const payload = line.startsWith("data:")
            ? line.slice(5).trim()
            : line.trim();

          if (!payload) continue;

          const event = parseStreamPayload(payload);
          if (!event) continue;

          nextEvents.push(event);
          if (event.active_node) {
            nextActiveNode = event.active_node;
          }
          if (event.latest_artifact !== undefined) {
            nextLatestArtifact = event.latest_artifact;
          }

          setEvents((prev) => [...prev, event]);
          applyEvent(event, setActiveNode, setLatestArtifact);
        }
      }

      const trailing = buffer.trim();
      if (trailing) {
        const payload = trailing.startsWith("data:")
          ? trailing.slice(5).trim()
          : trailing;
        const event = parseStreamPayload(payload);
        if (event) {
          nextEvents.push(event);
          if (event.active_node) {
            nextActiveNode = event.active_node;
          }
          if (event.latest_artifact !== undefined) {
            nextLatestArtifact = event.latest_artifact;
          }
          setEvents((prev) => [...prev, event]);
          applyEvent(event, setActiveNode, setLatestArtifact);
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        aborted = true;
      } else {
        nextError = err instanceof Error ? err.message : "Unknown streaming error";
        setError(nextError);
      }
    } finally {
      setIsStreaming(false);
      setIsLoading(false);
      abortRef.current = null;
    }

    return {
      events: nextEvents,
      activeNode: nextActiveNode,
      latestArtifact: nextLatestArtifact,
      error: nextError,
      aborted,
    };
  }, []);

  return {
    isStreaming,
    isLoading,
    activeNode,
    latestArtifact,
    events,
    error,
    startStream,
    abort,
    reset,
  };
}
