import { createFileRoute, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { listTemplates, sendMessage } from "@/lib/msp.functions";
import { AttachmentPicker, type PendingAttachment } from "@/components/amb/AttachmentPicker";
import { MessageItem } from "@/components/amb/MessageItem";
import { RawPayloadStudio } from "@/components/amb/RawPayloadStudio";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  channelLabel,
  displayName,
  type ConversationRow,
  type MessageRow,
  type OutboundLogRow,
} from "@/lib/amb";

export const Route = createFileRoute("/_authenticated/inbox/$conversationId")({
  component: ConversationView,
});

function ConversationView() {
  const { conversationId } = useParams({ from: "/_authenticated/inbox/$conversationId" });
  const queryClient = useQueryClient();
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: conversation } = useQuery({
    queryKey: ["conversation", conversationId],
    queryFn: async (): Promise<ConversationRow | null> => {
      const { data, error } = await supabase
        .from("conversations")
        .select("*")
        .eq("id", conversationId)
        .maybeSingle();
      if (error) throw error;
      return (data as ConversationRow) ?? null;
    },
  });

  const { data: messages = [] } = useQuery({
    queryKey: ["messages", conversationId],
    queryFn: async (): Promise<MessageRow[]> => {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("occurred_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as MessageRow[];
    },
  });

  const { data: logs = [] } = useQuery({
    queryKey: ["outbound", conversationId],
    queryFn: async (): Promise<OutboundLogRow[]> => {
      const { data, error } = await supabase
        .from("outbound_log")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as OutboundLogRow[];
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel(`thread-${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["messages", conversationId] });
          queryClient.invalidateQueries({ queryKey: ["outbound", conversationId] });
          queryClient.invalidateQueries({ queryKey: ["conversation", conversationId] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, queryClient]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  const logByRequestId = new Map(logs.map((log) => [log.request_message_id, log]));

  if (!conversation) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading conversation…
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-2.5">
        <div>
          <h1 className="text-sm font-semibold text-foreground">{displayName(conversation)}</h1>
          <p className="text-[11px] text-muted-foreground">
            {channelLabel(conversation.channel_platform)} · {conversation.status} ·{" "}
            {conversation.agent_status}
          </p>
        </div>
      </header>

      {conversation.opted_out ? (
        <div className="border-b border-destructive/40 bg-destructive/10 px-4 py-2 text-xs text-destructive">
          This customer has opted out. Sending is disabled — opt-out is binding.
        </div>
      ) : null}

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.map((message) => {
          const log = message.request_identifier
            ? logByRequestId.get(message.request_identifier)
            : undefined;
          return <MessageItem key={message.id} message={message} {...(log ? { log } : {})} />;
        })}
        <div ref={bottomRef} />
      </div>

      <Composer conversation={conversation} />
    </div>
  );
}

function Composer({ conversation }: { conversation: ConversationRow }) {
  const queryClient = useQueryClient();
  const send = useServerFn(sendMessage);
  const [body, setBody] = useState("");
  const [pending, setPending] = useState<PendingAttachment[]>([]);
  const readyAttachments = pending.flatMap((item) => (item.uploaded ? [item.uploaded] : []));

  const [templateId, setTemplateId] = useState("");
  const [variables, setVariables] = useState<Record<string, string>>({});

  const { data: templateData } = useQuery({
    queryKey: ["templates"],
    queryFn: useServerFn(listTemplates),
  });

  const templates = (templateData?.templates ?? []).filter(
    (template) => template.status === "published",
  );
  const selected = templates.find((template) => template.id === templateId);
  const readiness = selected?.readiness.find(
    (entry) => entry.channel === conversation.channel_platform,
  );
  const blocked = Boolean(selected) && readiness?.status !== "ready";

  const mutation = useMutation({
    mutationFn: async (input: Parameters<typeof send>[0]) => send(input),
    onSuccess: (result) => {
      if (result.ok) {
        setBody("");
        setPending((previous) => {
          previous.forEach((item) => item.previewUrl && URL.revokeObjectURL(item.previewUrl));
          return [];
        });
        setVariables({});
        queryClient.invalidateQueries({ queryKey: ["messages", conversation.id] });
        queryClient.invalidateQueries({ queryKey: ["outbound", conversation.id] });
      } else {
        const reasons = (result.reasons ?? [])
          .map((reason) => reason.message ?? reason.code)
          .join(" · ");
        toast.error(result.message, reasons ? { description: reasons } : undefined);
      }
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Send failed"),
  });

  if (conversation.opted_out) {
    return (
      <div className="shrink-0 border-t border-border bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
        Composer disabled — this customer opted out.
      </div>
    );
  }

  return (
    <div className="shrink-0 border-t border-border bg-card px-4 py-3">
      <Tabs defaultValue="text">
        <TabsList className="h-8">
          <TabsTrigger value="text" className="text-xs">
            Text
          </TabsTrigger>
          <TabsTrigger value="rich" className="text-xs">
            Rich template
          </TabsTrigger>
          <TabsTrigger value="raw" className="text-xs">
            Raw
          </TabsTrigger>
        </TabsList>

        <TabsContent value="text" className="mt-3 space-y-2">
          <Textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Write a reply…"
            rows={3}
          />
          <AttachmentPicker
            conversationId={conversation.id}
            channelPlatform={conversation.channel_platform}
            items={pending}
            onChange={(updater) => setPending((previous) => updater(previous))}
            disabled={mutation.isPending}
          />
          <div className="flex items-center justify-end gap-2">
            <Button
              size="sm"
              disabled={
                mutation.isPending ||
                pending.some((item) => item.status === "uploading") ||
                (!body.trim() && readyAttachments.length === 0)
              }
              onClick={() =>
                mutation.mutate({
                  data: {
                    conversationId: conversation.id,
                    ...(body.trim() ? { body: body.trim() } : {}),
                    ...(readyAttachments.length ? { attachments: readyAttachments } : {}),
                  },
                })
              }
            >
              Send
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="rich" className="mt-3 space-y-2">
          {templates.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No published templates available for this org yet.
            </p>
          ) : (
            <>
              <Select value={templateId} onValueChange={setTemplateId}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Choose a published template" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {selected?.variables.map((variable) => (
                <Input
                  key={variable.name}
                  value={variables[variable.name] ?? ""}
                  onChange={(event) =>
                    setVariables((previous) => ({
                      ...previous,
                      [variable.name]: event.target.value,
                    }))
                  }
                  placeholder={`${variable.name}${variable.required ? " (required)" : ""}`}
                  className="h-8 text-xs"
                />
              ))}

              {blocked ? (
                <p className="text-xs text-destructive">
                  Blocked on {channelLabel(conversation.channel_platform)}:{" "}
                  {(readiness?.reasons ?? []).map((reason) => reason.code).join(", ") ||
                    "not supported on this channel"}
                </p>
              ) : null}

              <Button
                size="sm"
                disabled={!templateId || blocked || mutation.isPending}
                onClick={() =>
                  mutation.mutate({
                    data: {
                      conversationId: conversation.id,
                      templateId,
                      variables,
                    },
                  })
                }
              >
                Send template
              </Button>
            </>
          )}
        </TabsContent>

        <TabsContent value="raw" className="mt-3">
          <RawPayloadStudio
            conversationId={conversation.id}
            canSend={!conversation.opted_out}
            onSent={() => {
              queryClient.invalidateQueries({ queryKey: ["messages", conversation.id] });
              queryClient.invalidateQueries({ queryKey: ["outbound", conversation.id] });
            }}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
