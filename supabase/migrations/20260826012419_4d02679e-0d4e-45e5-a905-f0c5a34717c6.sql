CREATE TABLE public.conversations (
  id uuid PRIMARY KEY,
  channel_platform text NOT NULL DEFAULT 'amb',
  channel_address text,
  first_name text,
  last_name text,
  status text NOT NULL DEFAULT 'active',
  agent_status text NOT NULL DEFAULT 'live',
  opted_out boolean NOT NULL DEFAULT false,
  last_message_at timestamptz NOT NULL DEFAULT now(),
  last_message_preview text,
  unread_count integer NOT NULL DEFAULT 0,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.messages (
  id uuid PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  direction text NOT NULL CHECK (direction IN ('inbound','outbound')),
  message_type text NOT NULL DEFAULT 'text',
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  request_identifier text,
  is_demo boolean NOT NULL DEFAULT false,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX messages_conversation_idx ON public.messages (conversation_id, occurred_at);

CREATE TABLE public.webhook_events (
  id uuid PRIMARY KEY,
  event_type text NOT NULL DEFAULT '',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  received_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.outbound_log (
  request_message_id uuid PRIMARY KEY,
  conversation_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('text','template','raw')),
  status text NOT NULL DEFAULT 'pending',
  error_code text,
  reasons jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX outbound_log_conversation_idx ON public.outbound_log (conversation_id);

GRANT SELECT ON public.conversations TO authenticated;
GRANT SELECT ON public.messages TO authenticated;
GRANT SELECT ON public.webhook_events TO authenticated;
GRANT SELECT ON public.outbound_log TO authenticated;
GRANT ALL ON public.conversations TO service_role;
GRANT ALL ON public.messages TO service_role;
GRANT ALL ON public.webhook_events TO service_role;
GRANT ALL ON public.outbound_log TO service_role;

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outbound_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agents can read conversations" ON public.conversations FOR SELECT TO authenticated USING (true);
CREATE POLICY "Agents can read messages" ON public.messages FOR SELECT TO authenticated USING (true);
CREATE POLICY "Agents can read webhook events" ON public.webhook_events FOR SELECT TO authenticated USING (true);
CREATE POLICY "Agents can read outbound log" ON public.outbound_log FOR SELECT TO authenticated USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER TABLE public.messages REPLICA IDENTITY FULL;
ALTER TABLE public.conversations REPLICA IDENTITY FULL;

INSERT INTO public.conversations (id, channel_platform, channel_address, first_name, last_name, status, agent_status, opted_out, last_message_at, last_message_preview, unread_count, is_demo) VALUES
  ('018f1a2b-0000-7000-8000-0000000000a1', 'amb', 'urn:mbid:AQAAY-demo-1', 'Ada', 'Lovelace', 'active', 'live', false, now() - interval '4 minutes', 'Chose: Large', 2, true),
  ('018f1a2b-0000-7000-8000-0000000000a2', 'amb', 'urn:mbid:AQAAY-demo-2', 'Grace', 'Hopper', 'active', 'live', false, now() - interval '38 minutes', 'receipt.pdf', 0, true),
  ('018f1a2b-0000-7000-8000-0000000000a3', 'amb', 'urn:mbid:AQAAY-demo-3', NULL, NULL, 'active', 'bot', false, now() - interval '3 hours', 'Liked 1 Business Message', 1, true),
  ('018f1a2b-0000-7000-8000-0000000000a4', 'amb', 'urn:mbid:AQAAY-demo-4', 'Alan', 'Turing', 'opted_out', 'closed', true, now() - interval '2 days', 'Customer opted out of messaging', 0, true);

INSERT INTO public.messages (id, conversation_id, direction, message_type, content, attachments, request_identifier, occurred_at, is_demo) VALUES
  ('018f1a2b-0000-7000-8000-0000000001a1', '018f1a2b-0000-7000-8000-0000000000a1', 'inbound', 'text', '{"body":"Hi! Do you have this jacket in a bigger size?"}', '[]', NULL, now() - interval '22 minutes', true),
  ('018f1a2b-0000-7000-8000-0000000001a2', '018f1a2b-0000-7000-8000-0000000000a1', 'outbound', 'rich_message', '{"body":"Which size should we set aside for you?","template":"Size picker"}', '[]', '018f1a2b-0000-7000-8000-00000000f001', now() - interval '12 minutes', true),
  ('018f1a2b-0000-7000-8000-0000000001a3', '018f1a2b-0000-7000-8000-0000000000a1', 'inbound', 'interactive', '{"responseType":"quick_reply","selections":[{"identifier":"size_l","title":"Large"}],"formValues":[],"selectedStartTime":null,"requestIdentifier":"018f1a2b-0000-7000-8000-00000000f001","private":false}', '[]', '018f1a2b-0000-7000-8000-00000000f001', now() - interval '4 minutes', true),
  ('018f1a2b-0000-7000-8000-0000000001b1', '018f1a2b-0000-7000-8000-0000000000a2', 'inbound', 'text', '{"body":"Here is the receipt you asked for."}', '[{"id":"018f1a2b-0000-7000-8000-00000000e001","fileName":"receipt.pdf","mimeType":"application/pdf","sizeBytes":184320,"url":null,"urlExpiresAt":null}]', NULL, now() - interval '38 minutes', true),
  ('018f1a2b-0000-7000-8000-0000000001b2', '018f1a2b-0000-7000-8000-0000000000a2', 'outbound', 'text', '{"body":"Got it — refund is on the way, thanks Grace."}', '[]', '018f1a2b-0000-7000-8000-00000000f002', now() - interval '30 minutes', true),
  ('018f1a2b-0000-7000-8000-0000000001c1', '018f1a2b-0000-7000-8000-0000000000a3', 'inbound', 'interactive', '{"responseType":"time_picker","selections":[{"identifier":"slot_1","title":"Thu 3:55 PM"}],"formValues":[],"selectedStartTime":"2026-08-27T15:55+0000","requestIdentifier":null,"private":false}', '[]', NULL, now() - interval '4 hours', true),
  ('018f1a2b-0000-7000-8000-0000000001c2', '018f1a2b-0000-7000-8000-0000000000a3', 'inbound', 'text', '{"body":"Liked 1 Business Message"}', '[]', NULL, now() - interval '3 hours', true),
  ('018f1a2b-0000-7000-8000-0000000001d1', '018f1a2b-0000-7000-8000-0000000000a4', 'inbound', 'text', '{"body":"Please stop messaging me."}', '[]', NULL, now() - interval '2 days 5 minutes', true),
  ('018f1a2b-0000-7000-8000-0000000001d2', '018f1a2b-0000-7000-8000-0000000000a4', 'inbound', 'opt_out', '{"reason":"customer_request"}', '[]', NULL, now() - interval '2 days', true);

INSERT INTO public.outbound_log (request_message_id, conversation_id, kind, status, error_code, reasons, created_at) VALUES
  ('018f1a2b-0000-7000-8000-00000000f001', '018f1a2b-0000-7000-8000-0000000000a1', 'template', 'sent', NULL, NULL, now() - interval '12 minutes'),
  ('018f1a2b-0000-7000-8000-00000000f002', '018f1a2b-0000-7000-8000-0000000000a2', 'text', 'sent', NULL, NULL, now() - interval '30 minutes'),
  ('018f1a2b-0000-7000-8000-00000000f003', '018f1a2b-0000-7000-8000-0000000000a2', 'template', 'rejected', 'capability_not_supported', '[{"code":"capability_not_supported","message":"List picker is not supported on this conversation''s channel."}]', now() - interval '26 minutes');