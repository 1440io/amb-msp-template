// Authenticated server functions for the data-source mapping layer.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  DEFAULT_SETTINGS,
  type DataSourceSettings,
  type ResolvedVariable,
  type SourceKind,
  type VariableMapping,
} from "@/lib/data-sources/types";

const SOURCE_KINDS: SourceKind[] = [
  "customer",
  "appointment",
  "availability",
  "conversation",
  "literal",
  "ai",
  "manual",
];

type SettingsRow = {
  appointment_object: string;
  appointment_start_field: string;
  appointment_end_field: string;
  appointment_subject_field: string;
  appointment_contact_field: string;
  business_start_hour: number;
  business_end_hour: number;
  slot_minutes: number;
  days_ahead: number;
  slots_offered: number;
};

function toSettings(row: SettingsRow | null): DataSourceSettings {
  if (!row) return DEFAULT_SETTINGS;
  return {
    appointmentObject: row.appointment_object,
    appointmentStartField: row.appointment_start_field,
    appointmentEndField: row.appointment_end_field,
    appointmentSubjectField: row.appointment_subject_field,
    appointmentContactField: row.appointment_contact_field,
    businessStartHour: row.business_start_hour,
    businessEndHour: row.business_end_hour,
    slotMinutes: row.slot_minutes,
    daysAhead: row.days_ahead,
    slotsOffered: row.slots_offered,
  };
}

export const getDataSourceStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(
    async ({
      context,
    }): Promise<{ settings: DataSourceSettings; salesforceConnected: boolean }> => {
      const { salesforceConfigured } = await import("@/lib/data-sources/salesforce.server");
      const { data } = await context.supabase
        .from("data_source_settings")
        .select("*")
        .eq("id", "default")
        .maybeSingle();
      return {
        settings: toSettings((data as SettingsRow | null) ?? null),
        salesforceConnected: salesforceConfigured(),
      };
    },
  );

export const saveDataSourceSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: DataSourceSettings) => input)
  .handler(async ({ data, context }): Promise<{ ok: boolean; error?: string }> => {
    const clamp = (value: number, min: number, max: number) =>
      Math.max(min, Math.min(max, Math.round(Number(value) || min)));
    const { error } = await context.supabase.from("data_source_settings").upsert({
      id: "default",
      appointment_object: data.appointmentObject.trim() || "Event",
      appointment_start_field: data.appointmentStartField.trim() || "StartDateTime",
      appointment_end_field: data.appointmentEndField.trim() || "EndDateTime",
      appointment_subject_field: data.appointmentSubjectField.trim() || "Subject",
      appointment_contact_field: data.appointmentContactField.trim() || "WhoId",
      business_start_hour: clamp(data.businessStartHour, 0, 23),
      business_end_hour: clamp(data.businessEndHour, 1, 24),
      slot_minutes: clamp(data.slotMinutes, 5, 240),
      days_ahead: clamp(data.daysAhead, 1, 30),
      slots_offered: clamp(data.slotsOffered, 1, 10),
    });
    return error ? { ok: false, error: error.message } : { ok: true };
  });

export const listVariableMappings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { templateId: string }) => {
    if (!input?.templateId) throw new Error("templateId is required");
    return input;
  })
  .handler(async ({ data, context }): Promise<{ mappings: VariableMapping[] }> => {
    const { data: rows } = await context.supabase
      .from("template_variable_mappings")
      .select("*")
      .eq("template_id", data.templateId);
    return { mappings: (rows ?? []).map(rowToMapping) };
  });

type MappingRow = {
  template_id: string;
  variable_name: string;
  source_kind: string;
  source_path: string | null;
  literal_value: string | null;
  fallback_kind: string;
};

function rowToMapping(row: MappingRow): VariableMapping {
  const kind = SOURCE_KINDS.includes(row.source_kind as SourceKind)
    ? (row.source_kind as SourceKind)
    : "manual";
  return {
    templateId: row.template_id,
    variableName: row.variable_name,
    sourceKind: kind,
    sourcePath: row.source_path,
    literalValue: row.literal_value,
    fallbackKind: row.fallback_kind === "ai" ? "ai" : "manual",
  };
}

