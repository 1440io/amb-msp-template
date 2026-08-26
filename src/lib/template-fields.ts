// Structured field model for the template wizard. Converts between friendly
// form fields and the two definition shapes (canonical block / native AMB
// payload) so the wizard, the live preview, and the JSON view stay in sync.
import { APPLE_OUTER_TYPE, type RawMessageType } from "@/lib/raw-payloads";
import { templateSkeleton, type TemplateMode } from "@/lib/template-definitions";

export type TemplateVariable = { name: string; type: string; required: boolean };
export type ChoiceItem = { id: string; title: string };
export type ListSection = { title: string; multipleSelection: boolean; items: ChoiceItem[] };
export type Timeslot = { startTime: string; duration: number };
export type FormField = { id: string; title: string; type: string; required: boolean };
export type FormPage = { id: string; title: string; fields: FormField[] };

export type TemplateFields = {
  /** Message body / bubble text. */
  body: string;
  /** Quick reply summary text. */
  summaryText: string;
  items: ChoiceItem[];
  sections: ListSection[];
  /** Title shown on the received bubble. */
  receivedTitle: string;
  /** Interaction title (time picker event / form banner). */
  title: string;
  timeslots: Timeslot[];
  /** Canonical time pickers can bind the slots to a variable instead. */
  timeslotsVariable: string;
  pages: FormPage[];
  appName: string;
  appId: string;
  bid: string;
  url: string;
  imageSlot: string;
  imageUrl: string;
  variables: TemplateVariable[];
};

export const FORM_FIELD_TYPES = ["text", "email", "phone", "date", "select", "number"] as const;
export const VARIABLE_TYPES = ["text", "url", "number", "collection"] as const;

export function emptyFields(): TemplateFields {
  return {
    body: "",
    summaryText: "",
    items: [],
    sections: [],
    receivedTitle: "",
    title: "",
    timeslots: [],
    timeslotsVariable: "",
    pages: [],
    appName: "",
    appId: "",
    bid: "",
    url: "",
    imageSlot: "",
    imageUrl: "",
    variables: [],
  };
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function num(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function arr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function rec(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value ?? null)) as T;
}

function toVariables(value: unknown): TemplateVariable[] {
  return arr(value).map((entry) => {
    const variable = rec(entry);
    return {
      name: str(variable["name"]),
      type: str(variable["type"]) || "text",
      required: variable["required"] !== false,
    };
  });
}

function toChoiceItems(value: unknown): ChoiceItem[] {
  return arr(value).map((entry) => {
    const item = rec(entry);
    return {
      id: str(item["id"]) || str(item["identifier"]),
      title: str(item["title"]),
    };
  });
}

/** Locate `interactiveData.data` in a native payload. */
function nativeData(content: Record<string, unknown>): Record<string, unknown> {
  return rec(rec(content["interactiveData"])["data"]);
}

