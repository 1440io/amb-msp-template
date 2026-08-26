// Structured field model for the template wizard. Converts between friendly
// form fields and the platform's RichTemplateDefinition shapes (canonical block
// for text/quick reply, channel-native content for everything else) so the
// wizard, the live preview, and the JSON view stay in sync.
import {
  modeForKind,
  templateSkeleton,
  type TemplateKind,
  type TemplateMode,
} from "@/lib/template-definitions";

export type VariableType = "text" | "url" | "datetime" | "collection";
export type ItemSchema = "list_picker_item" | "timeslot" | null;
export type BubbleStyle = "icon" | "small" | "large";
export type PageType = "input" | "select" | "picker" | "date_picker";

export type TemplateVariable = {
  name: string;
  type: VariableType;
  required: boolean;
  itemSchema: ItemSchema;
};
export type BubbleFields = {
  title: string;
  subtitle: string;
  style: BubbleStyle;
  imageSlot: string;
};
export type ChoiceItem = { id: string; title: string; subtitle: string; imageSlot: string };
export type ListSection = {
  title: string;
  multipleSelection: boolean;
  items: ChoiceItem[];
  /** Bind the items to a collection variable instead of listing them. */
  itemsVariable: string;
};
export type Timeslot = { id: string; startTime: string; durationSeconds: number };
export type PageItem = { id: string; title: string; value: string };
export type FormPage = {
  id: string;
  pageType: PageType;
  title: string;
  subtitle: string;
  submitForm: boolean;
  nextPageId: string;
  /** input pages */
  labelText: string;
  placeholder: string;
  required: boolean;
  multiline: boolean;
  /** select / picker pages */
  items: PageItem[];
  /** select pages */
  allowMultiple: boolean;
};

export type TemplateFields = {
  /** Canonical text body. */
  body: string;
  /** Canonical quick reply summary text. */
  summaryText: string;
  /** Canonical quick reply options. */
  items: ChoiceItem[];
  receivedBubble: BubbleFields;
  replyBubble: BubbleFields;
  sections: ListSection[];
  /** Time picker event title. */
  eventTitle: string;
  timeslots: Timeslot[];
  timeslotsVariable: string;
  pages: FormPage[];
  startPageId: string;
  isPrivate: boolean;
  showSummary: boolean;
  /** iMessage app fields. */
  appName: string;
  appId: string;
  teamId: string;
  extensionBundleId: string;
  appIconSlot: string;
  useLiveLayout: boolean;
  /** Rich link / App Clip / iMessage app link. */
  title: string;
  url: string;
  imageSlot: string;
  videoUrl: string;
  storeRegion: string;
  variables: TemplateVariable[];
};

export const VARIABLE_TYPES: VariableType[] = ["text", "url", "datetime", "collection"];
export const ITEM_SCHEMAS: Exclude<ItemSchema, null>[] = ["list_picker_item", "timeslot"];
export const BUBBLE_STYLES: BubbleStyle[] = ["icon", "small", "large"];
export const PAGE_TYPES: PageType[] = ["input", "select", "picker", "date_picker"];

export function pageTypeLabel(type: PageType): string {
  switch (type) {
    case "input":
      return "Text input";
    case "select":
      return "Select list";
    case "picker":
      return "Picker";
    case "date_picker":
      return "Date picker";
  }
}

function emptyBubble(title = ""): BubbleFields {
  return { title, subtitle: "", style: "large", imageSlot: "" };
}

export function emptyFields(): TemplateFields {
  return {
    body: "",
    summaryText: "",
    items: [],
    receivedBubble: emptyBubble(),
    replyBubble: emptyBubble(),
    sections: [],
    eventTitle: "",
    timeslots: [],
    timeslotsVariable: "",
    pages: [],
    startPageId: "",
    isPrivate: false,
    showSummary: true,
    appName: "",
    appId: "",
    teamId: "",
    extensionBundleId: "",
    appIconSlot: "",
    useLiveLayout: false,
    title: "",
    url: "",
    imageSlot: "",
    videoUrl: "",
    storeRegion: "",
    variables: [],
  };
}

export function emptyItem(index: number): ChoiceItem {
  return { id: `option_${index + 1}`, title: "", subtitle: "", imageSlot: "" };
}

export function emptySection(): ListSection {
  return { title: "", multipleSelection: false, items: [], itemsVariable: "" };
}

