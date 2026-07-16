import ChatInterface from "@/components/ChatInterface";

export default function Home() {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-zinc-950 text-zinc-100">
      <div className="mx-auto flex h-full w-full max-w-7xl flex-1 flex-col px-4 py-4 sm:px-6 sm:py-6 lg:py-8">
        <div className="mb-4 sm:mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">
            DevMind Workspace
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-zinc-50 sm:text-3xl">
            Developer Studio
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-400 sm:text-base">
            Stream multi-agent responses, attach error screenshots, and drive
            specialist workflows with slash commands.
          </p>
        </div>

        <div className="min-h-[calc(100vh-12rem)] flex-1">
          <ChatInterface />
        </div>
      </div>
    </div>
  );
}
