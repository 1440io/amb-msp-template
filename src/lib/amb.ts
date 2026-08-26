// Client-safe presentation helpers for AMB conversations and messages.
export type ConversationRow = {
  id: string;
  channel_platform: string;
  channel_address: string | null;
  first_name: string | null;
  last_name: string | null;
  status: string;
  agent_status: string;
  opted_out: boolean;
  last_message_at: string;
  last_message_preview: string | null;
  unread_count: number;
  is_demo: boolean;
};

export type MessageRow = {
  id: string;
  conversation_id: string;
  direction: string;
  message_type: string;
  content: unknown;
  attachments: unknown;
  request_identifier: string | null;
  occurred_at: string;
  is_demo: boolean;
};

export type OutboundLogRow = {
  request_message_id: string;
  conversation_id: string;
  kind: string;
  status: string;
  error_code: string | null;
  reasons: unknown;
};

export function displayName(conversation: ConversationRow): string {
  const name = [conversation.first_name, conversation.last_name].filter(Boolean).join(" ").trim();
  if (name) return name;
  return conversation.channel_address ?? "Unknown customer";
}

export function initials(conversation: ConversationRow): string {
  const name = displayName(conversation);
  return name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const seconds = Math.round((Date.now() - then) / 1000);
  if (seconds < 60) return "now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function channelLabel(platform: string): string {
  switch (platform) {
    case "apple_messages":
    case "amb":
      return "Apple Messages";
    case "sms":
      return "SMS";
    case "whatsapp":
      return "WhatsApp";
    default:
      return platform.replace(/_/g, " ");
  }
}

export function formatBytes(bytes?: number | null): string | null {
  if (!bytes || bytes <= 0) return null;
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value < 10 && unit > 0 ? 1 : 0)} ${units[unit]}`;
}
