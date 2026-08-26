import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { draftPayload } from "@/lib/ai.functions";
import { sendRaw } from "@/lib/msp.functions";
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
  const [debug, setDebug] = useState<{ label: string; detail: unknown } | null>(null);
  const [showDebug, setShowDebug] = useState(false);

  const draft = useServerFn(draftPayload);
  const send = useServerFn(sendRaw);

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

      {debug ? (
        <div className="rounded-md border border-border bg-muted/30">
          <div className="flex items-center justify-between px-3 py-1.5">
            <button
              type="button"
              className="text-[11px] font-medium text-foreground"
              onClick={() => setShowDebug((value) => !value)}
            >
              {showDebug ? "▾" : "▸"} Debug · {debug.label}
            </button>
            <button
              type="button"
              className="text-[11px] text-muted-foreground hover:text-foreground"
              onClick={() => {
                void navigator.clipboard.writeText(JSON.stringify(debug.detail, null, 2));
                toast.success("Debug detail copied");
              }}
            >
              Copy
            </button>
          </div>
          {showDebug ? (
            <pre className="max-h-64 overflow-auto border-t border-border px-3 py-2 font-mono text-[10px] leading-relaxed text-muted-foreground">
              {JSON.stringify(debug.detail, null, 2)}
            </pre>
          ) : null}
        </div>
      ) : null}

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
