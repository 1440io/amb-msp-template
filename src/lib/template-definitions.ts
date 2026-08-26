// Client-safe helpers for rich template definitions. These shapes mirror the
// platform's RichTemplateDefinition schema exactly: canonical definitions carry
// one `text` or `quick_reply` block, and every other message kind is a
// channel-native definition with a structured `content` object.

export const TEMPLATE_MODES = ["canonical", "native"] as const;
export type TemplateMode = (typeof TEMPLATE_MODES)[number];

/** Every kind the template API accepts. */
export const TEMPLATE_KINDS = [
  "text",
  "quick_reply",
  "list_picker",
  "time_picker",
  "form",
  "rich_link",
  "imessage_app",
  "app_clip_rich_link",
] as const;
export type TemplateKind = (typeof TEMPLATE_KINDS)[number];

/** Kinds the platform renders from a channel-neutral canonical block. */
export const CANONICAL_KINDS: TemplateKind[] = ["text", "quick_reply"];

export function isTemplateKind(value: string): value is TemplateKind {
  return (TEMPLATE_KINDS as readonly string[]).includes(value);
}

export function isTemplateMode(value: string): value is TemplateMode {
  return (TEMPLATE_MODES as readonly string[]).includes(value);
}

/** The mode is implied by the kind — canonical only supports two blocks. */
export function modeForKind(kind: TemplateKind): TemplateMode {
  return CANONICAL_KINDS.includes(kind) ? "canonical" : "native";
}

const KIND_LABELS: Record<TemplateKind, string> = {
  text: "Text",
  quick_reply: "Quick reply",
  list_picker: "List picker",
  time_picker: "Time picker",
  form: "Form",
  rich_link: "Rich link",
  imessage_app: "iMessage app",
  app_clip_rich_link: "App Clip rich link",
};

export function templateKindLabel(kind: TemplateKind): string {
  return KIND_LABELS[kind];
}

export function templateModeLabel(mode: TemplateMode): string {
  return mode === "canonical" ? "Canonical (all channels)" : "Channel-native (Apple Messages)";
}

export function templateModeHint(kind: TemplateKind): string {
  return modeForKind(kind) === "canonical"
    ? "Canonical: one definition the platform renders on every connected channel."
    : "Apple-native: this kind only exists on Apple Messages, so the definition is bound to that channel.";
}

const BUBBLE = {
  title: "Choose an option",
  subtitle: null,
  style: "large" as const,
  imageSlot: null,
};

/** Starting definition for a kind, valid against the platform schema. */
export function templateSkeleton(kind: TemplateKind): Record<string, unknown> {
  switch (kind) {
    case "text":
      return {
        mode: "canonical",
        variables: [{ name: "customerName", type: "text", required: true, itemSchema: null }],
        block: { kind: "text", body: "Hi {{customerName}} — an agent is with you now." },
      };
    case "quick_reply":
      return {
        mode: "canonical",
        variables: [],
        block: {
          kind: "quick_reply",
          summaryText: "How would you like to receive your order?",
          items: [
            { id: "pickup", title: "Pick up in store" },
            { id: "delivery", title: "Ship to me" },
          ],
        },
      };
    case "list_picker":
      return {
        mode: "native",
        channel: "amb",
        variables: [],
        content: {
          kind: "list_picker",
          receivedBubble: { ...BUBBLE, title: "Pick a size" },
          replyBubble: { ...BUBBLE, title: "You picked" },
          sections: [
            {
              title: "Available sizes",
              multipleSelection: false,
              itemsVariable: null,
              items: [
                { id: "small", title: "Small", subtitle: null, imageSlot: null },
                { id: "large", title: "Large", subtitle: null, imageSlot: null },
              ],
            },
          ],
        },
      };
    case "time_picker":
      return {
        mode: "native",
        channel: "amb",
        variables: [
          { name: "timeslots", type: "collection", required: true, itemSchema: "timeslot" },
        ],
        content: {
          kind: "time_picker",
          event: { title: "Book a fitting", timezoneOffset: null, location: null },
          receivedBubble: { ...BUBBLE, title: "Choose a time" },
          replyBubble: { ...BUBBLE, title: "Booked" },
          timeslots: null,
          timeslotsVariable: "timeslots",
        },
      };
    case "form":
      return {
        mode: "native",
        channel: "amb",
        variables: [],
        content: {
          kind: "form",
          isPrivate: false,
          showSummary: true,
          splash: null,
          startPageId: "email",
          receivedBubble: { ...BUBBLE, title: "Update your details" },
          replyBubble: { ...BUBBLE, title: "Details received" },
          pages: [
            {
              id: "email",
              pageType: "input",
              title: "Email",
              subtitle: "So we can send your receipt",
              submitForm: true,
              nextPageId: null,
              hintText: null,
              options: {
                inputType: "singleline",
                keyboardType: "emailAddress",
                labelText: "Email",
                maximumCharacterCount: null,
                placeholder: "you@example.com",
                prefixText: null,
                regex: null,
                required: true,
                textContentType: "emailAddress",
              },
            },
          ],
        },
      };
    case "rich_link":
      return {
        mode: "native",
        channel: "amb",
        variables: [{ name: "offerUrl", type: "url", required: true, itemSchema: null }],
        content: {
          kind: "rich_link",
          title: "Autumn offer",
          url: "{{offerUrl}}",
          imageSlot: null,
          videoUrl: null,
        },
      };
    case "imessage_app":
      return {
        mode: "native",
        channel: "amb",
        variables: [{ name: "appUrl", type: "url", required: true, itemSchema: null }],
        content: {
          kind: "imessage_app",
          appId: "0000000000",
          appName: "My App",
          teamId: "ABCDE12345",
          extensionBundleId: "com.example.app.MessagesExtension",
          appIconSlot: null,
          url: "{{appUrl}}",
          useLiveLayout: false,
          receivedBubble: {
            title: "Open in app",
            subtitle: null,
            secondarySubtitle: null,
            tertiarySubtitle: null,
            imageTitle: null,
            imageSubtitle: null,
          },
        },
      };
    case "app_clip_rich_link":
      return {
        mode: "native",
        channel: "amb",
        variables: [{ name: "clipUrl", type: "url", required: true, itemSchema: null }],
        content: {
          kind: "app_clip_rich_link",
          title: "Start your order",
          url: "{{clipUrl}}",
          imageSlot: "heroImage",
          storeRegion: null,
        },
      };
  }
}

