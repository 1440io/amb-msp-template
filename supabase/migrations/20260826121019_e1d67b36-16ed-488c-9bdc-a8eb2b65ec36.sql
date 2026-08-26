CREATE TABLE public.template_variable_mappings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id text NOT NULL,
  variable_name text NOT NULL,
  source_kind text NOT NULL DEFAULT 'manual',
  source_path text,
  literal_value text,
  fallback_kind text NOT NULL DEFAULT 'manual',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (template_id, variable_name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.template_variable_mappings TO authenticated;
GRANT ALL ON public.template_variable_mappings TO service_role;

ALTER TABLE public.template_variable_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agents can manage variable mappings"
  ON public.template_variable_mappings FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE TABLE public.data_source_settings (
  id text NOT NULL DEFAULT 'default' PRIMARY KEY,
  appointment_object text NOT NULL DEFAULT 'Event',
  appointment_start_field text NOT NULL DEFAULT 'StartDateTime',
  appointment_end_field text NOT NULL DEFAULT 'EndDateTime',
  appointment_subject_field text NOT NULL DEFAULT 'Subject',
  appointment_contact_field text NOT NULL DEFAULT 'WhoId',
  business_start_hour integer NOT NULL DEFAULT 9,
  business_end_hour integer NOT NULL DEFAULT 17,
  slot_minutes integer NOT NULL DEFAULT 30,
  days_ahead integer NOT NULL DEFAULT 5,
  slots_offered integer NOT NULL DEFAULT 4,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.data_source_settings TO authenticated;
GRANT ALL ON public.data_source_settings TO service_role;

ALTER TABLE public.data_source_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agents can manage data source settings"
  ON public.data_source_settings FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_template_variable_mappings_updated_at
  BEFORE UPDATE ON public.template_variable_mappings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_data_source_settings_updated_at
  BEFORE UPDATE ON public.data_source_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.data_source_settings (id) VALUES ('default');