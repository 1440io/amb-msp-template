import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { draftTemplate } from "@/lib/ai.functions";
import { createTemplate, listAssets, updateTemplate } from "@/lib/msp.functions";
import type { TemplateAdminView } from "@/lib/msp.server";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { JsonDebugPanel, type DebugEntry } from "@/components/amb/JsonDebugPanel";
import {
  parseJson,
  RAW_MESSAGE_TYPES,
  rawMessageTypeLabel,
  type Json,
  type RawMessageType,
} from "@/lib/raw-payloads";
import {
  inferTemplateShape,
  templateModeLabel,
  templateSkeleton,
  TEMPLATE_MODES,
  validateTemplateDefinition,
  type TemplateMode,
} from "@/lib/template-definitions";

type SlotBinding = { slotName: string; assetId: string };

export function TemplateEditor({
  template,
  onSaved,
  onCancel,
}: {
  template?: TemplateAdminView;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const inferred = template
    ? inferTemplateShape(template.definition)
    : { messageType: "quick_reply" as RawMessageType, mode: "canonical" as TemplateMode };

  const [name, setName] = useState(template?.name ?? "");
  const [messageType, setMessageType] = useState<RawMessageType>(inferred.messageType);
  const [mode, setMode] = useState<TemplateMode>(inferred.mode);
  const [prompt, setPrompt] = useState("");
  const [json, setJson] = useState(() =>
    JSON.stringify(
      template ? template.definition : templateSkeleton(inferred.messageType, inferred.mode),
      null,
      2,
    ),
  );
  const [notes, setNotes] = useState<string[]>([]);
  const [bindings, setBindings] = useState<SlotBinding[]>(template?.slotBindings ?? []);
  const [debug, setDebug] = useState<DebugEntry | null>(null);
  const [showDebug, setShowDebug] = useState(false);

  const draft = useServerFn(draftTemplate);
  const create = useServerFn(createTemplate);
  const update = useServerFn(updateTemplate);

  const { data: assetData } = useQuery({ queryKey: ["assets"], queryFn: useServerFn(listAssets) });

  const parsed = json.trim() ? parseJson(json) : { ok: false as const, error: "Definition is empty" };
  const problems = parsed.ok
    ? validateTemplateDefinition(messageType, mode, parsed.value)
    : [parsed.error];

  /** Reseed the definition whenever the type or mode changes. */
  function reseed(nextType: RawMessageType, nextMode: TemplateMode) {
    setMessageType(nextType);
    setMode(nextMode);
    setJson(JSON.stringify(templateSkeleton(nextType, nextMode), null, 2));
    setNotes([]);
    setDebug(null);
  }

  const ai = useMutation({
    mutationFn: async (aiMode: "create" | "review") =>
      draft({
        data: {
          prompt,
          messageType,
          mode,
          ...(aiMode === "review" && json.trim() ? { existingJson: json } : {}),
        },
      }),
    onSuccess: (result) => {
      if (!result.ok || !result.json) {
        toast.error(result.error ?? "The model could not produce a definition");
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

  const save = useMutation({
    mutationFn: async (): Promise<{ ok: boolean; error?: string }> => {
      if (!parsed.ok) throw new Error(parsed.error);
      const body = {
        name: name.trim(),
        definition: parsed.value as Json,
        slotBindings: bindings.filter((binding) => binding.slotName && binding.assetId),
      };
      return template
        ? update({ data: { templateId: template.id, ...body } })
        : create({ data: body });
    },
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.error ?? "Save failed");
        setDebug({
          label: "Save rejected",
          detail: {
            messageType,
            mode,
            templateId: template?.id ?? null,
            response: result,
            definition: parsed.ok ? parsed.value : json,
          },
        });
        setShowDebug(true);
        return;
      }
      setDebug(null);
      toast.success(template ? "Draft updated" : "Draft created");
      onSaved();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Save failed");
      setDebug({
        label: "Save threw before a response",
        detail: { message: error instanceof Error ? error.message : String(error) },
      });
      setShowDebug(true);
    },
  });

  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-medium text-foreground">
          {template ? `Edit “${template.name}”` : "New template"}
        </h2>
        <Button size="sm" variant="ghost" className="ml-auto" onClick={onCancel}>
          Cancel
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Template name"
          className="h-8 min-w-[180px] flex-1 text-xs"
        />
        <Select value={messageType} onValueChange={(value) => reseed(value as RawMessageType, mode)}>
          <SelectTrigger className="h-8 w-[150px] text-xs">
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
        <Select value={mode} onValueChange={(value) => reseed(messageType, value as TemplateMode)}>
          <SelectTrigger className="h-8 w-[190px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TEMPLATE_MODES.map((entry) => (
              <SelectItem key={entry} value={entry}>
                {templateModeLabel(entry)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Textarea
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        placeholder="Describe the template — e.g. “quick reply asking to confirm or reschedule an appointment, with a customerName variable”"
        rows={2}
        className="text-xs"
      />

      <div className="flex flex-wrap gap-2">
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
          disabled={ai.isPending || !json.trim()}
          onClick={() => ai.mutate("review")}
        >
          {ai.isPending && ai.variables === "review" ? "Reviewing…" : "Review & fix"}
        </Button>
      </div>

      <Textarea
        value={json}
        onChange={(event) => {
          setJson(event.target.value);
          setNotes([]);
        }}
        spellCheck={false}
        rows={14}
        placeholder="Template definition JSON"
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
          Definition passes local validation for {rawMessageTypeLabel(messageType)} (
          {templateModeLabel(mode)}).
        </p>
      )}

      <JsonDebugPanel entry={debug} open={showDebug} onToggle={() => setShowDebug((v) => !v)} />

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-foreground">Asset slot bindings</span>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs"
            onClick={() => setBindings((previous) => [...previous, { slotName: "", assetId: "" }])}
          >
            Add binding
          </Button>
        </div>
        {bindings.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">
            None. Add one when the definition references an image slot.
          </p>
        ) : (
          bindings.map((binding, index) => (
            <div key={index} className="flex items-center gap-2">
              <Input
                value={binding.slotName}
                onChange={(event) =>
                  setBindings((previous) =>
                    previous.map((entry, i) =>
                      i === index ? { ...entry, slotName: event.target.value } : entry,
                    ),
                  )
                }
                placeholder="slotName"
                className="h-8 text-xs"
              />
              <Input
                value={binding.assetId}
                onChange={(event) =>
                  setBindings((previous) =>
                    previous.map((entry, i) =>
                      i === index ? { ...entry, assetId: event.target.value } : entry,
                    ),
                  )
                }
                placeholder="assetId"
                className="h-8 text-xs"
              />
              <Button
                size="sm"
                variant="ghost"
                className="h-8 text-xs"
                onClick={() => setBindings((previous) => previous.filter((_, i) => i !== index))}
              >
                Remove
              </Button>
            </div>
          ))
        )}
        {(assetData?.assets.length ?? 0) > 0 ? (
          <p className="text-[11px] text-muted-foreground">
            Library: {assetData?.assets.map((asset) => `${asset.displayName} (${asset.id})`).join(", ")}
          </p>
        ) : null}
      </div>

      <Button
        size="sm"
        disabled={save.isPending || !name.trim() || problems.length > 0}
        onClick={() => save.mutate()}
      >
        {save.isPending ? "Saving…" : template ? "Save draft" : "Create draft"}
      </Button>
    </div>
  );
}
