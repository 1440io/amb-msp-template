// Setup card for the data-source layer: connection status, appointment field
// configuration, and a live customer lookup test.
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  getDataSourceStatus,
  saveDataSourceSettings,
  testCustomerLookup,
} from "@/lib/data-sources.functions";
import { DEFAULT_SETTINGS, type DataSourceSettings } from "@/lib/data-sources/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type TestResult = { ok: boolean; source: string; resultJson: string; notes: string[] };

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string | number;
  onChange: (next: string) => void;
  type?: "text" | "number";
}) {
  return (
    <div>
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      <Input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 h-8 text-xs"
      />
    </div>
  );
}

export function DataSourcesCard() {
  const status = useQuery({
    queryKey: ["data-source-status"],
    queryFn: useServerFn(getDataSourceStatus),
  });
  const saveFn = useServerFn(saveDataSourceSettings);
  const testFn = useServerFn(testCustomerLookup);

  const [settings, setSettings] = useState<DataSourceSettings>(DEFAULT_SETTINGS);
  const [phone, setPhone] = useState("");
  const [result, setResult] = useState<TestResult | null>(null);

  useEffect(() => {
    if (status.data?.settings) setSettings(status.data.settings);
  }, [status.data]);

  const save = useMutation({
    mutationFn: () =>
      saveFn({ data: settings }) as Promise<{ ok: boolean; error?: string }>,
    onSuccess: (response) =>
      response.ok
        ? toast.success("Data source settings saved")
        : toast.error(response.error ?? "Could not save settings"),
    onError: (error) => toast.error(error instanceof Error ? error.message : "Save failed"),
  });

  const test = useMutation({
    mutationFn: () => testFn({ data: { phone } }) as Promise<TestResult>,
    onSuccess: (response) => setResult(response),
    onError: (error) => toast.error(error instanceof Error ? error.message : "Lookup failed"),
  });

  const connected = Boolean(status.data?.salesforceConnected);
  const patch = (next: Partial<DataSourceSettings>) =>
    setSettings((previous) => ({ ...previous, ...next }));
  const number = (value: string, fallback: number) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-baseline gap-2">
        <h2 className="text-sm font-medium text-foreground">Data sources</h2>
        <Badge variant={connected ? "default" : "secondary"} className="text-[10px]">
          {connected ? "Salesforce connected" : "Demo data"}
        </Badge>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Template variables can pull customer, appointment, and availability values from your CRM.
        {connected
          ? " Lookups run server-side against Salesforce; failures fall back to demo data."
          : " Connect Salesforce to use live records — until then, realistic demo records are used."}
      </p>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <Field
          label="Appointment object"
          value={settings.appointmentObject}
          onChange={(next) => patch({ appointmentObject: next })}
        />
        <Field
          label="Subject field"
          value={settings.appointmentSubjectField}
          onChange={(next) => patch({ appointmentSubjectField: next })}
        />
        <Field
          label="Start field"
          value={settings.appointmentStartField}
          onChange={(next) => patch({ appointmentStartField: next })}
        />
        <Field
          label="End field"
          value={settings.appointmentEndField}
          onChange={(next) => patch({ appointmentEndField: next })}
        />
        <Field
          label="Contact field"
          value={settings.appointmentContactField}
          onChange={(next) => patch({ appointmentContactField: next })}
        />
        <Field
          label="Slot length (minutes)"
          type="number"
          value={settings.slotMinutes}
          onChange={(next) => patch({ slotMinutes: number(next, 30) })}
        />
        <Field
          label="Business hours start"
          type="number"
          value={settings.businessStartHour}
          onChange={(next) => patch({ businessStartHour: number(next, 9) })}
        />
        <Field
          label="Business hours end"
          type="number"
          value={settings.businessEndHour}
          onChange={(next) => patch({ businessEndHour: number(next, 17) })}
        />
        <Field
          label="Days ahead"
          type="number"
          value={settings.daysAhead}
          onChange={(next) => patch({ daysAhead: number(next, 5) })}
        />
        <Field
          label="Timeslots offered"
          type="number"
          value={settings.slotsOffered}
          onChange={(next) => patch({ slotsOffered: number(next, 4) })}
        />
      </div>

      <Button
        size="sm"
        className="mt-3"
        disabled={save.isPending}
        onClick={() => save.mutate()}
      >
        {save.isPending ? "Saving…" : "Save data settings"}
      </Button>

      <h3 className="mt-6 text-sm font-medium text-foreground">Test a lookup</h3>
      <div className="mt-2 flex gap-2">
        <Input
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          placeholder="+15551234567"
          className="h-8 text-xs"
        />
        <Button
          size="sm"
          variant="outline"
          disabled={test.isPending || phone.trim().length === 0}
          onClick={() => test.mutate()}
        >
          {test.isPending ? "Looking up…" : "Test"}
        </Button>
      </div>
      {result ? (
        <div className="mt-2">
          <p className="text-[11px] text-muted-foreground">
            Answered by {result.source}
            {result.notes.length > 0 ? ` · ${result.notes.join(" · ")}` : ""}
          </p>
          <pre className="mt-1 max-h-64 overflow-auto rounded-md bg-muted p-2 text-[11px] text-foreground">
            {result.resultJson}
          </pre>
        </div>
      ) : null}
    </section>
  );
}