export const saveVariableMappings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { templateId: string; mappings: VariableMapping[] }) => {
    if (!input?.templateId) throw new Error("templateId is required");
    if (!Array.isArray(input.mappings)) throw new Error("mappings must be an array");
    for (const mapping of input.mappings) {
      if (!SOURCE_KINDS.includes(mapping.sourceKind)) {
        throw new Error(`Unknown source ${mapping.sourceKind}`);
      }
    }
    return input;
  })
  .handler(async ({ data, context }): Promise<{ ok: boolean; error?: string }> => {
    const { error: deleteError } = await context.supabase
      .from("template_variable_mappings")
      .delete()
      .eq("template_id", data.templateId);
    if (deleteError) return { ok: false, error: deleteError.message };

    const rows = data.mappings
      .filter((mapping) => mapping.sourceKind !== "manual")
      .map((mapping) => ({
        template_id: data.templateId,
        variable_name: mapping.variableName,
        source_kind: mapping.sourceKind,
        source_path: mapping.sourcePath,
        literal_value: mapping.literalValue,
        fallback_kind: mapping.fallbackKind,
      }));
    if (rows.length === 0) return { ok: true };

    const { error } = await context.supabase.from("template_variable_mappings").insert(rows);
    return error ? { ok: false, error: error.message } : { ok: true };
  });

export const resolveTemplateVariables = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { conversationId: string; templateId: string }) => {
    if (!input?.conversationId || !input?.templateId) {
      throw new Error("conversationId and templateId are required");
    }
    return input;
  })
  .handler(
    async ({
      data,
      context,
    }): Promise<{
      ok: boolean;
      source: "salesforce" | "demo" | null;
      resolved: ResolvedVariable[];
      unresolved: string[];
      notes: string[];
      error?: string;
    }> => {
      const { resolveVariables } = await import("@/lib/data-sources/resolve.server");
      const { getTemplateDetailById } = await import("@/lib/msp.server");

      const [{ data: conversation }, { data: settingsRow }, { data: mappingRows }] =
        await Promise.all([
          context.supabase
            .from("conversations")
            .select("id, first_name, last_name, channel_address")
            .eq("id", data.conversationId)
            .maybeSingle(),
          context.supabase.from("data_source_settings").select("*").eq("id", "default").maybeSingle(),
          context.supabase
            .from("template_variable_mappings")
            .select("*")
            .eq("template_id", data.templateId),
        ]);

      if (!conversation) {
        return {
          ok: false,
          source: null,
          resolved: [],
          unresolved: [],
          notes: [],
          error: "Conversation not found.",
        };
      }

      const mappings = (mappingRows ?? []).map(rowToMapping);
      if (mappings.length === 0) {
        return { ok: true, source: null, resolved: [], unresolved: [], notes: [] };
      }

      let specs: {
        name: string;
        type: string;
        required: boolean;
        itemSchema: "list_picker_item" | "timeslot" | null;
      }[];
      try {
        const template = await getTemplateDetailById(data.templateId);
        specs = template.variables;
      } catch (error) {
        return {
          ok: false,
          source: null,
          resolved: [],
          unresolved: [],
          notes: [],
          error: error instanceof Error ? error.message : "Could not load the template.",
        };
      }

      const result = await resolveVariables({
        seed: {
          id: conversation.id,
          firstName: conversation.first_name,
          lastName: conversation.last_name,
          channelAddress: conversation.channel_address,
        },
        settings: toSettings((settingsRow as SettingsRow | null) ?? null),
        specs,
        mappings,
      });

      return {
        ok: true,
        source: result.context.source,
        resolved: result.resolved,
        unresolved: result.unresolved,
        notes: result.context.notes,
      };
    },
  );

export const testCustomerLookup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { phone: string }) => {
    if (!input?.phone?.trim()) throw new Error("Enter a phone number to test");
    return input;
  })
  .handler(
    async ({
      data,
      context,
    }): Promise<{ ok: boolean; source: string; resultJson: string; notes: string[] }> => {
      const { resolveContext } = await import("@/lib/data-sources/resolve.server");
      const { data: settingsRow } = await context.supabase
        .from("data_source_settings")
        .select("*")
        .eq("id", "default")
        .maybeSingle();

      const result = await resolveContext(
        { id: "test", firstName: null, lastName: null, channelAddress: data.phone.trim() },
        toSettings((settingsRow as SettingsRow | null) ?? null),
      );

      return {
        ok: true,
        source: result.source,
        resultJson: JSON.stringify(
          {
            customer: result.customer,
            appointments: result.appointments,
            availability: result.availability,
            cases: result.cases,
          },
          null,
          2,
        ),
        notes: result.notes,
      };
    },
  );
