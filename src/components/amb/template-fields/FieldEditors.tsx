// Per-message-type structured editors for the template wizard.
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
import type { RawMessageType } from "@/lib/raw-payloads";
import type { TemplateMode } from "@/lib/template-definitions";
import {
  FORM_FIELD_TYPES,
  VARIABLE_TYPES,
  type TemplateFields,
} from "@/lib/template-fields";

type Patch = (updater: (fields: TemplateFields) => TemplateFields) => void;

function Label({ children }: { children: React.ReactNode }) {
  return <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{children}</span>;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

export function FieldEditors({
  messageType,
  mode,
  fields,
  patch,
}: {
  messageType: RawMessageType;
  mode: TemplateMode;
  fields: TemplateFields;
  patch: Patch;
}) {
  return (
    <div className="space-y-4">
      {messageType === "text" ? (
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

      {messageType === "quick_reply" ? (
        <>
          <Row label="Body">
            <Textarea
              value={fields.body}
              onChange={(event) => patch((f) => ({ ...f, body: event.target.value }))}
              rows={2}
              className="text-xs"
              placeholder="How would you like to receive your order?"
            />
          </Row>
          <Row label="Summary text">
            <Input
              value={fields.summaryText}
              onChange={(event) => patch((f) => ({ ...f, summaryText: event.target.value }))}
              className="h-8 text-xs"
              placeholder="Choose a delivery option"
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
                  patch((f) => ({ ...f, items: [...f.items, { id: "", title: "" }] }))
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
                  className="h-8 w-32 text-xs"
                />
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 text-xs"
                  onClick={() =>
                    patch((f) => ({ ...f, items: f.items.filter((_, i) => i !== index) }))
                  }
                >
                  Remove
                </Button>
              </div>
            ))}
            {fields.items.length < 2 || fields.items.length > 5 ? (
              <p className="text-[11px] text-destructive">
                Apple rejects quick replies outside 2–5 options as 502 provider_rejected.
              </p>
            ) : null}
          </div>
        </>
      ) : null}

      {messageType === "list_picker" ? (
        <>
          <Row label="Received bubble title">
            <Input
              value={fields.receivedTitle}
              onChange={(event) => patch((f) => ({ ...f, receivedTitle: event.target.value }))}
              className="h-8 text-xs"
              placeholder="Pick a size"
            />
          </Row>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Label>Sections</Label>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
                onClick={() =>
                  patch((f) => ({
                    ...f,
                    sections: [
                      ...f.sections,
                      { title: "", multipleSelection: false, items: [{ id: "", title: "" }] },
                    ],
                  }))
                }
              >
                Add section
              </Button>
            </div>
            {fields.sections.map((section, sectionIndex) => (
              <div key={sectionIndex} className="space-y-2 rounded-md border border-border p-3">
                <div className="flex items-center gap-2">
                  <Input
                    value={section.title}
                    onChange={(event) =>
                      patch((f) => ({
                        ...f,
                        sections: f.sections.map((entry, i) =>
                          i === sectionIndex ? { ...entry, title: event.target.value } : entry,
                        ),
                      }))
                    }
                    placeholder="Section title"
                    className="h-8 flex-1 text-xs"
                  />
                  <div className="flex items-center gap-1.5">
                    <Switch
                      checked={section.multipleSelection}
                      onCheckedChange={(checked) =>
                        patch((f) => ({
                          ...f,
                          sections: f.sections.map((entry, i) =>
                            i === sectionIndex ? { ...entry, multipleSelection: checked } : entry,
                          ),
                        }))
                      }
                    />
                    <span className="text-[11px] text-muted-foreground">Multi-select</span>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 text-xs"
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
                {section.items.map((item, itemIndex) => (
                  <div key={itemIndex} className="flex items-center gap-2">
                    <Input
                      value={item.title}
                      onChange={(event) =>
                        patch((f) => ({
                          ...f,
                          sections: f.sections.map((entry, i) =>
                            i === sectionIndex
                              ? {
                                  ...entry,
                                  items: entry.items.map((raw, j) =>
                                    j === itemIndex
                                      ? {
                                          title: event.target.value,
                                          id: raw.id || slugify(event.target.value),
                                        }
                                      : raw,
                                  ),
                                }
                              : entry,
                          ),
                        }))
                      }
                      placeholder="Item title"
                      className="h-8 flex-1 text-xs"
                    />
                    <Input
                      value={item.id}
                      onChange={(event) =>
                        patch((f) => ({
                          ...f,
                          sections: f.sections.map((entry, i) =>
                            i === sectionIndex
                              ? {
                                  ...entry,
                                  items: entry.items.map((raw, j) =>
                                    j === itemIndex ? { ...raw, id: event.target.value } : raw,
                                  ),
                                }
                              : entry,
                          ),
                        }))
                      }
                      placeholder="id"
                      className="h-8 w-28 text-xs"
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 text-xs"
                      onClick={() =>
                        patch((f) => ({
                          ...f,
                          sections: f.sections.map((entry, i) =>
                            i === sectionIndex
                              ? { ...entry, items: entry.items.filter((_, j) => j !== itemIndex) }
                              : entry,
                          ),
                        }))
                      }
                    >
                      Remove
                    </Button>
                  </div>
                ))}
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() =>
                    patch((f) => ({
                      ...f,
                      sections: f.sections.map((entry, i) =>
                        i === sectionIndex
                          ? { ...entry, items: [...entry.items, { id: "", title: "" }] }
                          : entry,
                      ),
                    }))
                  }
                >
                  Add item
                </Button>
              </div>
            ))}
          </div>
        </>
      ) : null}

      {messageType === "time_picker" ? (
        <>
          <Row label="Event title">
            <Input
              value={fields.title}
              onChange={(event) => patch((f) => ({ ...f, title: event.target.value }))}
              className="h-8 text-xs"
              placeholder="Book a fitting"
            />
          </Row>
          <Row label="Received bubble title">
            <Input
              value={fields.receivedTitle}
              onChange={(event) => patch((f) => ({ ...f, receivedTitle: event.target.value }))}
              className="h-8 text-xs"
              placeholder="Choose a time"
            />
          </Row>
          {mode === "canonical" ? (
            <Row label="Timeslots variable (optional)">
              <Input
                value={fields.timeslotsVariable}
                onChange={(event) =>
                  patch((f) => ({ ...f, timeslotsVariable: event.target.value }))
                }
                className="h-8 text-xs"
                placeholder="timeslots — leave empty to list fixed slots below"
              />
            </Row>
          ) : null}
          {mode === "native" || !fields.timeslotsVariable.trim() ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label>Timeslots</Label>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() =>
                    patch((f) => ({
                      ...f,
                      timeslots: [...f.timeslots, { startTime: "", duration: 1800 }],
                    }))
                  }
                >
                  Add slot
                </Button>
              </div>
              {fields.timeslots.map((slot, index) => (
                <div key={index} className="flex items-center gap-2">
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
                    placeholder="2026-09-01T15:00+0000"
                    className="h-8 flex-1 font-mono text-[11px]"
                  />
                  <Input
                    type="number"
                    value={slot.duration}
                    onChange={(event) =>
                      patch((f) => ({
                        ...f,
                        timeslots: f.timeslots.map((entry, i) =>
                          i === index
                            ? { ...entry, duration: Number(event.target.value) || 0 }
                            : entry,
                        ),
                      }))
                    }
                    className="h-8 w-24 text-xs"
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 text-xs"
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
              <p className="text-[11px] text-muted-foreground">
                Apple format: no seconds and no colon in the offset — 2026-09-01T15:00+0000.
                Duration is in seconds.
              </p>
            </div>
          ) : null}
        </>
      ) : null}

      {messageType === "form" ? (
        <>
          <Row label="Form title">
            <Input
              value={fields.title}
              onChange={(event) => patch((f) => ({ ...f, title: event.target.value }))}
              className="h-8 text-xs"
              placeholder="Update your details"
            />
          </Row>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Label>Pages</Label>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
                onClick={() =>
                  patch((f) => ({
                    ...f,
                    pages: [
                      ...f.pages,
                      {
                        id: "",
                        title: "",
                        fields: [{ id: "", title: "", type: "text", required: false }],
                      },
                    ],
                  }))
                }
              >
                Add page
              </Button>
            </div>
            {fields.pages.map((page, pageIndex) => (
              <div key={pageIndex} className="space-y-2 rounded-md border border-border p-3">
                <div className="flex items-center gap-2">
                  <Input
                    value={page.title}
                    onChange={(event) =>
                      patch((f) => ({
                        ...f,
                        pages: f.pages.map((entry, i) =>
                          i === pageIndex
                            ? {
                                ...entry,
                                title: event.target.value,
                                id: entry.id || slugify(event.target.value),
                              }
                            : entry,
                        ),
                      }))
                    }
                    placeholder="Page title"
                    className="h-8 flex-1 text-xs"
                  />
                  <Input
                    value={page.id}
                    onChange={(event) =>
                      patch((f) => ({
                        ...f,
                        pages: f.pages.map((entry, i) =>
                          i === pageIndex ? { ...entry, id: event.target.value } : entry,
                        ),
                      }))
                    }
                    placeholder="id"
                    className="h-8 w-28 text-xs"
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 text-xs"
                    onClick={() =>
                      patch((f) => ({ ...f, pages: f.pages.filter((_, i) => i !== pageIndex) }))
                    }
                  >
                    Remove
                  </Button>
                </div>
                {page.fields.map((field, fieldIndex) => (
                  <div key={fieldIndex} className="flex items-center gap-2">
                    <Input
                      value={field.title}
                      onChange={(event) =>
                        patch((f) => ({
                          ...f,
                          pages: f.pages.map((entry, i) =>
                            i === pageIndex
                              ? {
                                  ...entry,
                                  fields: entry.fields.map((raw, j) =>
                                    j === fieldIndex
                                      ? {
                                          ...raw,
                                          title: event.target.value,
                                          id: raw.id || slugify(event.target.value),
                                        }
                                      : raw,
                                  ),
                                }
                              : entry,
                          ),
                        }))
                      }
                      placeholder="Field label"
                      className="h-8 flex-1 text-xs"
                    />
                    <Select
                      value={field.type}
                      onValueChange={(value) =>
                        patch((f) => ({
                          ...f,
                          pages: f.pages.map((entry, i) =>
                            i === pageIndex
                              ? {
                                  ...entry,
                                  fields: entry.fields.map((raw, j) =>
                                    j === fieldIndex ? { ...raw, type: value } : raw,
                                  ),
                                }
                              : entry,
                          ),
                        }))
                      }
                    >
                      <SelectTrigger className="h-8 w-28 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FORM_FIELD_TYPES.map((type) => (
                          <SelectItem key={type} value={type}>
                            {type}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="flex items-center gap-1.5">
                      <Switch
                        checked={field.required}
                        onCheckedChange={(checked) =>
                          patch((f) => ({
                            ...f,
                            pages: f.pages.map((entry, i) =>
                              i === pageIndex
                                ? {
                                    ...entry,
                                    fields: entry.fields.map((raw, j) =>
                                      j === fieldIndex ? { ...raw, required: checked } : raw,
                                    ),
                                  }
                                : entry,
                            ),
                          }))
                        }
                      />
                      <span className="text-[11px] text-muted-foreground">Req</span>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 text-xs"
                      onClick={() =>
                        patch((f) => ({
                          ...f,
                          pages: f.pages.map((entry, i) =>
                            i === pageIndex
                              ? { ...entry, fields: entry.fields.filter((_, j) => j !== fieldIndex) }
                              : entry,
                          ),
                        }))
                      }
                    >
                      Remove
                    </Button>
                  </div>
                ))}
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() =>
                    patch((f) => ({
                      ...f,
                      pages: f.pages.map((entry, i) =>
                        i === pageIndex
                          ? {
                              ...entry,
                              fields: [
                                ...entry.fields,
                                { id: "", title: "", type: "text", required: false },
                              ],
                            }
                          : entry,
                      ),
                    }))
                  }
                >
                  Add field
                </Button>
              </div>
            ))}
          </div>
        </>
      ) : null}

      {messageType === "imessage_app" ? (
        <>
          <Row label="App name">
            <Input
              value={fields.appName}
              onChange={(event) => patch((f) => ({ ...f, appName: event.target.value }))}
              className="h-8 text-xs"
              placeholder="My App"
            />
          </Row>
          <Row label="URL">
            <Input
              value={fields.url}
              onChange={(event) => patch((f) => ({ ...f, url: event.target.value }))}
              className="h-8 text-xs"
              placeholder="?action=start or {{appUrl}}"
            />
          </Row>
          <Row label="Received bubble title">
            <Input
              value={fields.receivedTitle}
              onChange={(event) => patch((f) => ({ ...f, receivedTitle: event.target.value }))}
              className="h-8 text-xs"
              placeholder="Open in app"
            />
          </Row>
          {mode === "native" ? (
            <>
              <Row label="Extension bid">
                <Input
                  value={fields.bid}
                  onChange={(event) => patch((f) => ({ ...f, bid: event.target.value }))}
                  className="h-8 font-mono text-[11px]"
                  placeholder="com.example.myapp.MessagesExtension"
                />
              </Row>
              <Row label="App ID">
                <Input
                  value={fields.appId}
                  onChange={(event) => patch((f) => ({ ...f, appId: event.target.value }))}
                  className="h-8 font-mono text-[11px]"
                  placeholder="1234567890"
                />
              </Row>
            </>
          ) : null}
        </>
      ) : null}

      {messageType === "rich_link" ? (
        <>
          <Row label="Link URL">
            <Input
              value={fields.url}
              onChange={(event) => patch((f) => ({ ...f, url: event.target.value }))}
              className="h-8 text-xs"
              placeholder="https://example.com/offer or {{offerUrl}}"
            />
          </Row>
          <Row label="Title">
            <Input
              value={fields.title}
              onChange={(event) => patch((f) => ({ ...f, title: event.target.value }))}
              className="h-8 text-xs"
              placeholder="Autumn offer"
            />
          </Row>
          {mode === "canonical" ? (
            <Row label="Image slot name">
              <Input
                value={fields.imageSlot}
                onChange={(event) => patch((f) => ({ ...f, imageSlot: event.target.value }))}
                className="h-8 text-xs"
                placeholder="heroImage — bound to an asset on the next step"
              />
            </Row>
          ) : (
            <Row label="Image URL">
              <Input
                value={fields.imageUrl}
                onChange={(event) => patch((f) => ({ ...f, imageUrl: event.target.value }))}
                className="h-8 text-xs"
                placeholder="https://example.com/offer.png"
              />
            </Row>
          )}
        </>
      ) : null}

      {mode === "canonical" ? (
        <div className="space-y-2 rounded-md border border-border p-3">
          <div className="flex items-center gap-2">
            <Label>Variables</Label>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() =>
                patch((f) => ({
                  ...f,
                  variables: [...f.variables, { name: "", type: "text", required: true }],
                }))
              }
            >
              Add variable
            </Button>
          </div>
          {fields.variables.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">
              None. Add one for every {`{{placeholder}}`} used above.
            </p>
          ) : (
            fields.variables.map((variable, index) => (
              <div key={index} className="flex items-center gap-2">
                <Input
                  value={variable.name}
                  onChange={(event) =>
                    patch((f) => ({
                      ...f,
                      variables: f.variables.map((entry, i) =>
                        i === index ? { ...entry, name: event.target.value } : entry,
                      ),
                    }))
                  }
                  placeholder="customerName"
                  className="h-8 flex-1 text-xs"
                />
                <Select
                  value={variable.type}
                  onValueChange={(value) =>
                    patch((f) => ({
                      ...f,
                      variables: f.variables.map((entry, i) =>
                        i === index ? { ...entry, type: value } : entry,
                      ),
                    }))
                  }
                >
                  <SelectTrigger className="h-8 w-32 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VARIABLE_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-1.5">
                  <Switch
                    checked={variable.required}
                    onCheckedChange={(checked) =>
                      patch((f) => ({
                        ...f,
                        variables: f.variables.map((entry, i) =>
                          i === index ? { ...entry, required: checked } : entry,
                        ),
                      }))
                    }
                  />
                  <span className="text-[11px] text-muted-foreground">Req</span>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 text-xs"
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
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