/** Read the structured fields out of a stored definition. */
export function fieldsFromDefinition(
  messageType: RawMessageType,
  mode: TemplateMode,
  definition: unknown,
): TemplateFields {
  const fields = emptyFields();
  const root = rec(definition);

  if (mode === "canonical") {
    fields.variables = toVariables(root["variables"]);
    const block = rec(root["block"]);
    fields.body = str(block["body"]);
    fields.summaryText = str(block["summaryText"]);
    fields.receivedTitle = str(block["receivedTitle"]);
    fields.title = str(block["title"]);
    fields.url = str(block["url"]);
    fields.appName = str(block["appName"]);
    fields.imageSlot = str(block["imageSlot"]);
    fields.items = toChoiceItems(block["items"]);
    fields.sections = arr(block["sections"]).map((entry) => {
      const section = rec(entry);
      return {
        title: str(section["title"]),
        multipleSelection: section["multipleSelection"] === true,
        items: toChoiceItems(section["items"]),
      };
    });
    if (typeof block["timeslots"] === "string") {
      fields.timeslotsVariable = str(block["timeslots"]).replace(/[{}\s]/g, "");
    } else {
      fields.timeslots = arr(block["timeslots"]).map((entry) => {
        const slot = rec(entry);
        return { startTime: str(slot["startTime"]), duration: num(slot["duration"], 1800) };
      });
    }
    fields.pages = arr(block["pages"]).map((entry) => {
      const page = rec(entry);
      return {
        id: str(page["id"]),
        title: str(page["title"]),
        fields: arr(page["inputFields"]).map((raw) => {
          const field = rec(raw);
          return {
            id: str(field["id"]),
            title: str(field["title"]),
            type: str(field["type"]) || "text",
            required: field["required"] === true,
          };
        }),
      };
    });
    return fields;
  }

  const content = rec(root["content"]);
  const data = nativeData(content);
  const interactive = rec(content["interactiveData"]);
  fields.body = str(content["body"]);
  fields.receivedTitle = str(rec(data["receivedMessage"])["title"]) || str(rec(interactive["receivedMessage"])["title"]);

  switch (messageType) {
    case "quick_reply": {
      const marker = rec(data["quick-reply"]);
      fields.summaryText = str(marker["summaryText"]);
      fields.items = toChoiceItems(marker["items"]);
      break;
    }
    case "list_picker": {
      fields.sections = arr(rec(data["listPicker"])["sections"]).map((entry) => {
        const section = rec(entry);
        return {
          title: str(section["title"]),
          multipleSelection: section["multipleSelection"] === true,
          items: toChoiceItems(section["items"]),
        };
      });
      break;
    }
    case "time_picker": {
      const event = rec(data["event"]);
      fields.title = str(event["title"]);
      fields.timeslots = arr(event["timeslots"]).map((entry) => {
        const slot = rec(entry);
        return { startTime: str(slot["startTime"]), duration: num(slot["duration"], 1800) };
      });
      break;
    }
    case "form": {
      const form = rec(data["form"]);
      fields.title = str(rec(form["startBanner"])["title"]);
      fields.pages = arr(form["pages"]).map((entry) => {
        const page = rec(entry);
        return {
          id: str(page["id"]),
          title: str(page["title"]),
          fields: arr(page["inputFields"]).map((raw) => {
            const field = rec(raw);
            return {
              id: str(field["id"]),
              title: str(field["title"]),
              type: str(field["type"]) || "text",
              required: field["required"] === true,
            };
          }),
        };
      });
      break;
    }
    case "imessage_app": {
      fields.bid = str(interactive["bid"]);
      fields.appId = str(interactive["appId"]);
      fields.appName = str(interactive["appName"]);
      fields.url = str(interactive["URL"]);
      break;
    }
    case "rich_link": {
      const link = rec(content["richLinkData"]);
      fields.url = str(link["url"]);
      fields.title = str(link["title"]);
      fields.imageUrl = str(rec(rec(link["assets"])["image"])["url"]);
      break;
    }
    default:
      break;
  }

  return fields;
}

const CANONICAL_KIND: Record<RawMessageType, string> = {
  text: "text",
  quick_reply: "quick_reply",
  list_picker: "list_picker",
  time_picker: "time_picker",
  form: "form",
  imessage_app: "imessage_app",
  rich_link: "rich_link",
};

/**
 * Write the structured fields back into a definition, preserving any unknown
 * keys already present on the base definition so hand-written extras survive.
 */
