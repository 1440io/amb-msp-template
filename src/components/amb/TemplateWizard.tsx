// Stepped template authoring wizard: structured fields, live preview, AI
// assistance, validation, and save/publish. Used for both new templates and
// editing existing drafts. Every shape it produces matches the platform's
// template schema — canonical text/quick reply, or Apple-native content.
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { draftTemplate } from "@/lib/ai.functions";
import {
  createTemplate,
  listAssets,
  templateLifecycle,
  updateTemplate,
} from "@/lib/msp.functions";
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
import { TemplatePreview } from "@/components/amb/TemplatePreview";
import { FieldEditors } from "@/components/amb/template-fields/FieldEditors";
import { parseJson, type Json } from "@/lib/raw-payloads";
import {
  inferTemplateShape,
  modeForKind,
  TEMPLATE_KINDS,
  templateKindLabel,
  templateModeHint,
  templateModeLabel,
  templateSkeleton,
  validateTemplateDefinition,
  type TemplateKind,
} from "@/lib/template-definitions";
import {
  definitionFromFields,
  fieldsFromDefinition,
  undeclaredVariables,
  type TemplateFields,
} from "@/lib/template-fields";
import { templateExamples } from "@/lib/template-examples";
import { extractUrls } from "@/lib/links";
import { getLinkMetadata } from "@/lib/link-preview.functions";

type SlotBinding = { slotName: string; assetId: string };

const STEPS = ["Basics", "Describe", "Build", "Review", "Finish"] as const;

