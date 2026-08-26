// Client-safe helpers for raw Apple MSP payloads. Used by the composer UI
// before a send and again on the server before the payload reaches 1440.

export const RAW_MESSAGE_TYPES = [
  "text",
  "quick_reply",
  "list_picker",
  "time_picker",
  "form",
  "imessage_app",
  "rich_link",
] as const;

export type RawMessageType = (typeof RAW_MESSAGE_TYPES)[number];

export function isRawMessageType(value: string): value is RawMessageType {
  return (RAW_MESSAGE_TYPES as readonly string[]).includes(value);
}

export function rawMessageTypeLabel(type: RawMessageType): string {
  return type.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

/** Starter payloads, deliberately minimal but shaped like the real thing. */
export const RAW_PAYLOAD_SKELETONS: Record<RawMessageType, unknown> = {
  text: { type: "text", body: "Thanks for reaching out — an agent is with you now." },
  quick_reply: {
    type: "interactive",
    body: "How would you like to receive your order?",
    interactiveData: {
      bid: "com.apple.messages.MSMessageExtensionBalloonPlugin:0000000000:com.apple.icloud.apps.messages.business.extension",
      data: {
        version: "1.0",
        requestIdentifier: "REPLACE_WITH_UUID",
        "quick-reply": {
          summaryText: "Choose a delivery option",
          items: [
            { identifier: "pickup", title: "Pick up in store" },
            { identifier: "delivery", title: "Ship to me" },
          ],
        },
      },
    },
  },
  list_picker: {
    type: "interactive",
    interactiveData: {
      bid: "com.apple.messages.MSMessageExtensionBalloonPlugin:0000000000:com.apple.icloud.apps.messages.business.extension",
      data: {
        version: "1.0",
        requestIdentifier: "REPLACE_WITH_UUID",
        listPicker: {
          sections: [
            {
              title: "Available sizes",
              multipleSelection: false,
              items: [
                { identifier: "small", title: "Small", order: 0 },
                { identifier: "large", title: "Large", order: 1 },
              ],
            },
          ],
        },
        receivedMessage: { title: "Pick a size", style: "large" },
        replyMessage: { title: "Size selected", style: "small" },
      },
    },
  },
  time_picker: {
    type: "interactive",
    interactiveData: {
      bid: "com.apple.messages.MSMessageExtensionBalloonPlugin:0000000000:com.apple.icloud.apps.messages.business.extension",
      data: {
        version: "1.0",
        requestIdentifier: "REPLACE_WITH_UUID",
        event: {
          title: "Book a fitting",
          timeslots: [{ startTime: "2026-09-01T15:00+0000", duration: 1800 }],
          timezoneOffset: 0,
        },
        receivedMessage: { title: "Choose a time", style: "large" },
        replyMessage: { title: "Time booked", style: "small" },
      },
    },
  },
  form: {
    type: "interactive",
    interactiveData: {
      bid: "com.apple.messages.MSMessageExtensionBalloonPlugin:0000000000:com.apple.icloud.apps.messages.business.extension",
      data: {
        version: "1.0",
        requestIdentifier: "REPLACE_WITH_UUID",
        form: {
          startBanner: { title: "Update your details", style: "large" },
          pages: [
            {
              id: "contact",
              type: "input",
              title: "Contact details",
              inputFields: [{ id: "email", title: "Email", type: "email", required: true }],
            },
          ],
        },
      },
    },
  },
  imessage_app: {
    type: "interactive",
    interactiveData: {
      bid: "com.example.myapp.MessagesExtension",
      appId: "REPLACE_WITH_APP_ID",
      appName: "My App",
      URL: "?action=start",
      receivedMessage: { title: "Open in app", style: "large" },
      replyMessage: { title: "Done", style: "small" },
    },
  },
  rich_link: {
    type: "richLink",
    richLinkData: {
      url: "https://example.com/offer",
      title: "Autumn offer",
      assets: { image: { url: "https://example.com/offer.png", mimeType: "image/png" } },
    },
  },
};

function walk(value: unknown, visit: (key: string, node: unknown) => void): void {
  if (Array.isArray(value)) {
    for (const entry of value) walk(entry, visit);
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, node] of Object.entries(value as Record<string, unknown>)) {
      visit(key, node);
      walk(node, visit);
    }
  }
}