export function definitionFromFields(
  messageType: RawMessageType,
  mode: TemplateMode,
  fields: TemplateFields,
  base?: unknown,
): Record<string, unknown> {
  const baseRecord = rec(base);
  const useBase = baseRecord["mode"] === mode;
  const definition = useBase
    ? clone(baseRecord)
    : (templateSkeleton(messageType, mode) as Record<string, unknown>);

  if (mode === "canonical") {
    definition["mode"] = "canonical";
    definition["variables"] = fields.variables
      .filter((variable) => variable.name.trim())
      .map((variable) => ({
        name: variable.name.trim(),
        type: variable.type,
        required: variable.required,
      }));
    const block = rec(definition["block"]);
    const next: Record<string, unknown> = { ...block, kind: CANONICAL_KIND[messageType] };

    // Drop keys that belong to other kinds so switching types leaves no residue.
    for (const key of [
      "body",
      "summaryText",
      "items",
      "sections",
      "receivedTitle",
      "title",
      "timeslots",
      "pages",
      "appName",
      "url",
      "imageSlot",
    ]) {
      delete next[key];
    }

    switch (messageType) {
      case "text":
        next["body"] = fields.body;
        break;
      case "quick_reply":
        next["summaryText"] = fields.summaryText;
        next["body"] = fields.body;
        next["items"] = fields.items.map((item) => ({ id: item.id, title: item.title }));
        break;
      case "list_picker":
        next["receivedTitle"] = fields.receivedTitle;
        next["sections"] = fields.sections.map((section) => ({
          title: section.title,
          multipleSelection: section.multipleSelection,
          items: section.items.map((item) => ({ id: item.id, title: item.title })),
        }));
        break;
      case "time_picker":
        next["title"] = fields.title;
        next["receivedTitle"] = fields.receivedTitle;
        next["timeslots"] = fields.timeslotsVariable.trim()
          ? `{{${fields.timeslotsVariable.trim()}}}`
          : fields.timeslots.map((slot) => ({
              startTime: slot.startTime,
              duration: slot.duration,
            }));
        break;
      case "form":
        next["title"] = fields.title;
        next["pages"] = fields.pages.map((page) => ({
          id: page.id,
          title: page.title,
          inputFields: page.fields.map((field) => ({
            id: field.id,
            title: field.title,
            type: field.type,
            required: field.required,
          })),
        }));
        break;
      case "imessage_app":
        next["appName"] = fields.appName;
        next["url"] = fields.url;
        next["receivedTitle"] = fields.receivedTitle;
        break;
      case "rich_link":
        next["url"] = fields.url;
        next["title"] = fields.title;
        if (fields.imageSlot.trim()) next["imageSlot"] = fields.imageSlot.trim();
        break;
    }

    definition["block"] = next;
    delete definition["channel"];
    delete definition["content"];
    return definition;
  }

  // Native AMB payload.
  definition["mode"] = "native";
  definition["channel"] = "amb";
  delete definition["variables"];
  delete definition["block"];

  const skeletonContent = rec(
    (templateSkeleton(messageType, "native") as Record<string, unknown>)["content"],
  );
  const existing = rec(definition["content"]);
  const content: Record<string, unknown> =
    typeof existing["type"] === "string" && existing["type"] === APPLE_OUTER_TYPE[messageType]
      ? clone(existing)
      : clone(skeletonContent);
  content["type"] = APPLE_OUTER_TYPE[messageType];

  if (messageType === "rich_link") {
    delete content["interactiveData"];
    delete content["body"];
    const link = rec(content["richLinkData"]);
    content["richLinkData"] = {
      ...link,
      url: fields.url,
      title: fields.title,
      ...(fields.imageUrl.trim()
        ? {
            assets: {
              ...rec(link["assets"]),
              image: {
                ...rec(rec(link["assets"])["image"]),
                url: fields.imageUrl.trim(),
                mimeType: fields.imageUrl.trim().endsWith(".jpg") ? "image/jpeg" : "image/png",
              },
            },
          }
        : {}),
    };
    return definition;
  }

  if (messageType === "text") {
    delete content["interactiveData"];
    delete content["richLinkData"];
    content["body"] = fields.body;
    definition["content"] = content;
    return definition;
  }

  delete content["richLinkData"];
  const interactive = rec(content["interactiveData"]);
  const data = rec(interactive["data"]);
  for (const key of ["quick-reply", "quickReply", "listPicker", "event", "form"]) {
    delete data[key];
  }

  if (messageType === "imessage_app") {
    content["interactiveData"] = {
      ...interactive,
      bid: fields.bid || str(interactive["bid"]),
      appId: fields.appId,
      appName: fields.appName,
      URL: fields.url,
      receivedMessage: {
        ...rec(interactive["receivedMessage"]),
        title: fields.receivedTitle,
        style: str(rec(interactive["receivedMessage"])["style"]) || "large",
      },
    };
    delete (content["interactiveData"] as Record<string, unknown>)["data"];
    definition["content"] = content;
    return definition;
  }

  switch (messageType) {
    case "quick_reply":
      content["body"] = fields.body;
      data["quick-reply"] = {
        summaryText: fields.summaryText,
        items: fields.items.map((item) => ({ identifier: item.id, title: item.title })),
      };
      break;
    case "list_picker":
      data["listPicker"] = {
        sections: fields.sections.map((section) => ({
          title: section.title,
          multipleSelection: section.multipleSelection,
          items: section.items.map((item, index) => ({
            identifier: item.id,
            title: item.title,
            order: index,
          })),
        })),
      };
      data["receivedMessage"] = {
        ...rec(data["receivedMessage"]),
        title: fields.receivedTitle,
        style: str(rec(data["receivedMessage"])["style"]) || "large",
      };
      break;
    case "time_picker":
      data["event"] = {
        ...rec(data["event"]),
        title: fields.title,
        timeslots: fields.timeslots.map((slot) => ({
          startTime: slot.startTime,
          duration: slot.duration,
        })),
        timezoneOffset: num(rec(data["event"])["timezoneOffset"], 0),
      };
      data["receivedMessage"] = {
        ...rec(data["receivedMessage"]),
        title: fields.receivedTitle,
        style: str(rec(data["receivedMessage"])["style"]) || "large",
      };
      break;
    case "form":
      data["form"] = {
        ...rec(data["form"]),
        startBanner: {
          ...rec(rec(data["form"])["startBanner"]),
          title: fields.title,
          style: "large",
        },
        pages: fields.pages.map((page) => ({
          id: page.id,
          type: "input",
          title: page.title,
          inputFields: page.fields.map((field) => ({
            id: field.id,
            title: field.title,
            type: field.type,
            required: field.required,
          })),
        })),
      };
      break;
    default:
      break;
  }

  data["version"] = str(data["version"]) || "1.0";
  data["requestIdentifier"] = str(data["requestIdentifier"]) || "REPLACE_WITH_UUID";
  content["interactiveData"] = {
    ...interactive,
    bid:
      str(interactive["bid"]) ||
      str(rec(rec(skeletonContent["interactiveData"]))["bid"]) ||
      "com.apple.messages.MSMessageExtensionBalloonPlugin:0000000000:com.apple.icloud.apps.messages.business.extension",
    data,
  };
  definition["content"] = content;
  return definition;
}

/** Variables referenced by the definition but never declared. */
export function undeclaredVariables(definition: unknown, variables: TemplateVariable[]): string[] {
  const declared = new Set(variables.map((variable) => variable.name.trim()).filter(Boolean));
  const found = new Set<string>();
  const walk = (value: unknown): void => {
    if (typeof value === "string") {
      for (const match of value.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)) {
        if (match[1]) found.add(match[1]);
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    if (value && typeof value === "object") Object.values(value).forEach(walk);
  };
  walk(definition);
  return [...found].filter((name) => !declared.has(name));
}

/** Sample value used by the preview so {{variables}} read like real content. */
export function fillVariables(text: string): string {
  return text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, name: string) => {
    const key = name.toLowerCase();
    if (key.includes("name")) return "Alex";
    if (key.includes("url")) return "example.com";
    if (key.includes("order")) return "#10482";
    if (key.includes("date")) return "Sep 1";
    if (key.includes("time")) return "3:00 PM";
    return name;
  });
}
