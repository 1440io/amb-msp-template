// Shows the reply fields captured from this customer, so an agent can see
// exactly what a template can reuse.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, ChevronRight } from "lucide-react";
import { listConversationReplies } from "@/lib/data-sources.functions";
import { relativeTime } from "@/lib/amb";

export function ConversationReplies({ conversationId }: { conversationId: string }) {
  const [open, setOpen] = useState(false);
  const fetchReplies = useServerFn(listConversationReplies);
  const { data } = useQuery({
    queryKey: ["conversation-replies", conversationId],
    queryFn: () => fetchReplies({ data: { conversationId } }),
  });

  const fields = data?.fields ?? [];
  if (fields.length === 0) return null;

  return (
    <div className="rounded-md border border-border bg-card">
      <button
        type="button"
        className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
        onClick={() => setOpen((previous) => !previous)}
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        Captured replies ({fields.length})
      </button>
      {open ? (
        <div className="border-t border-border">
          {fields.map((field) => (
            <div
              key={field.key}
              className="flex items-baseline gap-2 border-b border-border px-2.5 py-1.5 text-xs last:border-0"
            >
              <span className="shrink-0 text-muted-foreground">{field.label}</span>
              <span className="min-w-0 flex-1 truncate text-foreground">{field.text}</span>
              <span className="shrink-0 text-[10px] text-muted-foreground">
                {relativeTime(field.occurredAt)}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