function find(value: unknown, key: string): unknown {
  let found: unknown;
  walk(value, (candidate, node) => {
    if (candidate === key && found === undefined) found = node;
  });
  return found;
}

const APPLE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}([+-]\d{4})?$/;

/**
 * Validate the documented hard constraints and the Apple pitfalls that produce
 * confusing platform rejects. Returns human-readable problems, empty when fine.
 */
export function validateRawPayload(
  messageType: RawMessageType,
  payload: unknown,
): string[] {
  const problems: string[] = [];
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return ["Payload must be a JSON object."];
  }

  // Server-owned fields must not be supplied.
  for (const owned of ["sourceId", "destinationId", "id", "v"]) {
    if (owned in (payload as Record<string, unknown>)) {
      problems.push(`Remove the server-owned "${owned}" field — the platform sets it.`);
    }
  }

  // The camelCase spelling fails as message_type_mismatch, which reads like a
  // problem with messageType instead of the payload marker.
  if (find(payload, "quickReply") !== undefined) {
    problems.push('Quick-reply payloads use the hyphenated marker "quick-reply", not "quickReply".');
  }

  // The platform matches messageType against Apple's outer "type" marker. A
  // missing marker fails as 422 "requires an interactive payload".
  const expectedType = APPLE_OUTER_TYPE[messageType];
  const actualType = (payload as { type?: unknown }).type;
  if (actualType !== expectedType) {
    problems.push(
      `Payload must declare Apple's outer marker "type": "${expectedType}" for ${rawMessageTypeLabel(messageType)}${
        typeof actualType === "string" ? ` (found "${actualType}")` : ""
      }.`,
    );
  }



  switch (messageType) {
    case "text": {
      const body = (payload as { body?: unknown }).body;
      if (typeof body !== "string" || !body.trim()) problems.push("Text payloads need a non-empty body.");
      break;
    }
    case "quick_reply": {
      const marker = find(payload, "quick-reply") as { items?: unknown } | undefined;
      if (!marker) {
        problems.push('Missing the "quick-reply" object inside interactiveData.data.');
      } else if (!Array.isArray(marker.items)) {
        problems.push("quick-reply.items must be an array.");
      } else if (marker.items.length < 2 || marker.items.length > 5) {
        problems.push(
          `Quick replies need 2–5 items (found ${marker.items.length}). Apple rejects other counts as 502 provider_rejected.`,
        );
      }
      break;
    }
    case "list_picker": {
      const picker = find(payload, "listPicker") as { sections?: unknown } | undefined;
      if (!picker) problems.push('Missing "listPicker" inside interactiveData.data.');
      else if (!Array.isArray(picker.sections) || picker.sections.length === 0)
        problems.push("listPicker.sections must contain at least one section.");
      break;
    }
    case "time_picker": {
      const event = find(payload, "event") as { timeslots?: unknown } | undefined;
      if (!event) problems.push('Missing "event" inside interactiveData.data.');
      else if (!Array.isArray(event.timeslots) || event.timeslots.length === 0)
        problems.push("event.timeslots must contain at least one slot.");
      else {
        for (const slot of event.timeslots as { startTime?: unknown }[]) {
          if (typeof slot.startTime !== "string" || !APPLE_TIME.test(slot.startTime)) {
            problems.push(
              'Timeslot startTime must use Apple\'s format, e.g. "2026-09-01T15:00+0000" — no seconds, no colon in the offset.',
            );
            break;
          }
        }
      }
      break;
    }
    case "form": {
      const form = find(payload, "form") as { pages?: unknown } | undefined;
      if (!form) problems.push('Missing "form" inside interactiveData.data.');
      else if (!Array.isArray(form.pages) || form.pages.length === 0)
        problems.push("form.pages must contain at least one page.");
      break;
    }
    case "imessage_app": {
      if (find(payload, "bid") === undefined)
        problems.push('iMessage app payloads need the extension "bid".');
      break;
    }
    case "rich_link": {
      const link = find(payload, "richLinkData") as { url?: unknown } | undefined;
      if (!link) problems.push('Missing "richLinkData".');
      else if (typeof link.url !== "string" || !link.url.startsWith("http"))
        problems.push("richLinkData.url must be an absolute https URL.");
      break;
    }
  }

  return problems;
}

export function parseJson(text: string): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Invalid JSON" };
  }
}

/** JSON-serializable value — safe to return across the server-function boundary. */
export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
