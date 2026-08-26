// Client-safe helpers for rich template definitions. Mirrors raw-payloads.ts so
// the template editor and the raw studio start from the same shapes and rules.
import {
  RAW_PAYLOAD_SKELETONS,
  rawMessageTypeLabel,
  validateRawPayload,
  isRawMessageType,
  type RawMessageType,
} from "@/lib/raw-payloads";

export const TEMPLATE_MODES = ["canonical", "native"] as const;
export type TemplateMode = (typeof TEMPLATE_MODES)[number];

export function isTemplateMode(value: string): value is TemplateMode {
  return (TEMPLATE_MODES as readonly string[]).includes(value);
}

export function templateModeLabel(mode: TemplateMode): string {
  return mode === "canonical" ? "Canonical" : "Channel-native (AMB)";
}

/** Canonical block kinds the platform understands, keyed by raw message type. */
const CANONICAL_BLOCKS: Record<RawMessageType, Record<string, unknown>> = {
  text: { kind: "text", body: "Hi {{customerName}} — an agent is with you now." },
  quick_reply: {
    kind: "quick_reply",
    summaryText: "Choose a delivery option",
    body: "Hi {{customerName}}, how would you like to receive your order?",
    items: [
      { id: "pickup", title: "Pick up in store" },
      { id: "delivery", title: "Ship to me" },
    ],
  },
  list_picker: {
    kind: "list_picker",
    receivedTitle: "Pick a size",
    sections: [
      {
        title: "Available sizes",
        multipleSelection: false,
        items: [
          { id: "small", title: "Small" },
          { id: "large", title: "Large" },
        ],
      },
    ],
  },
  time_picker: {
    kind: "time_picker",
    title: "Book a fitting",
    receivedTitle: "Choose a time",
    timeslots: "{{timeslots}}",
  },
  form: {
    kind: "form",
    title: "Update your details",
    pages: [
      {
        id: "contact",
        title: "Contact details",
        inputFields: [{ id: "email", title: "Email", type: "email", required: true }],
      },
    ],
  },
  imessage_app: {
    kind: "imessage_app",
    appName: "My App",
    url: "{{appUrl}}",
    receivedTitle: "Open in app",
  },
  rich_link: {
    kind: "rich_link",
    url: "{{offerUrl}}",
    title: "Autumn offer",
    imageSlot: "heroImage",
  },
};

/** Variables the canonical skeletons above reference. */
const CANONICAL_VARIABLES: Record<RawMessageType, Record<string, unknown>[]> = {
  text: [{ name: "customerName", type: "text", required: true }],
  quick_reply: [{ name: "customerName", type: "text", required: true }],
  list_picker: [],
  time_picker: [
    { name: "timeslots", type: "collection", required: true, itemSchema: "timeslot" },
  ],
  form: [],
  imessage_app: [{ name: "appUrl", type: "url", required: true }],
  rich_link: [{ name: "offerUrl", type: "url", required: true }],
};

/** Starting definition for a message type + mode pairing. */
export function templateSkeleton(
  messageType: RawMessageType,
  mode: TemplateMode,
): Record<string, unknown> {
  if (mode === "native") {
    return {
      mode: "native",
      channel: "amb",
      content: RAW_PAYLOAD_SKELETONS[messageType] as Record<string, unknown>,
    };
  }
  return {
    mode: "canonical",
    variables: CANONICAL_VARIABLES[messageType],
    block: CANONICAL_BLOCKS[messageType],
  };
}

const KIND_TO_TYPE: Record<string, RawMessageType> = {
  text: "text",
  quick_reply: "quick_reply",
  "quick-reply": "quick_reply",
  quickReply: "quick_reply",
  list_picker: "list_picker",
  listPicker: "list_picker",
  time_picker: "time_picker",
  timePicker: "time_picker",
  form: "form",
  imessage_app: "imessage_app",
  rich_link: "rich_link",
  richLink: "rich_link",
};

