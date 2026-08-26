import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/amb/AppShell";
import { DemoBanner } from "@/components/amb/DemoBanner";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { channelLabel, displayName, initials, relativeTime, type ConversationRow } from "@/lib/amb";

export const Route = createFileRoute("/_authenticated/inbox")({
  head: () => ({
    meta: [
      { title: "Inbox — AMB Agent Console" },
      {
        name: "description",
        content: "Live agent inbox for Apple Messages for Business conversations.",
      },
      { property: "og:title", content: "Inbox — AMB Agent Console" },
      {
        property: "og:description",
        content: "Answer Apple Messages for Business customers in real time.",
      },
    ],
  }),
  component: InboxLayout,
});

export function useConversations() {
  return useQuery({
    queryKey: ["conversations"],
    queryFn: async (): Promise<ConversationRow[]> => {
      const { data, error } = await supabase
        .from("conversations")
        .select("*")
        .order("last_message_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ConversationRow[];
    },
  });
}

function InboxLayout() {
  const queryClient = useQueryClient();
  const { data: conversations = [] } = useConversations();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [channel, setChannel] = useState("all");

  useEffect(() => {
    const channelSub = supabase
      .channel("inbox-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, () => {
        queryClient.invalidateQueries({ queryKey: ["conversations"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => {
        queryClient.invalidateQueries({ queryKey: ["conversations"] });
        queryClient.invalidateQueries({ queryKey: ["messages"] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channelSub);
    };
  }, [queryClient]);

  const channels = useMemo(
    () => Array.from(new Set(conversations.map((item) => item.channel_platform))),
    [conversations],
  );

  const filtered = conversations.filter((conversation) => {
    if (status !== "all" && conversation.status !== status) return false;
    if (channel !== "all" && conversation.channel_platform !== channel) return false;
    if (search.trim()) {
      const haystack = `${displayName(conversation)} ${conversation.last_message_preview ?? ""}`;
      if (!haystack.toLowerCase().includes(search.trim().toLowerCase())) return false;
    }
    return true;
  });

  const demo = conversations.length > 0 && conversations.every((item) => item.is_demo);

  return (
    <AppShell>
      <div className="flex h-full flex-col">
        {demo ? <DemoBanner /> : null}
        <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[20rem_1fr]">
          <aside className="flex min-h-0 flex-col border-r border-border bg-sidebar">
            <div className="space-y-2 border-b border-border p-3">
              <InvitationPanel />
              <Input
                placeholder="Search conversations"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="h-8"
              />
              <div className="flex gap-2">
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger className="h-8 flex-1 text-xs">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                    <SelectItem value="opted_out">Opted out</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={channel} onValueChange={setChannel}>
                  <SelectTrigger className="h-8 flex-1 text-xs">
                    <SelectValue placeholder="Channel" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All channels</SelectItem>
                    {channels.map((item) => (
                      <SelectItem key={item} value={item}>
                        {channelLabel(item)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {filtered.length === 0 ? (
                <p className="p-4 text-xs text-muted-foreground">No conversations match.</p>
              ) : (
                filtered.map((conversation) => (
                  <Link
                    key={conversation.id}
                    to="/inbox/$conversationId"
                    params={{ conversationId: conversation.id }}
                    className="flex gap-3 border-b border-border px-3 py-2.5 transition-colors hover:bg-accent/60 data-[status=active]:bg-accent"
                  >
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-medium text-muted-foreground">
                      {initials(conversation) || "?"}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <p className="truncate text-sm font-medium text-foreground">
                          {displayName(conversation)}
                        </p>
                        <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
                          {relativeTime(conversation.last_message_at)}
                        </span>
                      </div>
                      <p className="truncate text-xs text-muted-foreground">
                        {conversation.last_message_preview ?? "No messages yet"}
                      </p>
                      <div className="mt-1 flex items-center gap-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                        <span>{channelLabel(conversation.channel_platform)}</span>
                        {conversation.opted_out ? (
                          <span className="text-destructive">Opted out</span>
                        ) : null}
                        {conversation.unread_count > 0 ? (
                          <span className="ml-auto rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground">
                            {conversation.unread_count}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </aside>
          <section className="min-h-0 overflow-hidden">
            <Outlet />
          </section>
        </div>
      </div>
    </AppShell>
  );
}