export function emptyTimeslot(index: number): Timeslot {
  return { id: `slot_${index + 1}`, startTime: "", durationSeconds: 1800 };
}

export function emptyPage(index: number): FormPage {
  return {
    id: `page_${index + 1}`,
    pageType: "input",
    title: "",
    subtitle: "",
    submitForm: false,
    nextPageId: "",
    labelText: "",
    placeholder: "",
    required: true,
    multiline: false,
    items: [],
    allowMultiple: false,
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

/** null-or-string, the shape the platform schema uses for optional strings. */
function orNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function toVariables(value: unknown): TemplateVariable[] {
  return arr(value).map((entry) => {
    const variable = rec(entry);
    const type = str(variable["type"]);
    const itemSchema = str(variable["itemSchema"]);
    return {
      name: str(variable["name"]),
      type: (VARIABLE_TYPES as string[]).includes(type) ? (type as VariableType) : "text",
      required: variable["required"] !== false,
      itemSchema: (ITEM_SCHEMAS as string[]).includes(itemSchema)
        ? (itemSchema as Exclude<ItemSchema, null>)
        : null,
    };
  });
}

function toBubble(value: unknown): BubbleFields {
  const bubble = rec(value);
  const style = str(bubble["style"]);
  return {
    title: str(bubble["title"]),
    subtitle: str(bubble["subtitle"]),
    style: (BUBBLE_STYLES as string[]).includes(style) ? (style as BubbleStyle) : "large",
    imageSlot: str(bubble["imageSlot"]),
  };
}

function fromBubble(bubble: BubbleFields): Record<string, unknown> {
  return {
    title: bubble.title,
    subtitle: orNull(bubble.subtitle),
    style: bubble.style,
    imageSlot: orNull(bubble.imageSlot),
  };
}

function toChoiceItems(value: unknown): ChoiceItem[] {
  return arr(value).map((entry) => {
    const item = rec(entry);
    return {
      id: str(item["id"]),
      title: str(item["title"]),
      subtitle: str(item["subtitle"]),
      imageSlot: str(item["imageSlot"]),
    };
  });
}

/** Read the structured fields out of a stored definition. */
export function fieldsFromDefinition(kind: TemplateKind, definition: unknown): TemplateFields {
  const fields = emptyFields();
  const root = rec(definition);
  fields.variables = toVariables(root["variables"]);

  if (modeForKind(kind) === "canonical") {
    const block = rec(root["block"]);
    fields.body = str(block["body"]);
    fields.summaryText = str(block["summaryText"]);
    fields.items = toChoiceItems(block["items"]);
    return fields;
  }

  const content = rec(root["content"]);
  fields.receivedBubble = toBubble(content["receivedBubble"]);
  fields.replyBubble = toBubble(content["replyBubble"]);
  fields.title = str(content["title"]);
  fields.url = str(content["url"]);
  fields.imageSlot = str(content["imageSlot"]);
  fields.videoUrl = str(content["videoUrl"]);
  fields.storeRegion = str(content["storeRegion"]);

  switch (kind) {
    case "list_picker":
      fields.sections = arr(content["sections"]).map((entry) => {
        const section = rec(entry);
        return {
          title: str(section["title"]),
          multipleSelection: section["multipleSelection"] === true,
          items: toChoiceItems(section["items"]),
          itemsVariable: str(section["itemsVariable"]).replace(/[{}\s]/g, ""),
        };
      });
      break;
    case "time_picker":
      fields.eventTitle = str(rec(content["event"])["title"]);
      fields.timeslots = arr(content["timeslots"]).map((entry, index) => {
        const slot = rec(entry);
        return {
          id: str(slot["id"]) || `slot_${index + 1}`,
          startTime: str(slot["startTime"]),
          durationSeconds: num(slot["durationSeconds"], 1800),
        };
      });
      fields.timeslotsVariable = str(content["timeslotsVariable"]).replace(/[{}\s]/g, "");
      break;
    case "form":
      fields.isPrivate = content["isPrivate"] === true;
      fields.showSummary = content["showSummary"] !== false;
      fields.startPageId = str(content["startPageId"]);
      fields.pages = arr(content["pages"]).map((entry, index) => {
        const page = rec(entry);
        const options = rec(page["options"]);
        const pageType = str(page["pageType"]);
        return {
          ...emptyPage(index),
          id: str(page["id"]) || `page_${index + 1}`,
          pageType: (PAGE_TYPES as string[]).includes(pageType) ? (pageType as PageType) : "input",
          title: str(page["title"]),
          subtitle: str(page["subtitle"]),
          submitForm: page["submitForm"] === true,
          nextPageId: str(page["nextPageId"]),
          labelText: str(options["labelText"]),
          placeholder: str(options["placeholder"]),
          required: options["required"] !== false,
          multiline: str(options["inputType"]) === "multiline",
          allowMultiple: page["allowMultiple"] === true,
          items: arr(page["items"]).map((raw) => {
            const item = rec(raw);
            return {
              id: str(item["id"]),
              title: str(item["title"]),
              value: str(item["value"]) || str(item["title"]),
            };
          }),
        };
      });
      break;
    case "imessage_app": {
      const bubble = rec(content["receivedBubble"]);
      fields.receivedBubble = {
        ...emptyBubble(str(bubble["title"])),
        subtitle: str(bubble["subtitle"]),
      };
      fields.appName = str(content["appName"]);
      fields.appId = str(content["appId"]);
      fields.teamId = str(content["teamId"]);
      fields.extensionBundleId = str(content["extensionBundleId"]);
      fields.appIconSlot = str(content["appIconSlot"]);
      fields.useLiveLayout = content["useLiveLayout"] === true;
      break;
    }
    default:
      break;
  }

  return fields;
}

function variablesOut(fields: TemplateFields): Record<string, unknown>[] {
  return fields.variables
    .filter((variable) => variable.name.trim())
    .map((variable) => ({
      name: variable.name.trim(),
      type: variable.type,
      required: variable.required,
      itemSchema: variable.type === "collection" ? (variable.itemSchema ?? "timeslot") : null,
    }));
}

function pageOut(page: FormPage): Record<string, unknown> {
  const shared = {
    id: page.id,
    title: orNull(page.title),
    subtitle: page.subtitle,
    submitForm: page.submitForm,
    nextPageId: orNull(page.nextPageId),
  };
  switch (page.pageType) {
    case "select":
      return {
        ...shared,
        pageType: "select",
        allowMultiple: page.allowMultiple,
        items: page.items.map((item) => ({
          id: item.id,
          title: item.title,
          value: item.value || item.title,
          subtitle: null,
          imageSlot: null,
          nextPageId: null,
        })),
      };
    case "picker":
      return {
        ...shared,
        pageType: "picker",
        pickerTitle: orNull(page.labelText),
        items: page.items.map((item) => ({
          id: item.id,
          title: item.title,
          value: item.value || item.title,
        })),
      };
    case "date_picker":
      return {
        ...shared,
        pageType: "date_picker",
        hintText: orNull(page.placeholder),
        options: {
          dateFormat: null,
          labelText: orNull(page.labelText),
          maximumDate: null,
          minimumDate: null,
          startDate: null,
        },
      };
    case "input":
      return {
        ...shared,
        pageType: "input",
        hintText: orNull(page.placeholder),
        options: {
          inputType: page.multiline ? "multiline" : "singleline",
          keyboardType: null,
          labelText: orNull(page.labelText),
          maximumCharacterCount: null,
          placeholder: orNull(page.placeholder),
          prefixText: null,
          regex: null,
          required: page.required,
          textContentType: null,
        },
      };
  }
}

/** Write the structured fields into a schema-valid definition. */
export function definitionFromFields(
  kind: TemplateKind,
  fields: TemplateFields,
): Record<string, unknown> {
  const variables = variablesOut(fields);

  if (kind === "text") {
    return { mode: "canonical", variables, block: { kind: "text", body: fields.body } };
  }
  if (kind === "quick_reply") {
    return {
      mode: "canonical",
      variables,
      block: {
        kind: "quick_reply",
        summaryText: fields.summaryText,
        items: fields.items.map((item) => ({ id: item.id, title: item.title })),
      },
    };
  }

  const base = { mode: "native" as const, channel: "amb" as const, variables };

  switch (kind) {
    case "list_picker":
      return {
        ...base,
        content: {
          kind: "list_picker",
          receivedBubble: fromBubble(fields.receivedBubble),
          replyBubble: fromBubble(fields.replyBubble),
          sections: fields.sections.map((section) => ({
            title: section.title,
            multipleSelection: section.multipleSelection,
            itemsVariable: orNull(section.itemsVariable),
            items: section.itemsVariable.trim()
              ? null
              : section.items.map((item) => ({
                  id: item.id,
                  title: item.title,
                  subtitle: orNull(item.subtitle),
                  imageSlot: orNull(item.imageSlot),
                })),
          })),
        },
      };
    case "time_picker":
      return {
        ...base,
        content: {
          kind: "time_picker",
          event: { title: orNull(fields.eventTitle), timezoneOffset: null, location: null },
          receivedBubble: fromBubble(fields.receivedBubble),
          replyBubble: fromBubble(fields.replyBubble),
          timeslots: fields.timeslotsVariable.trim()
            ? null
            : fields.timeslots.map((slot) => ({
                id: slot.id,
                startTime: slot.startTime,
                durationSeconds: slot.durationSeconds,
              })),
          timeslotsVariable: orNull(fields.timeslotsVariable),
        },
      };
    case "form":
      return {
        ...base,
        content: {
          kind: "form",
          isPrivate: fields.isPrivate,
          showSummary: fields.showSummary,
          splash: null,
          startPageId: orNull(fields.startPageId) ?? fields.pages[0]?.id ?? null,
          receivedBubble: fromBubble(fields.receivedBubble),
          replyBubble: fromBubble(fields.replyBubble),
          pages: fields.pages.map(pageOut),
        },
      };
    case "rich_link":
      return {
        ...base,
        content: {
          kind: "rich_link",
          title: fields.title,
          url: fields.url,
          imageSlot: orNull(fields.imageSlot),
          videoUrl: orNull(fields.videoUrl),
        },
      };
    case "app_clip_rich_link":
      return {
        ...base,
        content: {
          kind: "app_clip_rich_link",
          title: fields.title,
          url: fields.url,
          imageSlot: fields.imageSlot.trim(),
          storeRegion: orNull(fields.storeRegion),
        },
      };
    case "imessage_app":
      return {
        ...base,
        content: {
          kind: "imessage_app",
          appId: fields.appId,
          appName: fields.appName,
          teamId: fields.teamId,
          extensionBundleId: fields.extensionBundleId,
          appIconSlot: orNull(fields.appIconSlot),
          url: orNull(fields.url),
          useLiveLayout: fields.useLiveLayout,
          receivedBubble: {
            title: orNull(fields.receivedBubble.title),
            subtitle: orNull(fields.receivedBubble.subtitle),
            secondarySubtitle: null,
            tertiarySubtitle: null,
            imageTitle: null,
            imageSubtitle: null,
          },
        },
      };
    default:
      return templateSkeleton(kind);
  }
}

/** Image slot names the definition references, for asset binding. */
export function imageSlots(kind: TemplateKind, fields: TemplateFields): string[] {
  const slots = new Set<string>();
  const add = (value: string) => {
    if (value.trim()) slots.add(value.trim());
  };
  if (modeForKind(kind) === "canonical") return [];
  add(fields.receivedBubble.imageSlot);
  add(fields.replyBubble.imageSlot);
  add(fields.imageSlot);
  add(fields.appIconSlot);
  for (const section of fields.sections) for (const item of section.items) add(item.imageSlot);
  return [...slots];
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
  const record = rec(definition);
  const content = rec(record["content"]);
  for (const section of arr(content["sections"])) {
    const name = str(rec(section)["itemsVariable"]);
    if (name) found.add(name.replace(/[{}\s]/g, ""));
  }
  const slotsVariable = str(content["timeslotsVariable"]);
  if (slotsVariable) found.add(slotsVariable.replace(/[{}\s]/g, ""));
  return [...found].filter((name) => !declared.has(name));
}

/** Sample value used by the preview so {{variables}} read like real content. */
export function fillVariables(text: string, values?: Record<string, unknown>): string {
  return text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, name: string) => {
    const provided = values?.[name];
    if (provided !== undefined && provided !== null && typeof provided !== "object") {
      return String(provided);
    }
    const key = name.toLowerCase();
    if (key.includes("name")) return "Alex";
    if (key.includes("url")) return "example.com";
    if (key.includes("order")) return "#10482";
    if (key.includes("date")) return "Sep 1";
    if (key.includes("time")) return "3:00 PM";
    return name;
  });
}

export type { TemplateKind, TemplateMode };