/** Recover the type + mode of a stored definition so the editor reflects it. */
export function inferTemplateShape(definition: unknown): {
  messageType: RawMessageType;
  mode: TemplateMode;
} {
  const record = (definition ?? {}) as Record<string, unknown>;
  const mode: TemplateMode = record["mode"] === "native" ? "native" : "canonical";

  if (mode === "canonical") {
    const block = record["block"] as { kind?: unknown } | undefined;
    const kind = typeof block?.kind === "string" ? block.kind : "";
    return { messageType: KIND_TO_TYPE[kind] ?? "text", mode };
  }

  const content = record["content"] as Record<string, unknown> | undefined;
  const kind = typeof content?.["kind"] === "string" ? (content["kind"] as string) : "";
  if (KIND_TO_TYPE[kind]) return { messageType: KIND_TO_TYPE[kind] as RawMessageType, mode };

  // Native AMB payload: infer from the Apple markers.
  const json = JSON.stringify(content ?? {});
  if (json.includes('"quick-reply"') || json.includes('"quickReply"'))
    return { messageType: "quick_reply", mode };
  if (json.includes('"listPicker"')) return { messageType: "list_picker", mode };
  if (json.includes('"timeslots"')) return { messageType: "time_picker", mode };
  if (json.includes('"form"')) return { messageType: "form", mode };
  if (json.includes('"richLinkData"')) return { messageType: "rich_link", mode };
  if (json.includes('"appId"')) return { messageType: "imessage_app", mode };
  return { messageType: "text", mode };
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

/**
 * Validate a template definition against the chosen message type. Native
 * definitions reuse the raw payload validators, so Apple's pitfalls (outer
 * "type" marker, hyphenated quick-reply, 2–5 items, Apple time format) are
 * caught in exactly one place.
 */
export function validateTemplateDefinition(
  messageType: RawMessageType,
  mode: TemplateMode,
  definition: unknown,
): string[] {
  const problems: string[] = [];
  if (!definition || typeof definition !== "object" || Array.isArray(definition)) {
    return ["Definition must be a JSON object."];
  }
  const record = definition as Record<string, unknown>;

  if (record["mode"] !== mode) {
    problems.push(`Definition "mode" must be "${mode}" to match the selected mode.`);
  }

  if (mode === "native") {
    if (record["channel"] !== "amb") {
      problems.push('Native definitions need "channel": "amb".');
    }
    const content = record["content"];
    if (!content || typeof content !== "object") {
      problems.push('Native definitions need a "content" object.');
    } else if (!isRawMessageType(messageType)) {
      problems.push("Unknown message type.");
    } else if (typeof (content as { kind?: unknown }).kind === "string") {
      // Platform-shorthand native content; only the kind can be checked here.
      const kind = (content as { kind: string }).kind;
      if (KIND_TO_TYPE[kind] !== messageType) {
        problems.push(
          `content.kind "${kind}" does not match the selected ${rawMessageTypeLabel(messageType)}.`,
        );
      }
    } else {
      problems.push(...validateRawPayload(messageType, content));
    }
    return problems;
  }

  const variables = record["variables"];
  if (!Array.isArray(variables)) {
    problems.push('Canonical definitions need a "variables" array (use [] when there are none).');
  }
  const block = record["block"] as { kind?: unknown } | undefined;
  if (!block || typeof block !== "object") {
    problems.push('Canonical definitions need a "block" object.');
  } else if (typeof block.kind !== "string") {
    problems.push("block.kind is required.");
  } else if (KIND_TO_TYPE[block.kind] !== messageType) {
    problems.push(
      `block.kind "${block.kind}" does not match the selected ${rawMessageTypeLabel(messageType)}.`,
    );
  } else if (messageType === "quick_reply") {
    const items = (block as { items?: unknown }).items;
    if (!Array.isArray(items)) problems.push("quick_reply blocks need an items array.");
    else if (items.length < 2 || items.length > 5)
      problems.push(
        `Quick replies need 2–5 items (found ${items.length}). Apple rejects other counts as 502 provider_rejected.`,
      );
  } else if (messageType === "text") {
    const body = (block as { body?: unknown }).body;
    if (typeof body !== "string" || !body.trim()) problems.push("text blocks need a body.");
  } else if (messageType === "list_picker") {
    const sections = (block as { sections?: unknown }).sections;
    if (!Array.isArray(sections) || sections.length === 0)
      problems.push("list_picker blocks need at least one section.");
  } else if (messageType === "form") {
    const pages = (block as { pages?: unknown }).pages;
    if (!Array.isArray(pages) || pages.length === 0)
      problems.push("form blocks need at least one page.");
  } else if (messageType === "rich_link") {
    const url = (block as { url?: unknown }).url;
    if (typeof url !== "string" || !url.trim())
      problems.push("rich_link blocks need a url (a literal https URL or a {{variable}}).");
  }

  // Every {{variable}} referenced by the block must be declared.
  if (Array.isArray(variables)) {
    const declared = new Set(
      variables
        .map((variable) => (variable as { name?: unknown }).name)
        .filter((name): name is string => typeof name === "string"),
    );
    const referenced = new Set<string>();
    collectVariableRefs(record["block"], referenced);
    for (const name of referenced) {
      if (!declared.has(name)) {
        problems.push(`{{${name}}} is used in the block but not declared in variables.`);
      }
    }
  }

  return problems;
}
