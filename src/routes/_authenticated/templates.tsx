import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listTemplates } from "@/lib/msp.functions";
import { AppShell } from "@/components/amb/AppShell";
import { Badge } from "@/components/ui/badge";
import { channelLabel } from "@/lib/amb";

export const Route = createFileRoute("/_authenticated/templates")({
  head: () => ({
    meta: [
      { title: "Templates — AMB Agent Console" },
      {
        name: "description",
        content:
          "Published rich message templates with per-channel readiness for Apple Messages for Business.",
      },
      { property: "og:title", content: "Templates — AMB Agent Console" },
      {
        property: "og:description",
        content: "Check which rich templates are ready to send on each channel.",
      },
    ],
  }),
  component: TemplatesPage,
});

function TemplatesPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["templates"],
    queryFn: useServerFn(listTemplates),
  });

  return (
    <AppShell>
      <div className="h-full overflow-y-auto px-6 py-6">
        <h1 className="text-base font-semibold text-foreground">Templates</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Published rich templates and their readiness per channel.
        </p>

        {isLoading ? (
          <p className="mt-6 text-sm text-muted-foreground">Loading templates…</p>
        ) : !data?.configured ? (
          <p className="mt-6 max-w-lg text-sm text-muted-foreground">
            Add your 1440 integration key in Setup to load templates.
          </p>
        ) : data.error ? (
          <p className="mt-6 text-sm text-destructive">{data.error}</p>
        ) : data.templates.length === 0 ? (
          <div className="mt-6 max-w-lg rounded-lg border border-border bg-card p-4">
            <p className="text-sm font-medium text-foreground">No templates yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              A new organization starts with none. Rich templates are authored and published in the
              1440 console, then appear here automatically.
            </p>
          </div>
        ) : (
          <div className="mt-6 grid gap-3 md:grid-cols-2">
            {data.templates.map((template) => (
              <div key={template.id} className="rounded-lg border border-border bg-card p-4">
                <div className="flex items-baseline gap-2">
                  <h2 className="text-sm font-medium text-foreground">{template.name}</h2>
                  <Badge variant="secondary" className="text-[10px]">
                    {template.status}
                  </Badge>
                  <span className="ml-auto text-[11px] text-muted-foreground">{template.mode}</span>
                </div>
                {template.variables.length > 0 ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Variables: {template.variables.map((variable) => variable.name).join(", ")}
                  </p>
                ) : null}
                <div className="mt-3 space-y-1.5">
                  {template.readiness.map((entry) => (
                    <div key={entry.channel} className="flex items-start gap-2 text-xs">
                      <Badge
                        variant={entry.status === "ready" ? "default" : "destructive"}
                        className="text-[10px]"
                      >
                        {entry.status}
                      </Badge>
                      <div>
                        <span className="text-foreground">{channelLabel(entry.channel)}</span>
                        {entry.reasons.length > 0 ? (
                          <ul className="mt-0.5 text-muted-foreground">
                            {entry.reasons.map((reason, index) => (
                              <li key={index}>{reason.message ?? reason.code}</li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
