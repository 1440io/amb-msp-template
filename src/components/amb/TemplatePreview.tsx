// Apple-style preview of the template being authored. Reads the structured
// field model so it works identically for canonical and native definitions.
import { rawMessageTypeLabel, type RawMessageType } from "@/lib/raw-payloads";
import { fillVariables, type TemplateFields } from "@/lib/template-fields";

function slotLabel(startTime: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(startTime);
  if (!match) return startTime || "Choose a time";
  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
  );
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function Bubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-primary px-3.5 py-2 text-[13px] leading-snug text-primary-foreground">
      {children}
    </div>
  );
}

function Card({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="max-w-[85%] overflow-hidden rounded-2xl border border-border bg-card">
      {title ? (
        <div className="border-b border-border px-3.5 py-2 text-[13px] font-medium text-foreground">
          {fillVariables(title)}
        </div>
      ) : null}
      <div className="space-y-1.5 px-3.5 py-2.5">{children}</div>
    </div>
  );
}

export function TemplatePreview({
  messageType,
  fields,
}: {
  messageType: RawMessageType;
  fields: TemplateFields;
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-4">
      <div className="flex items-baseline gap-2">
        <span className="text-xs font-medium text-foreground">Preview</span>
        <span className="text-[11px] text-muted-foreground">
          {rawMessageTypeLabel(messageType)} · sample values
        </span>
      </div>

      <div className="mt-3 space-y-2">
        {messageType === "text" ? (
          <Bubble>{fillVariables(fields.body) || "Message body"}</Bubble>
        ) : null}

        {messageType === "quick_reply" ? (
          <>
            <Bubble>{fillVariables(fields.body) || fields.summaryText || "Message body"}</Bubble>
            <div className="flex flex-wrap gap-1.5">
              {(fields.items.length > 0 ? fields.items : [{ id: "", title: "Add options" }]).map(
                (item, index) => (
                  <span
                    key={index}
                    className="rounded-full border border-primary/50 bg-background px-3 py-1 text-[12px] text-primary"
                  >
                    {fillVariables(item.title) || "Untitled"}
                  </span>
                ),
              )}
            </div>
            {fields.items.length > 0 && (fields.items.length < 2 || fields.items.length > 5) ? (
              <p className="text-[11px] text-destructive">
                Apple accepts 2–5 quick-reply options ({fields.items.length} now).
              </p>
            ) : null}
          </>
        ) : null}

        {messageType === "list_picker" ? (
          <Card title={fields.receivedTitle || "List picker"}>
            {fields.sections.length === 0 ? (
              <p className="text-[12px] text-muted-foreground">Add a section</p>
            ) : (
              fields.sections.map((section, index) => (
                <div key={index} className="space-y-1">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    {section.title || "Section"}
                    {section.multipleSelection ? " · multi-select" : ""}
                  </p>
                  {section.items.map((item, itemIndex) => (
                    <div
                      key={itemIndex}
                      className="flex items-center justify-between rounded-md bg-muted/60 px-2.5 py-1.5 text-[12px] text-foreground"
                    >
                      <span>{fillVariables(item.title) || "Untitled"}</span>
                      <span className="text-muted-foreground">›</span>
                    </div>
                  ))}
                </div>
              ))
            )}
          </Card>
        ) : null}

        {messageType === "time_picker" ? (
          <Card title={fields.receivedTitle || fields.title || "Choose a time"}>
            <p className="text-[12px] text-foreground">{fillVariables(fields.title) || "Event"}</p>
            {fields.timeslotsVariable ? (
              <p className="text-[12px] text-muted-foreground">
                Slots come from {`{{${fields.timeslotsVariable}}}`} at send time.
              </p>
            ) : fields.timeslots.length === 0 ? (
              <p className="text-[12px] text-muted-foreground">Add a timeslot</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {fields.timeslots.map((slot, index) => (
                  <span
                    key={index}
                    className="rounded-md border border-border bg-background px-2.5 py-1 text-[12px] text-foreground"
                  >
                    {slotLabel(slot.startTime)} · {Math.round(slot.duration / 60)} min
                  </span>
                ))}
              </div>
            )}
          </Card>
        ) : null}

        {messageType === "form" ? (
          <Card title={fields.title || "Form"}>
            {fields.pages.length === 0 ? (
              <p className="text-[12px] text-muted-foreground">Add a page</p>
            ) : (
              fields.pages.map((page, index) => (
                <div key={index} className="space-y-1">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    {page.title || page.id || "Page"}
                  </p>
                  {page.fields.map((field, fieldIndex) => (
                    <div
                      key={fieldIndex}
                      className="rounded-md border border-border bg-background px-2.5 py-1.5 text-[12px] text-muted-foreground"
                    >
                      {field.title || field.id || "Field"}
                      {field.required ? " *" : ""}
                      <span className="ml-1 text-[10px] uppercase">{field.type}</span>
                    </div>
                  ))}
                </div>
              ))
            )}
          </Card>
        ) : null}

        {messageType === "imessage_app" ? (
          <Card title={fields.receivedTitle || "Open in app"}>
            <p className="text-[12px] font-medium text-foreground">{fields.appName || "App name"}</p>
            <p className="truncate text-[12px] text-muted-foreground">
              {fillVariables(fields.url) || "app url"}
            </p>
          </Card>
        ) : null}

        {messageType === "rich_link" ? (
          <div className="max-w-[85%] overflow-hidden rounded-2xl border border-border bg-card">
            <div className="flex h-24 items-center justify-center bg-muted text-[11px] text-muted-foreground">
              {fields.imageUrl || fields.imageSlot ? (
                <span>{fields.imageSlot ? `slot: ${fields.imageSlot}` : "image"}</span>
              ) : (
                <span>No image</span>
              )}
            </div>
            <div className="px-3.5 py-2">
              <p className="text-[13px] font-medium text-foreground">
                {fillVariables(fields.title) || "Link title"}
              </p>
              <p className="truncate text-[11px] text-muted-foreground">
                {fillVariables(fields.url) || "https://example.com"}
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