/** Recover the kind + mode of a stored definition so the editor reflects it. */
export function inferTemplateShape(definition: unknown): {
  kind: TemplateKind;
  mode: TemplateMode;
} {
  const record = (definition ?? {}) as Record<string, unknown>;
  const block = record["block"] as { kind?: unknown } | undefined;
  const content = record["content"] as { kind?: unknown } | undefined;
  const raw =
    typeof block?.kind === "string"
      ? block.kind
      : typeof content?.kind === "string"
        ? content.kind
        : "";
  const kind = isTemplateKind(raw) ? raw : "text";
  return { kind, mode: modeForKind(kind) };
}

function collectVariableRefs(value: unknown, found: Set<string>): void {
  if (typeof value === "string") {
    for (const match of value.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)) {
      if (match[1]) found.add(match[1]);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) collectVariableRefs(entry, found);
    return;
  }
  if (value && typeof value === "object") {
    for (const entry of Object.values(value as Record<string, unknown>)) {
      collectVariableRefs(entry, found);
    }
  }
}

const VARIABLE_TYPE_VALUES = ["text", "url", "datetime", "collection"];
const ITEM_SCHEMA_VALUES = ["list_picker_item", "timeslot"];
const BUBBLE_STYLES = ["icon", "small", "large"];
const PAGE_TYPES = ["input", "select", "picker", "date_picker"];

