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
import { parseJson } from "@/lib/raw-payloads";

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
  const [name, setName] = useState(template?.name ?? "");
  const [prompt, setPrompt] = useState("");
  const [json, setJson] = useState(() =>
    template ? JSON.stringify(template.definition, null, 2) : "",
  );
  const [notes, setNotes] = useState<string[]>([]);
  const [bindings, setBindings] = useState<SlotBinding[]>(template?.slotBindings ?? []);

  const draft = useServerFn(draftTemplate);
  const create = useServerFn(createTemplate);
  const update = useServerFn(updateTemplate);

  const { data: assetData } = useQuery({ queryKey: ["assets"], queryFn: useServerFn(listAssets) });

  const parsed = json.trim() ? parseJson(json) : { ok: false as const, error: "Definition is empty" };

  const ai = useMutation({
    mutationFn: async (mode: "create" | "review") =>
      draft({
        data: {
          prompt,
          ...(mode === "review" && json.trim() ? { existingJson: json } : {}),
        },
      }),
    onSuccess: (result) => {
      if (!result.ok || !result.json) {
        toast.error(result.error ?? "The model could not produce a definition");
        return;
      }
      setJson(result.json);
      setNotes(result.notes);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "AI request failed"),
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!parsed.ok) throw new Error(parsed.error);
      const body = {
        name: name.trim(),
        definition: parsed.value,
        slotBindings: bindings.filter((binding) => binding.slotName && binding.assetId),
      };
      return template
        ? update({ data: { templateId: template.id, ...body } })
        : create({ data: body });
    },
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.error ?? "Save failed");
        return;
      }
      toast.success(template ? "Draft updated" : "Draft created");
      onSaved();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Save failed"),
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

      <Input
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="Template name"
        className="h-8 text-xs"
      />

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

      {!parsed.ok ? <p className="text-[11px] text-destructive">{parsed.error}</p> : null}

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
        disabled={save.isPending || !name.trim() || !parsed.ok}
        onClick={() => save.mutate()}
      >
        {save.isPending ? "Saving…" : template ? "Save draft" : "Create draft"}
      </Button>
    </div>
  );
}
