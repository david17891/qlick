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
          action: string
          actor_email: string
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          metadata: Json | null
        }
        Insert: {
          action: string
          actor_email: string
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          metadata?: Json | null
        }
        Update: {
          action?: string
          actor_email?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          metadata?: Json | null
        }
        Relationships: []
      }
      courses: {
        Row: {
          access_type: string
          category: string | null
          cover_image_url: string | null
          created_at: string
          description: string | null
          display_order: number
          duration_minutes: number | null
          id: string
          instructor_name: string | null
          is_featured: boolean
          level: string
          price_mxn: number | null
          slug: string
          status: string
          subtitle: string | null
          title: string
          updated_at: string
        }
        Insert: {
          access_type?: string
          category?: string | null
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          display_order?: number
          duration_minutes?: number | null
          id?: string
          instructor_name?: string | null
          is_featured?: boolean
          level?: string
          price_mxn?: number | null
          slug: string
          status?: string
          subtitle?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          access_type?: string
          category?: string | null
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          display_order?: number
          duration_minutes?: number | null
          id?: string
          instructor_name?: string | null
          is_featured?: boolean
          level?: string
          price_mxn?: number | null
          slug?: string
          status?: string
          subtitle?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      course_access: {
        Row: {
          access_source: string
          access_status: string
          course_id: string
          created_at: string
          expires_at: string | null
          granted_reason: string | null
          id: string
          payment_id: string | null
          starts_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          access_source: string
          access_status?: string
          course_id: string
          created_at?: string
          expires_at?: string | null
          granted_reason?: string | null
          id?: string
          payment_id?: string | null
          starts_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          access_source?: string
          access_status?: string
          course_id?: string
          created_at?: string
          expires_at?: string | null
          granted_reason?: string | null
          id?: string
          payment_id?: string | null
          starts_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_access_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_access_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
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
      enrollments: {
        Row: {
          completed_at: string | null
          course_id: string
          enrolled_at: string
          id: string
          progress_percent: number
          source: string | null
          status: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          course_id: string
          enrolled_at?: string
          id?: string
          progress_percent?: number
          source?: string | null
          status?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          course_id?: string
          enrolled_at?: string
          id?: string
          progress_percent?: number
          source?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrollments_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
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
      lesson_progress: {
        Row: {
          completed: boolean
          completed_at: string | null
          id: string
          lesson_id: string
          updated_at: string
          user_id: string
          watch_seconds: number
        }
        Insert: {
          completed?: boolean
          completed_at?: string | null
          id?: string
          lesson_id: string
          updated_at?: string
          user_id: string
          watch_seconds?: number
        }
        Update: {
          completed?: boolean
          completed_at?: string | null
          id?: string
          lesson_id?: string
          updated_at?: string
          user_id?: string
          watch_seconds?: number
        }
        Relationships: [
          {
            foreignKeyName: "lesson_progress_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      lessons: {
        Row: {
          created_at: string
          description: string | null
          display_order: number
          duration_minutes: number | null
          id: string
          is_free_preview: boolean
          module_id: string
          title: string
          video_id: string | null
          video_provider: string | null
          video_url: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_order?: number
          duration_minutes?: number | null
          id?: string
          is_free_preview?: boolean
          module_id: string
          title: string
          video_id?: string | null
          video_provider?: string | null
          video_url?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          display_order?: number
          duration_minutes?: number | null
          id?: string
          is_free_preview?: boolean
          module_id?: string
          title?: string
          video_id?: string | null
          video_provider?: string | null
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lessons_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "modules"
            referencedColumns: ["id"]
          },
        ]
      }
      masterclass_registrations: {
        Row: {
          attendance_status: Database["public"]["Enums"]["masterclass_attendance_status"]
          attended_at: string | null
          commercial_status: Database["public"]["Enums"]["masterclass_commercial_status"]
          consent_to_contact: boolean
          email: string
          id: string
          lead_id: string | null
          masterclass_id: string
          name: string
          notes: string | null
          phone: string | null
          registered_at: string
          registration_status: Database["public"]["Enums"]["masterclass_registration_status"]
          source: string
          utm_campaign: string | null
          utm_source: string | null
        }
        Insert: {
          attendance_status?: Database["public"]["Enums"]["masterclass_attendance_status"]
          attended_at?: string | null
          commercial_status?: Database["public"]["Enums"]["masterclass_commercial_status"]
          consent_to_contact?: boolean
          email: string
          id?: string
          lead_id?: string | null
          masterclass_id: string
          name: string
          notes?: string | null
          phone?: string | null
          registered_at?: string
          registration_status?: Database["public"]["Enums"]["masterclass_registration_status"]
          source?: string
          utm_campaign?: string | null
          utm_source?: string | null
        }
        Update: {
          attendance_status?: Database["public"]["Enums"]["masterclass_attendance_status"]
          attended_at?: string | null
          commercial_status?: Database["public"]["Enums"]["masterclass_commercial_status"]
          consent_to_contact?: boolean
          email?: string
          id?: string
          lead_id?: string | null
          masterclass_id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          registered_at?: string
          registration_status?: Database["public"]["Enums"]["masterclass_registration_status"]
          source?: string
          utm_campaign?: string | null
          utm_source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "masterclass_registrations_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "masterclass_registrations_masterclass_id_fkey"
            columns: ["masterclass_id"]
            isOneToOne: false
            referencedRelation: "masterclasses"
            referencedColumns: ["id"]
          },
        ]
      }
      masterclasses: {
        Row: {
          cover_image_url: string | null
          created_at: string
          cta_label: string
          description: string | null
          duration_minutes: number | null
          id: string
          instructor_name: string | null
          location: string | null
          modality: Database["public"]["Enums"]["masterclass_modality"]
          slug: string
          starts_at: string | null
          status: Database["public"]["Enums"]["masterclass_status"]
          subtitle: string | null
          title: string
          updated_at: string
        }
        Insert: {
          cover_image_url?: string | null
          created_at?: string
          cta_label?: string
          description?: string | null
          duration_minutes?: number | null
          id?: string
          instructor_name?: string | null
          location?: string | null
          modality?: Database["public"]["Enums"]["masterclass_modality"]
          slug: string
          starts_at?: string | null
          status?: Database["public"]["Enums"]["masterclass_status"]
          subtitle?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          cover_image_url?: string | null
          created_at?: string
          cta_label?: string
          description?: string | null
          duration_minutes?: number | null
          id?: string
          instructor_name?: string | null
          location?: string | null
          modality?: Database["public"]["Enums"]["masterclass_modality"]
          slug?: string
          starts_at?: string | null
          status?: Database["public"]["Enums"]["masterclass_status"]
          subtitle?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      modules: {
        Row: {
          course_id: string
          created_at: string
          description: string | null
          display_order: number
          id: string
          title: string
        }
        Insert: {
          course_id: string
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          title: string
        }
        Update: {
          course_id?: string
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "modules_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_mxn: number
          coupon_id: string | null
          course_id: string
          created_at: string
          currency: string
          discount_mxn: number
          enrollment_id: string | null
          external_reference: string | null
          id: string
          idempotency_key: string
          method: string | null
          provider: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_mxn: number
          coupon_id?: string | null
          course_id: string
          created_at?: string
          currency?: string
          discount_mxn?: number
          enrollment_id?: string | null
          external_reference?: string | null
          id?: string
          idempotency_key: string
          method?: string | null
          provider?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_mxn?: number
          coupon_id?: string | null
          course_id?: string
          created_at?: string
          currency?: string
          discount_mxn?: number
          enrollment_id?: string | null
          external_reference?: string | null
          id?: string
          idempotency_key?: string
          method?: string | null
          provider?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
        ]
      }
      event_attendees: {
        Row: {
          checked_in_at: string
          checked_in_by: string | null
          confirmation_id: string | null
          email: string | null
          event_id: string
          id: string
          import_batch_id: string | null
          name: string | null
          phone_normalized: string | null
          source: Database["public"]["Enums"]["event_attendee_source"]
        }
        Insert: {
          checked_in_at?: string
          checked_in_by?: string | null
          confirmation_id?: string | null
          email?: string | null
          event_id: string
          id?: string
          import_batch_id?: string | null
          name?: string | null
          phone_normalized?: string | null
          source?: Database["public"]["Enums"]["event_attendee_source"]
        }
        Update: {
          checked_in_at?: string
          checked_in_by?: string | null
          confirmation_id?: string | null
          email?: string | null
          event_id?: string
          id?: string
          import_batch_id?: string | null
          name?: string | null
          phone_normalized?: string | null
          source?: Database["public"]["Enums"]["event_attendee_source"]
        }
        Relationships: []
      }
      event_confirmations: {
        Row: {
          confirmed_at: string
          email: string | null
          event_id: string
          id: string
          import_batch_id: string | null
          name: string
          phone_normalized: string | null
          phone_raw: string | null
          source: Database["public"]["Enums"]["event_confirmation_source"]
        }
        Insert: {
          confirmed_at?: string
          email?: string | null
          event_id: string
          id?: string
          import_batch_id?: string | null
          name: string
          phone_normalized?: string | null
          phone_raw?: string | null
          source?: Database["public"]["Enums"]["event_confirmation_source"]
        }
        Update: {
          confirmed_at?: string
          email?: string | null
          event_id?: string
          id?: string
          import_batch_id?: string | null
          name?: string
          phone_normalized?: string | null
          phone_raw?: string | null
          source?: Database["public"]["Enums"]["event_confirmation_source"]
        }
        Relationships: []
      }
      event_survey_unmatched: {
        Row: {
          created_at: string
          id: string
          reason: string
          survey_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          reason: string
          survey_id: string
        }
        Update: {
          created_at?: string
          id?: string
          reason?: string
          survey_id?: string
        }
        Relationships: []
      }
      event_surveys: {
        Row: {
          attendee_id: string | null
          commercial_interest: string | null
          confirmation_id: string | null
          consent_to_contact: boolean
          event_id: string
          id: string
          import_batch_id: string | null
          phone_normalized: string | null
          promoted_at: string | null
          promoted_to_lead_id: string | null
          respondent_email: string | null
          respondent_phone: string | null
          responses: Json
          submitted_at: string
        }
        Insert: {
          attendee_id?: string | null
          commercial_interest?: string | null
          confirmation_id?: string | null
          consent_to_contact: boolean
          event_id: string
          id?: string
          import_batch_id?: string | null
          phone_normalized?: string | null
          promoted_at?: string | null
          promoted_to_lead_id?: string | null
          respondent_email?: string | null
          respondent_phone?: string | null
          responses?: Json
          submitted_at?: string
        }
        Update: {
          attendee_id?: string | null
          commercial_interest?: string | null
          confirmation_id?: string | null
          consent_to_contact?: boolean
          event_id?: string
          id?: string
          import_batch_id?: string | null
          phone_normalized?: string | null
          promoted_at?: string | null
          promoted_to_lead_id?: string | null
          respondent_email?: string | null
          respondent_phone?: string | null
          responses?: Json
          submitted_at?: string
        }
        Relationships: []
      }
      events: {
        Row: {
          cover_image_url: string | null
          created_at: string
          description: string | null
          ends_at: string | null
          id: string
          location: string | null
          slug: string
          starts_at: string
          status: Database["public"]["Enums"]["event_status"]
          title: string
          updated_at: string
        }
        Insert: {
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          ends_at?: string | null
          id?: string
          location?: string | null
          slug: string
          starts_at: string
          status?: Database["public"]["Enums"]["event_status"]
          title: string
          updated_at?: string
        }
        Update: {
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          ends_at?: string | null
          id?: string
          location?: string | null
          slug?: string
          starts_at?: string
          status?: Database["public"]["Enums"]["event_status"]
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      lead_event_links: {
        Row: {
          created_at: string
          event_id: string
          id: string
          lead_id: string
          link_id: string
          link_type: Database["public"]["Enums"]["lead_event_link_type"]
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          lead_id: string
          link_id: string
          link_type: Database["public"]["Enums"]["lead_event_link_type"]
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          lead_id?: string
          link_id?: string
          link_type?: Database["public"]["Enums"]["lead_event_link_type"]
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
      crm_task_status: "pending" | "completed" | "cancelled"
      interaction_channel: "whatsapp" | "email" | "phone" | "form" | "system"
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
      masterclass_attendance_status: "pending" | "attended" | "no_show"
      masterclass_commercial_status:
        | "new"
        | "interested"
        | "not_interested"
        | "converted"
        | "lost"
      masterclass_modality: "online" | "in_person" | "hybrid"
      masterclass_registration_status:
        | "registered"
        | "cancelled"
        | "no_show"
        | "attended"
      masterclass_status: "draft" | "published" | "archived"
      event_status: "draft" | "published" | "archived"
      event_confirmation_source:
        | "imported_excel"
        | "public_form"
        | "manual"
      event_attendee_source:
        | "check_in"
        | "imported_excel"
        | "zoom_export"
        | "manual"
      lead_event_link_type: "confirmation" | "attendee" | "survey"
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
      masterclass_attendance_status: ["pending", "attended", "no_show"],
      masterclass_commercial_status: [
        "new",
        "interested",
        "not_interested",
        "converted",
        "lost",
      ],
      masterclass_modality: ["online", "in_person", "hybrid"],
      masterclass_registration_status: [
        "registered",
        "cancelled",
        "no_show",
        "attended",
      ],
      masterclass_status: ["draft", "published", "archived"],
      event_status: ["draft", "published", "archived"],
      event_confirmation_source: [
        "imported_excel",
        "public_form",
        "manual",
      ],
      event_attendee_source: [
        "check_in",
        "imported_excel",
        "zoom_export",
        "manual",
      ],
      lead_event_link_type: ["confirmation", "attendee", "survey"],
    },
  },
} as const
