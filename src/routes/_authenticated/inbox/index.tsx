import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/inbox/")({
  component: () => (
    <div className="flex h-full items-center justify-center p-8 text-center">
      <p className="max-w-xs text-sm text-muted-foreground">
        Select a conversation on the left to read the thread and reply.
      </p>
    </div>
  ),
});
