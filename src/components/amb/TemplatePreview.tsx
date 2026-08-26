// Apple-style preview of the template being authored. Reads the structured
// field model, so it matches whatever the definition will contain.
import { templateKindLabel, type TemplateKind } from "@/lib/template-definitions";
import { fillVariables, pageTypeLabel, type TemplateFields } from "@/lib/template-fields";

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

const ValuesContext = createContext<Record<string, unknown> | undefined>(undefined);

/** Fills {{variables}} with the caller's values, falling back to samples. */
function useFill(): (text: string) => string {
  const values = useContext(ValuesContext);
  return (text: string) => fillVariables(text, values);
}

function Bubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-primary px-3.5 py-2 text-[13px] leading-snug text-primary-foreground">
      {children}
    </div>
  );
}

function Card({ title, children }: { title?: string; children: React.ReactNode }) {
  const fill = useFill();
  return (
    <div className="max-w-[85%] overflow-hidden rounded-2xl border border-border bg-card">
      {title ? (
        <div className="border-b border-border px-3.5 py-2 text-[13px] font-medium text-foreground">
          {fill(title)}
        </div>
      ) : null}
      <div className="space-y-1.5 px-3.5 py-2.5">{children}</div>
    </div>
  );
}

export function TemplatePreview({
  kind,
  fields,
  values,
  heading = "Preview",
  subheading,
  bare = false,
}: {
  kind: TemplateKind;
  fields: TemplateFields;
  /** Actual variable values (e.g. from a sent message). */
  values?: Record<string, unknown>;
  heading?: string | null;
  subheading?: string;
  /** Drop the outer panel chrome when embedded in another surface. */
  bare?: boolean;
}) {
  const fill = useFill.call(null) as never; // replaced below
  return null as never;
}

export function TemplatePreviewInner(_: never) {
  return null;
}
          <Bubble>{fill(fields.body) || "Message body"}</Bubble>
        ) : null}

        {kind === "quick_reply" ? (
          <>
            <Bubble>{fill(fields.summaryText) || "Summary text"}</Bubble>
            <div className="flex flex-wrap gap-1.5">
              {(fields.items.length > 0 ? fields.items : [{ id: "", title: "Add options" }]).map(
                (item, index) => (
                  <span
                    key={index}
                    className="rounded-full border border-primary/50 bg-background px-3 py-1 text-[12px] text-primary"
                  >
                    {fill(item.title) || "Untitled"}
                  </span>
                ),
              )}
            </div>
            {fields.items.length > 0 && (fields.items.length < 2 || fields.items.length > 5) ? (
              <p className="text-[11px] text-destructive">
                Quick replies accept 2–5 options ({fields.items.length} now).
              </p>
            ) : null}
          </>
        ) : null}

        {kind === "list_picker" ? (
          <Card title={fields.receivedBubble.title || "List picker"}>
            {fields.sections.length === 0 ? (
              <p className="text-[12px] text-muted-foreground">Add a section</p>
            ) : (
              fields.sections.map((section, index) => (
                <div key={index} className="space-y-1">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    {section.title || "Section"}
                    {section.multipleSelection ? " · multi-select" : ""}
                  </p>
                  {section.itemsVariable.trim() ? (
                    <p className="text-[12px] text-muted-foreground">
                      Items come from {`{{${section.itemsVariable}}}`} at send time.
                    </p>
                  ) : (
                    section.items.map((item, itemIndex) => (
                      <div
                        key={itemIndex}
                        className="flex items-center justify-between rounded-md bg-muted/60 px-2.5 py-1.5 text-[12px] text-foreground"
                      >
                        <span>{fill(item.title) || "Untitled"}</span>
                        <span className="text-muted-foreground">›</span>
                      </div>
                    ))
                  )}
                </div>
              ))
            )}
          </Card>
        ) : null}

        {kind === "time_picker" ? (
          <Card title={fields.receivedBubble.title || "Choose a time"}>
            <p className="text-[12px] text-foreground">
              {fill(fields.eventTitle) || "Event"}
            </p>
            {fields.timeslotsVariable.trim() ? (
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
                    {slotLabel(slot.startTime)} · {Math.round(slot.durationSeconds / 60)} min
                  </span>
                ))}
              </div>
            )}
          </Card>
        ) : null}

        {kind === "form" ? (
          <Card title={fields.receivedBubble.title || "Form"}>
            {fields.pages.length === 0 ? (
              <p className="text-[12px] text-muted-foreground">Add a page</p>
            ) : (
              fields.pages.map((page, index) => (
                <div key={index} className="space-y-1">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    {page.title || page.id || "Page"} · {pageTypeLabel(page.pageType)}
                  </p>
                  {page.pageType === "input" || page.pageType === "date_picker" ? (
                    <div className="rounded-md border border-border bg-background px-2.5 py-1.5 text-[12px] text-muted-foreground">
                      {page.labelText || page.placeholder || "Field"}
                      {page.pageType === "input" && page.required ? " *" : ""}
                    </div>
                  ) : (
                    page.items.map((item, itemIndex) => (
                      <div
                        key={itemIndex}
                        className="rounded-md bg-muted/60 px-2.5 py-1.5 text-[12px] text-foreground"
                      >
                        {item.title || item.value || "Choice"}
                      </div>
                    ))
                  )}
                </div>
              ))
            )}
            {fields.isPrivate ? (
              <p className="text-[11px] text-muted-foreground">Private — responses stay hidden.</p>
            ) : null}
          </Card>
        ) : null}

        {kind === "imessage_app" ? (
          <Card title={fields.receivedBubble.title || "Open in app"}>
            <p className="text-[12px] font-medium text-foreground">{fields.appName || "App name"}</p>
            <p className="truncate text-[12px] text-muted-foreground">
              {fill(fields.url) || "app url"}
            </p>
          </Card>
        ) : null}

        {kind === "rich_link" || kind === "app_clip_rich_link" ? (
          <div className="max-w-[85%] overflow-hidden rounded-2xl border border-border bg-card">
            <div className="flex h-24 items-center justify-center bg-muted text-[11px] text-muted-foreground">
              {fields.imageSlot ? <span>slot: {fields.imageSlot}</span> : <span>No image</span>}
            </div>
            <div className="px-3.5 py-2">
              <p className="text-[13px] font-medium text-foreground">
                {fill(fields.title) || "Link title"}
              </p>
              <p className="truncate text-[11px] text-muted-foreground">
                {fill(fields.url) || "https://example.com"}
              </p>
              {kind === "app_clip_rich_link" ? (
                <p className="text-[11px] text-muted-foreground">Opens an App Clip</p>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