function rec(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function checkBubble(
  label: string,
  value: unknown,
  problems: string[],
  requireStyle = true,
): void {
  const bubble = rec(value);
  if (typeof bubble["title"] !== "string" || !bubble["title"].trim()) {
    problems.push(`${label}.title is required.`);
  }
  if (requireStyle && !BUBBLE_STYLES.includes(String(bubble["style"]))) {
    problems.push(`${label}.style must be "icon", "small" or "large".`);
  }
}

/**
 * Validate a definition against the platform template schema. This catches the
 * 400s the API would otherwise return: unsupported canonical block kinds,
 * variables missing an explicit `itemSchema`, and malformed native content.
 */
export function validateTemplateDefinition(kind: TemplateKind, definition: unknown): string[] {
  const problems: string[] = [];
  if (!definition || typeof definition !== "object" || Array.isArray(definition)) {
    return ["Definition must be a JSON object."];
  }
  const record = definition as Record<string, unknown>;
  const mode = modeForKind(kind);

  if (record["mode"] !== mode) {
    problems.push(
      `"${templateKindLabel(kind)}" definitions use "mode": "${mode}" (found ${JSON.stringify(record["mode"]) ?? "nothing"}).`,
    );
  }

  // Variables: itemSchema must always be present, even as null.
  const variables = record["variables"];
  if (!Array.isArray(variables)) {
    problems.push('Definitions need a "variables" array (use [] when there are none).');
  } else {
    variables.forEach((entry, index) => {
      const variable = rec(entry);
      if (typeof variable["name"] !== "string" || !variable["name"].trim()) {
        problems.push(`variables.${index}.name is required.`);
      }
      if (!VARIABLE_TYPE_VALUES.includes(String(variable["type"]))) {
        problems.push(
          `variables.${index}.type must be one of ${VARIABLE_TYPE_VALUES.join(", ")}.`,
        );
      }
      if (typeof variable["required"] !== "boolean") {
        problems.push(`variables.${index}.required must be true or false.`);
      }
      if (!("itemSchema" in variable)) {
        problems.push(
          `variables.${index}.itemSchema is required — use null unless the variable is a collection.`,
        );
      } else {
        const itemSchema = variable["itemSchema"];
        if (itemSchema !== null && !ITEM_SCHEMA_VALUES.includes(String(itemSchema))) {
          problems.push(
            `variables.${index}.itemSchema must be "list_picker_item", "timeslot" or null.`,
          );
        }
        if (variable["type"] === "collection" && itemSchema === null) {
          problems.push(
            `variables.${index} is a collection, so itemSchema must be "list_picker_item" or "timeslot".`,
          );
        }
        if (variable["type"] !== "collection" && itemSchema !== null) {
          problems.push(`variables.${index}.itemSchema must be null unless the type is collection.`);
        }
      }
    });
  }

  if (mode === "canonical") {
    if ("content" in record) problems.push('Canonical definitions must not carry a "content" key.');
    if ("channel" in record) problems.push('Canonical definitions must not carry a "channel" key.');
    const block = rec(record["block"]);
    if (!record["block"]) {
      problems.push('Canonical definitions need a "block" object.');
    } else if (block["kind"] !== kind) {
      problems.push(`block.kind must be "${kind}".`);
    } else if (kind === "text") {
      if (typeof block["body"] !== "string" || !block["body"].trim()) {
        problems.push("text blocks need a body.");
      }
    } else {
      if (typeof block["summaryText"] !== "string" || !block["summaryText"].trim()) {
        problems.push("quick_reply blocks need summaryText.");
      }
      if ("body" in block) {
        problems.push('quick_reply blocks do not accept "body" — use summaryText.');
      }
      const items = block["items"];
      if (!Array.isArray(items)) problems.push("quick_reply blocks need an items array.");
      else if (items.length < 2 || items.length > 5) {
        problems.push(`Quick replies need 2–5 items (found ${items.length}).`);
      } else {
        items.forEach((entry, index) => {
          const item = rec(entry);
          if (!String(item["id"] ?? "").trim()) problems.push(`items.${index}.id is required.`);
          if (!String(item["title"] ?? "").trim())
            problems.push(`items.${index}.title is required.`);
        });
      }
    }
  } else {
    if (record["channel"] !== "amb") problems.push('Native definitions need "channel": "amb".');
    if ("block" in record) problems.push('Native definitions must not carry a "block" key.');
    const content = rec(record["content"]);
    if (!record["content"]) {
      problems.push('Native definitions need a "content" object.');
    } else if (content["kind"] !== kind) {
      problems.push(`content.kind must be "${kind}".`);
    } else {
      switch (kind) {
        case "list_picker": {
          checkBubble("content.receivedBubble", content["receivedBubble"], problems);
          checkBubble("content.replyBubble", content["replyBubble"], problems);
          const sections = content["sections"];
          if (!Array.isArray(sections) || sections.length === 0) {
            problems.push("List pickers need at least one section.");
          } else {
            sections.forEach((entry, index) => {
              const section = rec(entry);
              if (!String(section["title"] ?? "").trim())
                problems.push(`sections.${index}.title is required.`);
              const items = section["items"];
              const itemsVariable = section["itemsVariable"];
              const hasItems = Array.isArray(items) && items.length > 0;
              if (!hasItems && !itemsVariable) {
                problems.push(
                  `sections.${index} needs items or an itemsVariable bound to a collection.`,
                );
              }
            });
          }
          break;
        }
        case "time_picker": {
          checkBubble("content.receivedBubble", content["receivedBubble"], problems);
          checkBubble("content.replyBubble", content["replyBubble"], problems);
          const timeslots = content["timeslots"];
          const variable = content["timeslotsVariable"];
          const hasSlots = Array.isArray(timeslots) && timeslots.length > 0;
          if (!hasSlots && !variable) {
            problems.push("Time pickers need timeslots or a timeslotsVariable.");
          }
          if (hasSlots) {
            (timeslots as unknown[]).forEach((entry, index) => {
              const slot = rec(entry);
              if (!String(slot["id"] ?? "").trim())
                problems.push(`timeslots.${index}.id is required.`);
              if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(String(slot["startTime"] ?? ""))) {
                problems.push(
                  `timeslots.${index}.startTime must look like 2026-09-01T15:00:00Z.`,
                );
              }
              if (typeof slot["durationSeconds"] !== "number" || slot["durationSeconds"] <= 0) {
                problems.push(`timeslots.${index}.durationSeconds must be a positive number.`);
              }
            });
          }
          break;
        }
        case "form": {
          checkBubble("content.receivedBubble", content["receivedBubble"], problems);
          checkBubble("content.replyBubble", content["replyBubble"], problems);
          const pages = content["pages"];
          if (!Array.isArray(pages) || pages.length === 0) {
            problems.push("Forms need at least one page.");
          } else {
            const ids = new Set<string>();
            pages.forEach((entry, index) => {
              const page = rec(entry);
              const id = String(page["id"] ?? "").trim();
              if (!id) problems.push(`pages.${index}.id is required.`);
              else if (ids.has(id)) problems.push(`pages.${index}.id "${id}" is duplicated.`);
              else ids.add(id);
              if (!PAGE_TYPES.includes(String(page["pageType"]))) {
                problems.push(`pages.${index}.pageType must be one of ${PAGE_TYPES.join(", ")}.`);
              }
              if (typeof page["submitForm"] !== "boolean") {
                problems.push(`pages.${index}.submitForm must be true or false.`);
              }
              if (
                (page["pageType"] === "select" || page["pageType"] === "picker") &&
                (!Array.isArray(page["items"]) || (page["items"] as unknown[]).length === 0)
              ) {
                problems.push(`pages.${index} needs at least one item.`);
              }
            });
            if (!pages.some((entry) => rec(entry)["submitForm"] === true)) {
              problems.push("One form page must have submitForm set to true.");
            }
            const startPageId = content["startPageId"];
            if (startPageId && !ids.has(String(startPageId))) {
              problems.push(`content.startPageId "${String(startPageId)}" is not one of the pages.`);
            }
          }
          break;
        }
        case "rich_link": {
          if (!String(content["title"] ?? "").trim()) problems.push("Rich links need a title.");
          if (!String(content["url"] ?? "").trim()) problems.push("Rich links need a url.");
          break;
        }
        case "app_clip_rich_link": {
          if (!String(content["title"] ?? "").trim())
            problems.push("App Clip rich links need a title.");
          if (!String(content["url"] ?? "").trim()) problems.push("App Clip rich links need a url.");
          if (!String(content["imageSlot"] ?? "").trim()) {
            problems.push("App Clip rich links need an imageSlot bound to an asset.");
          }
          break;
        }
        case "imessage_app": {
          for (const key of ["appId", "appName", "teamId", "extensionBundleId"]) {
            if (!String(content[key] ?? "").trim()) problems.push(`content.${key} is required.`);
          }
          checkBubble("content.receivedBubble", content["receivedBubble"], problems, false);
          break;
        }
        default:
          break;
      }
    }
  }

  // Every {{variable}} referenced must be declared.
  if (Array.isArray(variables)) {
    const declared = new Set(
      variables
        .map((variable) => rec(variable)["name"])
        .filter((name): name is string => typeof name === "string"),
    );
    const referenced = new Set<string>();
    collectVariableRefs(record["block"] ?? record["content"], referenced);
    const bindings = [
      ...(Array.isArray(rec(record["content"])["sections"])
        ? (rec(record["content"])["sections"] as unknown[]).map(
            (section) => rec(section)["itemsVariable"],
          )
        : []),
      rec(record["content"])["timeslotsVariable"],
    ].filter((name): name is string => typeof name === "string" && name.length > 0);
    for (const name of bindings) referenced.add(name.replace(/[{}\s]/g, ""));
    for (const name of referenced) {
      if (!declared.has(name)) {
        problems.push(`"${name}" is used by the definition but not declared in variables.`);
      }
    }
  }

  return problems;
}
