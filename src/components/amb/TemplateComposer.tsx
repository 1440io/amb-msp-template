// Rich template tab of the inbox composer: typed editors for every template
// variable, plus Lovable AI suggestions derived from the conversation so far.
import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Plus, Sparkles, Trash2, X } from "lucide-react";
import { suggestTemplateVariables } from "@/lib/ai.functions";
import { resolveTemplateVariables } from "@/lib/data-sources.functions";
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

export type TemplateVariableSpec = {
  name: string;
  type: string;
  required: boolean;
  itemSchema: "list_picker_item" | "timeslot" | null;
};

export type ListPickerItemValue = { id: string; title: string; subtitle: string };
export type TimeslotValue = { id: string; startTime: string; durationSeconds: number };
export type VariableValue = string | ListPickerItemValue[] | TimeslotValue[];

/** Apple's time format: no seconds and no colon in the offset. */
export function toAppleTime(date: string, time: string): string {
  if (!date || !time) return "";
  const local = new Date(`${date}T${time}`);
  if (Number.isNaN(local.getTime())) return "";
  const minutes = -local.getTimezoneOffset();
  const sign = minutes < 0 ? "-" : "+";
  const abs = Math.abs(minutes);
  const offset = `${String(Math.floor(abs / 60)).padStart(2, "0")}${String(abs % 60).padStart(2, "0")}`;
  return `${date}T${time}${sign}${offset}`;
}

function fromAppleTime(value: string): { date: string; time: string } {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(value ?? "");
  return match ? { date: match[1]!, time: match[2]! } : { date: "", time: "" };
}

function emptyValue(spec: TemplateVariableSpec): VariableValue {
  return spec.type === "collection" ? [] : "";
}

function isFilled(spec: TemplateVariableSpec, value: VariableValue | undefined): boolean {
  if (value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;
  return value.trim().length > 0;
}

/** Coerce an AI-suggested value into the variable's shape, or drop it. */
export function coerceSuggestion(
  spec: TemplateVariableSpec,
  raw: unknown,
): VariableValue | undefined {
  if (spec.type === "collection") {
    if (!Array.isArray(raw)) return undefined;
    if (spec.itemSchema === "timeslot") {
      const slots = raw.flatMap((entry, index) => {
        if (!entry || typeof entry !== "object") return [];
        const record = entry as Record<string, unknown>;
        const startTime = typeof record["startTime"] === "string" ? record["startTime"] : "";
        if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(startTime)) return [];
        const duration = Number(record["durationSeconds"]);
        return [
          {
            id: typeof record["id"] === "string" && record["id"] ? record["id"] : `slot-${index + 1}`,
            startTime,
            durationSeconds: Number.isFinite(duration) && duration > 0 ? duration : 1800,
          },
        ];
      });
      return slots.length > 0 ? slots : undefined;
    }
    const items = raw.flatMap((entry, index) => {
      if (!entry || typeof entry !== "object") return [];
      const record = entry as Record<string, unknown>;
      const title = typeof record["title"] === "string" ? record["title"] : "";
      if (!title.trim()) return [];
      return [
        {
          id: typeof record["id"] === "string" && record["id"] ? record["id"] : `item-${index + 1}`,
          title,
          subtitle: typeof record["subtitle"] === "string" ? record["subtitle"] : "",
        },
      ];
    });
    return items.length > 0 ? items : undefined;
  }

  const text = typeof raw === "string" ? raw.trim() : typeof raw === "number" ? String(raw) : "";
  if (!text) return undefined;
  if (spec.type === "url") return /^https:\/\/\S+$/i.test(text) ? text : undefined;
  if (spec.type === "datetime") {
    return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}([+-]\d{4})?$/.test(text) ? text : undefined;
  }
  return text;
}

