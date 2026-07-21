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
          after: Json | null
          before: Json | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          metadata: Json | null
        }
        Insert: {
          action: string
          actor_email: string
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          metadata?: Json | null
        }
        Update: {
          action?: string
          actor_email?: string
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          metadata?: Json | null
        }
        Relationships: []
      }
      ai_bot_rules: {
        Row: {
          created_at: string
          created_by: string
          expires_at: string | null
          id: string
          instruction: string
          is_active: boolean
          metadata: Json
          priority: number
          scope: string
          updated_at: string
          usage_count: number
        }
        Insert: {
          created_at?: string
          created_by?: string
          expires_at?: string | null
          id?: string
          instruction: string
          is_active?: boolean
          metadata?: Json
          priority?: number
          scope?: string
          updated_at?: string
          usage_count?: number
        }
        Update: {
          created_at?: string
          created_by?: string
          expires_at?: string | null
          id?: string
          instruction?: string
          is_active?: boolean
          metadata?: Json
          priority?: number
          scope?: string
          updated_at?: string
          usage_count?: number
        }
        Relationships: []
      }
      bot_context_overrides: {
        Row: {
          bot_name: string
          context_key: string
          context_value: string
          created_at: string
          enabled: boolean
          expires_at: string | null
          id: string
          priority: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          bot_name?: string
          context_key: string
          context_value: string
          created_at?: string
          enabled?: boolean
          expires_at?: string | null
          id?: string
          priority?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          bot_name?: string
          context_key?: string
          context_value?: string
          created_at?: string
          enabled?: boolean
          expires_at?: string | null
          id?: string
          priority?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      bot_usage_daily: {
        Row: {
          call_count: number
          completion_tokens: number
          date: string
          estimated_cost_cents: number
          model: string
          prompt_tokens: number
          updated_at: string
        }
        Insert: {
          call_count?: number
          completion_tokens?: number
          date: string
          estimated_cost_cents?: number
          model: string
          prompt_tokens?: number
          updated_at?: string
        }
        Update: {
          call_count?: number
          completion_tokens?: number
          date?: string
          estimated_cost_cents?: number
          model?: string
          prompt_tokens?: number
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
          priority: string | null
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
          priority?: string | null
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
          priority?: string | null
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
      event_access: {
        Row: {
          access_source: string
          access_status: string
          confirmation_id: string | null
          created_at: string
          event_id: string
          expires_at: string | null
          granted_reason: string | null
          id: string
          payment_id: string | null
          starts_at: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          access_source: string
          access_status: string
          confirmation_id?: string | null
          created_at?: string
          event_id: string
          expires_at?: string | null
          granted_reason?: string | null
          id?: string
          payment_id?: string | null
          starts_at?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          access_source?: string
          access_status?: string
          confirmation_id?: string | null
          created_at?: string
          event_id?: string
          expires_at?: string | null
          granted_reason?: string | null
          id?: string
          payment_id?: string | null
          starts_at?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_access_confirmation_id_fkey"
            columns: ["confirmation_id"]
            isOneToOne: false
            referencedRelation: "event_confirmations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_access_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_access_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "event_payments"
            referencedColumns: ["id"]
          },
        ]
      }
      event_attendees: {
        Row: {
          checked_in_at: string | null
          checked_in_by: string | null
          confirmation_id: string | null
          email: string | null
          event_id: string
          guests: Json
          id: string
          import_batch_id: string | null
          lead_id: string | null
          name: string | null
          phone_normalized: string | null
          source: Database["public"]["Enums"]["event_attendee_source"]
        }
        Insert: {
          checked_in_at?: string | null
          checked_in_by?: string | null
          confirmation_id?: string | null
          email?: string | null
          event_id: string
          guests?: Json
          id?: string
          import_batch_id?: string | null
          lead_id?: string | null
          name?: string | null
          phone_normalized?: string | null
          source?: Database["public"]["Enums"]["event_attendee_source"]
        }
        Update: {
          checked_in_at?: string | null
          checked_in_by?: string | null
          confirmation_id?: string | null
          email?: string | null
          event_id?: string
          guests?: Json
          id?: string
          import_batch_id?: string | null
          lead_id?: string | null
          name?: string | null
          phone_normalized?: string | null
          source?: Database["public"]["Enums"]["event_attendee_source"]
        }
        Relationships: [
          {
            foreignKeyName: "event_attendees_confirmation_id_fkey"
            columns: ["confirmation_id"]
            isOneToOne: false
            referencedRelation: "event_confirmations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_attendees_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_attendees_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      event_certificates: {
        Row: {
          attendee_id: string
          event_id: string
          folio: string
          id: string
          issued_at: string
          issued_by_admin_id: string | null
          metadata: Json | null
          template_variant: string
        }
        Insert: {
          attendee_id: string
          event_id: string
          folio: string
          id?: string
          issued_at?: string
          issued_by_admin_id?: string | null
          metadata?: Json | null
          template_variant?: string
        }
        Update: {
          attendee_id?: string
          event_id?: string
          folio?: string
          id?: string
          issued_at?: string
          issued_by_admin_id?: string | null
          metadata?: Json | null
          template_variant?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_certificates_attendee_id_fkey"
            columns: ["attendee_id"]
            isOneToOne: false
            referencedRelation: "event_attendees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_certificates_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_confirmations: {
        Row: {
          confirmed_at: string
          email: string | null
          event_id: string
          id: string
          import_batch_id: string | null
          name: string
          payment_status: string
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
          payment_status?: string
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
          payment_status?: string
          phone_normalized?: string | null
          phone_raw?: string | null
          source?: Database["public"]["Enums"]["event_confirmation_source"]
        }
        Relationships: [
          {
            foreignKeyName: "event_confirmations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_email_log: {
        Row: {
          attendee_name: string | null
          email_type: string
          error: string | null
          event_certificate_id: string | null
          event_id: string | null
          event_qr_token_id: string | null
          id: string
          ok: boolean
          provider_message_id: string | null
          recipient: string
          sent_at: string
          subject: string
        }
        Insert: {
          attendee_name?: string | null
          email_type: string
          error?: string | null
          event_certificate_id?: string | null
          event_id?: string | null
          event_qr_token_id?: string | null
          id?: string
          ok: boolean
          provider_message_id?: string | null
          recipient: string
          sent_at?: string
          subject: string
        }
        Update: {
          attendee_name?: string | null
          email_type?: string
          error?: string | null
          event_certificate_id?: string | null
          event_id?: string | null
          event_qr_token_id?: string | null
          id?: string
          ok?: boolean
          provider_message_id?: string | null
          recipient?: string
          sent_at?: string
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_email_log_event_certificate_id_fkey"
            columns: ["event_certificate_id"]
            isOneToOne: false
            referencedRelation: "event_certificates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_email_log_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_payments: {
        Row: {
          amount_mxn: number
          confirmation_id: string
          created_at: string
          currency: string
          external_reference: string | null
          id: string
          idempotency_key: string | null
          metadata: Json | null
          method: string
          notes: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount_mxn: number
          confirmation_id: string
          created_at?: string
          currency?: string
          external_reference?: string | null
          id?: string
          idempotency_key?: string | null
          metadata?: Json | null
          method: string
          notes?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount_mxn?: number
          confirmation_id?: string
          created_at?: string
          currency?: string
          external_reference?: string | null
          id?: string
          idempotency_key?: string | null
          metadata?: Json | null
          method?: string
          notes?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_payments_confirmation_id_fkey"
            columns: ["confirmation_id"]
            isOneToOne: false
            referencedRelation: "event_confirmations"
            referencedColumns: ["id"]
          },
        ]
      }
      event_qr_tokens: {
        Row: {
          attendee_email: string | null
          attendee_name: string
          attendee_phone_normalized: string
          checked_in_at: string | null
          checked_in_by: string | null
          confirmation_id: string | null
          created_at: string
          event_id: string
          expires_at: string
          id: string
          token: string
        }
        Insert: {
          attendee_email?: string | null
          attendee_name: string
          attendee_phone_normalized: string
          checked_in_at?: string | null
          checked_in_by?: string | null
          confirmation_id?: string | null
          created_at?: string
          event_id: string
          expires_at: string
          id?: string
          token: string
        }
        Update: {
          attendee_email?: string | null
          attendee_name?: string
          attendee_phone_normalized?: string
          checked_in_at?: string | null
          checked_in_by?: string | null
          confirmation_id?: string | null
          created_at?: string
          event_id?: string
          expires_at?: string
          id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_qr_tokens_confirmation_id_fkey"
            columns: ["confirmation_id"]
            isOneToOne: false
            referencedRelation: "event_confirmations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_qr_tokens_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_reminder_log: {
        Row: {
          attendee_email: string
          attendee_name: string | null
          brevo_message_id: string | null
          error: string | null
          event_id: string
          event_qr_token_id: string
          id: string
          reminder_kind: string
          sent_at: string
        }
        Insert: {
          attendee_email: string
          attendee_name?: string | null
          brevo_message_id?: string | null
          error?: string | null
          event_id: string
          event_qr_token_id: string
          id?: string
          reminder_kind: string
          sent_at?: string
        }
        Update: {
          attendee_email?: string
          attendee_name?: string | null
          brevo_message_id?: string | null
          error?: string | null
          event_id?: string
          event_qr_token_id?: string
          id?: string
          reminder_kind?: string
          sent_at?: string
        }
        Relationships: []
      }
      event_reminder_log_v2: {
        Row: {
          channel: string
          created_at: string
          error: string | null
          event_id: string
          event_qr_token_id: string | null
          external_id: string | null
          id: string
          lead_id: string | null
          reminder_window: string
          scheduled_at_utc: string
          sent_at_utc: string | null
          status: string
          updated_at: string
        }
        Insert: {
          channel: string
          created_at?: string
          error?: string | null
          event_id: string
          event_qr_token_id?: string | null
          external_id?: string | null
          id?: string
          lead_id?: string | null
          reminder_window: string
          scheduled_at_utc: string
          sent_at_utc?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          channel?: string
          created_at?: string
          error?: string | null
          event_id?: string
          event_qr_token_id?: string | null
          external_id?: string | null
          id?: string
          lead_id?: string | null
          reminder_window?: string
          scheduled_at_utc?: string
          sent_at_utc?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_reminder_log_v2_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_reminder_log_v2_event_qr_token_id_fkey"
            columns: ["event_qr_token_id"]
            isOneToOne: false
            referencedRelation: "event_qr_tokens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_reminder_log_v2_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      event_staff_links: {
        Row: {
          created_at: string
          created_by: string
          event_id: string
          id: string
          label: string | null
          last_used_at: string | null
          revoke_reason: string | null
          revoked_at: string | null
          revoked_by: string | null
          token: string
          use_count: number
          valid_from: string
          valid_until: string
        }
        Insert: {
          created_at?: string
          created_by: string
          event_id: string
          id?: string
          label?: string | null
          last_used_at?: string | null
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          token: string
          use_count?: number
          valid_from?: string
          valid_until: string
        }
        Update: {
          created_at?: string
          created_by?: string
          event_id?: string
          id?: string
          label?: string | null
          last_used_at?: string | null
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          token?: string
          use_count?: number
          valid_from?: string
          valid_until?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_staff_links_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_survey_tokens: {
        Row: {
          attendee_id: string | null
          confirmation_id: string | null
          created_at: string
          email: string | null
          event_id: string
          expires_at: string
          id: string
          phone_normalized: string | null
          sent_at: string | null
          submitted_survey_id: string | null
          token: string
        }
        Insert: {
          attendee_id?: string | null
          confirmation_id?: string | null
          created_at?: string
          email?: string | null
          event_id: string
          expires_at: string
          id?: string
          phone_normalized?: string | null
          sent_at?: string | null
          submitted_survey_id?: string | null
          token: string
        }
        Update: {
          attendee_id?: string | null
          confirmation_id?: string | null
          created_at?: string
          email?: string | null
          event_id?: string
          expires_at?: string
          id?: string
          phone_normalized?: string | null
          sent_at?: string | null
          submitted_survey_id?: string | null
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_survey_tokens_attendee_id_fkey"
            columns: ["attendee_id"]
            isOneToOne: false
            referencedRelation: "event_attendees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_survey_tokens_confirmation_id_fkey"
            columns: ["confirmation_id"]
            isOneToOne: false
            referencedRelation: "event_confirmations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_survey_tokens_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_survey_tokens_submitted_survey_id_fkey"
            columns: ["submitted_survey_id"]
            isOneToOne: false
            referencedRelation: "event_surveys"
            referencedColumns: ["id"]
          },
        ]
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
        Relationships: [
          {
            foreignKeyName: "event_survey_unmatched_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: false
            referencedRelation: "event_surveys"
            referencedColumns: ["id"]
          },
        ]
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
          reviewed_at: string | null
          reviewed_by: string | null
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
          reviewed_at?: string | null
          reviewed_by?: string | null
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
          reviewed_at?: string | null
          reviewed_by?: string | null
          submitted_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_surveys_attendee_id_fkey"
            columns: ["attendee_id"]
            isOneToOne: false
            referencedRelation: "event_attendees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_surveys_confirmation_id_fkey"
            columns: ["confirmation_id"]
            isOneToOne: false
            referencedRelation: "event_confirmations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_surveys_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_surveys_promoted_to_lead_id_fkey"
            columns: ["promoted_to_lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          cover_image_url: string | null
          created_at: string
          currency: string
          description: string | null
          ends_at: string | null
          event_rules: Json
          format: Database["public"]["Enums"]["event_format"]
          id: string
          location: string | null
          price_mxn: number
          requires_name: boolean
          short_code: string
          slug: string
          starts_at: string
          status: Database["public"]["Enums"]["event_status"]
          streaming_access_note: string | null
          streaming_provider:
            | Database["public"]["Enums"]["event_streaming_provider"]
            | null
          streaming_url: string | null
          survey_config: Json
          title: string
          updated_at: string
        }
        Insert: {
          cover_image_url?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          ends_at?: string | null
          event_rules?: Json
          format?: Database["public"]["Enums"]["event_format"]
          id?: string
          location?: string | null
          price_mxn?: number
          requires_name?: boolean
          short_code: string
          slug: string
          starts_at: string
          status?: Database["public"]["Enums"]["event_status"]
          streaming_access_note?: string | null
          streaming_provider?:
            | Database["public"]["Enums"]["event_streaming_provider"]
            | null
          streaming_url?: string | null
          survey_config?: Json
          title: string
          updated_at?: string
        }
        Update: {
          cover_image_url?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          ends_at?: string | null
          event_rules?: Json
          format?: Database["public"]["Enums"]["event_format"]
          id?: string
          location?: string | null
          price_mxn?: number
          requires_name?: boolean
          short_code?: string
          slug?: string
          starts_at?: string
          status?: Database["public"]["Enums"]["event_status"]
          streaming_access_note?: string | null
          streaming_provider?:
            | Database["public"]["Enums"]["event_streaming_provider"]
            | null
          streaming_url?: string | null
          survey_config?: Json
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      handoff_requests: {
        Row: {
          assigned_to: string | null
          closed_at: string | null
          contacted_at: string | null
          created_at: string
          id: string
          last_messages: Json
          lead_email: string | null
          lead_id: string | null
          lead_name: string
          lead_phone: string
          notes: string | null
          status: string
        }
        Insert: {
          assigned_to?: string | null
          closed_at?: string | null
          contacted_at?: string | null
          created_at?: string
          id?: string
          last_messages?: Json
          lead_email?: string | null
          lead_id?: string | null
          lead_name?: string
          lead_phone: string
          notes?: string | null
          status?: string
        }
        Update: {
          assigned_to?: string | null
          closed_at?: string | null
          contacted_at?: string | null
          created_at?: string
          id?: string
          last_messages?: Json
          lead_email?: string | null
          lead_id?: string | null
          lead_name?: string
          lead_phone?: string
          notes?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "handoff_requests_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_consent_log: {
        Row: {
          consent_granted: boolean
          consent_source: string
          consent_text: string
          created_at: string
          id: string
          ip_address: unknown
          lead_id: string | null
          metadata: Json
          phone_normalized: string | null
          user_agent: string | null
        }
        Insert: {
          consent_granted: boolean
          consent_source: string
          consent_text: string
          created_at?: string
          id?: string
          ip_address?: unknown
          lead_id?: string | null
          metadata?: Json
          phone_normalized?: string | null
          user_agent?: string | null
        }
        Update: {
          consent_granted?: boolean
          consent_source?: string
          consent_text?: string
          created_at?: string
          id?: string
          ip_address?: unknown
          lead_id?: string | null
          metadata?: Json
          phone_normalized?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_consent_log_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
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
        Relationships: [
          {
            foreignKeyName: "lead_event_links_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_event_links_lead_id_fkey"
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
      lead_profile: {
        Row: {
          created_at: string
          last_summary_at: string | null
          lead_id: string
          messages_since_summary: number
          summary: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          last_summary_at?: string | null
          lead_id: string
          messages_since_summary?: number
          summary?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          last_summary_at?: string | null
          lead_id?: string
          messages_since_summary?: number
          summary?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_profile_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: true
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_profile__bak_20260710: {
        Row: {
          created_at: string | null
          last_summary_at: string | null
          lead_id: string | null
          messages_since_summary: number | null
          summary: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          last_summary_at?: string | null
          lead_id?: string | null
          messages_since_summary?: number | null
          summary?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          last_summary_at?: string | null
          lead_id?: string | null
          messages_since_summary?: number | null
          summary?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      lead_whatsapp_conversations: {
        Row: {
          body: string | null
          created_at: string
          delete_reason: string | null
          deleted_at: string | null
          deleted_by_email: string | null
          direction: string
          id: string
          lead_id: string | null
          message_type: string
          metadata: Json
          phone_normalized: string
          related_event_id: string | null
          whatsapp_message_id: string | null
        }
        Insert: {
          body?: string | null
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by_email?: string | null
          direction: string
          id?: string
          lead_id?: string | null
          message_type: string
          metadata?: Json
          phone_normalized: string
          related_event_id?: string | null
          whatsapp_message_id?: string | null
        }
        Update: {
          body?: string | null
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by_email?: string | null
          direction?: string
          id?: string
          lead_id?: string | null
          message_type?: string
          metadata?: Json
          phone_normalized?: string
          related_event_id?: string | null
          whatsapp_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_whatsapp_conversations_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_whatsapp_conversations_related_event_id_fkey"
            columns: ["related_event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_whatsapp_conversations__bak_20260710: {
        Row: {
          body: string | null
          created_at: string | null
          delete_reason: string | null
          deleted_at: string | null
          deleted_by_email: string | null
          direction: string | null
          id: string | null
          lead_id: string | null
          message_type: string | null
          metadata: Json | null
          phone_normalized: string | null
          related_event_id: string | null
          whatsapp_message_id: string | null
        }
        Insert: {
          body?: string | null
          created_at?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by_email?: string | null
          direction?: string | null
          id?: string | null
          lead_id?: string | null
          message_type?: string | null
          metadata?: Json | null
          phone_normalized?: string | null
          related_event_id?: string | null
          whatsapp_message_id?: string | null
        }
        Update: {
          body?: string | null
          created_at?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by_email?: string | null
          direction?: string | null
          id?: string | null
          lead_id?: string | null
          message_type?: string | null
          metadata?: Json | null
          phone_normalized?: string | null
          related_event_id?: string | null
          whatsapp_message_id?: string | null
        }
        Relationships: []
      }
      lead_whatsapp_log: {
        Row: {
          actor_email: string | null
          created_at: string
          event_id: string | null
          id: string
          lead_id: string
          message_preview: string | null
          metadata: Json
          new_status: string
          prev_status: string | null
        }
        Insert: {
          actor_email?: string | null
          created_at?: string
          event_id?: string | null
          id?: string
          lead_id: string
          message_preview?: string | null
          metadata?: Json
          new_status: string
          prev_status?: string | null
        }
        Update: {
          actor_email?: string | null
          created_at?: string
          event_id?: string | null
          id?: string
          lead_id?: string
          message_preview?: string | null
          metadata?: Json
          new_status?: string
          prev_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_whatsapp_log_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_whatsapp_log_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          archived_conversations_at: string | null
          bot_paused: boolean
          bot_paused_at: string | null
          bot_paused_by_email: string | null
          bot_paused_reason:
            | Database["public"]["Enums"]["bot_pause_reason"]
            | null
          consent_to_contact: boolean
          course_of_interest: string | null
          created_at: string
          email: string
          estimated_value_mxn: number | null
          id: string
          intent: Database["public"]["Enums"]["lead_intent"]
          last_contacted_at: string | null
          last_read_at: string | null
          message: string | null
          name: string
          next_follow_up_at: string | null
          owner_id: string | null
          phone: string | null
          phone_normalized: string | null
          qualification: string | null
          score: number | null
          simulation_metadata: Json | null
          simulation_source: string | null
          source: Database["public"]["Enums"]["lead_source"]
          status: Database["public"]["Enums"]["lead_status"]
          summary: string | null
          survey_offer_sent_at: string | null
          tags: string[] | null
          updated_at: string
          whatsapp_status: string
        }
        Insert: {
          archived_conversations_at?: string | null
          bot_paused?: boolean
          bot_paused_at?: string | null
          bot_paused_by_email?: string | null
          bot_paused_reason?:
            | Database["public"]["Enums"]["bot_pause_reason"]
            | null
          consent_to_contact?: boolean
          course_of_interest?: string | null
          created_at?: string
          email: string
          estimated_value_mxn?: number | null
          id?: string
          intent?: Database["public"]["Enums"]["lead_intent"]
          last_contacted_at?: string | null
          last_read_at?: string | null
          message?: string | null
          name: string
          next_follow_up_at?: string | null
          owner_id?: string | null
          phone?: string | null
          phone_normalized?: string | null
          qualification?: string | null
          score?: number | null
          simulation_metadata?: Json | null
          simulation_source?: string | null
          source?: Database["public"]["Enums"]["lead_source"]
          status?: Database["public"]["Enums"]["lead_status"]
          summary?: string | null
          survey_offer_sent_at?: string | null
          tags?: string[] | null
          updated_at?: string
          whatsapp_status?: string
        }
        Update: {
          archived_conversations_at?: string | null
          bot_paused?: boolean
          bot_paused_at?: string | null
          bot_paused_by_email?: string | null
          bot_paused_reason?:
            | Database["public"]["Enums"]["bot_pause_reason"]
            | null
          consent_to_contact?: boolean
          course_of_interest?: string | null
          created_at?: string
          email?: string
          estimated_value_mxn?: number | null
          id?: string
          intent?: Database["public"]["Enums"]["lead_intent"]
          last_contacted_at?: string | null
          last_read_at?: string | null
          message?: string | null
          name?: string
          next_follow_up_at?: string | null
          owner_id?: string | null
          phone?: string | null
          phone_normalized?: string | null
          qualification?: string | null
          score?: number | null
          simulation_metadata?: Json | null
          simulation_source?: string | null
          source?: Database["public"]["Enums"]["lead_source"]
          status?: Database["public"]["Enums"]["lead_status"]
          summary?: string | null
          survey_offer_sent_at?: string | null
          tags?: string[] | null
          updated_at?: string
          whatsapp_status?: string
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
          course_id: string | null
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
          course_id?: string | null
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
          course_id?: string | null
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
      service_order_documents: {
        Row: {
          created_at: string
          description: string | null
          file_name: string
          file_size_bytes: number | null
          file_type: string
          file_url: string
          id: string
          mime_type: string | null
          order_id: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          file_name: string
          file_size_bytes?: number | null
          file_type?: string
          file_url: string
          id?: string
          mime_type?: string | null
          order_id: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          file_name?: string
          file_size_bytes?: number | null
          file_type?: string
          file_url?: string
          id?: string
          mime_type?: string | null
          order_id?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_order_documents_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "service_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      service_order_events: {
        Row: {
          actor_id: string | null
          actor_type: string
          created_at: string
          id: string
          order_id: string
          payload: Json
          type: string
        }
        Insert: {
          actor_id?: string | null
          actor_type?: string
          created_at?: string
          id?: string
          order_id: string
          payload?: Json
          type: string
        }
        Update: {
          actor_id?: string | null
          actor_type?: string
          created_at?: string
          id?: string
          order_id?: string
          payload?: Json
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_order_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "service_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      service_order_notes: {
        Row: {
          author_id: string | null
          body: string
          created_at: string
          id: string
          is_pinned: boolean
          note_type: string
          order_id: string
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          body: string
          created_at?: string
          id?: string
          is_pinned?: boolean
          note_type?: string
          order_id: string
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          body?: string
          created_at?: string
          id?: string
          is_pinned?: boolean
          note_type?: string
          order_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_order_notes_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "service_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      service_orders: {
        Row: {
          amount_mxn: number
          assigned_to: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          created_at: string
          currency: string
          customer_email: string
          customer_name: string
          customer_notes: string | null
          customer_phone: string | null
          delivered_at: string | null
          id: string
          lead_id: string | null
          order_number: string
          payment_mode: string
          payment_reference: string | null
          scheduled_at: string | null
          service_id: string
          status: string
          updated_at: string
          variant_id: string
        }
        Insert: {
          amount_mxn: number
          assigned_to?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          created_at?: string
          currency?: string
          customer_email: string
          customer_name: string
          customer_notes?: string | null
          customer_phone?: string | null
          delivered_at?: string | null
          id?: string
          lead_id?: string | null
          order_number: string
          payment_mode?: string
          payment_reference?: string | null
          scheduled_at?: string | null
          service_id: string
          status?: string
          updated_at?: string
          variant_id: string
        }
        Update: {
          amount_mxn?: number
          assigned_to?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          created_at?: string
          currency?: string
          customer_email?: string
          customer_name?: string
          customer_notes?: string | null
          customer_phone?: string | null
          delivered_at?: string | null
          id?: string
          lead_id?: string | null
          order_number?: string
          payment_mode?: string
          payment_reference?: string | null
          scheduled_at?: string | null
          service_id?: string
          status?: string
          updated_at?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_orders_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_orders_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_orders_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "service_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      service_variants: {
        Row: {
          created_at: string
          delivery_days_max: number | null
          delivery_days_min: number | null
          description: string | null
          display_order: number
          id: string
          is_active: boolean
          label: string
          price_mxn: number
          service_id: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          delivery_days_max?: number | null
          delivery_days_min?: number | null
          description?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          label: string
          price_mxn: number
          service_id: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          delivery_days_max?: number | null
          delivery_days_min?: number | null
          description?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          label?: string
          price_mxn?: number
          service_id?: string
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_variants_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          category: string
          created_at: string
          default_currency: string
          default_price_mxn: number | null
          deliverable_type: string | null
          display_name: string
          display_order: number
          icon: string | null
          id: string
          is_active: boolean
          long_description: string | null
          requires_documents: boolean
          requires_scheduling: boolean
          short_description: string | null
          slug: string
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          default_currency?: string
          default_price_mxn?: number | null
          deliverable_type?: string | null
          display_name: string
          display_order?: number
          icon?: string | null
          id?: string
          is_active?: boolean
          long_description?: string | null
          requires_documents?: boolean
          requires_scheduling?: boolean
          short_description?: string | null
          slug: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          default_currency?: string
          default_price_mxn?: number | null
          deliverable_type?: string | null
          display_name?: string
          display_order?: number
          icon?: string | null
          id?: string
          is_active?: boolean
          long_description?: string | null
          requires_documents?: boolean
          requires_scheduling?: boolean
          short_description?: string | null
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      system_settings: {
        Row: {
          description: string | null
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          description?: string | null
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          description?: string | null
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      generate_event_short_code: { Args: never; Returns: string }
      get_active_bot_overrides: {
        Args: { p_bot_name: string }
        Returns: {
          context_key: string
          context_value: string
          priority: number
        }[]
      }
      get_user_id_by_email: { Args: { p_email: string }; Returns: string }
      issue_event_certificate: {
        Args: {
          p_admin_user_id?: string
          p_attendee_id: string
          p_event_id: string
          p_folio: string
          p_metadata: Json
          p_template_variant: string
        }
        Returns: {
          attendee_id: string
          event_id: string
          folio: string
          issued_at: string
          metadata: Json
          template_variant: string
          was_inserted: boolean
        }[]
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      soft_delete_conversation_tx: {
        Args: { p_actor_email: string; p_lead_id: string; p_reason?: string }
        Returns: {
          archived_at: string
          deleted_count: number
        }[]
      }
    }
    Enums: {
      bot_pause_reason:
        | "keyword_escalation"
        | "ai_semantic_escalation"
        | "manual"
        | "manual_global"
      crm_task_status: "pending" | "completed" | "cancelled"
      event_attendee_source:
        | "check_in"
        | "imported_excel"
        | "zoom_export"
        | "manual"
        | "survey_attended"
      event_confirmation_source:
        | "imported_excel"
        | "public_form"
        | "manual"
        | "whatsapp_bot"
      event_format: "in_person" | "virtual" | "hybrid"
      event_status: "draft" | "published" | "archived"
      event_streaming_provider:
        | "youtube_live"
        | "facebook_live"
        | "zoom"
        | "other"
      interaction_channel: "whatsapp" | "email" | "phone" | "form" | "system"
      interaction_direction: "inbound" | "outbound" | "system"
      lead_event_link_type: "confirmation" | "attendee" | "survey"
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
        | "synthetic_lab"
      lead_status:
        | "new"
        | "contacted"
        | "interested"
        | "qualified"
        | "info_requested"
        | "payment_pending"
        | "enrolled"
        | "active_student"
        | "lost"
        | "archived"
        | "event_attended"
        | "survey_completed"
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
      bot_pause_reason: [
        "keyword_escalation",
        "ai_semantic_escalation",
        "manual",
        "manual_global",
      ],
      crm_task_status: ["pending", "completed", "cancelled"],
      event_attendee_source: [
        "check_in",
        "imported_excel",
        "zoom_export",
        "manual",
        "survey_attended",
      ],
      event_confirmation_source: [
        "imported_excel",
        "public_form",
        "manual",
        "whatsapp_bot",
      ],
      event_format: ["in_person", "virtual", "hybrid"],
      event_status: ["draft", "published", "archived"],
      event_streaming_provider: [
        "youtube_live",
        "facebook_live",
        "zoom",
        "other",
      ],
      interaction_channel: ["whatsapp", "email", "phone", "form", "system"],
      interaction_direction: ["inbound", "outbound", "system"],
      lead_event_link_type: ["confirmation", "attendee", "survey"],
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
        "synthetic_lab",
      ],
      lead_status: [
        "new",
        "contacted",
        "interested",
        "qualified",
        "info_requested",
        "payment_pending",
        "enrolled",
        "active_student",
        "lost",
        "archived",
        "event_attended",
        "survey_completed",
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
    },
  },
} as const