export function TemplateWizard({
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
    : { kind: "quick_reply" as TemplateKind };

  const [step, setStep] = useState(0);
  const [name, setName] = useState(template?.name ?? "");
  const [kind, setKind] = useState<TemplateKind>(inferred.kind);
  const [prompt, setPrompt] = useState("");
  const [notes, setNotes] = useState<string[]>([]);
  const [bindings, setBindings] = useState<SlotBinding[]>(template?.slotBindings ?? []);
  const [debug, setDebug] = useState<DebugEntry | null>(null);
  const [showDebug, setShowDebug] = useState(false);
  const [showJson, setShowJson] = useState(false);
  const [jsonDraft, setJsonDraft] = useState<string | null>(null);

  const [fields, setFields] = useState<TemplateFields>(() =>
    fieldsFromDefinition(
      inferred.kind,
      template ? template.definition : templateSkeleton(inferred.kind),
    ),
  );

  const mode = modeForKind(kind);
  const definition = useMemo(() => definitionFromFields(kind, fields), [kind, fields]);
  const json = jsonDraft ?? JSON.stringify(definition, null, 2);

  const jsonParsed =
    jsonDraft !== null ? parseJson(jsonDraft) : { ok: true as const, value: definition };
  const effective = jsonParsed.ok ? jsonParsed.value : definition;

  const problems = jsonParsed.ok
    ? [
        ...validateTemplateDefinition(kind, effective),
        ...undeclaredVariables(effective, fields.variables).map(
          (variable) => `{{${variable}}} is used but not declared in variables.`,
        ),
      ]
    : [jsonParsed.error];

  const draft = useServerFn(draftTemplate);
  const create = useServerFn(createTemplate);
  const update = useServerFn(updateTemplate);
  const lifecycle = useServerFn(templateLifecycle);
  const metadata = useServerFn(getLinkMetadata);

  const { data: assetData } = useQuery({ queryKey: ["assets"], queryFn: useServerFn(listAssets) });

  function patch(updater: (current: TemplateFields) => TemplateFields) {
    setJsonDraft(null);
    setFields(updater);
  }

  /** Reseed structure when the kind changes. */
  function reseed(nextKind: TemplateKind) {
    setKind(nextKind);
    setFields(fieldsFromDefinition(nextKind, templateSkeleton(nextKind)));
    setJsonDraft(null);
    setNotes([]);
    setDebug(null);
  }

  /** Adopt a definition produced by AI or pasted into the JSON view. */
  function adopt(value: unknown) {
    const shape = inferTemplateShape(value);
    setKind(shape.kind);
    setFields(fieldsFromDefinition(shape.kind, value));
    setJsonDraft(null);
  }

  /** A URL in the body (or link field) can be turned into a rich link card. */
  const detectedUrl = extractUrls(`${fields.body} ${fields.summaryText} ${fields.url}`)[0] ?? "";

  const linkFill = useMutation({
    mutationFn: async (url: string) => metadata({ data: { url } }),
    onSuccess: (result) => {
      const next = fieldsFromDefinition("rich_link", templateSkeleton("rich_link"));
      setKind("rich_link");
      setFields({
        ...next,
        url: result.url,
        title: result.title ?? next.title,
        variables: [],
      });
      setJsonDraft(null);
      setNotes([
        result.title
          ? `Filled from the page: “${result.title}”.`
          : "Could not read page metadata — using the URL alone.",
      ]);
      toast.success("Rich link filled from the page");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not read that link"),
  });

  const ai = useMutation({
    mutationFn: async (aiMode: "create" | "review") =>
      draft({
        data: {
          prompt,
          kind,
          ...(aiMode === "review" ? { existingJson: JSON.stringify(effective) } : {}),
        },
      }),
    onSuccess: (result) => {
      if (!result.ok || !result.json) {
        toast.error(result.error ?? "The model could not produce a definition");
        setDebug({ label: "AI draft failed", detail: result });
        setShowDebug(true);
        return;
      }
      const parsed = parseJson(result.json);
      if (!parsed.ok) {
        toast.error("The model returned invalid JSON");
        setJsonDraft(result.json);
        setShowJson(true);
      } else {
        adopt(parsed.value);
        toast.success("Definition drafted — review the fields");
        setStep(2);
      }
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
    mutationFn: async (publish: boolean) => {
      const body = {
        name: name.trim(),
        definition: effective as Json,
        slotBindings: bindings.filter((binding) => binding.slotName && binding.assetId),
      };
      const result = template
        ? await update({ data: { templateId: template.id, ...body } })
        : await create({ data: body });
      if (!result.ok) return { result, published: false };
      const templateId = result.template?.id ?? template?.id;
      if (publish && templateId) {
        const published = await lifecycle({ data: { templateId, action: "publish" } });
        if (!published.ok) return { result: published, published: false };
        return { result: published, published: true };
      }
      return { result, published: false };
    },
    onSuccess: ({ result, published }) => {
      if (!result.ok) {
        toast.error(result.error ?? "Save failed");
        setDebug({
          label: "Save rejected",
          detail: {
            kind,
            mode,
            templateId: template?.id ?? null,
            response: result,
            definition: effective,
          },
        });
        setShowDebug(true);
        return;
      }
      setDebug(null);
      toast.success(published ? "Template published" : template ? "Draft updated" : "Draft created");
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

  const canAdvance = step === 0 ? name.trim().length > 0 : jsonParsed.ok;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="space-y-4 rounded-lg border border-border bg-card p-4">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-medium text-foreground">
            {template ? `Edit “${template.name}”` : "New template"}
          </h2>
          <Button size="sm" variant="ghost" className="ml-auto" onClick={onCancel}>
            Cancel
          </Button>
        </div>

        {/* Step rail */}
        <div className="flex flex-wrap items-center gap-1.5">
          {STEPS.map((label, index) => (
            <button
              key={label}
              type="button"
              onClick={() => (index <= step || canAdvance ? setStep(index) : undefined)}
              className={`rounded-full px-2.5 py-1 text-[11px] ${
                index === step
                  ? "bg-primary text-primary-foreground"
                  : index < step
                    ? "bg-muted text-foreground"
                    : "bg-muted/50 text-muted-foreground"
              }`}
            >
              {index + 1}. {label}
            </button>
          ))}
        </div>

        {step === 0 ? (
          <div className="space-y-3">
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Template name"
              className="h-8 text-xs"
            />
            <Select value={kind} onValueChange={(value) => reseed(value as TemplateKind)}>
              <SelectTrigger className="h-8 w-[220px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TEMPLATE_KINDS.map((entry) => (
                  <SelectItem key={entry} value={entry}>
                    {templateKindLabel(entry)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">{templateModeHint(kind)}</p>
            <p className="text-[11px] text-muted-foreground">
              Changing the type restarts the definition from a matching starter shape.
            </p>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="space-y-3">
            <Textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Describe the template — e.g. “quick reply asking to confirm or reschedule an appointment, with a customerName variable”"
              rows={3}
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
                disabled={ai.isPending}
                onClick={() => ai.mutate("review")}
              >
                {ai.isPending && ai.variables === "review" ? "Reviewing…" : "Review & fix current"}
              </Button>
            </div>
            <div className="space-y-1.5">
              <p className="text-[11px] font-medium text-foreground">
                Examples for {templateKindLabel(kind)}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {templateExamples(kind).map((example) => (
                  <button
                    key={example}
                    type="button"
                    onClick={() => setPrompt(example)}
                    className={`max-w-full rounded-full border px-2.5 py-1 text-left text-[11px] transition-colors ${
                      prompt === example
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border bg-muted/40 text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Optional — pick an example, edit it, or skip ahead and fill the fields yourself.
            </p>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-3">
            <FieldEditors kind={kind} fields={fields} patch={patch} />
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
                    : kind === "rich_link"
                      ? "Refill from page"
                      : "Convert to rich link"}
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}

        {step === 3 ? (
          <div className="space-y-3">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-foreground">Asset slot bindings</span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() => setBindings((prev) => [...prev, { slotName: "", assetId: "" }])}
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
                        setBindings((prev) =>
                          prev.map((entry, i) =>
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
                        setBindings((prev) =>
                          prev.map((entry, i) =>
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
                      onClick={() => setBindings((prev) => prev.filter((_, i) => i !== index))}
                    >
                      Remove
                    </Button>
                  </div>
                ))
              )}
              {(assetData?.assets.length ?? 0) > 0 ? (
                <p className="text-[11px] text-muted-foreground">
                  Library:{" "}
                  {assetData?.assets
                    .map((asset) => `${asset.displayName} (${asset.id})`)
                    .join(", ")}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => setShowJson((value) => !value)}
              >
                {showJson ? "Hide definition JSON" : "Show definition JSON (advanced)"}
              </Button>
              {showJson ? (
                <>
                  <Textarea
                    value={json}
                    onChange={(event) => setJsonDraft(event.target.value)}
                    spellCheck={false}
                    rows={14}
                    className="font-mono text-[11px] leading-relaxed"
                  />
                  {jsonDraft !== null ? (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-7 text-xs"
                        disabled={!jsonParsed.ok}
                        onClick={() => {
                          if (jsonParsed.ok) adopt(jsonParsed.value);
                        }}
                      >
                        Apply to fields
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs"
                        onClick={() => setJsonDraft(null)}
                      >
                        Discard JSON edits
                      </Button>
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>
          </div>
        ) : null}

        {step === 4 ? (
          <div className="space-y-3">
            <div className="rounded-md border border-border bg-muted/30 p-3 text-[11px] text-muted-foreground">
              <p className="text-xs font-medium text-foreground">{name || "Untitled template"}</p>
              <p className="mt-1">
                {templateKindLabel(kind)} · {templateModeLabel(mode)} ·{" "}
                {bindings.filter((b) => b.slotName && b.assetId).length} asset binding(s)
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={save.isPending || !name.trim() || problems.length > 0}
                onClick={() => save.mutate(false)}
              >
                {save.isPending ? "Saving…" : template ? "Save draft" : "Create draft"}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={save.isPending || !name.trim() || problems.length > 0}
                onClick={() => save.mutate(true)}
              >
                Save &amp; publish
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Publishing makes the template sendable. Readiness per channel appears on the card
              afterwards.
            </p>
          </div>
        ) : null}

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
            Definition passes local validation for {templateKindLabel(kind)} (
            {templateModeLabel(mode)}).
          </p>
        )}

        <JsonDebugPanel entry={debug} open={showDebug} onToggle={() => setShowDebug((v) => !v)} />

        <div className="flex items-center gap-2 border-t border-border pt-3">
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-xs"
            disabled={step === 0}
            onClick={() => setStep((value) => Math.max(0, value - 1))}
          >
            Back
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="ml-auto h-8 text-xs"
            disabled={step === STEPS.length - 1 || !canAdvance}
            onClick={() => setStep((value) => Math.min(STEPS.length - 1, value + 1))}
          >
            Next
          </Button>
        </div>
      </div>

      <div className="lg:sticky lg:top-4 lg:self-start">
        <TemplatePreview kind={kind} fields={fields} />
      </div>
    </div>
  );
}