export function TemplateComposer({
  conversationId,
  templateId,
  templateName,
  variables: specs,
  disabled,
  blocked,
  blockedReason,
  hasMessages,
  onSend,
  sending,
}: {
  conversationId: string;
  templateId: string;
  templateName: string;
  variables: TemplateVariableSpec[];
  disabled?: boolean;
  blocked?: boolean;
  blockedReason?: string;
  /** Only auto-suggest when there is a conversation to learn from. */
  hasMessages?: boolean;
  onSend: (variables: Record<string, unknown>) => void;
  sending?: boolean;
}) {
  const [values, setValues] = useState<Record<string, VariableValue>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiNote, setAiNote] = useState<string | null>(null);
  const [origins, setOrigins] = useState<Record<string, string>>({});
  const [dataNote, setDataNote] = useState<string | null>(null);
  const suggest = useServerFn(suggestTemplateVariables);
  const resolveFn = useServerFn(resolveTemplateVariables);

  useEffect(() => {
    setValues({});
    setReasons({});
    setOrigins({});
    setDataNote(null);
    setAiError(null);
    setAiNote(null);
  }, [templateId]);

  // Mapped data sources (CRM/appointments) win; AI only fills what's left.
  const resolution = useMutation({
    mutationFn: (): Promise<{
      ok: boolean;
      source: "salesforce" | "demo" | null;
      resolved: { name: string; valueJson: string; origin: string }[];
      unresolved: string[];
      notes: string[];
      error?: string;
    }> => resolveFn({ data: { conversationId, templateId } }),
    onSuccess: (result) => {
      if (!result.ok) {
        setDataNote(result.error ?? "Could not resolve mapped values.");
        return;
      }
      const nextValues: Record<string, VariableValue> = {};
      const nextOrigins: Record<string, string> = {};
      for (const item of result.resolved) {
        const spec = specs.find((entry) => entry.name === item.name);
        if (!spec) continue;
        let parsed: unknown;
        try {
          parsed = JSON.parse(item.valueJson);
        } catch {
          continue;
        }
        const coerced = coerceSuggestion(spec, parsed);
        if (coerced === undefined) continue;
        nextValues[item.name] = coerced;
        nextOrigins[item.name] = item.origin;
      }
      setValues((previous) => ({ ...previous, ...nextValues }));
      setOrigins(nextOrigins);
      setDataNote(
        Object.keys(nextValues).length === 0
          ? result.source
            ? "No mapped values matched this customer."
            : null
          : `Prefilled from ${result.source === "salesforce" ? "Salesforce" : "demo data"}${
              result.notes.length > 0 ? ` · ${result.notes.join(" · ")}` : ""
            }`,
      );
    },
    onError: (error) =>
      setDataNote(error instanceof Error ? error.message : "Could not resolve mapped values."),
  });

  const suggestion = useMutation({
    mutationFn: (): Promise<{
      ok: boolean;
      suggestions: { name: string; valueJson: string; reason: string }[];
      error?: string;
    }> => suggest({ data: { conversationId, templateId } }),
    onSuccess: (result) => {
      if (!result.ok) {
        setAiError(result.error ?? "Could not suggest values right now.");
        return;
      }
      setAiError(null);
      const nextValues: Record<string, VariableValue> = {};
      const nextReasons: Record<string, string> = {};
      for (const item of result.suggestions) {
        const spec = specs.find((entry) => entry.name === item.name);
        if (!spec) continue;
        let parsedValue: unknown;
        try {
          parsedValue = JSON.parse(item.valueJson);
        } catch {
          continue;
        }
        const coerced = coerceSuggestion(spec, parsedValue);
        if (coerced === undefined) continue;
        if (origins[item.name]) continue;
        nextValues[item.name] = coerced;
        if (item.reason) nextReasons[item.name] = item.reason;
      }
      setValues((previous) => ({ ...previous, ...nextValues }));
      setReasons(nextReasons);
      setAiNote(
        Object.keys(nextValues).length === 0
          ? "The conversation didn't contain enough detail to suggest values — fill them in manually."
          : null,
      );
    },
    onError: (error) =>
      setAiError(error instanceof Error ? error.message : "Could not suggest values."),
  });

  const suggestMutate = suggestion.mutate;
  const resolveMutate = resolution.mutate;
  useEffect(() => {
    if (specs.length === 0) return;
    resolveMutate();
    if (!hasMessages) return;
    suggestMutate();
    // Run once per selected template; re-runs are manual.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId, hasMessages]);

  const missing = specs.filter((spec) => spec.required && !isFilled(spec, values[spec.name]));

  const setValue = (name: string, value: VariableValue) => {
    setValues((previous) => ({ ...previous, [name]: value }));
    setReasons((previous) => {
      if (!previous[name]) return previous;
      const { [name]: _dropped, ...rest } = previous;
      return rest;
    });
  };

  return (
    <div className="space-y-3">
      {specs.length > 0 ? (
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Variables
          </p>
          <div className="flex items-center gap-1">
            {Object.keys(reasons).length > 0 ? (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-[11px]"
                onClick={() => {
                  setValues({});
                  setReasons({});
                }}
              >
                <X className="mr-1 h-3 w-3" /> Clear suggestions
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-[11px]"
              disabled={resolution.isPending}
              onClick={() => resolution.mutate()}
            >
              {resolution.isPending ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="mr-1 h-3 w-3" />
              )}
              Refresh data
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-[11px]"
              disabled={suggestion.isPending}
              onClick={() => suggestion.mutate()}
            >
              {suggestion.isPending ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <Sparkles className="mr-1 h-3 w-3" />
              )}
              Suggest values
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          {templateName} takes no variables — it can be sent as-is.
        </p>
      )}

      {dataNote ? <p className="text-[11px] text-muted-foreground">{dataNote}</p> : null}
      {aiError ? <p className="text-xs text-destructive">{aiError}</p> : null}
      {aiNote ? <p className="text-[11px] text-muted-foreground">{aiNote}</p> : null}

      {specs.map((spec) => (
        <div key={spec.name} className="space-y-1.5 rounded-md border border-border p-2.5">
          <Label className="flex items-center gap-1.5 text-xs">
            {spec.name}
            <span className="text-[10px] font-normal text-muted-foreground">
              {spec.type}
              {spec.itemSchema ? ` · ${spec.itemSchema.replace(/_/g, " ")}` : ""}
              {spec.required ? " · required" : ""}
            </span>
            {origins[spec.name] ? (
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">
                {origins[spec.name]}
              </span>
            ) : null}
          </Label>

          {spec.type === "collection" && spec.itemSchema === "timeslot" ? (
            <TimeslotEditor
              value={(values[spec.name] as TimeslotValue[] | undefined) ?? []}
              onChange={(next) => setValue(spec.name, next)}
            />
          ) : spec.type === "collection" ? (
            <ListItemEditor
              value={(values[spec.name] as ListPickerItemValue[] | undefined) ?? []}
              onChange={(next) => setValue(spec.name, next)}
            />
          ) : spec.type === "datetime" ? (
            <DatetimeField
              value={(values[spec.name] as string | undefined) ?? ""}
              onChange={(next) => setValue(spec.name, next)}
            />
          ) : (
            <Input
              value={(values[spec.name] as string | undefined) ?? ""}
              onChange={(event) => setValue(spec.name, event.target.value)}
              placeholder={spec.type === "url" ? "https://…" : `Value for ${spec.name}`}
              className="h-8 text-xs"
            />
          )}

          {spec.type === "url" &&
          typeof values[spec.name] === "string" &&
          (values[spec.name] as string).trim() &&
          !/^https:\/\/\S+$/i.test((values[spec.name] as string).trim()) ? (
            <p className="text-[11px] text-destructive">Use an absolute https:// URL.</p>
          ) : null}

          {reasons[spec.name] ? (
            <p className="flex items-start gap-1 text-[11px] text-muted-foreground">
              <Sparkles className="mt-0.5 h-3 w-3 shrink-0" />
              {reasons[spec.name]}
            </p>
          ) : null}
        </div>
      ))}

      {blocked ? <p className="text-xs text-destructive">{blockedReason}</p> : null}

      {missing.length > 0 ? (
        <p className="text-[11px] text-muted-foreground">
          Fill required variables: {missing.map((spec) => spec.name).join(", ")}
        </p>
      ) : null}

      <Button
        size="sm"
        disabled={disabled || blocked || sending || missing.length > 0}
        onClick={() => {
          const payload: Record<string, unknown> = {};
          for (const spec of specs) {
            const value = values[spec.name];
            if (!isFilled(spec, value)) continue;
            payload[spec.name] = value;
          }
          onSend(payload);
        }}
      >
        Send template
      </Button>
    </div>
  );
}

function DatetimeField({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  const parts = fromAppleTime(value);
  return (
    <div className="flex gap-2">
      <Input
        type="date"
        value={parts.date}
        onChange={(event) => onChange(toAppleTime(event.target.value, parts.time || "09:00"))}
        className="h-8 text-xs"
      />
      <Input
        type="time"
        value={parts.time}
        onChange={(event) => onChange(toAppleTime(parts.date, event.target.value))}
        className="h-8 text-xs"
      />
    </div>
  );
}

function ListItemEditor({
  value,
  onChange,
}: {
  value: ListPickerItemValue[];
  onChange: (next: ListPickerItemValue[]) => void;
}) {
  return (
    <div className="space-y-2">
      {value.map((item, index) => (
        <div key={index} className="flex items-start gap-1.5">
          <div className="flex-1 space-y-1.5">
            <Input
              value={item.title}
              onChange={(event) =>
                onChange(
                  value.map((entry, position) =>
                    position === index ? { ...entry, title: event.target.value } : entry,
                  ),
                )
              }
              placeholder="Title"
              className="h-8 text-xs"
            />
            <Input
              value={item.subtitle}
              onChange={(event) =>
                onChange(
                  value.map((entry, position) =>
                    position === index ? { ...entry, subtitle: event.target.value } : entry,
                  ),
                )
              }
              placeholder="Subtitle (optional)"
              className="h-8 text-xs"
            />
          </div>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            onClick={() => onChange(value.filter((_entry, position) => position !== index))}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
      <Button
        size="sm"
        variant="outline"
        className="h-7 px-2 text-[11px]"
        onClick={() =>
          onChange([...value, { id: `item-${value.length + 1}`, title: "", subtitle: "" }])
        }
      >
        <Plus className="mr-1 h-3 w-3" /> Add item
      </Button>
    </div>
  );
}

function TimeslotEditor({
  value,
  onChange,
}: {
  value: TimeslotValue[];
  onChange: (next: TimeslotValue[]) => void;
}) {
  return (
    <div className="space-y-2">
      {value.map((slot, index) => {
        const parts = fromAppleTime(slot.startTime);
        const update = (next: Partial<TimeslotValue>) =>
          onChange(
            value.map((entry, position) => (position === index ? { ...entry, ...next } : entry)),
          );
        return (
          <div key={index} className="flex items-center gap-1.5">
            <Input
              type="date"
              value={parts.date}
              onChange={(event) =>
                update({ startTime: toAppleTime(event.target.value, parts.time || "09:00") })
              }
              className="h-8 text-xs"
            />
            <Input
              type="time"
              value={parts.time}
              onChange={(event) => update({ startTime: toAppleTime(parts.date, event.target.value) })}
              className="h-8 text-xs"
            />
            <Select
              value={String(slot.durationSeconds)}
              onValueChange={(next) => update({ durationSeconds: Number(next) })}
            >
              <SelectTrigger className="h-8 w-[104px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="900">15 min</SelectItem>
                <SelectItem value="1800">30 min</SelectItem>
                <SelectItem value="2700">45 min</SelectItem>
                <SelectItem value="3600">60 min</SelectItem>
              </SelectContent>
            </Select>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              onClick={() => onChange(value.filter((_entry, position) => position !== index))}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        );
      })}
      <Button
        size="sm"
        variant="outline"
        className="h-7 px-2 text-[11px]"
        onClick={() =>
          onChange([
            ...value,
            { id: `slot-${value.length + 1}`, startTime: "", durationSeconds: 1800 },
          ])
        }
      >
        <Plus className="mr-1 h-3 w-3" /> Add timeslot
      </Button>
    </div>
  );
}
