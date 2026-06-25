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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      admin_audit_log: {
        Row: {
          actor_email: string
          action: string
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          metadata: Json | null
        }
        Insert: {
          actor_email: string
          action: string
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          metadata?: Json | null
        }
        Update: {
          actor_email?: string
          action?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          metadata?: Json | null
        }
        Relationships: []
      }
      crm_notes: {
        Row: {
          body: string
          created_at: string
          created_by_email: string
          id: string
          lead_id: string
        }
        Insert: {
          body: string
          created_at?: string
          created_by_email: string
          id?: string
          lead_id: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by_email?: string
          id?: string
          lead_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_notes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_tasks: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by_email: string
          description: string | null
          due_at: string | null
          id: string
          lead_id: string
          status: Database["public"]["Enums"]["crm_task_status"]
          title: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by_email: string
          description?: string | null
          due_at?: string | null
          id?: string
          lead_id: string
          status?: Database["public"]["Enums"]["crm_task_status"]
          title: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by_email?: string
          description?: string | null
          due_at?: string | null
          id?: string
          lead_id?: string
          status?: Database["public"]["Enums"]["crm_task_status"]
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_tasks_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_interactions: {
        Row: {
          channel: Database["public"]["Enums"]["interaction_channel"]
          created_at: string
          created_by_email: string
          direction: Database["public"]["Enums"]["interaction_direction"]
          id: string
          lead_id: string
          metadata: Json | null
          summary: string
        }
        Insert: {
          channel?: Database["public"]["Enums"]["interaction_channel"]
          created_at?: string
          created_by_email: string
          direction?: Database["public"]["Enums"]["interaction_direction"]
          id?: string
          lead_id: string
          metadata?: Json | null
          summary: string
        }
        Update: {
          channel?: Database["public"]["Enums"]["interaction_channel"]
          created_at?: string
          created_by_email?: string
          direction?: Database["public"]["Enums"]["interaction_direction"]
          id?: string
          lead_id?: string
          metadata?: Json | null
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_interactions_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          consent_to_contact: boolean
          course_of_interest: string | null
          created_at: string
          email: string
          estimated_value_mxn: number | null
          id: string
          intent: Database["public"]["Enums"]["lead_intent"]
          message: string | null
          name: string
          next_follow_up_at: string | null
          owner_id: string | null
          phone: string | null
          source: Database["public"]["Enums"]["lead_source"]
          status: Database["public"]["Enums"]["lead_status"]
          summary: string | null
          tags: string[] | null
          updated_at: string
        }
        Insert: {
          consent_to_contact?: boolean
          course_of_interest?: string | null
          created_at?: string
          email: string
          estimated_value_mxn?: number | null
          id?: string
          intent?: Database["public"]["Enums"]["lead_intent"]
          message?: string | null
          name: string
          next_follow_up_at?: string | null
          owner_id?: string | null
          phone?: string | null
          source?: Database["public"]["Enums"]["lead_source"]
          status?: Database["public"]["Enums"]["lead_status"]
          summary?: string | null
          tags?: string[] | null
          updated_at?: string
        }
        Update: {
          consent_to_contact?: boolean
          course_of_interest?: string | null
          created_at?: string
          email?: string
          estimated_value_mxn?: number | null
          id?: string
          intent?: Database["public"]["Enums"]["lead_intent"]
          message?: string | null
          name?: string
          next_follow_up_at?: string | null
          owner_id?: string | null
          phone?: string | null
          source?: Database["public"]["Enums"]["lead_source"]
          status?: Database["public"]["Enums"]["lead_status"]
          summary?: string | null
          tags?: string[] | null
          updated_at?: string
        }
        Relationships: []
      }
      // === PLACEHOLDER pre-migración v0.6.0 ===
      // Estas tablas se SOBREESCRIBIRÁN cuando se aplique la migración
      // 20260625130000_masterclass_funnel.sql y se regenere el typegen con:
      //   npx supabase gen types typescript --linked > src/types/supabase.ts
      masterclasses: {
        Row: {
          id: string
          slug: string
          title: string
          subtitle: string | null
          description: string | null
          instructor_name: string | null
          starts_at: string | null
          duration_minutes: number | null
          modality: Database["public"]["Enums"]["masterclass_modality"]
          location: string | null
          cover_image_url: string | null
          status: Database["public"]["Enums"]["masterclass_status"]
          cta_label: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          slug: string
          title: string
          subtitle?: string | null
          description?: string | null
          instructor_name?: string | null
          starts_at?: string | null
          duration_minutes?: number | null
          modality?: Database["public"]["Enums"]["masterclass_modality"]
          location?: string | null
          cover_image_url?: string | null
          status?: Database["public"]["Enums"]["masterclass_status"]
          cta_label?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          slug?: string
          title?: string
          subtitle?: string | null
          description?: string | null
          instructor_name?: string | null
          starts_at?: string | null
          duration_minutes?: number | null
          modality?: Database["public"]["Enums"]["masterclass_modality"]
          location?: string | null
          cover_image_url?: string | null
          status?: Database["public"]["Enums"]["masterclass_status"]
          cta_label?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      masterclass_registrations: {
        Row: {
          id: string
          masterclass_id: string
          lead_id: string | null
          name: string
          email: string
          phone: string | null
          registration_status: Database["public"]["Enums"]["masterclass_registration_status"]
          attendance_status: Database["public"]["Enums"]["masterclass_attendance_status"]
          commercial_status: Database["public"]["Enums"]["masterclass_commercial_status"]
          source: string
          utm_source: string | null
          utm_campaign: string | null
          consent_to_contact: boolean
          registered_at: string
          attended_at: string | null
          notes: string | null
        }
        Insert: {
          id?: string
          masterclass_id: string
          lead_id?: string | null
          name: string
          email: string
          phone?: string | null
          registration_status?: Database["public"]["Enums"]["masterclass_registration_status"]
          attendance_status?: Database["public"]["Enums"]["masterclass_attendance_status"]
          commercial_status?: Database["public"]["Enums"]["masterclass_commercial_status"]
          source?: string
          utm_source?: string | null
          utm_campaign?: string | null
          consent_to_contact?: boolean
          registered_at?: string
          attended_at?: string | null
          notes?: string | null
        }
        Update: {
          id?: string
          masterclass_id?: string
          lead_id?: string | null
          name?: string
          email?: string
          phone?: string | null
          registration_status?: Database["public"]["Enums"]["masterclass_registration_status"]
          attendance_status?: Database["public"]["Enums"]["masterclass_attendance_status"]
          commercial_status?: Database["public"]["Enums"]["masterclass_commercial_status"]
          source?: string
          utm_source?: string | null
          utm_campaign?: string | null
          consent_to_contact?: boolean
          registered_at?: string
          attended_at?: string | null
          notes?: string | null
        }
        Relationships: []
      }
      // === fin PLACEHOLDER ===
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      crm_task_status: "pending" | "completed" | "cancelled"
      interaction_channel:
        | "whatsapp"
        | "email"
        | "phone"
        | "form"
        | "system"
      interaction_direction: "inbound" | "outbound" | "system"
      lead_intent:
        | "course_information"
        | "enroll_course"
        | "pricing"
        | "payment_help"
        | "group_access"
        | "support"
        | "schedule_call"
        | "course_recommendation"
        | "unknown"
      lead_source:
        | "website"
        | "whatsapp"
        | "facebook_ads"
        | "instagram_ads"
        | "referral"
        | "event"
        | "manual"
        | "organic"
        | "other"
      lead_status:
        | "new"
        | "contacted"
        | "interested"
        | "info_requested"
        | "payment_pending"
        | "enrolled"
        | "active_student"
        | "lost"
        | "archived"
      // === PLACEHOLDER pre-migración v0.6.0 ===
      masterclass_modality: "online" | "in_person" | "hybrid"
      masterclass_status: "draft" | "published" | "archived"
      masterclass_attendance_status: "pending" | "attended" | "no_show"
      masterclass_commercial_status:
        | "new"
        | "interested"
        | "not_interested"
        | "converted"
        | "lost"
      masterclass_registration_status:
        | "registered"
        | "cancelled"
        | "no_show"
        | "attended"
      // === fin PLACEHOLDER ===
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
    Enums: {
      crm_task_status: ["pending", "completed", "cancelled"],
      interaction_channel: ["whatsapp", "email", "phone", "form", "system"],
      interaction_direction: ["inbound", "outbound", "system"],
      lead_intent: [
        "course_information",
        "enroll_course",
        "pricing",
        "payment_help",
        "group_access",
        "support",
        "schedule_call",
        "course_recommendation",
        "unknown",
      ],
      lead_source: [
        "website",
        "whatsapp",
        "facebook_ads",
        "instagram_ads",
        "referral",
        "event",
        "manual",
        "organic",
        "other",
      ],
      lead_status: [
        "new",
        "contacted",
        "interested",
        "info_requested",
        "payment_pending",
        "enrolled",
        "active_student",
        "lost",
        "archived",
      ],
      // === PLACEHOLDER pre-migración v0.6.0 ===
      // Estas definiciones se SOBREESCRIBIRÁN cuando se aplique la migración
      // 20260625130000_masterclass_funnel.sql y se regenere el typegen con:
      //   npx supabase gen types typescript --linked > src/types/supabase.ts
      // Mismas definiciones están en src/lib/masterclasses/masterclass-mapper.ts.
      masterclass_modality: ["online", "in_person", "hybrid"],
      masterclass_status: ["draft", "published", "archived"],
      masterclass_attendance_status: ["pending", "attended", "no_show"],
      masterclass_commercial_status: [
        "new",
        "interested",
        "not_interested",
        "converted",
        "lost",
      ],
      masterclass_registration_status: [
        "registered",
        "cancelled",
        "no_show",
        "attended",
      ],
      // === fin PLACEHOLDER ===
    },
  },
} as const
