// Per-template panel that binds each declared variable to a data source, so the
// inbox composer can prefill real customer / appointment / availability values.
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { listVariableMappings, saveVariableMappings } from "@/lib/data-sources.functions";
import {
  SOURCE_LABELS,
  compatibleSources,
  pathsFor,
  type SourceKind,
  type VariableMapping,
} from "@/lib/data-sources/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Spec = {
  name: string;
  type: string;
  required: boolean;
  itemSchema: "list_picker_item" | "timeslot" | null;
};

export function VariableMappingPanel({
  templateId,
  variables,
}: {
  templateId: string;
  variables: Spec[];
}) {
  const list = useServerFn(listVariableMappings);
  const save = useServerFn(saveVariableMappings);
  const [draft, setDraft] = useState<Record<string, VariableMapping>>({});

  const { data, isLoading } = useQuery({
    queryKey: ["variable-mappings", templateId],
    queryFn: () => list({ data: { templateId } }),
  });

  useEffect(() => {
    const next: Record<string, VariableMapping> = {};
    for (const spec of variables) {
      const stored = data?.mappings.find((mapping) => mapping.variableName === spec.name);
      next[spec.name] =
        stored ??
        {
          templateId,
          variableName: spec.name,
          sourceKind: "manual",
          sourcePath: null,
          literalValue: null,
          fallbackKind: "ai",
        };
    }
    setDraft(next);
  }, [data, templateId, variables]);

  const mutation = useMutation({
    mutationFn: () =>
      save({ data: { templateId, mappings: Object.values(draft) } }) as Promise<{
        ok: boolean;
        error?: string;
      }>,
    onSuccess: (result) =>
      result.ok
        ? toast.success("Variable mappings saved")
        : toast.error(result.error ?? "Could not save mappings"),
    onError: (error) => toast.error(error instanceof Error ? error.message : "Save failed"),
  });

  if (variables.length === 0) {
    return <p className="text-xs text-muted-foreground">This template has no variables to map.</p>;
  }
  if (isLoading) {
    return <p className="text-xs text-muted-foreground">Loading mappings…</p>;
  }

  const update = (name: string, patch: Partial<VariableMapping>) =>
    setDraft((previous) => ({
      ...previous,
      [name]: { ...previous[name]!, ...patch },
    }));

  return (
    <div className="space-y-2.5">
      {variables.map((spec) => {
        const mapping = draft[spec.name];
        if (!mapping) return null;
        const sources = compatibleSources(spec.type, spec.itemSchema);
        const paths = pathsFor(mapping.sourceKind, spec.type, spec.itemSchema);
        return (
          <div key={spec.name} className="rounded-md border border-border p-2.5">
            <Label className="flex items-center gap-1.5 text-xs">
              {spec.name}
              <span className="text-[10px] font-normal text-muted-foreground">
                {spec.type}
                {spec.itemSchema ? ` · ${spec.itemSchema.replace(/_/g, " ")}` : ""}
              </span>
            </Label>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <Select
                value={mapping.sourceKind}
                onValueChange={(next) => {
                  const kind = next as SourceKind;
                  const options = pathsFor(kind, spec.type, spec.itemSchema);
                  update(spec.name, {
                    sourceKind: kind,
                    sourcePath: options[0]?.path ?? null,
                    literalValue: kind === "literal" ? (mapping.literalValue ?? "") : null,
                  });
                }}
              >
                <SelectTrigger className="h-8 w-[168px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {sources.map((kind) => (
                    <SelectItem key={kind} value={kind}>
                      {SOURCE_LABELS[kind]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {paths.length > 0 ? (
                <Select
                  value={mapping.sourcePath ?? paths[0]!.path}
                  onValueChange={(next) => update(spec.name, { sourcePath: next })}
                >
                  <SelectTrigger className="h-8 w-[200px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {paths.map((option) => (
                      <SelectItem key={option.path} value={option.path}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}

              {mapping.sourceKind === "literal" ? (
                <Input
                  value={mapping.literalValue ?? ""}
                  onChange={(event) => update(spec.name, { literalValue: event.target.value })}
                  placeholder="Fixed value"
                  className="h-8 w-[200px] text-xs"
                />
              ) : null}

              {mapping.sourceKind !== "manual" && mapping.sourceKind !== "ai" ? (
                <Select
                  value={mapping.fallbackKind}
                  onValueChange={(next) =>
                    update(spec.name, { fallbackKind: next === "ai" ? "ai" : "manual" })
                  }
                >
                  <SelectTrigger className="h-8 w-[168px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ai">If empty: ask AI</SelectItem>
                    <SelectItem value="manual">If empty: fill manually</SelectItem>
                  </SelectContent>
                </Select>
              ) : null}
            </div>
          </div>
        );
      })}

      <Button
        size="sm"
        className="h-7 text-xs"
        disabled={mutation.isPending}
        onClick={() => mutation.mutate()}
      >
        {mutation.isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
        Save mappings
      </Button>
    </div>
  );
}
