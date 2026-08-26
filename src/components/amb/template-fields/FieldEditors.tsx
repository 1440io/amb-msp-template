// Per-kind structured editors for the template wizard. Every field here maps
// straight onto the platform's template schema.
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ImageSlotField } from "@/components/amb/AssetSlotField";
import { modeForKind, type TemplateKind } from "@/lib/template-definitions";

import {
  BUBBLE_STYLES,
  ITEM_SCHEMAS,
  PAGE_TYPES,
  VARIABLE_TYPES,
  emptyItem,
  emptyPage,
  emptySection,
  emptyTimeslot,
  pageTypeLabel,
  type BubbleFields,
  type BubbleStyle,
  type ItemSchema,
  type PageType,
  type TemplateFields,
  type VariableType,
} from "@/lib/template-fields";

type Patch = (updater: (fields: TemplateFields) => TemplateFields) => void;

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
      {children}
    </span>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2 rounded-md border border-border p-3">
      <Label>{title}</Label>
      {children}
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-xs text-muted-foreground">
      <Switch checked={checked} onCheckedChange={onChange} />
      {label}
    </label>
  );
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function BubbleEditor({
  title,
  bubble,
  onChange,
}: {
  title: string;
  bubble: BubbleFields;
  onChange: (next: BubbleFields) => void;
}) {
  return (
    <Group title={title}>
      <Input
        value={bubble.title}
        onChange={(event) => onChange({ ...bubble, title: event.target.value })}
        className="h-8 text-xs"
        placeholder="Title shown on the bubble"
      />
      <Input
        value={bubble.subtitle}
        onChange={(event) => onChange({ ...bubble, subtitle: event.target.value })}
        className="h-8 text-xs"
        placeholder="Subtitle (optional)"
      />
      <div className="space-y-2">
        <Select
          value={bubble.style}
          onValueChange={(value) => onChange({ ...bubble, style: value as BubbleStyle })}
        >
          <SelectTrigger className="h-8 w-32 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {BUBBLE_STYLES.map((style) => (
              <SelectItem key={style} value={style} className="text-xs">
                {style}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <ImageSlotField
          value={bubble.imageSlot}
          onChange={(slot) => onChange({ ...bubble, imageSlot: slot })}
          usage="interactive_image"
          defaultSlot={`${slugify(title) || "bubble"}Image`}
        />
      </div>
    </Group>
  );
}


