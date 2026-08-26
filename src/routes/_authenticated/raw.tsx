import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/amb/AppShell";
import { RawPayloadStudio } from "@/components/amb/RawPayloadStudio";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { channelLabel, displayName, type ConversationRow } from "@/lib/amb";

export const Route = createFileRoute("/_authenticated/raw")({
  head: () => ({
    meta: [
      { title: "Raw payload playground — AMB Agent Console" },
      {
        name: "description",
        content:
          "Draft, validate, and send raw Apple Messages for Business channel payloads with AI assistance.",
      },
      { property: "og:title", content: "Raw payload playground — AMB Agent Console" },
      {
        property: "og:description",
        content: "Build channel-native Apple MSP payloads and send them into a live conversation.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RawPlayground,
});

function RawPlayground() {
  const [conversationId, setConversationId] = useState("");

  const { data: conversations = [] } = useQuery({
    queryKey: ["conversations", "picker"],
    queryFn: async (): Promise<ConversationRow[]> => {
      const { data, error } = await supabase
        .from("conversations")
        .select("*")
        .order("last_message_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as ConversationRow[];
    },
  });

  const selected = conversations.find((conversation) => conversation.id === conversationId);

  return (
    <AppShell>
      <div className="h-full overflow-y-auto px-6 py-6">
        <div className="max-w-3xl">
          <h1 className="text-base font-semibold text-foreground">Raw payload playground</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Iterate on a channel-native Apple MSP payload, let AI draft or repair it, then send it
            into a conversation when it validates.
          </p>

          <div className="mt-5 space-y-2">
            <label className="text-xs font-medium text-foreground">Send into</label>
            <Select value={conversationId} onValueChange={setConversationId}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Draft only — pick a conversation to enable sending" />
              </SelectTrigger>
              <SelectContent>
                {conversations.map((conversation) => (
                  <SelectItem key={conversation.id} value={conversation.id}>
                    {displayName(conversation)} · {channelLabel(conversation.channel_platform)}
                    {conversation.opted_out ? " · opted out" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selected?.opted_out ? (
              <p className="text-[11px] text-destructive">
                This customer opted out — sending is blocked.
              </p>
            ) : null}
          </div>

          <div className="mt-5 rounded-lg border border-border bg-card p-4">
            <RawPayloadStudio
              {...(conversationId ? { conversationId } : {})}
              canSend={Boolean(selected) && !selected?.opted_out}
            />
          </div>
        </div>
      </div>
    </AppShell>
  );
}
