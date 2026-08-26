// Server-only Lovable AI Gateway calls that draft and repair Apple MSP JSON.
// LOVABLE_API_KEY never leaves the server.
import { RAW_PAYLOAD_SKELETONS, validateRawPayload, type RawMessageType } from "@/lib/raw-payloads";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3.7-flash";

export type DraftResult = {
  ok: boolean;
  json?: string;
  notes: string[];
  error?: string;
};

const APPLE_RULES = `
Apple Messages for Business quirks that must be respected:
- Quick replies need between 2 and 5 items. A single item is accepted locally and then rejected by Apple as 502 provider_rejected.
- The quick-reply payload marker is hyphenated: "quick-reply". List picker is "listPicker" (camelCase).
- Time-picker times are NOT RFC 3339. Use "2026-09-01T15:00+0000": no seconds, no colon in the offset.
- Never include the server-owned fields sourceId, destinationId, id, or v.
- interactiveData payloads carry version, requestIdentifier, and a bid for the Messages extension.
- The payload MUST declare Apple's outer marker "type": "text" for text, "interactive" for quick_reply / list_picker / time_picker / form / imessage_app, and "richLink" for rich_link. Omitting it fails with 422 "requires an interactive payload".
`;

type GatewayMessage = { role: "system" | "user"; content: string };

async function callGateway(messages: GatewayMessage[]): Promise<
  { ok: true; content: string } | { ok: false; error: string }
> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) return { ok: false, error: "LOVABLE_API_KEY is not configured." };

  const response = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": apiKey,
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    let message = text;
    try {
      const parsed = JSON.parse(text) as { error?: { message?: string }; message?: string };
      message = parsed.error?.message ?? parsed.message ?? text;
    } catch {
      // keep raw text
    }
    if (response.status === 402) {
      return { ok: false, error: message || "AI credits are exhausted — top up in Lovable to continue." };
    }
    if (response.status === 403) {
      return { ok: false, error: message || "Lovable AI is blocked by workspace policy." };
    }
    if (response.status === 429) {
      return { ok: false, error: "Lovable AI is rate limited right now. Try again in a moment." };
    }
    return { ok: false, error: message || `AI request failed (${response.status}).` };
  }

  const data = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) return { ok: false, error: "The model returned an empty response." };
  return { ok: true, content };
}

function extract(content: string): { payload: unknown; notes: string[] } | null {
  try {
    const parsed = JSON.parse(content) as { payload?: unknown; definition?: unknown; notes?: unknown };
    const value = parsed.payload ?? parsed.definition;
    if (value === undefined) return null;
    const notes = Array.isArray(parsed.notes)
      ? parsed.notes.filter((note): note is string => typeof note === "string")
      : [];
    return { payload: value, notes };
  } catch {
    return null;
  }
}

/** Draft or repair a raw channel payload for one message type. */
export async function draftRawPayload(input: {
  messageType: RawMessageType;
  prompt: string;
  existingJson?: string;
}): Promise<DraftResult> {
  const system = `You author raw Apple Messages for Business (MSP) channel payloads for the 1440 platform.
${APPLE_RULES}
Return ONLY JSON of the shape {"payload": <the payload object>, "notes": [<short strings explaining choices or what you fixed>]}.
The payload is the Apple MSP payload for messageType "${input.messageType}", with no server-owned fields.
Reference skeleton for this message type:
${JSON.stringify(RAW_PAYLOAD_SKELETONS[input.messageType], null, 2)}`;

  const user = input.existingJson
    ? `Review and repair this payload. Explain each fix in notes.\n\nBrief: ${input.prompt || "(no extra brief)"}\n\nPayload:\n${input.existingJson}`
    : `Create a payload for: ${input.prompt}`;

  const result = await callGateway([
    { role: "system", content: system },
    { role: "user", content: user },
  ]);
  if (!result.ok) return { ok: false, notes: [], error: result.error };

  const extracted = extract(result.content);
  if (!extracted) {
    return { ok: false, notes: [], error: "The model did not return a usable payload object." };
  }

  const problems = validateRawPayload(input.messageType, extracted.payload);
  return {
    ok: true,
    json: JSON.stringify(extracted.payload, null, 2),
    notes: [...extracted.notes, ...problems.map((problem) => `Still invalid: ${problem}`)],
  };
}

/** Draft or repair a rich template definition (RichTemplateWriteBody.definition). */
export async function draftTemplateDefinition(input: {
  prompt: string;
  existingJson?: string;
  channel?: string;
  messageType?: RawMessageType;
  mode?: TemplateMode;
}): Promise<DraftResult> {
  const mode = input.mode ?? "canonical";
  const messageType = input.messageType;

  const pinned = messageType
    ? `The definition MUST be mode "${mode}" and represent an Apple ${messageType} message. Keep exactly that shape — do not switch mode or message type.
Reference skeleton to follow:
${JSON.stringify(templateSkeleton(messageType, mode), null, 2)}`
    : "";

  const system = `You author rich message template definitions for the 1440 MSP API.
A definition is either canonical or channel-native.

Canonical shape:
{
  "mode": "canonical",
  "variables": [{ "name": "customerName", "type": "text" | "url" | "datetime" | "collection", "required": true, "itemSchema": null | "list_picker_item" | "timeslot" }],
  "block": { "kind": "text", "body": "Hi {{customerName}}" }
        or { "kind": "quick_reply", "summaryText": "...", "items": [{ "id": "a", "title": "A" }, { "id": "b", "title": "B" }] }
}

Channel-native shape:
{ "mode": "native", "channel": "amb", "content": <the Apple MSP payload, same shape as a raw send> }

Every {{variable}} used inside the block must be declared in "variables".
${pinned}
${APPLE_RULES}
Return ONLY JSON of the shape {"definition": <the definition object>, "notes": [<short strings>]}.`;

  const user = input.existingJson
    ? `Review and repair this template definition. Explain each fix in notes.\n\nBrief: ${input.prompt || "(no extra brief)"}\n\nDefinition:\n${input.existingJson}`
    : `Create a template definition for: ${input.prompt}${input.channel ? ` (target channel: ${input.channel})` : ""}`;

  const result = await callGateway([
    { role: "system", content: system },
    { role: "user", content: user },
  ]);
  if (!result.ok) return { ok: false, notes: [], error: result.error };

  const extracted = extract(result.content);
  if (!extracted) {
    return { ok: false, notes: [], error: "The model did not return a usable definition object." };
  }

  const problems = messageType
    ? validateTemplateDefinition(messageType, mode, extracted.payload)
    : [];

  return {
    ok: true,
    json: JSON.stringify(extracted.payload, null, 2),
    notes: [...extracted.notes, ...problems.map((problem) => `Still invalid: ${problem}`)],
  };
}