export function VariablesEditor({
  fields,
  patch,
}: {
  fields: TemplateFields;
  patch: Patch;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Label>Variables</Label>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs"
          onClick={() =>
            patch((f) => ({
              ...f,
              variables: [
                ...f.variables,
                { name: "", type: "text" as VariableType, required: true, itemSchema: null },
              ],
            }))
          }
        >
          Add variable
        </Button>
      </div>
      {fields.variables.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">
          No variables — the definition is fully literal.
        </p>
      ) : null}
      {fields.variables.map((variable, index) => {
        const update = (next: Partial<typeof variable>) =>
          patch((f) => ({
            ...f,
            variables: f.variables.map((entry, i) =>
              i === index ? { ...entry, ...next } : entry,
            ),
          }));
        return (
          <div key={index} className="flex flex-wrap items-center gap-2">
            <Input
              value={variable.name}
              onChange={(event) => update({ name: event.target.value })}
              className="h-8 w-40 text-xs"
              placeholder="customerName"
            />
            <Select
              value={variable.type}
              onValueChange={(value) =>
                update({
                  type: value as VariableType,
                  itemSchema: value === "collection" ? (variable.itemSchema ?? "timeslot") : null,
                })
              }
            >
              <SelectTrigger className="h-8 w-32 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VARIABLE_TYPES.map((type) => (
                  <SelectItem key={type} value={type} className="text-xs">
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {variable.type === "collection" ? (
              <Select
                value={variable.itemSchema ?? "timeslot"}
                onValueChange={(value) => update({ itemSchema: value as ItemSchema })}
              >
                <SelectTrigger className="h-8 w-44 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ITEM_SCHEMAS.map((schema) => (
                    <SelectItem key={schema} value={schema} className="text-xs">
                      {schema}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            <Toggle
              label="Required"
              checked={variable.required}
              onChange={(value) => update({ required: value })}
            />
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs text-destructive"
              onClick={() =>
                patch((f) => ({
                  ...f,
                  variables: f.variables.filter((_, i) => i !== index),
                }))
              }
            >
              Remove
            </Button>
          </div>
        );
      })}
    </div>
  );
}

export function FieldEditors({
  kind,
  fields,
  patch,
}: {
  kind: TemplateKind;
  fields: TemplateFields;
  patch: Patch;
}) {
  const native = modeForKind(kind) === "native";
  const bubbles = native && kind !== "rich_link" && kind !== "app_clip_rich_link";

  return (
    <div className="space-y-4">
      {kind === "text" ? (
        <Row label="Body">
          <Textarea
            value={fields.body}
            onChange={(event) => patch((f) => ({ ...f, body: event.target.value }))}
            rows={3}
            className="text-xs"
            placeholder="Hi {{customerName}} — an agent is with you now."
          />
        </Row>
      ) : null}

      {kind === "quick_reply" ? (
        <>
          <Row label="Summary text (the message the customer reads)">
            <Textarea
              value={fields.summaryText}
              onChange={(event) => patch((f) => ({ ...f, summaryText: event.target.value }))}
              rows={2}
              className="text-xs"
              placeholder="How would you like to receive your order?"
            />
          </Row>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label>Options (2–5)</Label>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
                disabled={fields.items.length >= 5}
                onClick={() =>
                  patch((f) => ({ ...f, items: [...f.items, emptyItem(f.items.length)] }))
                }
              >
                Add option
              </Button>
            </div>
            {fields.items.map((item, index) => (
              <div key={index} className="flex items-center gap-2">
                <Input
                  value={item.title}
                  onChange={(event) =>
                    patch((f) => ({
                      ...f,
                      items: f.items.map((entry, i) =>
                        i === index
                          ? {
                              ...entry,
                              title: event.target.value,
                              id: entry.id || slugify(event.target.value),
                            }
                          : entry,
                      ),
                    }))
                  }
                  placeholder="Title shown to the customer"
                  className="h-8 flex-1 text-xs"
                />
                <Input
                  value={item.id}
                  onChange={(event) =>
                    patch((f) => ({
                      ...f,
                      items: f.items.map((entry, i) =>
                        i === index ? { ...entry, id: event.target.value } : entry,
                      ),
                    }))
                  }
                  placeholder="id"
                  className="h-8 w-28 font-mono text-[11px]"
                />
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs text-destructive"
                  onClick={() =>
                    patch((f) => ({ ...f, items: f.items.filter((_, i) => i !== index) }))
                  }
                >
                  Remove
                </Button>
              </div>
            ))}
          </div>
        </>
      ) : null}

      {bubbles ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <BubbleEditor
            title="Received bubble"
            bubble={fields.receivedBubble}
            onChange={(next) => patch((f) => ({ ...f, receivedBubble: next }))}
          />
          {kind === "imessage_app" ? null : (
            <BubbleEditor
              title="Reply bubble"
              bubble={fields.replyBubble}
              onChange={(next) => patch((f) => ({ ...f, replyBubble: next }))}
            />
          )}
        </div>
      ) : null}

      {kind === "list_picker" ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Label>Sections</Label>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() => patch((f) => ({ ...f, sections: [...f.sections, emptySection()] }))}
            >
              Add section
            </Button>
          </div>
          {fields.sections.map((section, sectionIndex) => {
            const updateSection = (next: Partial<typeof section>) =>
              patch((f) => ({
                ...f,
                sections: f.sections.map((entry, i) =>
                  i === sectionIndex ? { ...entry, ...next } : entry,
                ),
              }));
            return (
              <div key={sectionIndex} className="space-y-2 rounded-md border border-border p-3">
                <div className="flex items-center gap-2">
                  <Input
                    value={section.title}
                    onChange={(event) => updateSection({ title: event.target.value })}
                    className="h-8 flex-1 text-xs"
                    placeholder="Section title"
                  />
                  <Toggle
                    label="Multi-select"
                    checked={section.multipleSelection}
                    onChange={(value) => updateSection({ multipleSelection: value })}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs text-destructive"
                    onClick={() =>
                      patch((f) => ({
                        ...f,
                        sections: f.sections.filter((_, i) => i !== sectionIndex),
                      }))
                    }
                  >
                    Remove
                  </Button>
                </div>
                <Row label="Items variable (optional — a list_picker_item collection)">
                  <Input
                    value={section.itemsVariable}
                    onChange={(event) => updateSection({ itemsVariable: event.target.value })}
                    className="h-8 text-xs"
                    placeholder="availableSizes"
                  />
                </Row>
                {section.itemsVariable.trim() ? (
                  <p className="text-[11px] text-muted-foreground">
                    Items come from the variable at send time.
                  </p>
                ) : (
                  <div className="space-y-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs"
                      onClick={() =>
                        updateSection({ items: [...section.items, emptyItem(section.items.length)] })
                      }
                    >
                      Add item
                    </Button>
                    {section.items.map((item, itemIndex) => (
                      <div key={itemIndex} className="flex flex-wrap items-center gap-2">
                        <Input
                          value={item.title}
                          onChange={(event) =>
                            updateSection({
                              items: section.items.map((entry, i) =>
                                i === itemIndex
                                  ? {
                                      ...entry,
                                      title: event.target.value,
                                      id: entry.id || slugify(event.target.value),
                                    }
                                  : entry,
                              ),
                            })
                          }
                          className="h-8 flex-1 text-xs"
                          placeholder="Item title"
                        />
                        <Input
                          value={item.subtitle}
                          onChange={(event) =>
                            updateSection({
                              items: section.items.map((entry, i) =>
                                i === itemIndex ? { ...entry, subtitle: event.target.value } : entry,
                              ),
                            })
                          }
                          className="h-8 w-36 text-xs"
                          placeholder="Subtitle"
                        />
                        <div className="w-64">
                          <ImageSlotField
                            value={item.imageSlot}
                            onChange={(slot) =>
                              updateSection({
                                items: section.items.map((entry, i) =>
                                  i === itemIndex ? { ...entry, imageSlot: slot } : entry,
                                ),
                              })
                            }
                            usage="interactive_image"
                            defaultSlot={`${slugify(item.id || item.title) || `item_${itemIndex + 1}`}Image`}
                          />
                        </div>

                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs text-destructive"
                          onClick={() =>
                            updateSection({
                              items: section.items.filter((_, i) => i !== itemIndex),
                            })
                          }
                        >
                          Remove
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : null}

      {kind === "time_picker" ? (
        <>
          <Row label="Event title">
            <Input
              value={fields.eventTitle}
              onChange={(event) => patch((f) => ({ ...f, eventTitle: event.target.value }))}
              className="h-8 text-xs"
              placeholder="Book a fitting"
            />
          </Row>
          <Row label="Timeslots variable (a timeslot collection filled at send time)">
            <Input
              value={fields.timeslotsVariable}
              onChange={(event) => patch((f) => ({ ...f, timeslotsVariable: event.target.value }))}
              className="h-8 text-xs"
              placeholder="timeslots"
            />
          </Row>
          {fields.timeslotsVariable.trim() ? (
            <p className="text-[11px] text-muted-foreground">
              Slots come from the variable, so no fixed slots are stored on the template.
            </p>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label>Fixed timeslots</Label>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() =>
                    patch((f) => ({
                      ...f,
                      timeslots: [...f.timeslots, emptyTimeslot(f.timeslots.length)],
                    }))
                  }
                >
                  Add slot
                </Button>
              </div>
              {fields.timeslots.map((slot, index) => (
                <div key={index} className="flex flex-wrap items-center gap-2">
                  <Input
                    value={slot.startTime}
                    onChange={(event) =>
                      patch((f) => ({
                        ...f,
                        timeslots: f.timeslots.map((entry, i) =>
                          i === index ? { ...entry, startTime: event.target.value } : entry,
                        ),
                      }))
                    }
                    className="h-8 w-56 font-mono text-[11px]"
                    placeholder="2026-09-01T15:00:00Z"
                  />
                  <Input
                    type="number"
                    value={slot.durationSeconds}
                    onChange={(event) =>
                      patch((f) => ({
                        ...f,
                        timeslots: f.timeslots.map((entry, i) =>
                          i === index
                            ? { ...entry, durationSeconds: Number(event.target.value) || 0 }
                            : entry,
                        ),
                      }))
                    }
                    className="h-8 w-28 text-xs"
                    placeholder="1800"
                  />
                  <span className="text-[11px] text-muted-foreground">seconds</span>
                  <Input
                    value={slot.id}
                    onChange={(event) =>
                      patch((f) => ({
                        ...f,
                        timeslots: f.timeslots.map((entry, i) =>
                          i === index ? { ...entry, id: event.target.value } : entry,
                        ),
                      }))
                    }
                    className="h-8 w-28 font-mono text-[11px]"
                    placeholder="id"
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs text-destructive"
                    onClick={() =>
                      patch((f) => ({
                        ...f,
                        timeslots: f.timeslots.filter((_, i) => i !== index),
                      }))
                    }
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          )}
        </>
      ) : null}

      {kind === "form" ? (
        <>
          <div className="flex flex-wrap items-center gap-4">
            <Toggle
              label="Private (responses hidden from the transcript)"
              checked={fields.isPrivate}
              onChange={(value) => patch((f) => ({ ...f, isPrivate: value }))}
            />
            <Toggle
              label="Show summary"
              checked={fields.showSummary}
              onChange={(value) => patch((f) => ({ ...f, showSummary: value }))}
            />
          </div>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Label>Pages</Label>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
                onClick={() =>
                  patch((f) => {
                    const page = emptyPage(f.pages.length);
                    if (f.pages.length === 0) page.submitForm = true;
                    return {
                      ...f,
                      pages: [...f.pages, page],
                      startPageId: f.startPageId || page.id,
                    };
                  })
                }
              >
                Add page
              </Button>
            </div>
            {fields.pages.map((page, pageIndex) => {
              const updatePage = (next: Partial<typeof page>) =>
                patch((f) => ({
                  ...f,
                  pages: f.pages.map((entry, i) =>
                    i === pageIndex ? { ...entry, ...next } : entry,
                  ),
                }));
              return (
                <div key={pageIndex} className="space-y-2 rounded-md border border-border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Select
                      value={page.pageType}
                      onValueChange={(value) => updatePage({ pageType: value as PageType })}
                    >
                      <SelectTrigger className="h-8 w-36 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PAGE_TYPES.map((type) => (
                          <SelectItem key={type} value={type} className="text-xs">
                            {pageTypeLabel(type)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      value={page.id}
                      onChange={(event) => updatePage({ id: event.target.value })}
                      className="h-8 w-32 font-mono text-[11px]"
                      placeholder="page id"
                    />
                    <Toggle
                      label="Submits the form"
                      checked={page.submitForm}
                      onChange={(value) => updatePage({ submitForm: value })}
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs text-destructive"
                      onClick={() =>
                        patch((f) => ({
                          ...f,
                          pages: f.pages.filter((_, i) => i !== pageIndex),
                        }))
                      }
                    >
                      Remove
                    </Button>
                  </div>
                  <Input
                    value={page.title}
                    onChange={(event) => updatePage({ title: event.target.value })}
                    className="h-8 text-xs"
                    placeholder="Page title"
                  />
                  <Input
                    value={page.subtitle}
                    onChange={(event) => updatePage({ subtitle: event.target.value })}
                    className="h-8 text-xs"
                    placeholder="Subtitle shown under the title"
                  />
                  {page.pageType === "input" || page.pageType === "date_picker" ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <Input
                        value={page.labelText}
                        onChange={(event) => updatePage({ labelText: event.target.value })}
                        className="h-8 w-40 text-xs"
                        placeholder="Field label"
                      />
                      <Input
                        value={page.placeholder}
                        onChange={(event) => updatePage({ placeholder: event.target.value })}
                        className="h-8 w-44 text-xs"
                        placeholder="Placeholder / hint"
                      />
                      {page.pageType === "input" ? (
                        <>
                          <Toggle
                            label="Required"
                            checked={page.required}
                            onChange={(value) => updatePage({ required: value })}
                          />
                          <Toggle
                            label="Multiline"
                            checked={page.multiline}
                            onChange={(value) => updatePage({ multiline: value })}
                          />
                        </>
                      ) : null}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Label>Choices</Label>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs"
                          onClick={() =>
                            updatePage({
                              items: [
                                ...page.items,
                                { id: `choice_${page.items.length + 1}`, title: "", value: "" },
                              ],
                            })
                          }
                        >
                          Add choice
                        </Button>
                        {page.pageType === "select" ? (
                          <Toggle
                            label="Allow multiple"
                            checked={page.allowMultiple}
                            onChange={(value) => updatePage({ allowMultiple: value })}
                          />
                        ) : null}
                      </div>
                      {page.items.map((item, itemIndex) => (
                        <div key={itemIndex} className="flex items-center gap-2">
                          <Input
                            value={item.title}
                            onChange={(event) =>
                              updatePage({
                                items: page.items.map((entry, i) =>
                                  i === itemIndex
                                    ? {
                                        ...entry,
                                        title: event.target.value,
                                        value: entry.value || slugify(event.target.value),
                                      }
                                    : entry,
                                ),
                              })
                            }
                            className="h-8 flex-1 text-xs"
                            placeholder="Choice title"
                          />
                          <Input
                            value={item.value}
                            onChange={(event) =>
                              updatePage({
                                items: page.items.map((entry, i) =>
                                  i === itemIndex ? { ...entry, value: event.target.value } : entry,
                                ),
                              })
                            }
                            className="h-8 w-32 font-mono text-[11px]"
                            placeholder="value"
                          />
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs text-destructive"
                            onClick={() =>
                              updatePage({ items: page.items.filter((_, i) => i !== itemIndex) })
                            }
                          >
                            Remove
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <Row label="Start page id">
            <Input
              value={fields.startPageId}
              onChange={(event) => patch((f) => ({ ...f, startPageId: event.target.value }))}
              className="h-8 text-xs"
              placeholder={fields.pages[0]?.id ?? "page_1"}
            />
          </Row>
        </>
      ) : null}

      {kind === "rich_link" || kind === "app_clip_rich_link" ? (
        <>
          <Row label="Title">
            <Input
              value={fields.title}
              onChange={(event) => patch((f) => ({ ...f, title: event.target.value }))}
              className="h-8 text-xs"
              placeholder="Autumn offer"
            />
          </Row>
          <Row label="URL">
            <Input
              value={fields.url}
              onChange={(event) => patch((f) => ({ ...f, url: event.target.value }))}
              className="h-8 text-xs"
              placeholder="https://example.com/offer or {{offerUrl}}"
            />
          </Row>
          <Row
            label={kind === "app_clip_rich_link" ? "Image (required)" : "Image (optional)"}
          >
            <ImageSlotField
              value={fields.imageSlot}
              onChange={(slot) => patch((f) => ({ ...f, imageSlot: slot }))}
              usage={kind === "app_clip_rich_link" ? "app_clip_image" : "rich_link_image"}
              defaultSlot="heroImage"
              required={kind === "app_clip_rich_link"}
            />
          </Row>

          {kind === "rich_link" ? (
            <Row label="Video URL (optional)">
              <Input
                value={fields.videoUrl}
                onChange={(event) => patch((f) => ({ ...f, videoUrl: event.target.value }))}
                className="h-8 text-xs"
                placeholder="https://example.com/clip.mp4"
              />
            </Row>
          ) : (
            <Row label="Store region (optional)">
              <Input
                value={fields.storeRegion}
                onChange={(event) => patch((f) => ({ ...f, storeRegion: event.target.value }))}
                className="h-8 text-xs"
                placeholder="US"
              />
            </Row>
          )}
        </>
      ) : null}

      {kind === "imessage_app" ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Row label="App name">
              <Input
                value={fields.appName}
                onChange={(event) => patch((f) => ({ ...f, appName: event.target.value }))}
                className="h-8 text-xs"
                placeholder="My App"
              />
            </Row>
            <Row label="App Store app id">
              <Input
                value={fields.appId}
                onChange={(event) => patch((f) => ({ ...f, appId: event.target.value }))}
                className="h-8 text-xs"
                placeholder="1234567890"
              />
            </Row>
            <Row label="Apple team id">
              <Input
                value={fields.teamId}
                onChange={(event) => patch((f) => ({ ...f, teamId: event.target.value }))}
                className="h-8 text-xs"
                placeholder="ABCDE12345"
              />
            </Row>
            <Row label="Extension bundle id">
              <Input
                value={fields.extensionBundleId}
                onChange={(event) =>
                  patch((f) => ({ ...f, extensionBundleId: event.target.value }))
                }
                className="h-8 text-xs"
                placeholder="com.example.app.MessagesExtension"
              />
            </Row>
            <Row label="Deep link URL (optional)">
              <Input
                value={fields.url}
                onChange={(event) => patch((f) => ({ ...f, url: event.target.value }))}
                className="h-8 text-xs"
                placeholder="{{appUrl}}"
              />
            </Row>
            <Row label="App icon slot (optional)">
              <Input
                value={fields.appIconSlot}
                onChange={(event) => patch((f) => ({ ...f, appIconSlot: event.target.value }))}
                className="h-8 text-xs"
                placeholder="appIcon"
              />
            </Row>
          </div>
          <Toggle
            label="Use live layout"
            checked={fields.useLiveLayout}
            onChange={(value) => patch((f) => ({ ...f, useLiveLayout: value }))}
          />
        </>
      ) : null}

      {native || kind === "text" || kind === "quick_reply" ? (
        <VariablesEditor fields={fields} patch={patch} />
      ) : null}
    </div>
  );
}
