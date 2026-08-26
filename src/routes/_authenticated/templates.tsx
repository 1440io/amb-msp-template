import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { listAllTemplates, templateLifecycle } from "@/lib/msp.functions";
import type { TemplateAdminView } from "@/lib/msp.server";
import { AppShell } from "@/components/amb/AppShell";
import { TemplateEditor } from "@/components/amb/TemplateEditor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { channelLabel } from "@/lib/amb";

export const Route = createFileRoute("/_authenticated/templates")({
  head: () => ({
    meta: [
      { title: "Templates — AMB Agent Console" },
      {
        name: "description",
        content:
          "Author, publish, and archive rich message templates for Apple Messages for Business, with AI-assisted definitions.",
      },
      { property: "og:title", content: "Templates — AMB Agent Console" },
      {
        property: "og:description",
        content: "Create and edit rich templates with AI, and check readiness per channel.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TemplatesPage,
});

function TemplatesPage() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<TemplateAdminView | null>(null);
  const [creating, setCreating] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["templates", "all"],
    queryFn: useServerFn(listAllTemplates),
  });

  const lifecycle = useServerFn(templateLifecycle);
  const act = useMutation({
    mutationFn: async (input: { templateId: string; action: "publish" | "archive" | "delete" }) =>
      lifecycle({ data: input }),
    onSuccess: (result, input) => {
      if (!result.ok) {
        toast.error(result.error ?? `${input.action} failed`);
        return;
      }
      toast.success(`Template ${input.action === "delete" ? "deleted" : `${input.action}ed`}`);
      queryClient.invalidateQueries({ queryKey: ["templates"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Action failed"),
  });

  function refresh() {
    setCreating(false);
    setEditing(null);
    queryClient.invalidateQueries({ queryKey: ["templates"] });
  }

  return (
    <AppShell>
      <div className="h-full overflow-y-auto px-6 py-6">
        <div className="flex items-start gap-3">
          <div>
            <h1 className="text-base font-semibold text-foreground">Templates</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Draft, published, and archived rich templates with readiness per channel.
            </p>
          </div>
          {data?.configured ? (
            <Button
              size="sm"
              className="ml-auto"
              onClick={() => {
                setEditing(null);
                setCreating(true);
              }}
            >
              New template
            </Button>
          ) : null}
        </div>

        {creating || editing ? (
          <div className="mt-5 max-w-3xl">
            <TemplateEditor
              {...(editing ? { template: editing } : {})}
              onSaved={refresh}
              onCancel={() => {
                setCreating(false);
                setEditing(null);
              }}
            />
          </div>
        ) : null}

        {isLoading ? (
          <p className="mt-6 text-sm text-muted-foreground">Loading templates…</p>
        ) : !data?.configured ? (
          <p className="mt-6 max-w-lg text-sm text-muted-foreground">
            Add your 1440 integration key in Setup to load and author templates.
          </p>
        ) : data.error ? (
          <p className="mt-6 text-sm text-destructive">{data.error}</p>
        ) : data.templates.length === 0 ? (
          <div className="mt-6 max-w-lg rounded-lg border border-border bg-card p-4">
            <p className="text-sm font-medium text-foreground">No templates yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              A new organization starts with none. Use “New template” to describe one and let AI
              draft the definition, then publish it to make it sendable.
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

                <div className="mt-3 flex flex-wrap gap-2">
                  {template.status === "draft" ? (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => {
                          setCreating(false);
                          setEditing(template);
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        className="h-7 text-xs"
                        disabled={act.isPending}
                        onClick={() => act.mutate({ templateId: template.id, action: "publish" })}
                      >
                        Publish
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs text-destructive"
                        disabled={act.isPending}
                        onClick={() => act.mutate({ templateId: template.id, action: "delete" })}
                      >
                        Delete
                      </Button>
                    </>
                  ) : template.status === "published" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      disabled={act.isPending}
                      onClick={() => act.mutate({ templateId: template.id, action: "archive" })}
                    >
                      Archive
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
