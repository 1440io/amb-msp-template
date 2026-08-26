import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { draftPayload } from "@/lib/ai.functions";
import {
  createTemplate,
  sendMessage,
  sendRaw,
  templateLifecycle,
} from "@/lib/msp.functions";
import { JsonDebugPanel, type DebugEntry } from "@/components/amb/JsonDebugPanel";
import { AssetDialog } from "@/components/amb/AssetDialog";
import { AssetThumb } from "@/components/amb/AssetThumb";
import type { AssetView } from "@/lib/msp.server";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  RAW_MESSAGE_TYPES,
  RAW_PAYLOAD_SKELETONS,
  parseJson,
  rawMessageTypeLabel,
  validateRawPayload,
  type RawMessageType,
} from "@/lib/raw-payloads";
import { RICH_LINK_IMAGE_NOTE, buildRichLinkPayload, extractUrls } from "@/lib/links";
import { getLinkMetadata } from "@/lib/link-preview.functions";



type Props = {
  /** When present, the studio can send straight into this conversation. */
  conversationId?: string;
  canSend?: boolean;
  onSent?: () => void;
};

export function RawPayloadStudio({ conversationId, canSend = true, onSent }: Props) {
  const [messageType, setMessageType] = useState<RawMessageType>("quick_reply");
  const [prompt, setPrompt] = useState("");
  const [json, setJson] = useState(() =>
    JSON.stringify(RAW_PAYLOAD_SKELETONS["quick_reply"], null, 2),
  );
  const [notes, setNotes] = useState<string[]>([]);
  const [debug, setDebug] = useState<DebugEntry | null>(null);
  const [showDebug, setShowDebug] = useState(false);

  const draft = useServerFn(draftPayload);
  const send = useServerFn(sendRaw);
  const metadata = useServerFn(getLinkMetadata);


  const parsed = parseJson(json);
  const problems = parsed.ok
    ? validateRawPayload(messageType, parsed.value)
    : [`Invalid JSON: ${parsed.error}`];

  const ai = useMutation({
    mutationFn: async (mode: "create" | "review") =>
      draft({
        data: {
          messageType,
          prompt,
          ...(mode === "review" ? { existingJson: json } : {}),
        },
      }),
    onSuccess: (result) => {
      if (!result.ok || !result.json) {
        toast.error(result.error ?? "The model could not produce a payload");
        setDebug({ label: "AI draft failed", detail: result });
        setShowDebug(true);
        return;
      }
      setJson(result.json);
      setNotes(result.notes);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "AI request failed");
      setDebug({
        label: "AI request threw",
        detail: { message: error instanceof Error ? error.message : String(error) },
      });
      setShowDebug(true);
    },
  });

  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!conversationId || !parsed.ok) throw new Error("Nothing to send");
      return send({
        data: {
          conversationId,
          messageType,
          payload: parsed.value as Record<string, unknown>,
        },
      });
    },
    onSuccess: (result) => {
      setDebug({ label: result.ok ? "Send accepted" : "Send rejected", detail: result });
      if (result.ok) {
        setShowDebug(false);
        toast.success(result.duplicate ? "Already delivered (idempotent replay)" : "Raw payload sent");
        onSent?.();
      } else {
        setShowDebug(true);
        const reasons = (result.reasons ?? [])
          .map((reason) => reason.message ?? reason.code)
          .join(" · ");
        const status = result.status ? `HTTP ${result.status}` : "no response";
        toast.error(`${status}${result.code ? ` · ${result.code}` : ""}: ${result.message}`, {
          description: reasons || "Open the debug panel for the full response.",
        });
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Send failed");
      setDebug({
        label: "Send threw before a response",
        detail: { message: error instanceof Error ? error.message : String(error) },
      });
      setShowDebug(true);
    },
  });

  function changeType(value: string) {
    const next = value as RawMessageType;
    setMessageType(next);
    setJson(JSON.stringify(RAW_PAYLOAD_SKELETONS[next], null, 2));
    setNotes([]);
    setDebug(null);
  }

  /** URLs typed into the payload (or the link box) can become a rich link. */
  const detectedUrl = extractUrls(json)[0] ?? "";

  const linkFill = useMutation({
    mutationFn: async (url: string) => metadata({ data: { url } }),
    onSuccess: (result) => {
      setMessageType("rich_link");
      setJson(JSON.stringify(buildRichLinkPayload(result), null, 2));
      setNotes([
        result.title
          ? `Filled from the page: “${result.title}”.`
          : "Could not read page metadata — sending the URL alone.",
        ...(result.note ? [result.note] : []),
        ...(result.imageUrl ? [RICH_LINK_IMAGE_NOTE] : []),
      ]);

      toast.success("Rich link payload filled from the page");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not read that link"),
  });

  /**
   * Apple's gateway rejects inline images on raw rich links, so an image-bearing
   * link is sent as a one-off rich template: draft, publish, send, in one click.
   */
  const richLinkImage = useMutation({
    mutationFn: async () => {
      if (!conversationId) throw new Error("Pick a conversation first");
      if (!parsed.ok) throw new Error("Fix the payload JSON first");
      if (!imageAsset) throw new Error("Choose an image first");
      const payload = parsed.value as { richLinkData?: { url?: string; title?: string } };
      const url = payload.richLinkData?.url ?? "";
      const title = payload.richLinkData?.title ?? "Link";
      if (!url) throw new Error("The rich link needs a URL");

      const created = await createDraft({
        data: {
          name: `Rich link · ${title} · ${new Date().toISOString().slice(0, 19)}`,
          definition: {
            mode: "native",
            channel: "amb",
            variables: [{ name: "linkUrl", type: "url", required: true, itemSchema: null }],
            content: {
              kind: "rich_link",
              title,
              url: "{{linkUrl}}",
              imageSlot: "heroImage",
              videoUrl: null,
            },
          },
          slotBindings: [{ slotName: "heroImage", assetId: imageAsset.id }],
        },
      });
      if (!created.ok || !created.template) throw new Error(created.error ?? "Could not create the template");

      const published = await runLifecycle({
        data: { templateId: created.template.id, action: "publish" },
      });
      if (!published.ok) throw new Error(published.error ?? "Could not publish the template");

      return sendTemplate({
        data: {
          conversationId,
          templateId: created.template.id,
          variables: { linkUrl: url },
        },
      });
    },
    onSuccess: (result) => {
      setDebug({ label: result.ok ? "Template send accepted" : "Template send rejected", detail: result });
      if (result.ok) {
        setShowDebug(false);
        toast.success("Rich link with image sent as a template");
        onSent?.();
      } else {
        setShowDebug(true);
        toast.error(result.message);
      }
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Send failed"),
  });


  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={messageType} onValueChange={changeType}>
          <SelectTrigger className="h-8 w-[170px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RAW_MESSAGE_TYPES.map((type) => (
              <SelectItem key={type} value={type}>
                {rawMessageTypeLabel(type)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          variant="secondary"
          disabled={ai.isPending || !prompt.trim()}
          onClick={() => ai.mutate("create")}
        >
          {ai.isPending && ai.variables === "create" ? "Drafting…" : "Draft with AI"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={ai.isPending}
          onClick={() => ai.mutate("review")}
        >
          {ai.isPending && ai.variables === "review" ? "Reviewing…" : "Review & fix"}
        </Button>
      </div>

      <Textarea
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        placeholder="Describe the message — e.g. “three quick replies: pick up in store, ship to me, store credit”"
        rows={2}
        className="text-xs"
      />

      {detectedUrl ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
          <span className="truncate">Link detected: {detectedUrl}</span>
          <Button
            size="sm"
            variant="secondary"
            className="ml-auto h-7 text-xs"
            disabled={linkFill.isPending}
            onClick={() => linkFill.mutate(detectedUrl)}
          >
            {linkFill.isPending
              ? "Reading page…"
              : messageType === "rich_link"
                ? "Refill from page"
                : "Convert to rich link"}
          </Button>
        </div>
      ) : null}



      <Textarea
        value={json}
        onChange={(event) => {
          setJson(event.target.value);
          setNotes([]);
        }}
        spellCheck={false}
        rows={14}
        className="font-mono text-[11px] leading-relaxed"
      />

      {notes.length > 0 ? (
        <ul className="space-y-1 rounded-md border border-border bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
          {notes.map((note, index) => (
            <li key={index}>· {note}</li>
          ))}
        </ul>
      ) : null}

      {problems.length > 0 ? (
        <ul className="space-y-1 text-[11px] text-destructive">
          {problems.map((problem, index) => (
            <li key={index}>· {problem}</li>
          ))}
        </ul>
      ) : (
        <p className="text-[11px] text-muted-foreground">
          Payload passes local validation for {rawMessageTypeLabel(messageType)}.
        </p>
      )}

      <JsonDebugPanel entry={debug} open={showDebug} onToggle={() => setShowDebug((v) => !v)} />


      {conversationId ? (
        <Button
          size="sm"
          disabled={!canSend || problems.length > 0 || sendMutation.isPending}
          onClick={() => sendMutation.mutate()}
        >
          {sendMutation.isPending ? "Sending…" : "Send raw payload"}
        </Button>

      ) : null}
    </div>
  );
}
