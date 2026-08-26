CREATE TABLE public.initiations (
  id uuid NOT NULL PRIMARY KEY,
  channel text NOT NULL DEFAULT 'amb',
  purpose text NOT NULL DEFAULT 'connect',
  phone_masked text,
  target_first_name text,
  target_last_name text,
  target_agent_status text,
  status text NOT NULL DEFAULT 'submitting',
  reason_code text,
  caller_reference text,
  conversation_id uuid,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.initiations TO authenticated;
GRANT ALL ON public.initiations TO service_role;

ALTER TABLE public.initiations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agents can read initiations"
  ON public.initiations FOR SELECT TO authenticated USING (true);

CREATE INDEX initiations_created_at_idx ON public.initiations (created_at DESC);
CREATE INDEX initiations_status_idx ON public.initiations (status);

ALTER TABLE public.initiations REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.initiations;

INSERT INTO public.initiations
  (id, channel, purpose, phone_masked, target_first_name, target_last_name, target_agent_status, status, reason_code, caller_reference, conversation_id, is_demo, created_at, updated_at)
VALUES
  ('01a011db-0001-7000-8000-000000000001', 'amb', 'connect', '•••• 4417', 'Dana', 'Whitfield', 'live', 'accepted', NULL, 'demo-accepted', (SELECT id FROM public.conversations WHERE is_demo ORDER BY last_message_at DESC LIMIT 1), true, now() - interval '3 hours', now() - interval '2 hours 51 minutes'),
  ('01a011db-0002-7000-8000-000000000002', 'amb', 'connect', '•••• 9052', 'Marcus', 'Ono', 'bot', 'submitted', NULL, 'demo-pending', NULL, true, now() - interval '38 minutes', now() - interval '37 minutes'),
  ('01a011db-0003-7000-8000-000000000003', 'amb', 'connect', '•••• 2310', 'Priya', 'Raman', 'live', 'declined', NULL, 'demo-declined', NULL, true, now() - interval '1 day', now() - interval '23 hours'),
  ('01a011db-0004-7000-8000-000000000004', 'amb', 'connect', '•••• 7788', 'Sam', 'Delgado', 'live', 'provider_rejected', 'recipient_unavailable', 'demo-rejected', NULL, true, now() - interval '2 days', now() - interval '2 days');