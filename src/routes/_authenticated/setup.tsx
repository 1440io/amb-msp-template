import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getSetupStatus, runBackfill } from "@/lib/msp.functions";
import { AppShell } from "@/components/amb/AppShell";
import { DataSourcesCard } from "@/components/amb/DataSourcesCard";
import { Button } from "@/components/ui/button";
import { relativeTime } from "@/lib/amb";

export const Route = createFileRoute("/_authenticated/setup")({
  head: () => ({
    meta: [
      { title: "Setup — AMB Agent Console" },
      {
        name: "description",
        content:
          "Configure 1440 credentials, paste the webhook URL, and watch deliveries land in the AMB Agent Console.",
      },
      { property: "og:title", content: "Setup — AMB Agent Console" },
      {
        property: "og:description",
        content: "Three steps from a fresh clone to live Apple Messages conversations.",
      },
    ],
  }),
  component: SetupPage,
});

type WebhookEventRow = {
  id: string;
  event_type: string;
  received_at: string;
};

function CheckRow({ ok, label, hint }: { ok: boolean; label: string; hint: string }) {
  return (
    <div className="flex items-start gap-3 border-b border-border py-3 last:border-0">
      <span
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] ${
          ok ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
        }`}
      >
        {ok ? "✓" : "•"}
      </span>
      <div>
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
    </div>
  );
}
function WebhookUrlRow({
  label,
  hint,
  url,
}: {
  label: string;
  hint: string;
  url: string | undefined;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs font-medium text-foreground">{label}</p>
        <p className="text-[11px] text-muted-foreground">{hint}</p>
      </div>
      <div className="mt-1 flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-md bg-muted px-2 py-1.5 text-xs text-foreground">
          {url ?? "…"}
        </code>
        <Button
          size="sm"
          variant="outline"
          onClick={async () => {
            if (!url) return;
            await navigator.clipboard.writeText(url);
            toast.success(`${label} webhook URL copied`);
          }}
        >
          Copy
        </Button>
      </div>
    </div>
  );
}


function SetupPage() {
  const queryClient = useQueryClient();
  const [autoRan, setAutoRan] = useState(false);

  const { data: status } = useQuery({
    queryKey: ["setup-status"],
    queryFn: useServerFn(getSetupStatus),
  });

  const { data: events = [] } = useQuery({
    queryKey: ["webhook-events"],
    queryFn: async (): Promise<WebhookEventRow[]> => {
      const { data, error } = await supabase
        .from("webhook_events")
        .select("id, event_type, received_at")
        .order("received_at", { ascending: false })
        .limit(15);
      if (error) throw error;
      return (data ?? []) as WebhookEventRow[];
    },
    refetchInterval: 5000,
  });

  const backfillFn = useServerFn(runBackfill);
  const backfill = useMutation({
    mutationFn: async () =>
      (await backfillFn({})) as Awaited<ReturnType<typeof runBackfill>>,
    onSuccess: (result) => {
      if (result.ok) {
        toast.success(
          `Backfilled ${result.conversations ?? 0} conversations and ${result.messages ?? 0} messages.`,
        );
        queryClient.invalidateQueries({ queryKey: ["conversations"] });
        queryClient.invalidateQueries({ queryKey: ["setup-status"] });
      } else {
        toast.error(result.error ?? "Backfill failed");
      }
    },
  });

  // Once secrets are in place and only demo data exists, backfill automatically.
  useEffect(() => {
    if (!status || autoRan) return;
    if (status.hasApiKey && status.demoData) {
      setAutoRan(true);
      backfill.mutate();
    }
  }, [status, autoRan, backfill]);

  return (
    <AppShell>
      <div className="h-full overflow-y-auto px-6 py-6">
        <h1 className="text-base font-semibold text-foreground">Setup</h1>
        <p className="mt-1 max-w-xl text-sm text-muted-foreground">
          Three steps from a fresh clone to live conversations. Both credentials stay server-side —
          the browser never sees them.
        </p>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <section className="rounded-lg border border-border bg-card p-4">
            <h2 className="text-sm font-medium text-foreground">Checklist</h2>
            <div className="mt-2">
              <CheckRow
                ok={Boolean(status?.hasApiKey)}
                label="MSP_API_KEY configured"
                hint="Your 1440 integration API key (msp_…), stored as a backend secret."
              />
              <CheckRow
                ok={Boolean(status?.hasWebhookSecret)}
                label="MSP_WEBHOOK_SECRET configured"
                hint="The webhook signing secret (whsec_…) used to verify every delivery."
              />
              <CheckRow
                ok={!status?.demoData}
                label="Real conversations loaded"
                hint="Run a backfill to replace the demo data with your live conversations."
              />
            </div>
            <Button
              className="mt-4"
              size="sm"
              disabled={backfill.isPending}
              onClick={() => backfill.mutate()}
            >
              {backfill.isPending ? "Running backfill…" : "Run backfill"}
            </Button>
          </section>

          <section className="rounded-lg border border-border bg-card p-4">
            <h2 className="text-sm font-medium text-foreground">Webhook URL</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Paste one of these into the 1440 console as the delivery endpoint.
            </p>
            <div className="mt-3 space-y-3">
              <WebhookUrlRow
                label="Production"
                hint="Use this for live traffic on your published site."
                url={status?.webhookUrls.production}
              />
              <WebhookUrlRow
                label="Preview"
                hint="Use this to test before publishing."
                url={status?.webhookUrls.preview}
              />
            </div>


            <h3 className="mt-6 text-sm font-medium text-foreground">Recent deliveries</h3>
            <div className="mt-2 max-h-64 overflow-y-auto rounded-md border border-border">
              {events.length === 0 ? (
                <p className="p-3 text-xs text-muted-foreground">
                  Nothing yet. Send yourself a message and it will appear here within seconds.
                </p>
              ) : (
                events.map((event) => (
                  <div
                    key={event.id}
                    className="flex items-center gap-2 border-b border-border px-3 py-2 text-xs last:border-0"
                  >
                    <span className="text-foreground">{event.event_type || "unknown"}</span>
                    <span className="truncate text-muted-foreground">{event.id}</span>
                    <span className="ml-auto shrink-0 text-muted-foreground">
                      {relativeTime(event.received_at)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </section>

          <DataSourcesCard />
        </div>
      </div>
    </AppShell>
  );
}
