export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      conversations: {
        Row: {
          agent_status: string
          channel_address: string | null
          channel_platform: string
          created_at: string
          first_name: string | null
          id: string
          is_demo: boolean
          last_message_at: string
          last_message_preview: string | null
          last_name: string | null
          opted_out: boolean
          status: string
          unread_count: number
          updated_at: string
        }
        Insert: {
          agent_status?: string
          channel_address?: string | null
          channel_platform?: string
          created_at?: string
          first_name?: string | null
          id: string
          is_demo?: boolean
          last_message_at?: string
          last_message_preview?: string | null
          last_name?: string | null
          opted_out?: boolean
          status?: string
          unread_count?: number
          updated_at?: string
        }
        Update: {
          agent_status?: string
          channel_address?: string | null
          channel_platform?: string
          created_at?: string
          first_name?: string | null
          id?: string
          is_demo?: boolean
          last_message_at?: string
          last_message_preview?: string | null
          last_name?: string | null
          opted_out?: boolean
          status?: string
          unread_count?: number
          updated_at?: string
        }
        Relationships: []
      }
      data_source_settings: {
        Row: {
          appointment_contact_field: string
          appointment_end_field: string
          appointment_object: string
          appointment_start_field: string
          appointment_subject_field: string
          business_end_hour: number
          business_start_hour: number
          created_at: string
          days_ahead: number
          id: string
          slot_minutes: number
          slots_offered: number
          updated_at: string
        }
        Insert: {
          appointment_contact_field?: string
          appointment_end_field?: string
          appointment_object?: string
          appointment_start_field?: string
          appointment_subject_field?: string
          business_end_hour?: number
          business_start_hour?: number
          created_at?: string
          days_ahead?: number
          id?: string
          slot_minutes?: number
          slots_offered?: number
          updated_at?: string
        }
        Update: {
          appointment_contact_field?: string
          appointment_end_field?: string
          appointment_object?: string
          appointment_start_field?: string
          appointment_subject_field?: string
          business_end_hour?: number
          business_start_hour?: number
          created_at?: string
          days_ahead?: number
          id?: string
          slot_minutes?: number
          slots_offered?: number
          updated_at?: string
        }
        Relationships: []
      }
      initiations: {
        Row: {
          caller_reference: string | null
          channel: string
          conversation_id: string | null
          created_at: string
          id: string
          is_demo: boolean
          phone_masked: string | null
          purpose: string
          reason_code: string | null
          status: string
          target_agent_status: string | null
          target_first_name: string | null
          target_last_name: string | null
          updated_at: string
        }
        Insert: {
          caller_reference?: string | null
          channel?: string
          conversation_id?: string | null
          created_at?: string
          id: string
          is_demo?: boolean
          phone_masked?: string | null
          purpose?: string
          reason_code?: string | null
          status?: string
          target_agent_status?: string | null
          target_first_name?: string | null
          target_last_name?: string | null
          updated_at?: string
        }
        Update: {
          caller_reference?: string | null
          channel?: string
          conversation_id?: string | null
          created_at?: string
          id?: string
          is_demo?: boolean
          phone_masked?: string | null
          purpose?: string
          reason_code?: string | null
          status?: string
          target_agent_status?: string | null
          target_first_name?: string | null
          target_last_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          attachments: Json
          content: Json
          conversation_id: string
          created_at: string
          direction: string
          id: string
          is_demo: boolean
          message_type: string
          occurred_at: string
          request_identifier: string | null
        }
        Insert: {
          attachments?: Json
          content?: Json
          conversation_id: string
          created_at?: string
          direction: string
          id: string
          is_demo?: boolean
          message_type?: string
          occurred_at?: string
          request_identifier?: string | null
        }
        Update: {
          attachments?: Json
          content?: Json
          conversation_id?: string
          created_at?: string
          direction?: string
          id?: string
          is_demo?: boolean
          message_type?: string
          occurred_at?: string
          request_identifier?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      outbound_log: {
        Row: {
          conversation_id: string
          created_at: string
          error_code: string | null
          kind: string
          payload: Json | null
          reasons: Json | null
          request_message_id: string
          status: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          error_code?: string | null
          kind: string
          payload?: Json | null
          reasons?: Json | null
          request_message_id: string
          status?: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          error_code?: string | null
          kind?: string
          payload?: Json | null
          reasons?: Json | null
          request_message_id?: string
          status?: string
        }
        Relationships: []
      }
      template_variable_mappings: {
        Row: {
          created_at: string
          fallback_kind: string
          id: string
          literal_value: string | null
          source_kind: string
          source_path: string | null
          template_id: string
          updated_at: string
          variable_name: string
        }
        Insert: {
          created_at?: string
          fallback_kind?: string
          id?: string
          literal_value?: string | null
          source_kind?: string
          source_path?: string | null
          template_id: string
          updated_at?: string
          variable_name: string
        }
        Update: {
          created_at?: string
          fallback_kind?: string
          id?: string
          literal_value?: string | null
          source_kind?: string
          source_path?: string | null
          template_id?: string
          updated_at?: string
          variable_name?: string
        }
        Relationships: []
      }
      webhook_events: {
        Row: {
          event_type: string
          id: string
          payload: Json
          received_at: string
        }
        Insert: {
          event_type?: string
          id: string
          payload?: Json
          received_at?: string
        }
        Update: {
          event_type?: string
          id?: string
          payload?: Json
          received_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
