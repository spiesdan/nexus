export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      agent_case_events: {
        Row: {
          actor_kind: string;
          actor_user_id: string | null;
          body: string | null;
          case_id: string;
          created_at: string;
          human_action: string | null;
          id: string;
          kind: string;
          metadata: NonNullable<Json>;
          organization_id: string;
        };
        Insert: {
          actor_kind: string;
          actor_user_id?: string | null;
          body?: string | null;
          case_id: string;
          created_at?: string;
          human_action?: string | null;
          id?: string;
          kind: string;
          metadata?: NonNullable<Json>;
          organization_id: string;
        };
        Update: {
          actor_kind?: string;
          actor_user_id?: string | null;
          body?: string | null;
          case_id?: string;
          created_at?: string;
          human_action?: string | null;
          id?: string;
          kind?: string;
          metadata?: NonNullable<Json>;
          organization_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "agent_case_events_case_id_fkey";
            columns: ["case_id"];
            isOneToOne: false;
            referencedRelation: "agent_cases";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "agent_case_events_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      agent_cases: {
        Row: {
          agent_id: string | null;
          blocker: string;
          closed_at: string | null;
          context_snapshot: NonNullable<Json>;
          conversation_id: string;
          created_at: string;
          followup_attempts: number;
          id: string;
          lead_id: string | null;
          opened_at: string;
          organization_id: string;
          source: string;
          status: string;
          summary: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          agent_id?: string | null;
          blocker: string;
          closed_at?: string | null;
          context_snapshot?: NonNullable<Json>;
          conversation_id: string;
          created_at?: string;
          followup_attempts?: number;
          id?: string;
          lead_id?: string | null;
          opened_at?: string;
          organization_id: string;
          source?: string;
          status?: string;
          summary: string;
          title: string;
          updated_at?: string;
        };
        Update: {
          agent_id?: string | null;
          blocker?: string;
          closed_at?: string | null;
          context_snapshot?: NonNullable<Json>;
          conversation_id?: string;
          created_at?: string;
          followup_attempts?: number;
          id?: string;
          lead_id?: string | null;
          opened_at?: string;
          organization_id?: string;
          source?: string;
          status?: string;
          summary?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "agent_cases_agent_id_fkey";
            columns: ["agent_id"];
            isOneToOne: false;
            referencedRelation: "ai_agents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "agent_cases_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "agent_cases_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: false;
            referencedRelation: "crm_leads";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "agent_cases_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      agent_inbox_items: {
        Row: {
          body: string | null;
          created_at: string;
          id: string;
          kind: string;
          organization_id: string | null;
          ref_id: string | null;
          ref_kind: string | null;
          severity: string;
          status: string;
          title: string;
        };
        Insert: {
          body?: string | null;
          created_at?: string;
          id?: string;
          kind: string;
          organization_id?: string | null;
          ref_id?: string | null;
          ref_kind?: string | null;
          severity?: string;
          status?: string;
          title: string;
        };
        Update: {
          body?: string | null;
          created_at?: string;
          id?: string;
          kind?: string;
          organization_id?: string | null;
          ref_id?: string | null;
          ref_kind?: string | null;
          severity?: string;
          status?: string;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "agent_inbox_items_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      ai_agent_runs: {
        Row: {
          abort_reason: string | null;
          agent_id: string;
          agent_version_id: string;
          channel_session_id: string | null;
          completed_at: string | null;
          contact_id: string | null;
          conversation_id: string | null;
          cost_cents: number;
          created_at: string;
          error_code: string | null;
          error_message: string | null;
          id: string;
          inbound_message_id: string | null;
          is_dry_run: boolean;
          latency_ms: number | null;
          organization_id: string;
          outbound_message_id: string | null;
          started_at: string;
          status: string;
          steps_count: number;
          tokens_in: number;
          tokens_out: number;
          tool_calls: NonNullable<Json>;
        };
        Insert: {
          abort_reason?: string | null;
          agent_id: string;
          agent_version_id: string;
          channel_session_id?: string | null;
          completed_at?: string | null;
          contact_id?: string | null;
          conversation_id?: string | null;
          cost_cents?: number;
          created_at?: string;
          error_code?: string | null;
          error_message?: string | null;
          id?: string;
          inbound_message_id?: string | null;
          is_dry_run?: boolean;
          latency_ms?: number | null;
          organization_id: string;
          outbound_message_id?: string | null;
          started_at?: string;
          status?: string;
          steps_count?: number;
          tokens_in?: number;
          tokens_out?: number;
          tool_calls?: NonNullable<Json>;
        };
        Update: {
          abort_reason?: string | null;
          agent_id?: string;
          agent_version_id?: string;
          channel_session_id?: string | null;
          completed_at?: string | null;
          contact_id?: string | null;
          conversation_id?: string | null;
          cost_cents?: number;
          created_at?: string;
          error_code?: string | null;
          error_message?: string | null;
          id?: string;
          inbound_message_id?: string | null;
          is_dry_run?: boolean;
          latency_ms?: number | null;
          organization_id?: string;
          outbound_message_id?: string | null;
          started_at?: string;
          status?: string;
          steps_count?: number;
          tokens_in?: number;
          tokens_out?: number;
          tool_calls?: NonNullable<Json>;
        };
        Relationships: [
          {
            foreignKeyName: "ai_agent_runs_agent_id_fkey";
            columns: ["agent_id"];
            isOneToOne: false;
            referencedRelation: "ai_agents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ai_agent_runs_agent_version_id_fkey";
            columns: ["agent_version_id"];
            isOneToOne: false;
            referencedRelation: "ai_agent_versions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ai_agent_runs_channel_session_id_fkey";
            columns: ["channel_session_id"];
            isOneToOne: false;
            referencedRelation: "channel_sessions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ai_agent_runs_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ai_agent_runs_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ai_agent_runs_inbound_message_id_fkey";
            columns: ["inbound_message_id"];
            isOneToOne: false;
            referencedRelation: "messages";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ai_agent_runs_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ai_agent_runs_outbound_message_id_fkey";
            columns: ["outbound_message_id"];
            isOneToOne: false;
            referencedRelation: "messages";
            referencedColumns: ["id"];
          },
        ];
      };
      ai_agent_versions: {
        Row: {
          agent_id: string;
          cases_enabled: boolean;
          channel_session_id: string;
          cost_budget_cents: number;
          created_at: string;
          created_by: string | null;
          credential_id: string | null;
          followup: NonNullable<Json>;
          handoff_keywords: string[];
          handoff_tool_enabled: boolean;
          history_message_window: number;
          history_token_window: number;
          id: string;
          knowledge_source_ids: string[];
          max_steps: number;
          model: string;
          multimodal_input: boolean;
          operator_enabled: boolean;
          operator_model: string | null;
          operator_tool_ids: string[];
          organization_id: string;
          pipeline_ids: string[];
          provider: string;
          published_at: string | null;
          split_max_chars: number;
          split_messages: boolean;
          status: string;
          superseded_at: string | null;
          system_prompt: string;
          token_budget: number;
          tool_ids: string[];
          trigger_config: NonNullable<Json>;
          version_number: number;
          video_frames_enabled: boolean;
        };
        Insert: {
          agent_id: string;
          cases_enabled?: boolean;
          channel_session_id: string;
          cost_budget_cents?: number;
          created_at?: string;
          created_by?: string | null;
          credential_id?: string | null;
          followup?: NonNullable<Json>;
          handoff_keywords?: string[];
          handoff_tool_enabled?: boolean;
          history_message_window?: number;
          history_token_window?: number;
          id?: string;
          knowledge_source_ids?: string[];
          max_steps?: number;
          model: string;
          multimodal_input?: boolean;
          operator_enabled?: boolean;
          operator_model?: string | null;
          operator_tool_ids?: string[];
          organization_id: string;
          pipeline_ids?: string[];
          provider: string;
          published_at?: string | null;
          split_max_chars?: number;
          split_messages?: boolean;
          status?: string;
          superseded_at?: string | null;
          system_prompt: string;
          token_budget?: number;
          tool_ids?: string[];
          trigger_config?: NonNullable<Json>;
          version_number: number;
          video_frames_enabled?: boolean;
        };
        Update: {
          agent_id?: string;
          cases_enabled?: boolean;
          channel_session_id?: string;
          cost_budget_cents?: number;
          created_at?: string;
          created_by?: string | null;
          credential_id?: string | null;
          followup?: NonNullable<Json>;
          handoff_keywords?: string[];
          handoff_tool_enabled?: boolean;
          history_message_window?: number;
          history_token_window?: number;
          id?: string;
          knowledge_source_ids?: string[];
          max_steps?: number;
          model?: string;
          multimodal_input?: boolean;
          operator_enabled?: boolean;
          operator_model?: string | null;
          operator_tool_ids?: string[];
          organization_id?: string;
          pipeline_ids?: string[];
          provider?: string;
          published_at?: string | null;
          split_max_chars?: number;
          split_messages?: boolean;
          status?: string;
          superseded_at?: string | null;
          system_prompt?: string;
          token_budget?: number;
          tool_ids?: string[];
          trigger_config?: NonNullable<Json>;
          version_number?: number;
          video_frames_enabled?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "ai_agent_versions_agent_id_fkey";
            columns: ["agent_id"];
            isOneToOne: false;
            referencedRelation: "ai_agents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ai_agent_versions_channel_session_id_fkey";
            columns: ["channel_session_id"];
            isOneToOne: false;
            referencedRelation: "channel_sessions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ai_agent_versions_credential_id_fkey";
            columns: ["credential_id"];
            isOneToOne: false;
            referencedRelation: "ai_provider_credentials";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ai_agent_versions_credential_id_fkey";
            columns: ["credential_id"];
            isOneToOne: false;
            referencedRelation: "ai_provider_credentials_safe";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ai_agent_versions_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      ai_agents: {
        Row: {
          active_kb_version_id: string | null;
          archived_at: string | null;
          config: NonNullable<Json>;
          created_at: string;
          created_by: string | null;
          description: string | null;
          guardrails: NonNullable<Json>;
          id: string;
          is_active: boolean;
          is_default: boolean;
          kind: string;
          model: string;
          name: string;
          organization_id: string;
          priority: number;
          published_version_id: string | null;
          system_prompt: string;
          updated_at: string;
        };
        Insert: {
          active_kb_version_id?: string | null;
          archived_at?: string | null;
          config?: NonNullable<Json>;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          guardrails?: NonNullable<Json>;
          id?: string;
          is_active?: boolean;
          is_default?: boolean;
          kind?: string;
          model?: string;
          name: string;
          organization_id: string;
          priority?: number;
          published_version_id?: string | null;
          system_prompt: string;
          updated_at?: string;
        };
        Update: {
          active_kb_version_id?: string | null;
          archived_at?: string | null;
          config?: NonNullable<Json>;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          guardrails?: NonNullable<Json>;
          id?: string;
          is_active?: boolean;
          is_default?: boolean;
          kind?: string;
          model?: string;
          name?: string;
          organization_id?: string;
          priority?: number;
          published_version_id?: string | null;
          system_prompt?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ai_agents_active_kb_version_id_fkey";
            columns: ["active_kb_version_id"];
            isOneToOne: false;
            referencedRelation: "ai_knowledge_versions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ai_agents_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ai_agents_published_version_id_fkey";
            columns: ["published_version_id"];
            isOneToOne: false;
            referencedRelation: "ai_agent_versions";
            referencedColumns: ["id"];
          },
        ];
      };
      ai_budgets: {
        Row: {
          action_at_100pct: string;
          alarm_threshold_pct: number;
          current_month_consumed_cents: number;
          current_period_start: string;
          enforcement_effective_at: string | null;
          enforcement_mode: string;
          is_disabled: boolean;
          is_throttled: boolean;
          last_alarm_sent_at: string | null;
          monthly_limit_cents: number;
          organization_id: string;
          updated_at: string;
        };
        Insert: {
          action_at_100pct?: string;
          alarm_threshold_pct?: number;
          current_month_consumed_cents?: number;
          current_period_start?: string;
          enforcement_effective_at?: string | null;
          enforcement_mode?: string;
          is_disabled?: boolean;
          is_throttled?: boolean;
          last_alarm_sent_at?: string | null;
          monthly_limit_cents?: number;
          organization_id: string;
          updated_at?: string;
        };
        Update: {
          action_at_100pct?: string;
          alarm_threshold_pct?: number;
          current_month_consumed_cents?: number;
          current_period_start?: string;
          enforcement_effective_at?: string | null;
          enforcement_mode?: string;
          is_disabled?: boolean;
          is_throttled?: boolean;
          last_alarm_sent_at?: string | null;
          monthly_limit_cents?: number;
          organization_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ai_budgets_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: true;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      ai_chunks: {
        Row: {
          content: string;
          content_hash: string;
          created_at: string;
          embedding: string;
          id: string;
          kb_version_id: string;
          knowledge_source_id: string;
          metadata: NonNullable<Json>;
          organization_id: string;
          position: number;
          token_count: number;
        };
        Insert: {
          content: string;
          content_hash: string;
          created_at?: string;
          embedding: string;
          id?: string;
          kb_version_id: string;
          knowledge_source_id: string;
          metadata?: NonNullable<Json>;
          organization_id: string;
          position: number;
          token_count: number;
        };
        Update: {
          content?: string;
          content_hash?: string;
          created_at?: string;
          embedding?: string;
          id?: string;
          kb_version_id?: string;
          knowledge_source_id?: string;
          metadata?: NonNullable<Json>;
          organization_id?: string;
          position?: number;
          token_count?: number;
        };
        Relationships: [
          {
            foreignKeyName: "ai_chunks_kb_version_id_fkey";
            columns: ["kb_version_id"];
            isOneToOne: false;
            referencedRelation: "ai_knowledge_versions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ai_chunks_knowledge_source_id_fkey";
            columns: ["knowledge_source_id"];
            isOneToOne: false;
            referencedRelation: "ai_knowledge_sources";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ai_chunks_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      ai_execution_policies: {
        Row: {
          created_at: string;
          default_flow_pointer_id: string | null;
          executar_followup: boolean;
          nivel_maximo: number;
          organization_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          default_flow_pointer_id?: string | null;
          executar_followup?: boolean;
          nivel_maximo?: number;
          organization_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          default_flow_pointer_id?: string | null;
          executar_followup?: boolean;
          nivel_maximo?: number;
          organization_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ai_execution_policies_default_flow_pointer_id_fkey";
            columns: ["default_flow_pointer_id"];
            isOneToOne: false;
            referencedRelation: "followup_flow_pointers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ai_execution_policies_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: true;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      ai_faq_items: {
        Row: {
          answer: string;
          created_at: string;
          id: string;
          knowledge_source_id: string;
          locale: string;
          organization_id: string;
          position: number;
          question: string;
          tags: string[];
          updated_at: string;
        };
        Insert: {
          answer: string;
          created_at?: string;
          id?: string;
          knowledge_source_id: string;
          locale?: string;
          organization_id: string;
          position?: number;
          question: string;
          tags?: string[];
          updated_at?: string;
        };
        Update: {
          answer?: string;
          created_at?: string;
          id?: string;
          knowledge_source_id?: string;
          locale?: string;
          organization_id?: string;
          position?: number;
          question?: string;
          tags?: string[];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ai_faq_items_knowledge_source_id_fkey";
            columns: ["knowledge_source_id"];
            isOneToOne: false;
            referencedRelation: "ai_knowledge_sources";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ai_faq_items_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      ai_invocations: {
        Row: {
          agent_id: string | null;
          citations: NonNullable<Json>;
          completion_tokens: number;
          conversation_id: string | null;
          cost_cents: number;
          created_at: string;
          error_payload: Json | null;
          finish_reason: string | null;
          id: string;
          invocation_kind: string;
          latency_ms: number;
          message_id: string | null;
          model: string;
          organization_id: string;
          prompt_blob_path: string | null;
          prompt_tokens: number;
          response_blob_path: string | null;
          total_tokens: number | null;
        };
        Insert: {
          agent_id?: string | null;
          citations?: NonNullable<Json>;
          completion_tokens?: number;
          conversation_id?: string | null;
          cost_cents?: number;
          created_at?: string;
          error_payload?: Json | null;
          finish_reason?: string | null;
          id?: string;
          invocation_kind: string;
          latency_ms: number;
          message_id?: string | null;
          model: string;
          organization_id: string;
          prompt_blob_path?: string | null;
          prompt_tokens?: number;
          response_blob_path?: string | null;
          total_tokens?: never;
        };
        Update: {
          agent_id?: string | null;
          citations?: NonNullable<Json>;
          completion_tokens?: number;
          conversation_id?: string | null;
          cost_cents?: number;
          created_at?: string;
          error_payload?: Json | null;
          finish_reason?: string | null;
          id?: string;
          invocation_kind?: string;
          latency_ms?: number;
          message_id?: string | null;
          model?: string;
          organization_id?: string;
          prompt_blob_path?: string | null;
          prompt_tokens?: number;
          response_blob_path?: string | null;
          total_tokens?: never;
        };
        Relationships: [
          {
            foreignKeyName: "ai_invocations_agent_id_fkey";
            columns: ["agent_id"];
            isOneToOne: false;
            referencedRelation: "ai_agents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ai_invocations_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ai_invocations_message_id_fkey";
            columns: ["message_id"];
            isOneToOne: false;
            referencedRelation: "messages";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ai_invocations_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      ai_knowledge_sources: {
        Row: {
          active_kb_version_id: string | null;
          agent_id: string | null;
          chunks_count: number;
          created_at: string;
          id: string;
          ingested_at: string | null;
          is_active: boolean;
          last_index_error: string | null;
          last_index_status: string | null;
          last_indexed_at: string | null;
          name: string;
          organization_id: string;
          source_metadata: NonNullable<Json>;
          source_type: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          active_kb_version_id?: string | null;
          agent_id?: string | null;
          chunks_count?: number;
          created_at?: string;
          id?: string;
          ingested_at?: string | null;
          is_active?: boolean;
          last_index_error?: string | null;
          last_index_status?: string | null;
          last_indexed_at?: string | null;
          name?: string;
          organization_id: string;
          source_metadata?: NonNullable<Json>;
          source_type: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          active_kb_version_id?: string | null;
          agent_id?: string | null;
          chunks_count?: number;
          created_at?: string;
          id?: string;
          ingested_at?: string | null;
          is_active?: boolean;
          last_index_error?: string | null;
          last_index_status?: string | null;
          last_indexed_at?: string | null;
          name?: string;
          organization_id?: string;
          source_metadata?: NonNullable<Json>;
          source_type?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ai_knowledge_sources_active_kb_version_id_fkey";
            columns: ["active_kb_version_id"];
            isOneToOne: false;
            referencedRelation: "ai_knowledge_versions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ai_knowledge_sources_agent_id_fkey";
            columns: ["agent_id"];
            isOneToOne: false;
            referencedRelation: "ai_agents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ai_knowledge_sources_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      ai_knowledge_versions: {
        Row: {
          activated_at: string | null;
          activated_by: string | null;
          agent_id: string | null;
          created_at: string;
          description: string | null;
          embedding_dims: number | null;
          embedding_model: string | null;
          error_message: string | null;
          id: string;
          indexed_at: string | null;
          is_active: boolean;
          knowledge_source_id: string | null;
          organization_id: string;
          sources_snapshot: NonNullable<Json>;
          status: string | null;
          total_chunks: number;
          version_number: number;
        };
        Insert: {
          activated_at?: string | null;
          activated_by?: string | null;
          agent_id?: string | null;
          created_at?: string;
          description?: string | null;
          embedding_dims?: number | null;
          embedding_model?: string | null;
          error_message?: string | null;
          id?: string;
          indexed_at?: string | null;
          is_active?: boolean;
          knowledge_source_id?: string | null;
          organization_id: string;
          sources_snapshot?: NonNullable<Json>;
          status?: string | null;
          total_chunks?: number;
          version_number: number;
        };
        Update: {
          activated_at?: string | null;
          activated_by?: string | null;
          agent_id?: string | null;
          created_at?: string;
          description?: string | null;
          embedding_dims?: number | null;
          embedding_model?: string | null;
          error_message?: string | null;
          id?: string;
          indexed_at?: string | null;
          is_active?: boolean;
          knowledge_source_id?: string | null;
          organization_id?: string;
          sources_snapshot?: NonNullable<Json>;
          status?: string | null;
          total_chunks?: number;
          version_number?: number;
        };
        Relationships: [
          {
            foreignKeyName: "ai_knowledge_versions_agent_id_fkey";
            columns: ["agent_id"];
            isOneToOne: false;
            referencedRelation: "ai_agents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ai_knowledge_versions_knowledge_source_id_fkey";
            columns: ["knowledge_source_id"];
            isOneToOne: false;
            referencedRelation: "ai_knowledge_sources";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ai_knowledge_versions_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      ai_models: {
        Row: {
          context_window: number | null;
          deprecated_at: string | null;
          description: string | null;
          display_name: string;
          embedding_dims: number | null;
          id: string;
          input_price_per_million_cents: number | null;
          is_default_for_provider: boolean;
          metadata: NonNullable<Json>;
          model_id: string;
          output_price_per_million_cents: number | null;
          provider: string;
          released_at: string | null;
          source: string;
          supports_embedding: boolean;
          supports_tools: boolean;
          supports_vision: boolean;
          synced_at: string | null;
        };
        Insert: {
          context_window?: number | null;
          deprecated_at?: string | null;
          description?: string | null;
          display_name: string;
          embedding_dims?: number | null;
          id?: string;
          input_price_per_million_cents?: number | null;
          is_default_for_provider?: boolean;
          metadata?: NonNullable<Json>;
          model_id: string;
          output_price_per_million_cents?: number | null;
          provider: string;
          released_at?: string | null;
          source?: string;
          supports_embedding?: boolean;
          supports_tools?: boolean;
          supports_vision?: boolean;
          synced_at?: string | null;
        };
        Update: {
          context_window?: number | null;
          deprecated_at?: string | null;
          description?: string | null;
          display_name?: string;
          embedding_dims?: number | null;
          id?: string;
          input_price_per_million_cents?: number | null;
          is_default_for_provider?: boolean;
          metadata?: NonNullable<Json>;
          model_id?: string;
          output_price_per_million_cents?: number | null;
          provider?: string;
          released_at?: string | null;
          source?: string;
          supports_embedding?: boolean;
          supports_tools?: boolean;
          supports_vision?: boolean;
          synced_at?: string | null;
        };
        Relationships: [];
      };
      ai_pricing: {
        Row: {
          completion_cents_per_million_tokens: number | null;
          effective_from: string;
          embedding_cents_per_million_tokens: number | null;
          model: string;
          notes: string | null;
          prompt_cents_per_million_tokens: number | null;
          superseded_at: string | null;
        };
        Insert: {
          completion_cents_per_million_tokens?: number | null;
          effective_from?: string;
          embedding_cents_per_million_tokens?: number | null;
          model: string;
          notes?: string | null;
          prompt_cents_per_million_tokens?: number | null;
          superseded_at?: string | null;
        };
        Update: {
          completion_cents_per_million_tokens?: number | null;
          effective_from?: string;
          embedding_cents_per_million_tokens?: number | null;
          model?: string;
          notes?: string | null;
          prompt_cents_per_million_tokens?: number | null;
          superseded_at?: string | null;
        };
        Relationships: [];
      };
      ai_provider_credentials: {
        Row: {
          api_key_encrypted: string;
          api_key_iv: string;
          api_key_last4: string;
          api_key_tag: string;
          created_at: string;
          created_by: string | null;
          id: string;
          is_active: boolean;
          label: string;
          models_available: string[] | null;
          organization_id: string;
          provider: string;
          updated_at: string;
          validated_at: string | null;
          validation_error: string | null;
        };
        Insert: {
          api_key_encrypted: string;
          api_key_iv: string;
          api_key_last4: string;
          api_key_tag: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          is_active?: boolean;
          label: string;
          models_available?: string[] | null;
          organization_id: string;
          provider: string;
          updated_at?: string;
          validated_at?: string | null;
          validation_error?: string | null;
        };
        Update: {
          api_key_encrypted?: string;
          api_key_iv?: string;
          api_key_last4?: string;
          api_key_tag?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          is_active?: boolean;
          label?: string;
          models_available?: string[] | null;
          organization_id?: string;
          provider?: string;
          updated_at?: string;
          validated_at?: string | null;
          validation_error?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "ai_provider_credentials_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      ai_purpose_bindings: {
        Row: {
          base_url: string | null;
          created_at: string;
          credential_id: string | null;
          id: string;
          is_enabled: boolean;
          model_id: string;
          organization_id: string;
          provider: string;
          purpose: string;
          updated_at: string;
        };
        Insert: {
          base_url?: string | null;
          created_at?: string;
          credential_id?: string | null;
          id?: string;
          is_enabled?: boolean;
          model_id: string;
          organization_id: string;
          provider: string;
          purpose: string;
          updated_at?: string;
        };
        Update: {
          base_url?: string | null;
          created_at?: string;
          credential_id?: string | null;
          id?: string;
          is_enabled?: boolean;
          model_id?: string;
          organization_id?: string;
          provider?: string;
          purpose?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ai_purpose_bindings_credential_id_fkey";
            columns: ["credential_id"];
            isOneToOne: false;
            referencedRelation: "ai_provider_credentials";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ai_purpose_bindings_credential_id_fkey";
            columns: ["credential_id"];
            isOneToOne: false;
            referencedRelation: "ai_provider_credentials_safe";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ai_purpose_bindings_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      ai_router_decisions: {
        Row: {
          agent_id: string | null;
          confidence: number | null;
          conversation_id: string | null;
          created_at: string;
          id: string;
          intent_name: string | null;
          job_id: string | null;
          organization_id: string;
          outcome: string;
          router_id: string | null;
        };
        Insert: {
          agent_id?: string | null;
          confidence?: number | null;
          conversation_id?: string | null;
          created_at?: string;
          id?: string;
          intent_name?: string | null;
          job_id?: string | null;
          organization_id: string;
          outcome: string;
          router_id?: string | null;
        };
        Update: {
          agent_id?: string | null;
          confidence?: number | null;
          conversation_id?: string | null;
          created_at?: string;
          id?: string;
          intent_name?: string | null;
          job_id?: string | null;
          organization_id?: string;
          outcome?: string;
          router_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "ai_router_decisions_agent_id_fkey";
            columns: ["agent_id"];
            isOneToOne: false;
            referencedRelation: "ai_agents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ai_router_decisions_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ai_router_decisions_router_id_fkey";
            columns: ["router_id"];
            isOneToOne: false;
            referencedRelation: "ai_routers";
            referencedColumns: ["id"];
          },
        ];
      };
      ai_router_members: {
        Row: {
          agent_id: string;
          created_at: string;
          examples: string[];
          id: string;
          intent_description: string;
          intent_name: string;
          organization_id: string;
          position: number;
          router_id: string;
          updated_at: string;
        };
        Insert: {
          agent_id: string;
          created_at?: string;
          examples?: string[];
          id?: string;
          intent_description: string;
          intent_name: string;
          organization_id: string;
          position?: number;
          router_id: string;
          updated_at?: string;
        };
        Update: {
          agent_id?: string;
          created_at?: string;
          examples?: string[];
          id?: string;
          intent_description?: string;
          intent_name?: string;
          organization_id?: string;
          position?: number;
          router_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ai_router_members_agent_id_fkey";
            columns: ["agent_id"];
            isOneToOne: false;
            referencedRelation: "ai_agents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ai_router_members_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ai_router_members_router_id_fkey";
            columns: ["router_id"];
            isOneToOne: false;
            referencedRelation: "ai_routers";
            referencedColumns: ["id"];
          },
        ];
      };
      ai_routers: {
        Row: {
          channel_session_id: string;
          config: NonNullable<Json>;
          created_at: string;
          created_by: string | null;
          fallback_agent_id: string | null;
          id: string;
          is_active: boolean;
          name: string;
          organization_id: string;
          updated_at: string;
        };
        Insert: {
          channel_session_id: string;
          config?: NonNullable<Json>;
          created_at?: string;
          created_by?: string | null;
          fallback_agent_id?: string | null;
          id?: string;
          is_active?: boolean;
          name: string;
          organization_id: string;
          updated_at?: string;
        };
        Update: {
          channel_session_id?: string;
          config?: NonNullable<Json>;
          created_at?: string;
          created_by?: string | null;
          fallback_agent_id?: string | null;
          id?: string;
          is_active?: boolean;
          name?: string;
          organization_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ai_routers_channel_session_id_fkey";
            columns: ["channel_session_id"];
            isOneToOne: false;
            referencedRelation: "channel_sessions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ai_routers_fallback_agent_id_fkey";
            columns: ["fallback_agent_id"];
            isOneToOne: false;
            referencedRelation: "ai_agents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ai_routers_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      api_audit_log: {
        Row: {
          acting_as_platform_admin: boolean;
          action: string;
          actor_api_token_id: string | null;
          actor_ip: unknown;
          actor_user_agent: string | null;
          actor_user_id: string | null;
          bypassed_rls: boolean;
          created_at: string;
          id: string;
          metadata: NonNullable<Json>;
          organization_id: string | null;
          request_id: string | null;
          resource_id: string | null;
          resource_type: string | null;
        };
        Insert: {
          acting_as_platform_admin?: boolean;
          action: string;
          actor_api_token_id?: string | null;
          actor_ip?: unknown;
          actor_user_agent?: string | null;
          actor_user_id?: string | null;
          bypassed_rls?: boolean;
          created_at?: string;
          id?: string;
          metadata?: NonNullable<Json>;
          organization_id?: string | null;
          request_id?: string | null;
          resource_id?: string | null;
          resource_type?: string | null;
        };
        Update: {
          acting_as_platform_admin?: boolean;
          action?: string;
          actor_api_token_id?: string | null;
          actor_ip?: unknown;
          actor_user_agent?: string | null;
          actor_user_id?: string | null;
          bypassed_rls?: boolean;
          created_at?: string;
          id?: string;
          metadata?: NonNullable<Json>;
          organization_id?: string | null;
          request_id?: string | null;
          resource_id?: string | null;
          resource_type?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "api_audit_log_actor_api_token_id_fkey";
            columns: ["actor_api_token_id"];
            isOneToOne: false;
            referencedRelation: "api_tokens";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "api_audit_log_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      api_tokens: {
        Row: {
          created_at: string;
          created_by: string;
          expires_at: string | null;
          id: string;
          last_used_at: string | null;
          last_used_ip: unknown;
          name: string;
          organization_id: string;
          prefix: string;
          revoked_at: string | null;
          revoked_by: string | null;
          scopes: NonNullable<Json>;
          token_hash: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by: string;
          expires_at?: string | null;
          id?: string;
          last_used_at?: string | null;
          last_used_ip?: unknown;
          name: string;
          organization_id: string;
          prefix: string;
          revoked_at?: string | null;
          revoked_by?: string | null;
          scopes?: NonNullable<Json>;
          token_hash: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          expires_at?: string | null;
          id?: string;
          last_used_at?: string | null;
          last_used_ip?: unknown;
          name?: string;
          organization_id?: string;
          prefix?: string;
          revoked_at?: string | null;
          revoked_by?: string | null;
          scopes?: NonNullable<Json>;
          token_hash?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "api_tokens_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      attendant_availability: {
        Row: {
          capacity: number;
          id: string;
          is_available: boolean;
          last_heartbeat_at: string | null;
          organization_id: string;
          schedule: NonNullable<Json>;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          capacity?: number;
          id?: string;
          is_available?: boolean;
          last_heartbeat_at?: string | null;
          organization_id: string;
          schedule?: NonNullable<Json>;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          capacity?: number;
          id?: string;
          is_available?: boolean;
          last_heartbeat_at?: string | null;
          organization_id?: string;
          schedule?: NonNullable<Json>;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "attendant_availability_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      automatic_sales_campaigns: {
        Row: {
          categorias: string[];
          cidade: string;
          created_at: string;
          followup_horas: number[];
          followup_textos: string[];
          id: string;
          janela_fim: string;
          janela_inicio: string;
          limite_diario: number;
          nome: string;
          objetivo: string | null;
          oferta_produtos: string[];
          organization_id: string;
          perfil_abordagem: string | null;
          responsavel_user_id: string | null;
          status: string;
          uf: string | null;
          updated_at: string;
        };
        Insert: {
          categorias?: string[];
          cidade: string;
          created_at?: string;
          followup_horas?: number[];
          followup_textos?: string[];
          id?: string;
          janela_fim?: string;
          janela_inicio?: string;
          limite_diario: number;
          nome: string;
          objetivo?: string | null;
          oferta_produtos?: string[];
          organization_id: string;
          perfil_abordagem?: string | null;
          responsavel_user_id?: string | null;
          status?: string;
          uf?: string | null;
          updated_at?: string;
        };
        Update: {
          categorias?: string[];
          cidade?: string;
          created_at?: string;
          followup_horas?: number[];
          followup_textos?: string[];
          id?: string;
          janela_fim?: string;
          janela_inicio?: string;
          limite_diario?: number;
          nome?: string;
          objetivo?: string | null;
          oferta_produtos?: string[];
          organization_id?: string;
          perfil_abordagem?: string | null;
          responsavel_user_id?: string | null;
          status?: string;
          uf?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "automatic_sales_campaigns_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      automatic_sales_events: {
        Row: {
          campaign_id: string;
          created_at: string;
          event_type: string;
          id: string;
          organization_id: string;
          payload: NonNullable<Json>;
          queue_id: string | null;
        };
        Insert: {
          campaign_id: string;
          created_at?: string;
          event_type: string;
          id?: string;
          organization_id: string;
          payload?: NonNullable<Json>;
          queue_id?: string | null;
        };
        Update: {
          campaign_id?: string;
          created_at?: string;
          event_type?: string;
          id?: string;
          organization_id?: string;
          payload?: NonNullable<Json>;
          queue_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "automatic_sales_events_campaign_id_fkey";
            columns: ["campaign_id"];
            isOneToOne: false;
            referencedRelation: "automatic_sales_campaigns";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "automatic_sales_events_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "automatic_sales_events_queue_id_fkey";
            columns: ["queue_id"];
            isOneToOne: false;
            referencedRelation: "automatic_sales_queue";
            referencedColumns: ["id"];
          },
        ];
      };
      automatic_sales_queue: {
        Row: {
          campaign_id: string;
          contact_id: string | null;
          conversation_id: string | null;
          created_at: string;
          dia: string;
          followup_count: number;
          id: string;
          interest_level: string | null;
          lead_id: string | null;
          message_id: string | null;
          organization_id: string;
          prospect_id: string | null;
          proximo_followup_at: string | null;
          rejection_reason: string | null;
          snapshot: NonNullable<Json>;
          status: string;
          ultima_mensagem_at: string | null;
          updated_at: string;
        };
        Insert: {
          campaign_id: string;
          contact_id?: string | null;
          conversation_id?: string | null;
          created_at?: string;
          dia: string;
          followup_count?: number;
          id?: string;
          interest_level?: string | null;
          lead_id?: string | null;
          message_id?: string | null;
          organization_id: string;
          prospect_id?: string | null;
          proximo_followup_at?: string | null;
          rejection_reason?: string | null;
          snapshot?: NonNullable<Json>;
          status?: string;
          ultima_mensagem_at?: string | null;
          updated_at?: string;
        };
        Update: {
          campaign_id?: string;
          contact_id?: string | null;
          conversation_id?: string | null;
          created_at?: string;
          dia?: string;
          followup_count?: number;
          id?: string;
          interest_level?: string | null;
          lead_id?: string | null;
          message_id?: string | null;
          organization_id?: string;
          prospect_id?: string | null;
          proximo_followup_at?: string | null;
          rejection_reason?: string | null;
          snapshot?: NonNullable<Json>;
          status?: string;
          ultima_mensagem_at?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "automatic_sales_queue_campaign_id_fkey";
            columns: ["campaign_id"];
            isOneToOne: false;
            referencedRelation: "automatic_sales_campaigns";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "automatic_sales_queue_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "automatic_sales_queue_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "automatic_sales_queue_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: false;
            referencedRelation: "crm_leads";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "automatic_sales_queue_message_id_fkey";
            columns: ["message_id"];
            isOneToOne: false;
            referencedRelation: "messages";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "automatic_sales_queue_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "automatic_sales_queue_prospect_id_fkey";
            columns: ["prospect_id"];
            isOneToOne: false;
            referencedRelation: "business_prospects";
            referencedColumns: ["id"];
          },
        ];
      };
      automation_rule_runs: {
        Row: {
          actions_result: NonNullable<Json>;
          created_at: string;
          error: string | null;
          event_id: string | null;
          id: string;
          organization_id: string;
          rule_id: string;
          status: string;
        };
        Insert: {
          actions_result?: NonNullable<Json>;
          created_at?: string;
          error?: string | null;
          event_id?: string | null;
          id?: string;
          organization_id: string;
          rule_id: string;
          status: string;
        };
        Update: {
          actions_result?: NonNullable<Json>;
          created_at?: string;
          error?: string | null;
          event_id?: string | null;
          id?: string;
          organization_id?: string;
          rule_id?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "automation_rule_runs_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "event_log";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "automation_rule_runs_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "automation_rule_runs_rule_id_fkey";
            columns: ["rule_id"];
            isOneToOne: false;
            referencedRelation: "automation_rules";
            referencedColumns: ["id"];
          },
        ];
      };
      automation_rules: {
        Row: {
          actions: NonNullable<Json>;
          conditions: NonNullable<Json>;
          created_at: string;
          created_by_user_id: string | null;
          id: string;
          is_active: boolean;
          last_change_actor_kind: string | null;
          last_change_at: string | null;
          last_run_at: string | null;
          name: string;
          organization_id: string;
          run_count: number;
          trigger_event: string;
          updated_at: string;
        };
        Insert: {
          actions?: NonNullable<Json>;
          conditions?: NonNullable<Json>;
          created_at?: string;
          created_by_user_id?: string | null;
          id?: string;
          is_active?: boolean;
          last_change_actor_kind?: string | null;
          last_change_at?: string | null;
          last_run_at?: string | null;
          name: string;
          organization_id: string;
          run_count?: number;
          trigger_event: string;
          updated_at?: string;
        };
        Update: {
          actions?: NonNullable<Json>;
          conditions?: NonNullable<Json>;
          created_at?: string;
          created_by_user_id?: string | null;
          id?: string;
          is_active?: boolean;
          last_change_actor_kind?: string | null;
          last_change_at?: string | null;
          last_run_at?: string | null;
          name?: string;
          organization_id?: string;
          run_count?: number;
          trigger_event?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "automation_rules_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      before_send_traces: {
        Row: {
          channel_session_id: string;
          contact_id: string | null;
          created_at: string;
          id: string;
          job_id: string;
          organization_id: string;
          trace: NonNullable<Json>;
          vetoed_code: string | null;
          vetoed_gate: string | null;
        };
        Insert: {
          channel_session_id: string;
          contact_id?: string | null;
          created_at?: string;
          id?: string;
          job_id: string;
          organization_id: string;
          trace: NonNullable<Json>;
          vetoed_code?: string | null;
          vetoed_gate?: string | null;
        };
        Update: {
          channel_session_id?: string;
          contact_id?: string | null;
          created_at?: string;
          id?: string;
          job_id?: string;
          organization_id?: string;
          trace?: NonNullable<Json>;
          vetoed_code?: string | null;
          vetoed_gate?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "before_send_traces_channel_session_id_fkey";
            columns: ["channel_session_id"];
            isOneToOne: false;
            referencedRelation: "channel_sessions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "before_send_traces_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "before_send_traces_job_id_fkey";
            columns: ["job_id"];
            isOneToOne: false;
            referencedRelation: "job_queue";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "before_send_traces_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      business_prospects: {
        Row: {
          bairro: string | null;
          bloqueado: boolean;
          candidato_duplicado_de: string | null;
          categoria: string | null;
          categorias: string[];
          cep: string | null;
          cidade: string | null;
          contact_id: string | null;
          created_at: string;
          created_by: string | null;
          discovered_at: string;
          do_not_contact: boolean;
          dominio: string | null;
          email: string | null;
          endereco: string | null;
          estado: string | null;
          external_id: string | null;
          external_url: string | null;
          horario_funcionamento: Json | null;
          id: string;
          last_verified_at: string | null;
          latitude: number | null;
          lead_id: string | null;
          logradouro: string | null;
          longitude: number | null;
          nome: string;
          nome_normalizado: string;
          nota: number | null;
          numero_end: string | null;
          organization_id: string;
          owner_user_id: string | null;
          pais: string;
          provider: string;
          proximo_passo: string | null;
          score: number;
          source: string | null;
          source_url: string | null;
          status_comercial: string;
          telefone: string | null;
          telefone_normalizado: string | null;
          total_avaliacoes: number;
          updated_at: string;
          website: string | null;
          whatsapp_potencial: boolean;
        };
        Insert: {
          bairro?: string | null;
          bloqueado?: boolean;
          candidato_duplicado_de?: string | null;
          categoria?: string | null;
          categorias?: string[];
          cep?: string | null;
          cidade?: string | null;
          contact_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          discovered_at?: string;
          do_not_contact?: boolean;
          dominio?: string | null;
          email?: string | null;
          endereco?: string | null;
          estado?: string | null;
          external_id?: string | null;
          external_url?: string | null;
          horario_funcionamento?: Json | null;
          id?: string;
          last_verified_at?: string | null;
          latitude?: number | null;
          lead_id?: string | null;
          logradouro?: string | null;
          longitude?: number | null;
          nome: string;
          nome_normalizado: string;
          nota?: number | null;
          numero_end?: string | null;
          organization_id: string;
          owner_user_id?: string | null;
          pais?: string;
          provider: string;
          proximo_passo?: string | null;
          score?: number;
          source?: string | null;
          source_url?: string | null;
          status_comercial?: string;
          telefone?: string | null;
          telefone_normalizado?: string | null;
          total_avaliacoes?: number;
          updated_at?: string;
          website?: string | null;
          whatsapp_potencial?: boolean;
        };
        Update: {
          bairro?: string | null;
          bloqueado?: boolean;
          candidato_duplicado_de?: string | null;
          categoria?: string | null;
          categorias?: string[];
          cep?: string | null;
          cidade?: string | null;
          contact_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          discovered_at?: string;
          do_not_contact?: boolean;
          dominio?: string | null;
          email?: string | null;
          endereco?: string | null;
          estado?: string | null;
          external_id?: string | null;
          external_url?: string | null;
          horario_funcionamento?: Json | null;
          id?: string;
          last_verified_at?: string | null;
          latitude?: number | null;
          lead_id?: string | null;
          logradouro?: string | null;
          longitude?: number | null;
          nome?: string;
          nome_normalizado?: string;
          nota?: number | null;
          numero_end?: string | null;
          organization_id?: string;
          owner_user_id?: string | null;
          pais?: string;
          provider?: string;
          proximo_passo?: string | null;
          score?: number;
          source?: string | null;
          source_url?: string | null;
          status_comercial?: string;
          telefone?: string | null;
          telefone_normalizado?: string | null;
          total_avaliacoes?: number;
          updated_at?: string;
          website?: string | null;
          whatsapp_potencial?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "business_prospects_candidato_duplicado_de_fkey";
            columns: ["candidato_duplicado_de"];
            isOneToOne: false;
            referencedRelation: "business_prospects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "business_prospects_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "business_prospects_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: false;
            referencedRelation: "crm_leads";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "business_prospects_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      calendar_appointments: {
        Row: {
          cancellation_reason: string | null;
          cancelled_at: string | null;
          contact_id: string | null;
          conversation_id: string | null;
          created_at: string;
          created_by_agent_id: string | null;
          created_by_kind: string;
          created_by_user_id: string | null;
          description: string | null;
          ends_at: string;
          event_type_id: string | null;
          google_calendar_id: string | null;
          google_connection_id: string | null;
          google_event_id: string | null;
          google_ical_uid: string | null;
          google_sequence: number;
          google_sync_error: string | null;
          google_synced_at: string | null;
          id: string;
          location_details: string | null;
          location_kind: string;
          meeting_url: string | null;
          needs_google_push: boolean | null;
          notes: string | null;
          organization_id: string;
          owner_user_id: string | null;
          reminder_sent_at: string | null;
          rescheduled_from_id: string | null;
          source: string;
          starts_at: string;
          status: string;
          time_zone: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          cancellation_reason?: string | null;
          cancelled_at?: string | null;
          contact_id?: string | null;
          conversation_id?: string | null;
          created_at?: string;
          created_by_agent_id?: string | null;
          created_by_kind?: string;
          created_by_user_id?: string | null;
          description?: string | null;
          ends_at: string;
          event_type_id?: string | null;
          google_calendar_id?: string | null;
          google_connection_id?: string | null;
          google_event_id?: string | null;
          google_ical_uid?: string | null;
          google_sequence?: number;
          google_sync_error?: string | null;
          google_synced_at?: string | null;
          id?: string;
          location_details?: string | null;
          location_kind?: string;
          meeting_url?: string | null;
          needs_google_push?: never;
          notes?: string | null;
          organization_id: string;
          owner_user_id?: string | null;
          reminder_sent_at?: string | null;
          rescheduled_from_id?: string | null;
          source?: string;
          starts_at: string;
          status?: string;
          time_zone?: string;
          title: string;
          updated_at?: string;
        };
        Update: {
          cancellation_reason?: string | null;
          cancelled_at?: string | null;
          contact_id?: string | null;
          conversation_id?: string | null;
          created_at?: string;
          created_by_agent_id?: string | null;
          created_by_kind?: string;
          created_by_user_id?: string | null;
          description?: string | null;
          ends_at?: string;
          event_type_id?: string | null;
          google_calendar_id?: string | null;
          google_connection_id?: string | null;
          google_event_id?: string | null;
          google_ical_uid?: string | null;
          google_sequence?: number;
          google_sync_error?: string | null;
          google_synced_at?: string | null;
          id?: string;
          location_details?: string | null;
          location_kind?: string;
          meeting_url?: string | null;
          needs_google_push?: never;
          notes?: string | null;
          organization_id?: string;
          owner_user_id?: string | null;
          reminder_sent_at?: string | null;
          rescheduled_from_id?: string | null;
          source?: string;
          starts_at?: string;
          status?: string;
          time_zone?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "calendar_appointments_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "calendar_appointments_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "calendar_appointments_created_by_agent_id_fkey";
            columns: ["created_by_agent_id"];
            isOneToOne: false;
            referencedRelation: "ai_agents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "calendar_appointments_event_type_id_fkey";
            columns: ["event_type_id"];
            isOneToOne: false;
            referencedRelation: "calendar_event_types";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "calendar_appointments_google_connection_id_fkey";
            columns: ["google_connection_id"];
            isOneToOne: false;
            referencedRelation: "calendar_connections";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "calendar_appointments_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "calendar_appointments_rescheduled_from_id_fkey";
            columns: ["rescheduled_from_id"];
            isOneToOne: false;
            referencedRelation: "calendar_appointments";
            referencedColumns: ["id"];
          },
        ];
      };
      calendar_availability_exceptions: {
        Row: {
          created_at: string;
          end_minute: number;
          exception_date: string;
          id: string;
          is_unavailable: boolean;
          organization_id: string;
          reason: string | null;
          start_minute: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          end_minute?: number;
          exception_date: string;
          id?: string;
          is_unavailable?: boolean;
          organization_id: string;
          reason?: string | null;
          start_minute?: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          end_minute?: number;
          exception_date?: string;
          id?: string;
          is_unavailable?: boolean;
          organization_id?: string;
          reason?: string | null;
          start_minute?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "calendar_availability_exceptions_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      calendar_connection_calendars: {
        Row: {
          connection_id: string;
          counts_for_conflicts: boolean;
          created_at: string;
          external_calendar_id: string;
          id: string;
          is_destination: boolean;
          is_primary: boolean;
          name: string;
          organization_id: string;
          sync_token: string | null;
          time_zone: string | null;
          updated_at: string;
        };
        Insert: {
          connection_id: string;
          counts_for_conflicts?: boolean;
          created_at?: string;
          external_calendar_id: string;
          id?: string;
          is_destination?: boolean;
          is_primary?: boolean;
          name: string;
          organization_id: string;
          sync_token?: string | null;
          time_zone?: string | null;
          updated_at?: string;
        };
        Update: {
          connection_id?: string;
          counts_for_conflicts?: boolean;
          created_at?: string;
          external_calendar_id?: string;
          id?: string;
          is_destination?: boolean;
          is_primary?: boolean;
          name?: string;
          organization_id?: string;
          sync_token?: string | null;
          time_zone?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "calendar_connection_calendars_connection_id_fkey";
            columns: ["connection_id"];
            isOneToOne: false;
            referencedRelation: "calendar_connections";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "calendar_connection_calendars_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      calendar_connections: {
        Row: {
          account_email: string;
          created_at: string;
          id: string;
          last_sync_at: string | null;
          last_sync_error: string | null;
          oauth_access_token_encrypted: string | null;
          oauth_refresh_token_encrypted: string | null;
          organization_id: string;
          provider: string;
          scopes: string[];
          status: string;
          sync_token: string | null;
          token_expires_at: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          account_email: string;
          created_at?: string;
          id?: string;
          last_sync_at?: string | null;
          last_sync_error?: string | null;
          oauth_access_token_encrypted?: string | null;
          oauth_refresh_token_encrypted?: string | null;
          organization_id: string;
          provider?: string;
          scopes?: string[];
          status?: string;
          sync_token?: string | null;
          token_expires_at?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          account_email?: string;
          created_at?: string;
          id?: string;
          last_sync_at?: string | null;
          last_sync_error?: string | null;
          oauth_access_token_encrypted?: string | null;
          oauth_refresh_token_encrypted?: string | null;
          organization_id?: string;
          provider?: string;
          scopes?: string[];
          status?: string;
          sync_token?: string | null;
          token_expires_at?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "calendar_connections_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      calendar_event_types: {
        Row: {
          booking_window_days: number;
          buffer_after_minutes: number;
          buffer_before_minutes: number;
          category: string;
          created_at: string;
          default_owner_user_id: string | null;
          description: string | null;
          duration_minutes: number;
          id: string;
          is_active: boolean;
          location_details: string | null;
          location_kind: string;
          minimum_notice_minutes: number;
          name: string;
          organization_id: string;
          position: number;
          reminder_enabled: boolean;
          reminder_minutes_before: number;
          reminder_template_name: string | null;
          requires_confirmation: boolean;
          slot_interval_minutes: number | null;
          slug: string;
          updated_at: string;
        };
        Insert: {
          booking_window_days?: number;
          buffer_after_minutes?: number;
          buffer_before_minutes?: number;
          category?: string;
          created_at?: string;
          default_owner_user_id?: string | null;
          description?: string | null;
          duration_minutes?: number;
          id?: string;
          is_active?: boolean;
          location_details?: string | null;
          location_kind?: string;
          minimum_notice_minutes?: number;
          name: string;
          organization_id: string;
          position?: number;
          reminder_enabled?: boolean;
          reminder_minutes_before?: number;
          reminder_template_name?: string | null;
          requires_confirmation?: boolean;
          slot_interval_minutes?: number | null;
          slug: string;
          updated_at?: string;
        };
        Update: {
          booking_window_days?: number;
          buffer_after_minutes?: number;
          buffer_before_minutes?: number;
          category?: string;
          created_at?: string;
          default_owner_user_id?: string | null;
          description?: string | null;
          duration_minutes?: number;
          id?: string;
          is_active?: boolean;
          location_details?: string | null;
          location_kind?: string;
          minimum_notice_minutes?: number;
          name?: string;
          organization_id?: string;
          position?: number;
          reminder_enabled?: boolean;
          reminder_minutes_before?: number;
          reminder_template_name?: string | null;
          requires_confirmation?: boolean;
          slot_interval_minutes?: number | null;
          slug?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "calendar_event_types_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      calendar_external_events: {
        Row: {
          connection_id: string;
          created_at: string;
          ends_at: string;
          external_calendar_id: string;
          external_event_id: string;
          external_updated_at: string | null;
          ical_uid: string | null;
          id: string;
          is_all_day: boolean;
          organization_id: string;
          starts_at: string;
          status: string;
          title: string | null;
          transparency: string;
          updated_at: string;
        };
        Insert: {
          connection_id: string;
          created_at?: string;
          ends_at: string;
          external_calendar_id: string;
          external_event_id: string;
          external_updated_at?: string | null;
          ical_uid?: string | null;
          id?: string;
          is_all_day?: boolean;
          organization_id: string;
          starts_at: string;
          status?: string;
          title?: string | null;
          transparency?: string;
          updated_at?: string;
        };
        Update: {
          connection_id?: string;
          created_at?: string;
          ends_at?: string;
          external_calendar_id?: string;
          external_event_id?: string;
          external_updated_at?: string | null;
          ical_uid?: string | null;
          id?: string;
          is_all_day?: boolean;
          organization_id?: string;
          starts_at?: string;
          status?: string;
          title?: string | null;
          transparency?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "calendar_external_events_connection_id_fkey";
            columns: ["connection_id"];
            isOneToOne: false;
            referencedRelation: "calendar_connections";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "calendar_external_events_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      calendar_oauth_nonces: {
        Row: {
          expira_em: string;
          nonce: string;
          organization_id: string;
          usado_em: string;
          user_id: string;
        };
        Insert: {
          expira_em: string;
          nonce: string;
          organization_id: string;
          usado_em?: string;
          user_id: string;
        };
        Update: {
          expira_em?: string;
          nonce?: string;
          organization_id?: string;
          usado_em?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "calendar_oauth_nonces_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      catalog_products: {
        Row: {
          ativo: boolean;
          categoria: string | null;
          categoria_id: string | null;
          cfop: string | null;
          codigo: string;
          comissao_pct: number | null;
          controla_estoque: boolean;
          created_at: string;
          custo_cents: number | null;
          descricao: string | null;
          destaque: boolean;
          estoque_minimo: number;
          id: string;
          imagem_url: string | null;
          marca: string | null;
          moeda: string;
          ncm: string | null;
          ncm_origem: string | null;
          nome: string;
          organization_id: string;
          origem: string;
          preco_cents: number;
          preco_promocional_cents: number | null;
          promocao_ate: string | null;
          quantidade: number;
          unidade: string | null;
          updated_at: string;
        };
        Insert: {
          ativo?: boolean;
          categoria?: string | null;
          categoria_id?: string | null;
          cfop?: string | null;
          codigo: string;
          comissao_pct?: number | null;
          controla_estoque?: boolean;
          created_at?: string;
          custo_cents?: number | null;
          descricao?: string | null;
          destaque?: boolean;
          estoque_minimo?: number;
          id?: string;
          imagem_url?: string | null;
          marca?: string | null;
          moeda?: string;
          ncm?: string | null;
          ncm_origem?: string | null;
          nome: string;
          organization_id: string;
          origem?: string;
          preco_cents: number;
          preco_promocional_cents?: number | null;
          promocao_ate?: string | null;
          quantidade?: number;
          unidade?: string | null;
          updated_at?: string;
        };
        Update: {
          ativo?: boolean;
          categoria?: string | null;
          categoria_id?: string | null;
          cfop?: string | null;
          codigo?: string;
          comissao_pct?: number | null;
          controla_estoque?: boolean;
          created_at?: string;
          custo_cents?: number | null;
          descricao?: string | null;
          destaque?: boolean;
          estoque_minimo?: number;
          id?: string;
          imagem_url?: string | null;
          marca?: string | null;
          moeda?: string;
          ncm?: string | null;
          ncm_origem?: string | null;
          nome?: string;
          organization_id?: string;
          origem?: string;
          preco_cents?: number;
          preco_promocional_cents?: number | null;
          promocao_ate?: string | null;
          quantidade?: number;
          unidade?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "catalog_products_categoria_id_fkey";
            columns: ["categoria_id"];
            isOneToOne: false;
            referencedRelation: "product_categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "catalog_products_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      channel_knobs: {
        Row: {
          allow_sunday: boolean | null;
          channel_session_id: string;
          created_at: string;
          health_knobs: Json | null;
          jitter_max_ms: number | null;
          number_activated_at: string;
          organization_id: string;
          spinning_knobs: Json | null;
          throttle_ms: number | null;
          timezone: string | null;
          updated_at: string;
          warmup_daily_caps: Json | null;
          window_end_hour: number | null;
          window_start_hour: number | null;
        };
        Insert: {
          allow_sunday?: boolean | null;
          channel_session_id: string;
          created_at?: string;
          health_knobs?: Json | null;
          jitter_max_ms?: number | null;
          number_activated_at?: string;
          organization_id: string;
          spinning_knobs?: Json | null;
          throttle_ms?: number | null;
          timezone?: string | null;
          updated_at?: string;
          warmup_daily_caps?: Json | null;
          window_end_hour?: number | null;
          window_start_hour?: number | null;
        };
        Update: {
          allow_sunday?: boolean | null;
          channel_session_id?: string;
          created_at?: string;
          health_knobs?: Json | null;
          jitter_max_ms?: number | null;
          number_activated_at?: string;
          organization_id?: string;
          spinning_knobs?: Json | null;
          throttle_ms?: number | null;
          timezone?: string | null;
          updated_at?: string;
          warmup_daily_caps?: Json | null;
          window_end_hour?: number | null;
          window_start_hour?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "channel_knobs_channel_session_id_fkey";
            columns: ["channel_session_id"];
            isOneToOne: false;
            referencedRelation: "channel_sessions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "channel_knobs_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      channel_session_health: {
        Row: {
          channel_session_id: string;
          escalated_status: string | null;
          health_held_at: string | null;
          health_hold_active: boolean;
          health_hold_reason: string | null;
          health_released_at: string | null;
          id: string;
          organization_id: string;
          status: string;
          status_changed_at: string;
          updated_at: string;
        };
        Insert: {
          channel_session_id: string;
          escalated_status?: string | null;
          health_held_at?: string | null;
          health_hold_active?: boolean;
          health_hold_reason?: string | null;
          health_released_at?: string | null;
          id?: string;
          organization_id: string;
          status: string;
          status_changed_at?: string;
          updated_at?: string;
        };
        Update: {
          channel_session_id?: string;
          escalated_status?: string | null;
          health_held_at?: string | null;
          health_hold_active?: boolean;
          health_hold_reason?: string | null;
          health_released_at?: string | null;
          id?: string;
          organization_id?: string;
          status?: string;
          status_changed_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "channel_session_health_channel_session_id_fkey";
            columns: ["channel_session_id"];
            isOneToOne: false;
            referencedRelation: "channel_sessions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "channel_session_health_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      channel_session_warmup: {
        Row: {
          channel_session_id: string;
          day: string;
          id: string;
          messages_received: number;
          messages_sent: number;
          organization_id: string;
          unique_contacts: number;
        };
        Insert: {
          channel_session_id: string;
          day: string;
          id?: string;
          messages_received?: number;
          messages_sent?: number;
          organization_id: string;
          unique_contacts?: number;
        };
        Update: {
          channel_session_id?: string;
          day?: string;
          id?: string;
          messages_received?: number;
          messages_sent?: number;
          organization_id?: string;
          unique_contacts?: number;
        };
        Relationships: [
          {
            foreignKeyName: "channel_session_warmup_channel_session_id_fkey";
            columns: ["channel_session_id"];
            isOneToOne: false;
            referencedRelation: "channel_sessions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "channel_session_warmup_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      channel_sessions: {
        Row: {
          archived_at: string | null;
          consecutive_health_fails: number;
          created_at: string;
          created_by: string | null;
          daily_message_limit: number;
          display_name: string | null;
          engine: string;
          id: string;
          is_warmup_complete: boolean | null;
          last_health_check_at: string | null;
          last_status_change_at: string;
          meta_phone_number_id: string | null;
          meta_token_encrypted: string | null;
          meta_waba_id: string | null;
          metadata: NonNullable<Json>;
          organization_id: string;
          phone_number: string | null;
          provider: string;
          status: string;
          status_reason: string | null;
          updated_at: string;
          waha_session_name: string | null;
          warmup_completed_at: string | null;
          warmup_started_at: string | null;
          webhook_path_token: string;
          webhook_secret_encrypted: string;
          zernio_account_id: string | null;
          zernio_token_encrypted: string | null;
        };
        Insert: {
          archived_at?: string | null;
          consecutive_health_fails?: number;
          created_at?: string;
          created_by?: string | null;
          daily_message_limit?: number;
          display_name?: string | null;
          engine?: string;
          id?: string;
          is_warmup_complete?: never;
          last_health_check_at?: string | null;
          last_status_change_at?: string;
          meta_phone_number_id?: string | null;
          meta_token_encrypted?: string | null;
          meta_waba_id?: string | null;
          metadata?: NonNullable<Json>;
          organization_id: string;
          phone_number?: string | null;
          provider?: string;
          status?: string;
          status_reason?: string | null;
          updated_at?: string;
          waha_session_name?: string | null;
          warmup_completed_at?: string | null;
          warmup_started_at?: string | null;
          webhook_path_token?: string;
          webhook_secret_encrypted: string;
          zernio_account_id?: string | null;
          zernio_token_encrypted?: string | null;
        };
        Update: {
          archived_at?: string | null;
          consecutive_health_fails?: number;
          created_at?: string;
          created_by?: string | null;
          daily_message_limit?: number;
          display_name?: string | null;
          engine?: string;
          id?: string;
          is_warmup_complete?: never;
          last_health_check_at?: string | null;
          last_status_change_at?: string;
          meta_phone_number_id?: string | null;
          meta_token_encrypted?: string | null;
          meta_waba_id?: string | null;
          metadata?: NonNullable<Json>;
          organization_id?: string;
          phone_number?: string | null;
          provider?: string;
          status?: string;
          status_reason?: string | null;
          updated_at?: string;
          waha_session_name?: string | null;
          warmup_completed_at?: string | null;
          warmup_started_at?: string | null;
          webhook_path_token?: string;
          webhook_secret_encrypted?: string;
          zernio_account_id?: string | null;
          zernio_token_encrypted?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "channel_sessions_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      commercial_activities: {
        Row: {
          contact_id: string | null;
          created_at: string;
          id: string;
          observacao: string | null;
          ocorrida_em: string;
          organization_id: string;
          resultado: string | null;
          tipo: string;
          user_id: string | null;
        };
        Insert: {
          contact_id?: string | null;
          created_at?: string;
          id?: string;
          observacao?: string | null;
          ocorrida_em?: string;
          organization_id: string;
          resultado?: string | null;
          tipo?: string;
          user_id?: string | null;
        };
        Update: {
          contact_id?: string | null;
          created_at?: string;
          id?: string;
          observacao?: string | null;
          ocorrida_em?: string;
          organization_id?: string;
          resultado?: string | null;
          tipo?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "commercial_activities_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "commercial_activities_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      commercial_commission_baixas: {
        Row: {
          baixado_em: string;
          baixado_por: string | null;
          created_at: string;
          id: string;
          observacao: string | null;
          order_id: string;
          organization_id: string;
          valor_cents: number;
          vendedor_user_id: string | null;
        };
        Insert: {
          baixado_em?: string;
          baixado_por?: string | null;
          created_at?: string;
          id?: string;
          observacao?: string | null;
          order_id: string;
          organization_id: string;
          valor_cents: number;
          vendedor_user_id?: string | null;
        };
        Update: {
          baixado_em?: string;
          baixado_por?: string | null;
          created_at?: string;
          id?: string;
          observacao?: string | null;
          order_id?: string;
          organization_id?: string;
          valor_cents?: number;
          vendedor_user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "commercial_commission_baixas_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "commercial_orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "commercial_commission_baixas_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      commercial_goals: {
        Row: {
          ano_mes: string;
          created_at: string;
          id: string;
          organization_id: string;
          updated_at: string;
          valor_cents: number;
          vendedor_user_id: string | null;
        };
        Insert: {
          ano_mes: string;
          created_at?: string;
          id?: string;
          organization_id: string;
          updated_at?: string;
          valor_cents: number;
          vendedor_user_id?: string | null;
        };
        Update: {
          ano_mes?: string;
          created_at?: string;
          id?: string;
          organization_id?: string;
          updated_at?: string;
          valor_cents?: number;
          vendedor_user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "commercial_goals_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      commercial_order_counters: {
        Row: {
          organization_id: string;
          ultimo_numero: number;
          updated_at: string;
        };
        Insert: {
          organization_id: string;
          ultimo_numero?: number;
          updated_at?: string;
        };
        Update: {
          organization_id?: string;
          ultimo_numero?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "commercial_order_counters_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: true;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      commercial_order_items: {
        Row: {
          created_at: string;
          desconto_pct: number;
          id: string;
          order_id: string;
          organization_id: string;
          posicao: number;
          preco_unit_cents: number;
          product_id: string | null;
          produto_codigo: string;
          produto_nome: string;
          quantidade: number;
          subtotal_cents: number;
        };
        Insert: {
          created_at?: string;
          desconto_pct?: number;
          id?: string;
          order_id: string;
          organization_id: string;
          posicao?: number;
          preco_unit_cents: number;
          product_id?: string | null;
          produto_codigo: string;
          produto_nome: string;
          quantidade: number;
          subtotal_cents: number;
        };
        Update: {
          created_at?: string;
          desconto_pct?: number;
          id?: string;
          order_id?: string;
          organization_id?: string;
          posicao?: number;
          preco_unit_cents?: number;
          product_id?: string | null;
          produto_codigo?: string;
          produto_nome?: string;
          quantidade?: number;
          subtotal_cents?: number;
        };
        Relationships: [
          {
            foreignKeyName: "commercial_order_items_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "commercial_orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "commercial_order_items_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "commercial_order_items_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "catalog_products";
            referencedColumns: ["id"];
          },
        ];
      };
      commercial_orders: {
        Row: {
          cliente_documento: string | null;
          cliente_nome: string;
          condicao_pagamento: string | null;
          contact_id: string | null;
          created_at: string;
          created_by: string | null;
          desconto_cents: number;
          desconto_pct: number | null;
          endereco_entrega: string | null;
          frete_cents: number;
          id: string;
          modalidade_frete: string;
          moeda: string;
          numero: number;
          obs_interna: string | null;
          observacoes: string | null;
          organization_id: string;
          origem: string;
          parcelas: NonNullable<Json>;
          previsao_entrega: string | null;
          price_table_id: string | null;
          status: string;
          subtotal_cents: number;
          total_cents: number;
          transportadora_nome: string | null;
          updated_at: string;
          vendedor_user_id: string | null;
        };
        Insert: {
          cliente_documento?: string | null;
          cliente_nome: string;
          condicao_pagamento?: string | null;
          contact_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          desconto_cents?: number;
          desconto_pct?: number | null;
          endereco_entrega?: string | null;
          frete_cents?: number;
          id?: string;
          modalidade_frete?: string;
          moeda?: string;
          numero: number;
          obs_interna?: string | null;
          observacoes?: string | null;
          organization_id: string;
          origem?: string;
          parcelas?: NonNullable<Json>;
          previsao_entrega?: string | null;
          price_table_id?: string | null;
          status?: string;
          subtotal_cents?: number;
          total_cents?: number;
          transportadora_nome?: string | null;
          updated_at?: string;
          vendedor_user_id?: string | null;
        };
        Update: {
          cliente_documento?: string | null;
          cliente_nome?: string;
          condicao_pagamento?: string | null;
          contact_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          desconto_cents?: number;
          desconto_pct?: number | null;
          endereco_entrega?: string | null;
          frete_cents?: number;
          id?: string;
          modalidade_frete?: string;
          moeda?: string;
          numero?: number;
          obs_interna?: string | null;
          observacoes?: string | null;
          organization_id?: string;
          origem?: string;
          parcelas?: NonNullable<Json>;
          previsao_entrega?: string | null;
          price_table_id?: string | null;
          status?: string;
          subtotal_cents?: number;
          total_cents?: number;
          transportadora_nome?: string | null;
          updated_at?: string;
          vendedor_user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "commercial_orders_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "commercial_orders_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "commercial_orders_price_table_id_fkey";
            columns: ["price_table_id"];
            isOneToOne: false;
            referencedRelation: "price_tables";
            referencedColumns: ["id"];
          },
        ];
      };
      commercial_policies: {
        Row: {
          comissao_padrao_pct: number | null;
          created_at: string;
          desconto_max_vendedor_pct: number;
          organization_id: string;
          permite_estoque_negativo: boolean;
          updated_at: string;
        };
        Insert: {
          comissao_padrao_pct?: number | null;
          created_at?: string;
          desconto_max_vendedor_pct?: number;
          organization_id: string;
          permite_estoque_negativo?: boolean;
          updated_at?: string;
        };
        Update: {
          comissao_padrao_pct?: number | null;
          created_at?: string;
          desconto_max_vendedor_pct?: number;
          organization_id?: string;
          permite_estoque_negativo?: boolean;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "commercial_policies_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: true;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      commercial_shipment_counters: {
        Row: {
          organization_id: string;
          ultimo_numero: number;
          updated_at: string;
        };
        Insert: {
          organization_id: string;
          ultimo_numero?: number;
          updated_at?: string;
        };
        Update: {
          organization_id?: string;
          ultimo_numero?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "commercial_shipment_counters_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: true;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      commercial_tasks: {
        Row: {
          agendada_para: string | null;
          checkin_em: string | null;
          checkin_lat: number | null;
          checkin_lng: number | null;
          concluida_em: string | null;
          contact_id: string | null;
          created_at: string;
          created_by: string | null;
          descricao: string | null;
          id: string;
          organization_id: string;
          prospect_id: string | null;
          responsavel_user_id: string | null;
          status: string;
          tipo: string;
          titulo: string;
          updated_at: string;
        };
        Insert: {
          agendada_para?: string | null;
          checkin_em?: string | null;
          checkin_lat?: number | null;
          checkin_lng?: number | null;
          concluida_em?: string | null;
          contact_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          descricao?: string | null;
          id?: string;
          organization_id: string;
          prospect_id?: string | null;
          responsavel_user_id?: string | null;
          status?: string;
          tipo?: string;
          titulo: string;
          updated_at?: string;
        };
        Update: {
          agendada_para?: string | null;
          checkin_em?: string | null;
          checkin_lat?: number | null;
          checkin_lng?: number | null;
          concluida_em?: string | null;
          contact_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          descricao?: string | null;
          id?: string;
          organization_id?: string;
          prospect_id?: string | null;
          responsavel_user_id?: string | null;
          status?: string;
          tipo?: string;
          titulo?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "commercial_tasks_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "commercial_tasks_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "commercial_tasks_prospect_id_fkey";
            columns: ["prospect_id"];
            isOneToOne: false;
            referencedRelation: "business_prospects";
            referencedColumns: ["id"];
          },
        ];
      };
      commercial_titulo_baixas: {
        Row: {
          baixado_em: string;
          baixado_por: string | null;
          created_at: string;
          id: string;
          observacao: string | null;
          order_id: string;
          organization_id: string;
          parcela_n: number;
          valor_cents: number;
        };
        Insert: {
          baixado_em?: string;
          baixado_por?: string | null;
          created_at?: string;
          id?: string;
          observacao?: string | null;
          order_id: string;
          organization_id: string;
          parcela_n: number;
          valor_cents: number;
        };
        Update: {
          baixado_em?: string;
          baixado_por?: string | null;
          created_at?: string;
          id?: string;
          observacao?: string | null;
          order_id?: string;
          organization_id?: string;
          parcela_n?: number;
          valor_cents?: number;
        };
        Relationships: [
          {
            foreignKeyName: "commercial_titulo_baixas_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "commercial_orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "commercial_titulo_baixas_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      contact_field_proposals: {
        Row: {
          campo: string;
          contact_id: string;
          conversation_id: string | null;
          decided_at: string | null;
          decided_by_user_id: string | null;
          expires_at: string;
          id: string;
          message_id: string | null;
          motivo_recusa: string | null;
          organization_id: string;
          proposed_at: string;
          proposed_by_agent_id: string | null;
          status: string;
          trecho: string | null;
          updated_at: string;
          valor_anterior: string | null;
          valor_proposto: string;
        };
        Insert: {
          campo: string;
          contact_id: string;
          conversation_id?: string | null;
          decided_at?: string | null;
          decided_by_user_id?: string | null;
          expires_at: string;
          id?: string;
          message_id?: string | null;
          motivo_recusa?: string | null;
          organization_id: string;
          proposed_at?: string;
          proposed_by_agent_id?: string | null;
          status?: string;
          trecho?: string | null;
          updated_at?: string;
          valor_anterior?: string | null;
          valor_proposto: string;
        };
        Update: {
          campo?: string;
          contact_id?: string;
          conversation_id?: string | null;
          decided_at?: string | null;
          decided_by_user_id?: string | null;
          expires_at?: string;
          id?: string;
          message_id?: string | null;
          motivo_recusa?: string | null;
          organization_id?: string;
          proposed_at?: string;
          proposed_by_agent_id?: string | null;
          status?: string;
          trecho?: string | null;
          updated_at?: string;
          valor_anterior?: string | null;
          valor_proposto?: string;
        };
        Relationships: [
          {
            foreignKeyName: "contact_field_proposals_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "contact_field_proposals_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "contact_field_proposals_message_id_fkey";
            columns: ["message_id"];
            isOneToOne: false;
            referencedRelation: "messages";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "contact_field_proposals_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "contact_field_proposals_proposed_by_agent_id_fkey";
            columns: ["proposed_by_agent_id"];
            isOneToOne: false;
            referencedRelation: "ai_agents";
            referencedColumns: ["id"];
          },
        ];
      };
      contacts: {
        Row: {
          anonymized_at: string | null;
          avatar_storage_path: string | null;
          avatar_updated_at: string | null;
          bairro: string | null;
          birthdate: string | null;
          blocked_at: string | null;
          blocked_reason: string | null;
          cep: string | null;
          cidade: string | null;
          cnpj: string | null;
          complemento: string | null;
          condicao_pagamento: string | null;
          consent: NonNullable<Json>;
          cpf_encrypted: string | null;
          cpf_hash: string | null;
          created_at: string;
          created_by_user_id: string | null;
          display_name: string | null;
          email: string | null;
          email_normalized: string | null;
          fantasia: string | null;
          force_human: boolean;
          geo_em: string | null;
          geo_fonte: string | null;
          geo_status: string;
          id: string;
          ie: string | null;
          is_anonymized: boolean;
          is_blocked: boolean;
          is_merged_into: string | null;
          last_activity_at: string | null;
          latitude: number | null;
          limite_credito_cents: number | null;
          locale: string | null;
          logradouro: string | null;
          longitude: number | null;
          merged_at: string | null;
          name: string | null;
          numero_end: string | null;
          organization_id: string;
          phone_lookup_at: string | null;
          phone_number: string | null;
          regime: string | null;
          source: string;
          source_metadata: NonNullable<Json>;
          tags: string[];
          tipo_pessoa: string | null;
          uf: string | null;
          updated_at: string;
          wa_identity: string | null;
          wa_lid: string | null;
        };
        Insert: {
          anonymized_at?: string | null;
          avatar_storage_path?: string | null;
          avatar_updated_at?: string | null;
          bairro?: string | null;
          birthdate?: string | null;
          blocked_at?: string | null;
          blocked_reason?: string | null;
          cep?: string | null;
          cidade?: string | null;
          cnpj?: string | null;
          complemento?: string | null;
          condicao_pagamento?: string | null;
          consent?: NonNullable<Json>;
          cpf_encrypted?: string | null;
          cpf_hash?: string | null;
          created_at?: string;
          created_by_user_id?: string | null;
          display_name?: string | null;
          email?: string | null;
          email_normalized?: never;
          fantasia?: string | null;
          force_human?: boolean;
          geo_em?: string | null;
          geo_fonte?: string | null;
          geo_status?: string;
          id?: string;
          ie?: string | null;
          is_anonymized?: boolean;
          is_blocked?: boolean;
          is_merged_into?: string | null;
          last_activity_at?: string | null;
          latitude?: number | null;
          limite_credito_cents?: number | null;
          locale?: string | null;
          logradouro?: string | null;
          longitude?: number | null;
          merged_at?: string | null;
          name?: string | null;
          numero_end?: string | null;
          organization_id: string;
          phone_lookup_at?: string | null;
          phone_number?: string | null;
          regime?: string | null;
          source?: string;
          source_metadata?: NonNullable<Json>;
          tags?: string[];
          tipo_pessoa?: string | null;
          uf?: string | null;
          updated_at?: string;
          wa_identity?: never;
          wa_lid?: never;
        };
        Update: {
          anonymized_at?: string | null;
          avatar_storage_path?: string | null;
          avatar_updated_at?: string | null;
          bairro?: string | null;
          birthdate?: string | null;
          blocked_at?: string | null;
          blocked_reason?: string | null;
          cep?: string | null;
          cidade?: string | null;
          cnpj?: string | null;
          complemento?: string | null;
          condicao_pagamento?: string | null;
          consent?: NonNullable<Json>;
          cpf_encrypted?: string | null;
          cpf_hash?: string | null;
          created_at?: string;
          created_by_user_id?: string | null;
          display_name?: string | null;
          email?: string | null;
          email_normalized?: never;
          fantasia?: string | null;
          force_human?: boolean;
          geo_em?: string | null;
          geo_fonte?: string | null;
          geo_status?: string;
          id?: string;
          ie?: string | null;
          is_anonymized?: boolean;
          is_blocked?: boolean;
          is_merged_into?: string | null;
          last_activity_at?: string | null;
          latitude?: number | null;
          limite_credito_cents?: number | null;
          locale?: string | null;
          logradouro?: string | null;
          longitude?: number | null;
          merged_at?: string | null;
          name?: string | null;
          numero_end?: string | null;
          organization_id?: string;
          phone_lookup_at?: string | null;
          phone_number?: string | null;
          regime?: string | null;
          source?: string;
          source_metadata?: NonNullable<Json>;
          tags?: string[];
          tipo_pessoa?: string | null;
          uf?: string | null;
          updated_at?: string;
          wa_identity?: never;
          wa_lid?: never;
        };
        Relationships: [
          {
            foreignKeyName: "contacts_is_merged_into_fkey";
            columns: ["is_merged_into"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "contacts_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      conversation_assignment_events: {
        Row: {
          changed_by: string | null;
          conversation_id: string;
          created_at: string;
          from_user_id: string | null;
          id: string;
          organization_id: string;
          reason: string;
          to_user_id: string | null;
        };
        Insert: {
          changed_by?: string | null;
          conversation_id: string;
          created_at?: string;
          from_user_id?: string | null;
          id?: string;
          organization_id: string;
          reason: string;
          to_user_id?: string | null;
        };
        Update: {
          changed_by?: string | null;
          conversation_id?: string;
          created_at?: string;
          from_user_id?: string | null;
          id?: string;
          organization_id?: string;
          reason?: string;
          to_user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "conversation_assignment_events_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conversation_assignment_events_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      conversation_notes: {
        Row: {
          body: string;
          conversation_id: string;
          created_at: string;
          created_by_name: string | null;
          created_by_user_id: string | null;
          id: string;
          organization_id: string;
        };
        Insert: {
          body: string;
          conversation_id: string;
          created_at?: string;
          created_by_name?: string | null;
          created_by_user_id?: string | null;
          id?: string;
          organization_id: string;
        };
        Update: {
          body?: string;
          conversation_id?: string;
          created_at?: string;
          created_by_name?: string | null;
          created_by_user_id?: string | null;
          id?: string;
          organization_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "conversation_notes_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conversation_notes_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      conversations: {
        Row: {
          active_agent_set_at: string | null;
          active_ai_agent_id: string | null;
          active_intent: string | null;
          assigned_at: string | null;
          assigned_to_user_id: string | null;
          assigned_to_user_name: string | null;
          assignee_kind: string | null;
          bot_silenced_until: string | null;
          channel: string;
          channel_session_id: string;
          contact_id: string;
          created_at: string;
          group_chat_id: string | null;
          id: string;
          is_group: boolean;
          last_handoff_at: string | null;
          last_handoff_reason: string | null;
          last_inbound_at: string | null;
          last_message_at: string | null;
          last_message_preview: string | null;
          last_outbound_at: string | null;
          metadata: NonNullable<Json>;
          organization_id: string;
          provider_conversation_id: string | null;
          rag_review_status: string | null;
          snooze_until: string | null;
          snoozed_at: string | null;
          snoozed_by_user_id: string | null;
          status: string;
          status_changed_at: string;
          tags: string[];
          unread_count_for_assignee: number;
          updated_at: string;
          usable_for_rag: boolean;
          usable_for_rag_marked_at: string | null;
          usable_for_rag_marked_by: string | null;
          comando_da_conversa: string | null;
        };
        Insert: {
          active_agent_set_at?: string | null;
          active_ai_agent_id?: string | null;
          active_intent?: string | null;
          assigned_at?: string | null;
          assigned_to_user_id?: string | null;
          assigned_to_user_name?: string | null;
          assignee_kind?: string | null;
          bot_silenced_until?: string | null;
          channel?: string;
          channel_session_id: string;
          contact_id: string;
          created_at?: string;
          group_chat_id?: string | null;
          id?: string;
          is_group?: boolean;
          last_handoff_at?: string | null;
          last_handoff_reason?: string | null;
          last_inbound_at?: string | null;
          last_message_at?: string | null;
          last_message_preview?: string | null;
          last_outbound_at?: string | null;
          metadata?: NonNullable<Json>;
          organization_id: string;
          provider_conversation_id?: string | null;
          rag_review_status?: string | null;
          snooze_until?: string | null;
          snoozed_at?: string | null;
          snoozed_by_user_id?: string | null;
          status?: string;
          status_changed_at?: string;
          tags?: string[];
          unread_count_for_assignee?: number;
          updated_at?: string;
          usable_for_rag?: boolean;
          usable_for_rag_marked_at?: string | null;
          usable_for_rag_marked_by?: string | null;
        };
        Update: {
          active_agent_set_at?: string | null;
          active_ai_agent_id?: string | null;
          active_intent?: string | null;
          assigned_at?: string | null;
          assigned_to_user_id?: string | null;
          assigned_to_user_name?: string | null;
          assignee_kind?: string | null;
          bot_silenced_until?: string | null;
          channel?: string;
          channel_session_id?: string;
          contact_id?: string;
          created_at?: string;
          group_chat_id?: string | null;
          id?: string;
          is_group?: boolean;
          last_handoff_at?: string | null;
          last_handoff_reason?: string | null;
          last_inbound_at?: string | null;
          last_message_at?: string | null;
          last_message_preview?: string | null;
          last_outbound_at?: string | null;
          metadata?: NonNullable<Json>;
          organization_id?: string;
          provider_conversation_id?: string | null;
          rag_review_status?: string | null;
          snooze_until?: string | null;
          snoozed_at?: string | null;
          snoozed_by_user_id?: string | null;
          status?: string;
          status_changed_at?: string;
          tags?: string[];
          unread_count_for_assignee?: number;
          updated_at?: string;
          usable_for_rag?: boolean;
          usable_for_rag_marked_at?: string | null;
          usable_for_rag_marked_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "conversations_active_ai_agent_id_fkey";
            columns: ["active_ai_agent_id"];
            isOneToOne: false;
            referencedRelation: "ai_agents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conversations_channel_session_id_fkey";
            columns: ["channel_session_id"];
            isOneToOne: false;
            referencedRelation: "channel_sessions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conversations_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conversations_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      crm_lead_activities: {
        Row: {
          actor_agent_id: string | null;
          actor_kind: string | null;
          contact_id: string | null;
          created_at: string;
          evidence: Json | null;
          id: string;
          lead_id: string;
          metadata: NonNullable<Json>;
          organization_id: string;
          payload: NonNullable<Json>;
          performed_at: string;
          performed_by_user_id: string | null;
          reason: string | null;
          source_id: string | null;
          source_module: string;
          type: string;
        };
        Insert: {
          actor_agent_id?: string | null;
          actor_kind?: string | null;
          contact_id?: string | null;
          created_at?: string;
          evidence?: Json | null;
          id?: string;
          lead_id: string;
          metadata?: NonNullable<Json>;
          organization_id: string;
          payload?: NonNullable<Json>;
          performed_at?: string;
          performed_by_user_id?: string | null;
          reason?: string | null;
          source_id?: string | null;
          source_module: string;
          type: string;
        };
        Update: {
          actor_agent_id?: string | null;
          actor_kind?: string | null;
          contact_id?: string | null;
          created_at?: string;
          evidence?: Json | null;
          id?: string;
          lead_id?: string;
          metadata?: NonNullable<Json>;
          organization_id?: string;
          payload?: NonNullable<Json>;
          performed_at?: string;
          performed_by_user_id?: string | null;
          reason?: string | null;
          source_id?: string | null;
          source_module?: string;
          type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "crm_lead_activities_actor_agent_id_fkey";
            columns: ["actor_agent_id"];
            isOneToOne: false;
            referencedRelation: "ai_agents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "crm_lead_activities_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "crm_lead_activities_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: false;
            referencedRelation: "crm_leads";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "crm_lead_activities_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      crm_lead_links: {
        Row: {
          created_at: string;
          created_by_user_id: string | null;
          id: string;
          lead_id: string;
          link_kind: string;
          metadata: NonNullable<Json>;
          organization_id: string;
          target_id: string;
          target_kind: string;
        };
        Insert: {
          created_at?: string;
          created_by_user_id?: string | null;
          id?: string;
          lead_id: string;
          link_kind: string;
          metadata?: NonNullable<Json>;
          organization_id: string;
          target_id: string;
          target_kind: string;
        };
        Update: {
          created_at?: string;
          created_by_user_id?: string | null;
          id?: string;
          lead_id?: string;
          link_kind?: string;
          metadata?: NonNullable<Json>;
          organization_id?: string;
          target_id?: string;
          target_kind?: string;
        };
        Relationships: [
          {
            foreignKeyName: "crm_lead_links_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: false;
            referencedRelation: "crm_leads";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "crm_lead_links_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      crm_lead_reactivations: {
        Row: {
          decided_at: string | null;
          decided_by_user_id: string | null;
          draft: string | null;
          expires_at: string;
          id: string;
          lead_id: string;
          organization_id: string;
          proposed_at: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          decided_at?: string | null;
          decided_by_user_id?: string | null;
          draft?: string | null;
          expires_at: string;
          id?: string;
          lead_id: string;
          organization_id: string;
          proposed_at?: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          decided_at?: string | null;
          decided_by_user_id?: string | null;
          draft?: string | null;
          expires_at?: string;
          id?: string;
          lead_id?: string;
          organization_id?: string;
          proposed_at?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "crm_lead_reactivations_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: false;
            referencedRelation: "crm_leads";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "crm_lead_reactivations_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      crm_lead_risk_decisions: {
        Row: {
          acao: string;
          confianca: number | null;
          decidido_em: string;
          lead_id: string;
          modelo: string | null;
          organization_id: string;
        };
        Insert: {
          acao: string;
          confianca?: number | null;
          decidido_em?: string;
          lead_id: string;
          modelo?: string | null;
          organization_id: string;
        };
        Update: {
          acao?: string;
          confianca?: number | null;
          decidido_em?: string;
          lead_id?: string;
          modelo?: string | null;
          organization_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "crm_lead_risk_decisions_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: true;
            referencedRelation: "crm_leads";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "crm_lead_risk_decisions_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      crm_lead_risk_states: {
        Row: {
          bucket: string;
          cold_hours: number;
          detected_at: string;
          lead_id: string;
          organization_id: string;
          since: string;
          updated_at: string;
        };
        Insert: {
          bucket: string;
          cold_hours: number;
          detected_at?: string;
          lead_id: string;
          organization_id: string;
          since: string;
          updated_at?: string;
        };
        Update: {
          bucket?: string;
          cold_hours?: number;
          detected_at?: string;
          lead_id?: string;
          organization_id?: string;
          since?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "crm_lead_risk_states_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: true;
            referencedRelation: "crm_leads";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "crm_lead_risk_states_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      crm_lead_scores: {
        Row: {
          ai_probability: number | null;
          ai_probability_at: string | null;
          ai_probability_band: string | null;
          ai_probability_band_since: string | null;
          ai_probability_evidence: NonNullable<Json>;
          ai_probability_reason: string | null;
          lead_id: string;
          organization_id: string;
          updated_at: string;
        };
        Insert: {
          ai_probability?: number | null;
          ai_probability_at?: string | null;
          ai_probability_band?: string | null;
          ai_probability_band_since?: string | null;
          ai_probability_evidence?: NonNullable<Json>;
          ai_probability_reason?: string | null;
          lead_id: string;
          organization_id: string;
          updated_at?: string;
        };
        Update: {
          ai_probability?: number | null;
          ai_probability_at?: string | null;
          ai_probability_band?: string | null;
          ai_probability_band_since?: string | null;
          ai_probability_evidence?: NonNullable<Json>;
          ai_probability_reason?: string | null;
          lead_id?: string;
          organization_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "crm_lead_scores_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: true;
            referencedRelation: "crm_leads";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "crm_lead_scores_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      crm_leads: {
        Row: {
          assigned_at: string | null;
          closed_at: string | null;
          contact_id: string | null;
          created_at: string;
          created_by_user_id: string | null;
          currency: string | null;
          custom_fields: NonNullable<Json>;
          description: string | null;
          expected_close_date: string | null;
          external_id: string | null;
          id: string;
          last_activity_at: string | null;
          lost_reason: string | null;
          organization_id: string;
          owner_agent_id: string | null;
          owner_kind: string | null;
          owner_user_id: string | null;
          pipeline_id: string;
          position_in_stage: number;
          source: string;
          source_metadata: NonNullable<Json>;
          stage_changed_at: string | null;
          stage_id: string;
          status: string;
          tags: string[];
          title: string;
          updated_at: string;
          value_cents: number | null;
        };
        Insert: {
          assigned_at?: string | null;
          closed_at?: string | null;
          contact_id?: string | null;
          created_at?: string;
          created_by_user_id?: string | null;
          currency?: string | null;
          custom_fields?: NonNullable<Json>;
          description?: string | null;
          expected_close_date?: string | null;
          external_id?: string | null;
          id?: string;
          last_activity_at?: string | null;
          lost_reason?: string | null;
          organization_id: string;
          owner_agent_id?: string | null;
          owner_kind?: string | null;
          owner_user_id?: string | null;
          pipeline_id: string;
          position_in_stage?: number;
          source?: string;
          source_metadata?: NonNullable<Json>;
          stage_changed_at?: string | null;
          stage_id: string;
          status?: string;
          tags?: string[];
          title: string;
          updated_at?: string;
          value_cents?: number | null;
        };
        Update: {
          assigned_at?: string | null;
          closed_at?: string | null;
          contact_id?: string | null;
          created_at?: string;
          created_by_user_id?: string | null;
          currency?: string | null;
          custom_fields?: NonNullable<Json>;
          description?: string | null;
          expected_close_date?: string | null;
          external_id?: string | null;
          id?: string;
          last_activity_at?: string | null;
          lost_reason?: string | null;
          organization_id?: string;
          owner_agent_id?: string | null;
          owner_kind?: string | null;
          owner_user_id?: string | null;
          pipeline_id?: string;
          position_in_stage?: number;
          source?: string;
          source_metadata?: NonNullable<Json>;
          stage_changed_at?: string | null;
          stage_id?: string;
          status?: string;
          tags?: string[];
          title?: string;
          updated_at?: string;
          value_cents?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "crm_leads_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "crm_leads_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "crm_leads_owner_agent_id_fkey";
            columns: ["owner_agent_id"];
            isOneToOne: false;
            referencedRelation: "ai_agents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "crm_leads_pipeline_id_fkey";
            columns: ["pipeline_id"];
            isOneToOne: false;
            referencedRelation: "crm_pipelines";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "crm_leads_stage_id_fkey";
            columns: ["stage_id"];
            isOneToOne: false;
            referencedRelation: "crm_stages";
            referencedColumns: ["id"];
          },
        ];
      };
      crm_pipelines: {
        Row: {
          created_at: string;
          description: string | null;
          id: string;
          is_archived: boolean;
          is_default: boolean;
          name: string;
          organization_id: string;
          position: number;
          settings: NonNullable<Json>;
          slug: string;
          updated_at: string;
          vocabulary: NonNullable<Json>;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          id?: string;
          is_archived?: boolean;
          is_default?: boolean;
          name: string;
          organization_id: string;
          position?: number;
          settings?: NonNullable<Json>;
          slug: string;
          updated_at?: string;
          vocabulary?: NonNullable<Json>;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          id?: string;
          is_archived?: boolean;
          is_default?: boolean;
          name?: string;
          organization_id?: string;
          position?: number;
          settings?: NonNullable<Json>;
          slug?: string;
          updated_at?: string;
          vocabulary?: NonNullable<Json>;
        };
        Relationships: [
          {
            foreignKeyName: "crm_pipelines_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      crm_stages: {
        Row: {
          agent_stage_hint: string | null;
          color: string | null;
          created_at: string;
          description: string | null;
          expected_duration_hours: number | null;
          id: string;
          is_archived: boolean;
          is_lost: boolean;
          is_won: boolean;
          last_change_actor_kind: string | null;
          last_change_at: string | null;
          name: string;
          organization_id: string;
          pipeline_id: string;
          position: number;
          requires_human: boolean;
          slug: string;
          updated_at: string;
        };
        Insert: {
          agent_stage_hint?: string | null;
          color?: string | null;
          created_at?: string;
          description?: string | null;
          expected_duration_hours?: number | null;
          id?: string;
          is_archived?: boolean;
          is_lost?: boolean;
          is_won?: boolean;
          last_change_actor_kind?: string | null;
          last_change_at?: string | null;
          name: string;
          organization_id: string;
          pipeline_id: string;
          position: number;
          requires_human?: boolean;
          slug: string;
          updated_at?: string;
        };
        Update: {
          agent_stage_hint?: string | null;
          color?: string | null;
          created_at?: string;
          description?: string | null;
          expected_duration_hours?: number | null;
          id?: string;
          is_archived?: boolean;
          is_lost?: boolean;
          is_won?: boolean;
          last_change_actor_kind?: string | null;
          last_change_at?: string | null;
          name?: string;
          organization_id?: string;
          pipeline_id?: string;
          position?: number;
          requires_human?: boolean;
          slug?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "crm_stages_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "crm_stages_pipeline_id_fkey";
            columns: ["pipeline_id"];
            isOneToOne: false;
            referencedRelation: "crm_pipelines";
            referencedColumns: ["id"];
          },
        ];
      };
      cron_jobs: {
        Row: {
          attempts: number;
          cancel_reason: string | null;
          cancelled_at: string | null;
          contact_id: string;
          created_at: string;
          cron_expr: string | null;
          enabled: boolean;
          id: string;
          interval_ms: number | null;
          job_kind: string;
          kind: string;
          last_error: string | null;
          max_attempts: number;
          next_run_at: string;
          organization_id: string;
          payload: NonNullable<Json>;
          tz: string;
          updated_at: string;
        };
        Insert: {
          attempts?: number;
          cancel_reason?: string | null;
          cancelled_at?: string | null;
          contact_id: string;
          created_at?: string;
          cron_expr?: string | null;
          enabled?: boolean;
          id?: string;
          interval_ms?: number | null;
          job_kind?: string;
          kind: string;
          last_error?: string | null;
          max_attempts?: number;
          next_run_at: string;
          organization_id: string;
          payload?: NonNullable<Json>;
          tz?: string;
          updated_at?: string;
        };
        Update: {
          attempts?: number;
          cancel_reason?: string | null;
          cancelled_at?: string | null;
          contact_id?: string;
          created_at?: string;
          cron_expr?: string | null;
          enabled?: boolean;
          id?: string;
          interval_ms?: number | null;
          job_kind?: string;
          kind?: string;
          last_error?: string | null;
          max_attempts?: number;
          next_run_at?: string;
          organization_id?: string;
          payload?: NonNullable<Json>;
          tz?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "cron_jobs_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "cron_jobs_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      demanda_conversas: {
        Row: {
          conversation_id: string;
          demanda_id: string;
          organization_id: string;
          vinculada_em: string;
        };
        Insert: {
          conversation_id: string;
          demanda_id: string;
          organization_id: string;
          vinculada_em?: string;
        };
        Update: {
          conversation_id?: string;
          demanda_id?: string;
          organization_id?: string;
          vinculada_em?: string;
        };
        Relationships: [
          {
            foreignKeyName: "demanda_conversas_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "demanda_conversas_demanda_id_fkey";
            columns: ["demanda_id"];
            isOneToOne: false;
            referencedRelation: "demandas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "demanda_conversas_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      demandas: {
        Row: {
          aberta_em: string;
          agent_case_id: string | null;
          assunto: string | null;
          contact_id: string;
          created_at: string;
          desfecho: string | null;
          dono_kind: string;
          dono_user_id: string | null;
          estado: string;
          fechada_em: string | null;
          id: string;
          lead_id: string | null;
          organization_id: string;
          origem: string;
          prazo_em: string | null;
          proximo_passo: string | null;
          proximo_passo_em: string | null;
          updated_at: string;
        };
        Insert: {
          aberta_em?: string;
          agent_case_id?: string | null;
          assunto?: string | null;
          contact_id: string;
          created_at?: string;
          desfecho?: string | null;
          dono_kind?: string;
          dono_user_id?: string | null;
          estado?: string;
          fechada_em?: string | null;
          id?: string;
          lead_id?: string | null;
          organization_id: string;
          origem?: string;
          prazo_em?: string | null;
          proximo_passo?: string | null;
          proximo_passo_em?: string | null;
          updated_at?: string;
        };
        Update: {
          aberta_em?: string;
          agent_case_id?: string | null;
          assunto?: string | null;
          contact_id?: string;
          created_at?: string;
          desfecho?: string | null;
          dono_kind?: string;
          dono_user_id?: string | null;
          estado?: string;
          fechada_em?: string | null;
          id?: string;
          lead_id?: string | null;
          organization_id?: string;
          origem?: string;
          prazo_em?: string | null;
          proximo_passo?: string | null;
          proximo_passo_em?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "demandas_agent_case_id_fkey";
            columns: ["agent_case_id"];
            isOneToOne: false;
            referencedRelation: "agent_cases";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "demandas_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "demandas_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: false;
            referencedRelation: "crm_leads";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "demandas_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      disclosure_template_pointers: {
        Row: {
          organization_id: string;
          updated_at: string;
          version_id: string;
        };
        Insert: {
          organization_id: string;
          updated_at?: string;
          version_id: string;
        };
        Update: {
          organization_id?: string;
          updated_at?: string;
          version_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "disclosure_template_pointers_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "disclosure_template_pointers_version_id_fkey";
            columns: ["version_id"];
            isOneToOne: false;
            referencedRelation: "disclosure_template_versions";
            referencedColumns: ["id"];
          },
        ];
      };
      disclosure_template_versions: {
        Row: {
          body: string;
          created_at: string;
          id: string;
          organization_id: string;
        };
        Insert: {
          body: string;
          created_at?: string;
          id?: string;
          organization_id: string;
        };
        Update: {
          body?: string;
          created_at?: string;
          id?: string;
          organization_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "disclosure_template_versions_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      event_log: {
        Row: {
          attempts: number;
          consumed_by: string[];
          created_at: string;
          entity_id: string | null;
          entity_kind: string;
          event_type: string;
          id: string;
          last_error: string | null;
          metadata: NonNullable<Json>;
          next_attempt_at: string | null;
          organization_id: string;
          payload: NonNullable<Json>;
          status: string;
          updated_at: string;
        };
        Insert: {
          attempts?: number;
          consumed_by?: string[];
          created_at?: string;
          entity_id?: string | null;
          entity_kind: string;
          event_type: string;
          id?: string;
          last_error?: string | null;
          metadata?: NonNullable<Json>;
          next_attempt_at?: string | null;
          organization_id: string;
          payload?: NonNullable<Json>;
          status?: string;
          updated_at?: string;
        };
        Update: {
          attempts?: number;
          consumed_by?: string[];
          created_at?: string;
          entity_id?: string | null;
          entity_kind?: string;
          event_type?: string;
          id?: string;
          last_error?: string | null;
          metadata?: NonNullable<Json>;
          next_attempt_at?: string | null;
          organization_id?: string;
          payload?: NonNullable<Json>;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "event_log_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      financial_pagaveis: {
        Row: {
          contact_id: string | null;
          created_at: string;
          created_by: string | null;
          entrada_id: string | null;
          forma_pagamento: string | null;
          fornecedor_cnpj: string | null;
          fornecedor_nome: string | null;
          id: string;
          observacoes: string | null;
          organization_id: string;
          parcela_n: number;
          status: string;
          total_parcelas: number;
          updated_at: string;
          valor_original_cents: number;
          vencimento: string;
        };
        Insert: {
          contact_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          entrada_id?: string | null;
          forma_pagamento?: string | null;
          fornecedor_cnpj?: string | null;
          fornecedor_nome?: string | null;
          id?: string;
          observacoes?: string | null;
          organization_id: string;
          parcela_n: number;
          status?: string;
          total_parcelas: number;
          updated_at?: string;
          valor_original_cents: number;
          vencimento: string;
        };
        Update: {
          contact_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          entrada_id?: string | null;
          forma_pagamento?: string | null;
          fornecedor_cnpj?: string | null;
          fornecedor_nome?: string | null;
          id?: string;
          observacoes?: string | null;
          organization_id?: string;
          parcela_n?: number;
          status?: string;
          total_parcelas?: number;
          updated_at?: string;
          valor_original_cents?: number;
          vencimento?: string;
        };
        Relationships: [
          {
            foreignKeyName: "financial_pagaveis_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "financial_pagaveis_entrada_id_fkey";
            columns: ["entrada_id"];
            isOneToOne: false;
            referencedRelation: "fiscal_entradas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "financial_pagaveis_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      financial_payments: {
        Row: {
          conta: string | null;
          created_at: string;
          created_by: string | null;
          forma_pagamento: string | null;
          id: string;
          idempotency_key: string | null;
          observacao: string | null;
          organization_id: string;
          pago_em: string;
          receivable_id: string;
          valor_cents: number;
        };
        Insert: {
          conta?: string | null;
          created_at?: string;
          created_by?: string | null;
          forma_pagamento?: string | null;
          id?: string;
          idempotency_key?: string | null;
          observacao?: string | null;
          organization_id: string;
          pago_em?: string;
          receivable_id: string;
          valor_cents: number;
        };
        Update: {
          conta?: string | null;
          created_at?: string;
          created_by?: string | null;
          forma_pagamento?: string | null;
          id?: string;
          idempotency_key?: string | null;
          observacao?: string | null;
          organization_id?: string;
          pago_em?: string;
          receivable_id?: string;
          valor_cents?: number;
        };
        Relationships: [
          {
            foreignKeyName: "financial_payments_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "financial_payments_receivable_id_fkey";
            columns: ["receivable_id"];
            isOneToOne: false;
            referencedRelation: "financial_receivables";
            referencedColumns: ["id"];
          },
        ];
      };
      financial_receivables: {
        Row: {
          contact_id: string | null;
          created_at: string;
          created_by: string | null;
          forma_pagamento: string | null;
          id: string;
          invoice_id: string | null;
          observacoes: string | null;
          order_id: string | null;
          organization_id: string;
          parcela_n: number;
          status: string;
          total_parcelas: number;
          updated_at: string;
          valor_original_cents: number;
          vencimento: string;
        };
        Insert: {
          contact_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          forma_pagamento?: string | null;
          id?: string;
          invoice_id?: string | null;
          observacoes?: string | null;
          order_id?: string | null;
          organization_id: string;
          parcela_n: number;
          status?: string;
          total_parcelas: number;
          updated_at?: string;
          valor_original_cents: number;
          vencimento: string;
        };
        Update: {
          contact_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          forma_pagamento?: string | null;
          id?: string;
          invoice_id?: string | null;
          observacoes?: string | null;
          order_id?: string | null;
          organization_id?: string;
          parcela_n?: number;
          status?: string;
          total_parcelas?: number;
          updated_at?: string;
          valor_original_cents?: number;
          vencimento?: string;
        };
        Relationships: [
          {
            foreignKeyName: "financial_receivables_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "financial_receivables_invoice_id_fkey";
            columns: ["invoice_id"];
            isOneToOne: false;
            referencedRelation: "invoices";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "financial_receivables_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "commercial_orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "financial_receivables_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      fiscal_cfop_equivalentes: {
        Row: {
          cfop_destino: string;
          cfop_origem: string;
          created_at: string;
          created_by: string | null;
          id: string;
          organization_id: string;
        };
        Insert: {
          cfop_destino: string;
          cfop_origem: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          organization_id: string;
        };
        Update: {
          cfop_destino?: string;
          cfop_origem?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          organization_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "fiscal_cfop_equivalentes_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      fiscal_entrada_cursor: {
        Row: {
          atualizado_em: string;
          organization_id: string;
          ult_nsu: number;
        };
        Insert: {
          atualizado_em?: string;
          organization_id: string;
          ult_nsu?: number;
        };
        Update: {
          atualizado_em?: string;
          organization_id?: string;
          ult_nsu?: number;
        };
        Relationships: [
          {
            foreignKeyName: "fiscal_entrada_cursor_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: true;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      fiscal_entradas: {
        Row: {
          chave: string;
          cobranca_json: NonNullable<Json>;
          contact_id: string | null;
          created_at: string;
          created_by: string | null;
          dh_emi: string | null;
          emitente_cnpj: string;
          emitente_ie: string | null;
          emitente_nome: string;
          estoque_processado_em: string | null;
          financeiro_processado_em: string | null;
          id: string;
          itens_json: NonNullable<Json>;
          manifestacao: string | null;
          manifestada_em: string | null;
          nsu: number;
          numero: number | null;
          organization_id: string;
          serie: string | null;
          status: string;
          updated_at: string;
          valor_total_cents: number;
          xml: string | null;
        };
        Insert: {
          chave: string;
          cobranca_json?: NonNullable<Json>;
          contact_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          dh_emi?: string | null;
          emitente_cnpj: string;
          emitente_ie?: string | null;
          emitente_nome: string;
          estoque_processado_em?: string | null;
          financeiro_processado_em?: string | null;
          id?: string;
          itens_json?: NonNullable<Json>;
          manifestacao?: string | null;
          manifestada_em?: string | null;
          nsu: number;
          numero?: number | null;
          organization_id: string;
          serie?: string | null;
          status?: string;
          updated_at?: string;
          valor_total_cents?: number;
          xml?: string | null;
        };
        Update: {
          chave?: string;
          cobranca_json?: NonNullable<Json>;
          contact_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          dh_emi?: string | null;
          emitente_cnpj?: string;
          emitente_ie?: string | null;
          emitente_nome?: string;
          estoque_processado_em?: string | null;
          financeiro_processado_em?: string | null;
          id?: string;
          itens_json?: NonNullable<Json>;
          manifestacao?: string | null;
          manifestada_em?: string | null;
          nsu?: number;
          numero?: number | null;
          organization_id?: string;
          serie?: string | null;
          status?: string;
          updated_at?: string;
          valor_total_cents?: number;
          xml?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "fiscal_entradas_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fiscal_entradas_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      fiscal_events: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          invoice_id: string;
          mensagem: string | null;
          organization_id: string;
          protocolo: string | null;
          status: string | null;
          tipo: string;
          xml: string | null;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          invoice_id: string;
          mensagem?: string | null;
          organization_id: string;
          protocolo?: string | null;
          status?: string | null;
          tipo: string;
          xml?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          invoice_id?: string;
          mensagem?: string | null;
          organization_id?: string;
          protocolo?: string | null;
          status?: string | null;
          tipo?: string;
          xml?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "fiscal_events_invoice_id_fkey";
            columns: ["invoice_id"];
            isOneToOne: false;
            referencedRelation: "invoices";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fiscal_events_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      fiscal_inutilizacoes: {
        Row: {
          ambiente: string;
          created_at: string;
          created_by: string | null;
          id: string;
          motivo: string;
          numero_final: number;
          numero_inicial: number;
          organization_id: string;
          sefaz_protocolo: string | null;
          sefaz_xmotivo: string | null;
          serie: string;
          status: string;
        };
        Insert: {
          ambiente?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          motivo: string;
          numero_final: number;
          numero_inicial: number;
          organization_id: string;
          sefaz_protocolo?: string | null;
          sefaz_xmotivo?: string | null;
          serie: string;
          status?: string;
        };
        Update: {
          ambiente?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          motivo?: string;
          numero_final?: number;
          numero_inicial?: number;
          organization_id?: string;
          sefaz_protocolo?: string | null;
          sefaz_xmotivo?: string | null;
          serie?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "fiscal_inutilizacoes_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      fiscal_jobs: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          idempotency_key: string | null;
          invoice_id: string;
          max_tentativas: number;
          organization_id: string;
          proxima_tentativa: string;
          status: string;
          tentativas: number;
          tipo: string;
          ultimo_erro: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          idempotency_key?: string | null;
          invoice_id: string;
          max_tentativas?: number;
          organization_id: string;
          proxima_tentativa?: string;
          status?: string;
          tentativas?: number;
          tipo?: string;
          ultimo_erro?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          idempotency_key?: string | null;
          invoice_id?: string;
          max_tentativas?: number;
          organization_id?: string;
          proxima_tentativa?: string;
          status?: string;
          tentativas?: number;
          tipo?: string;
          ultimo_erro?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "fiscal_jobs_invoice_id_fkey";
            columns: ["invoice_id"];
            isOneToOne: false;
            referencedRelation: "invoices";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fiscal_jobs_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      fiscal_settings: {
        Row: {
          ambiente: string;
          bairro: string | null;
          cep: string | null;
          certificado_path: string | null;
          certificado_senha_encrypted: string | null;
          cfop_padrao: string;
          codigo_municipio: string | null;
          created_at: string;
          crt: string;
          emitente_documento: string | null;
          ie: string | null;
          logradouro: string | null;
          municipio: string | null;
          natureza_operacao: string;
          numero_end: string | null;
          organization_id: string;
          provedor: string;
          serie: string;
          uf: string | null;
          updated_at: string;
        };
        Insert: {
          ambiente?: string;
          bairro?: string | null;
          cep?: string | null;
          certificado_path?: string | null;
          certificado_senha_encrypted?: string | null;
          cfop_padrao?: string;
          codigo_municipio?: string | null;
          created_at?: string;
          crt?: string;
          emitente_documento?: string | null;
          ie?: string | null;
          logradouro?: string | null;
          municipio?: string | null;
          natureza_operacao?: string;
          numero_end?: string | null;
          organization_id: string;
          provedor?: string;
          serie?: string;
          uf?: string | null;
          updated_at?: string;
        };
        Update: {
          ambiente?: string;
          bairro?: string | null;
          cep?: string | null;
          certificado_path?: string | null;
          certificado_senha_encrypted?: string | null;
          cfop_padrao?: string;
          codigo_municipio?: string | null;
          created_at?: string;
          crt?: string;
          emitente_documento?: string | null;
          ie?: string | null;
          logradouro?: string | null;
          municipio?: string | null;
          natureza_operacao?: string;
          numero_end?: string | null;
          organization_id?: string;
          provedor?: string;
          serie?: string;
          uf?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "fiscal_settings_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: true;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      flywheel_distiller_proposals: {
        Row: {
          applied_at: string | null;
          applied_by: string | null;
          applied_version_id: string | null;
          content: string;
          dataset: string;
          evidence: NonNullable<Json>;
          id: string;
          organization_id: string;
          proposed_at: string;
          run_id: string;
          target: string;
          type: string;
        };
        Insert: {
          applied_at?: string | null;
          applied_by?: string | null;
          applied_version_id?: string | null;
          content: string;
          dataset: string;
          evidence: NonNullable<Json>;
          id?: string;
          organization_id: string;
          proposed_at?: string;
          run_id: string;
          target: string;
          type: string;
        };
        Update: {
          applied_at?: string | null;
          applied_by?: string | null;
          applied_version_id?: string | null;
          content?: string;
          dataset?: string;
          evidence?: NonNullable<Json>;
          id?: string;
          organization_id?: string;
          proposed_at?: string;
          run_id?: string;
          target?: string;
          type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "flywheel_distiller_proposals_applied_version_id_fkey";
            columns: ["applied_version_id"];
            isOneToOne: false;
            referencedRelation: "ai_agent_versions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "flywheel_distiller_proposals_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      flywheel_judge_verdicts: {
        Row: {
          dataset: string;
          dimension: string;
          id: string;
          judge_family: string;
          judged_at: string;
          model: string;
          option_order: string;
          organization_id: string;
          provenance: NonNullable<Json>;
          run_id: string;
          trace_id: string;
          verdict: string;
        };
        Insert: {
          dataset: string;
          dimension: string;
          id?: string;
          judge_family: string;
          judged_at?: string;
          model: string;
          option_order: string;
          organization_id: string;
          provenance?: NonNullable<Json>;
          run_id: string;
          trace_id: string;
          verdict: string;
        };
        Update: {
          dataset?: string;
          dimension?: string;
          id?: string;
          judge_family?: string;
          judged_at?: string;
          model?: string;
          option_order?: string;
          organization_id?: string;
          provenance?: NonNullable<Json>;
          run_id?: string;
          trace_id?: string;
          verdict?: string;
        };
        Relationships: [
          {
            foreignKeyName: "flywheel_judge_verdicts_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      followup_enrollment_events: {
        Row: {
          created_at: string;
          enrollment_id: string;
          event_type: string;
          id: string;
          idempotency_key: string | null;
          node_id: string | null;
          organization_id: string;
          payload: NonNullable<Json>;
        };
        Insert: {
          created_at?: string;
          enrollment_id: string;
          event_type: string;
          id?: string;
          idempotency_key?: string | null;
          node_id?: string | null;
          organization_id: string;
          payload?: NonNullable<Json>;
        };
        Update: {
          created_at?: string;
          enrollment_id?: string;
          event_type?: string;
          id?: string;
          idempotency_key?: string | null;
          node_id?: string | null;
          organization_id?: string;
          payload?: NonNullable<Json>;
        };
        Relationships: [
          {
            foreignKeyName: "followup_enrollment_events_enrollment_id_fkey";
            columns: ["enrollment_id"];
            isOneToOne: false;
            referencedRelation: "followup_enrollments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "followup_enrollment_events_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      followup_enrollments: {
        Row: {
          agent_id: string | null;
          attempts: number;
          cancel_reason: string | null;
          claimed_until: string | null;
          completed_at: string | null;
          contact_id: string;
          conversation_id: string | null;
          current_node_id: string;
          id: string;
          last_error: string | null;
          max_attempts: number;
          next_eval_at: string | null;
          organization_id: string;
          outcome: string | null;
          pointer_id: string;
          started_at: string;
          status: string;
          steps_taken: number;
          timing_plan: Json | null;
          updated_at: string;
          version_id: string;
        };
        Insert: {
          agent_id?: string | null;
          attempts?: number;
          cancel_reason?: string | null;
          claimed_until?: string | null;
          completed_at?: string | null;
          contact_id: string;
          conversation_id?: string | null;
          current_node_id: string;
          id?: string;
          last_error?: string | null;
          max_attempts?: number;
          next_eval_at?: string | null;
          organization_id: string;
          outcome?: string | null;
          pointer_id: string;
          started_at?: string;
          status?: string;
          steps_taken?: number;
          timing_plan?: Json | null;
          updated_at?: string;
          version_id: string;
        };
        Update: {
          agent_id?: string | null;
          attempts?: number;
          cancel_reason?: string | null;
          claimed_until?: string | null;
          completed_at?: string | null;
          contact_id?: string;
          conversation_id?: string | null;
          current_node_id?: string;
          id?: string;
          last_error?: string | null;
          max_attempts?: number;
          next_eval_at?: string | null;
          organization_id?: string;
          outcome?: string | null;
          pointer_id?: string;
          started_at?: string;
          status?: string;
          steps_taken?: number;
          timing_plan?: Json | null;
          updated_at?: string;
          version_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "followup_enrollments_agent_id_fkey";
            columns: ["agent_id"];
            isOneToOne: false;
            referencedRelation: "ai_agents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "followup_enrollments_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "followup_enrollments_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "followup_enrollments_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "followup_enrollments_pointer_id_fkey";
            columns: ["pointer_id"];
            isOneToOne: false;
            referencedRelation: "followup_flow_pointers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "followup_enrollments_version_id_fkey";
            columns: ["version_id"];
            isOneToOne: false;
            referencedRelation: "followup_flow_versions";
            referencedColumns: ["id"];
          },
        ];
      };
      followup_flow_pointers: {
        Row: {
          active_version_id: string | null;
          created_at: string;
          draft_graph: Json | null;
          handoff_policy: string;
          id: string;
          name: string;
          organization_id: string;
          status: string;
          surface: string;
          trigger_config: NonNullable<Json>;
          updated_at: string;
        };
        Insert: {
          active_version_id?: string | null;
          created_at?: string;
          draft_graph?: Json | null;
          handoff_policy?: string;
          id?: string;
          name: string;
          organization_id: string;
          status?: string;
          surface?: string;
          trigger_config?: NonNullable<Json>;
          updated_at?: string;
        };
        Update: {
          active_version_id?: string | null;
          created_at?: string;
          draft_graph?: Json | null;
          handoff_policy?: string;
          id?: string;
          name?: string;
          organization_id?: string;
          status?: string;
          surface?: string;
          trigger_config?: NonNullable<Json>;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "followup_flow_pointers_active_version_id_fkey";
            columns: ["active_version_id"];
            isOneToOne: false;
            referencedRelation: "followup_flow_versions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "followup_flow_pointers_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      followup_flow_versions: {
        Row: {
          created_at: string;
          created_by: string | null;
          graph: NonNullable<Json>;
          id: string;
          organization_id: string;
          pointer_id: string | null;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          graph: NonNullable<Json>;
          id?: string;
          organization_id: string;
          pointer_id?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          graph?: NonNullable<Json>;
          id?: string;
          organization_id?: string;
          pointer_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "followup_flow_versions_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "followup_flow_versions_pointer_id_fkey";
            columns: ["pointer_id"];
            isOneToOne: false;
            referencedRelation: "followup_flow_pointers";
            referencedColumns: ["id"];
          },
        ];
      };
      idempotency_keys: {
        Row: {
          created_at: string;
          endpoint: string;
          expires_at: string;
          id: string;
          key: string;
          organization_id: string;
          request_hash: string;
          response_body: NonNullable<Json>;
          status_code: number;
        };
        Insert: {
          created_at?: string;
          endpoint: string;
          expires_at?: string;
          id?: string;
          key: string;
          organization_id: string;
          request_hash: string;
          response_body: NonNullable<Json>;
          status_code: number;
        };
        Update: {
          created_at?: string;
          endpoint?: string;
          expires_at?: string;
          id?: string;
          key?: string;
          organization_id?: string;
          request_hash?: string;
          response_body?: NonNullable<Json>;
          status_code?: number;
        };
        Relationships: [
          {
            foreignKeyName: "idempotency_keys_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      incidents: {
        Row: {
          acknowledged_at: string | null;
          acknowledged_by: string | null;
          created_at: string;
          id: string;
          organization_id: string | null;
          payload: NonNullable<Json>;
          resolution_note: string | null;
          resolved_at: string | null;
          resolved_by: string | null;
          severity: string;
          status: string;
          type: string;
          updated_at: string;
        };
        Insert: {
          acknowledged_at?: string | null;
          acknowledged_by?: string | null;
          created_at?: string;
          id?: string;
          organization_id?: string | null;
          payload?: NonNullable<Json>;
          resolution_note?: string | null;
          resolved_at?: string | null;
          resolved_by?: string | null;
          severity: string;
          status?: string;
          type: string;
          updated_at?: string;
        };
        Update: {
          acknowledged_at?: string | null;
          acknowledged_by?: string | null;
          created_at?: string;
          id?: string;
          organization_id?: string | null;
          payload?: NonNullable<Json>;
          resolution_note?: string | null;
          resolved_at?: string | null;
          resolved_by?: string | null;
          severity?: string;
          status?: string;
          type?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "incidents_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      inventory_movements: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          observacao: string | null;
          order_id: string | null;
          organization_id: string;
          origem: string;
          product_id: string | null;
          purchase_order_id: string | null;
          quantidade: number;
          tipo: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          observacao?: string | null;
          order_id?: string | null;
          organization_id: string;
          origem?: string;
          product_id?: string | null;
          purchase_order_id?: string | null;
          quantidade: number;
          tipo: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          observacao?: string | null;
          order_id?: string | null;
          organization_id?: string;
          origem?: string;
          product_id?: string | null;
          purchase_order_id?: string | null;
          quantidade?: number;
          tipo?: string;
        };
        Relationships: [
          {
            foreignKeyName: "inventory_movements_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "commercial_orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inventory_movements_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inventory_movements_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "catalog_products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inventory_movements_purchase_order_fk";
            columns: ["purchase_order_id"];
            isOneToOne: false;
            referencedRelation: "purchase_orders";
            referencedColumns: ["id"];
          },
        ];
      };
      invoices: {
        Row: {
          chave_acesso: string | null;
          created_at: string;
          created_by: string | null;
          erro: string | null;
          extras_fiscais: Json | null;
          id: string;
          numero: number | null;
          order_id: string | null;
          organization_id: string;
          protocolo: string | null;
          provedor: string;
          sefaz_cstat: string | null;
          sefaz_xmotivo: string | null;
          serie: string;
          status: string;
          total_cents: number;
          updated_at: string;
          xml: string | null;
        };
        Insert: {
          chave_acesso?: string | null;
          created_at?: string;
          created_by?: string | null;
          erro?: string | null;
          extras_fiscais?: Json | null;
          id?: string;
          numero?: number | null;
          order_id?: string | null;
          organization_id: string;
          protocolo?: string | null;
          provedor?: string;
          sefaz_cstat?: string | null;
          sefaz_xmotivo?: string | null;
          serie: string;
          status?: string;
          total_cents: number;
          updated_at?: string;
          xml?: string | null;
        };
        Update: {
          chave_acesso?: string | null;
          created_at?: string;
          created_by?: string | null;
          erro?: string | null;
          extras_fiscais?: Json | null;
          id?: string;
          numero?: number | null;
          order_id?: string | null;
          organization_id?: string;
          protocolo?: string | null;
          provedor?: string;
          sefaz_cstat?: string | null;
          sefaz_xmotivo?: string | null;
          serie?: string;
          status?: string;
          total_cents?: number;
          updated_at?: string;
          xml?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "invoices_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "commercial_orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invoices_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      job_queue: {
        Row: {
          attempts: number;
          contact_id: string | null;
          created_at: string;
          id: string;
          kind: string;
          last_error: string | null;
          locked_at: string | null;
          locked_by: string | null;
          max_attempts: number;
          organization_id: string;
          payload: NonNullable<Json>;
          priority: number;
          run_after: string;
          source_event_id: string | null;
          status: string;
        };
        Insert: {
          attempts?: number;
          contact_id?: string | null;
          created_at?: string;
          id?: string;
          kind: string;
          last_error?: string | null;
          locked_at?: string | null;
          locked_by?: string | null;
          max_attempts?: number;
          organization_id: string;
          payload?: NonNullable<Json>;
          priority?: number;
          run_after?: string;
          source_event_id?: string | null;
          status?: string;
        };
        Update: {
          attempts?: number;
          contact_id?: string | null;
          created_at?: string;
          id?: string;
          kind?: string;
          last_error?: string | null;
          locked_at?: string | null;
          locked_by?: string | null;
          max_attempts?: number;
          organization_id?: string;
          payload?: NonNullable<Json>;
          priority?: number;
          run_after?: string;
          source_event_id?: string | null;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "job_queue_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "job_queue_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      judge_alignment_pool: {
        Row: {
          added_at: string;
          dataset: string;
          dimension: string;
          id: string;
          organization_id: string;
          trace_id: string;
        };
        Insert: {
          added_at?: string;
          dataset: string;
          dimension: string;
          id?: string;
          organization_id: string;
          trace_id: string;
        };
        Update: {
          added_at?: string;
          dataset?: string;
          dimension?: string;
          id?: string;
          organization_id?: string;
          trace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "judge_alignment_pool_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      knowledge_searches: {
        Row: {
          agent_id: string | null;
          created_at: string;
          hits: number;
          id: string;
          job_id: string | null;
          kb_version_id: string | null;
          knowledge_source_ids: string[];
          organization_id: string;
          threshold: number;
          top_score: number | null;
        };
        Insert: {
          agent_id?: string | null;
          created_at?: string;
          hits?: number;
          id?: string;
          job_id?: string | null;
          kb_version_id?: string | null;
          knowledge_source_ids?: string[];
          organization_id: string;
          threshold: number;
          top_score?: number | null;
        };
        Update: {
          agent_id?: string | null;
          created_at?: string;
          hits?: number;
          id?: string;
          job_id?: string | null;
          kb_version_id?: string | null;
          knowledge_source_ids?: string[];
          organization_id?: string;
          threshold?: number;
          top_score?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "knowledge_searches_agent_id_fkey";
            columns: ["agent_id"];
            isOneToOne: false;
            referencedRelation: "ai_agents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "knowledge_searches_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      lead_checkpoints: {
        Row: {
          commitments: NonNullable<Json>;
          contact_id: string;
          created_at: string;
          declaracao: Json | null;
          id: string;
          job_id: string | null;
          next_action: string | null;
          objections: NonNullable<Json>;
          organization_id: string;
          rolling_summary: string;
          seq: number;
        };
        Insert: {
          commitments?: NonNullable<Json>;
          contact_id: string;
          created_at?: string;
          declaracao?: Json | null;
          id?: string;
          job_id?: string | null;
          next_action?: string | null;
          objections?: NonNullable<Json>;
          organization_id: string;
          rolling_summary?: string;
          seq?: never;
        };
        Update: {
          commitments?: NonNullable<Json>;
          contact_id?: string;
          created_at?: string;
          declaracao?: Json | null;
          id?: string;
          job_id?: string | null;
          next_action?: string | null;
          objections?: NonNullable<Json>;
          organization_id?: string;
          rolling_summary?: string;
          seq?: never;
        };
        Relationships: [
          {
            foreignKeyName: "lead_checkpoints_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lead_checkpoints_job_id_fkey";
            columns: ["job_id"];
            isOneToOne: false;
            referencedRelation: "job_queue";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lead_checkpoints_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      lead_notes: {
        Row: {
          body: string;
          contact_id: string;
          created_at: string;
          embedding: Json | null;
          headline: string;
          id: string;
          organization_id: string;
          updated_at: string;
        };
        Insert: {
          body: string;
          contact_id: string;
          created_at?: string;
          embedding?: Json | null;
          headline: string;
          id?: string;
          organization_id: string;
          updated_at?: string;
        };
        Update: {
          body?: string;
          contact_id?: string;
          created_at?: string;
          embedding?: Json | null;
          headline?: string;
          id?: string;
          organization_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "lead_notes_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lead_notes_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      lead_state: {
        Row: {
          contact_id: string;
          id: string;
          next_action: string | null;
          next_action_seq: number;
          organization_id: string;
          qualification: NonNullable<Json>;
          stage: string;
          updated_at: string;
        };
        Insert: {
          contact_id: string;
          id?: string;
          next_action?: string | null;
          next_action_seq?: number;
          organization_id: string;
          qualification?: NonNullable<Json>;
          stage?: string;
          updated_at?: string;
        };
        Update: {
          contact_id?: string;
          id?: string;
          next_action?: string | null;
          next_action_seq?: number;
          organization_id?: string;
          qualification?: NonNullable<Json>;
          stage?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "lead_state_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lead_state_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      lead_state_transitions: {
        Row: {
          contact_id: string;
          created_at: string;
          from_stage: string;
          id: string;
          job_id: string | null;
          organization_id: string;
          reason: string | null;
          seq: number;
          to_stage: string;
        };
        Insert: {
          contact_id: string;
          created_at?: string;
          from_stage: string;
          id?: string;
          job_id?: string | null;
          organization_id: string;
          reason?: string | null;
          seq?: never;
          to_stage: string;
        };
        Update: {
          contact_id?: string;
          created_at?: string;
          from_stage?: string;
          id?: string;
          job_id?: string | null;
          organization_id?: string;
          reason?: string | null;
          seq?: never;
          to_stage?: string;
        };
        Relationships: [
          {
            foreignKeyName: "lead_state_transitions_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lead_state_transitions_job_id_fkey";
            columns: ["job_id"];
            isOneToOne: false;
            referencedRelation: "job_queue";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lead_state_transitions_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      lgpd_requests: {
        Row: {
          attempts: number;
          cascaded_to: Json | null;
          completed_at: string | null;
          contact_id: string | null;
          created_at: string;
          due_at: string;
          emergency: boolean;
          error_message: string | null;
          external_customer_id: string | null;
          id: string;
          organization_id: string;
          received_at: string;
          request_payload: NonNullable<Json>;
          request_type: string;
          result: Json | null;
          scope: string;
          source: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          attempts?: number;
          cascaded_to?: Json | null;
          completed_at?: string | null;
          contact_id?: string | null;
          created_at?: string;
          due_at: string;
          emergency?: boolean;
          error_message?: string | null;
          external_customer_id?: string | null;
          id?: string;
          organization_id: string;
          received_at?: string;
          request_payload?: NonNullable<Json>;
          request_type: string;
          result?: Json | null;
          scope?: string;
          source: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          attempts?: number;
          cascaded_to?: Json | null;
          completed_at?: string | null;
          contact_id?: string | null;
          created_at?: string;
          due_at?: string;
          emergency?: boolean;
          error_message?: string | null;
          external_customer_id?: string | null;
          id?: string;
          organization_id?: string;
          received_at?: string;
          request_payload?: NonNullable<Json>;
          request_type?: string;
          result?: Json | null;
          scope?: string;
          source?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "lgpd_requests_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lgpd_requests_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      llm_calls: {
        Row: {
          agent_id: string | null;
          cache_read_tokens: number;
          cache_write_tokens: number;
          contact_id: string | null;
          cost_cents: number | null;
          created_at: string;
          error_code: string | null;
          error_message: string | null;
          http_status: number | null;
          id: string;
          input_tokens: number;
          job_id: string | null;
          latency_ms: number | null;
          legacy_invocation_id: string | null;
          model: string;
          organization_id: string;
          origem_da_escolha: string | null;
          output_tokens: number;
          provider: string;
          purpose: string;
          status: string;
          variant_id: string | null;
        };
        Insert: {
          agent_id?: string | null;
          cache_read_tokens?: number;
          cache_write_tokens?: number;
          contact_id?: string | null;
          cost_cents?: number | null;
          created_at?: string;
          error_code?: string | null;
          error_message?: string | null;
          http_status?: number | null;
          id?: string;
          input_tokens?: number;
          job_id?: string | null;
          latency_ms?: number | null;
          legacy_invocation_id?: string | null;
          model: string;
          organization_id: string;
          origem_da_escolha?: string | null;
          output_tokens?: number;
          provider: string;
          purpose?: string;
          status?: string;
          variant_id?: string | null;
        };
        Update: {
          agent_id?: string | null;
          cache_read_tokens?: number;
          cache_write_tokens?: number;
          contact_id?: string | null;
          cost_cents?: number | null;
          created_at?: string;
          error_code?: string | null;
          error_message?: string | null;
          http_status?: number | null;
          id?: string;
          input_tokens?: number;
          job_id?: string | null;
          latency_ms?: number | null;
          legacy_invocation_id?: string | null;
          model?: string;
          organization_id?: string;
          origem_da_escolha?: string | null;
          output_tokens?: number;
          provider?: string;
          purpose?: string;
          status?: string;
          variant_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "llm_calls_agent_id_fkey";
            columns: ["agent_id"];
            isOneToOne: false;
            referencedRelation: "ai_agents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "llm_calls_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "llm_calls_job_id_fkey";
            columns: ["job_id"];
            isOneToOne: false;
            referencedRelation: "job_queue";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "llm_calls_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      merge_queue: {
        Row: {
          candidates: string[];
          created_at: string;
          id: string;
          organization_id: string;
          reason: string;
          resolution: Json | null;
          resolved_at: string | null;
          resolved_by_user_id: string | null;
          status: string;
          trigger_payload: NonNullable<Json>;
        };
        Insert: {
          candidates: string[];
          created_at?: string;
          id?: string;
          organization_id: string;
          reason: string;
          resolution?: Json | null;
          resolved_at?: string | null;
          resolved_by_user_id?: string | null;
          status?: string;
          trigger_payload?: NonNullable<Json>;
        };
        Update: {
          candidates?: string[];
          created_at?: string;
          id?: string;
          organization_id?: string;
          reason?: string;
          resolution?: Json | null;
          resolved_at?: string | null;
          resolved_by_user_id?: string | null;
          status?: string;
          trigger_payload?: NonNullable<Json>;
        };
        Relationships: [
          {
            foreignKeyName: "merge_queue_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      message_templates: {
        Row: {
          body: string;
          created_at: string;
          created_by_user_id: string | null;
          id: string;
          organization_id: string;
          owner_user_id: string | null;
          shortcut: string | null;
          title: string;
          updated_at: string;
        };
        Insert: {
          body: string;
          created_at?: string;
          created_by_user_id?: string | null;
          id?: string;
          organization_id: string;
          owner_user_id?: string | null;
          shortcut?: string | null;
          title: string;
          updated_at?: string;
        };
        Update: {
          body?: string;
          created_at?: string;
          created_by_user_id?: string | null;
          id?: string;
          organization_id?: string;
          owner_user_id?: string | null;
          shortcut?: string | null;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "message_templates_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      messages: {
        Row: {
          ack: number | null;
          activity_id: string | null;
          body: string | null;
          channel_session_id: string;
          contact_id: string;
          conversation_id: string;
          created_at: string;
          delivered_at: string | null;
          direction: string;
          edited_at: string | null;
          error_code: string | null;
          error_message: string | null;
          external_id: string | null;
          id: string;
          media_derived_status: string | null;
          media_derived_text: string | null;
          media_mime: string | null;
          media_size_bytes: number | null;
          media_storage_path: string | null;
          media_url: string | null;
          metadata: NonNullable<Json>;
          organization_id: string;
          read_at: string | null;
          reply_to_message_id: string | null;
          revoked_at: string | null;
          sent_at: string;
          sent_by_user_id: string | null;
          sent_via: string;
          status: string;
          template_language: string | null;
          template_name: string | null;
          type: string;
          updated_at: string;
        };
        Insert: {
          ack?: number | null;
          activity_id?: string | null;
          body?: string | null;
          channel_session_id: string;
          contact_id: string;
          conversation_id: string;
          created_at?: string;
          delivered_at?: string | null;
          direction: string;
          edited_at?: string | null;
          error_code?: string | null;
          error_message?: string | null;
          external_id?: string | null;
          id?: string;
          media_derived_status?: string | null;
          media_derived_text?: string | null;
          media_mime?: string | null;
          media_size_bytes?: number | null;
          media_storage_path?: string | null;
          media_url?: string | null;
          metadata?: NonNullable<Json>;
          organization_id: string;
          read_at?: string | null;
          reply_to_message_id?: string | null;
          revoked_at?: string | null;
          sent_at?: string;
          sent_by_user_id?: string | null;
          sent_via?: string;
          status?: string;
          template_language?: string | null;
          template_name?: string | null;
          type: string;
          updated_at?: string;
        };
        Update: {
          ack?: number | null;
          activity_id?: string | null;
          body?: string | null;
          channel_session_id?: string;
          contact_id?: string;
          conversation_id?: string;
          created_at?: string;
          delivered_at?: string | null;
          direction?: string;
          edited_at?: string | null;
          error_code?: string | null;
          error_message?: string | null;
          external_id?: string | null;
          id?: string;
          media_derived_status?: string | null;
          media_derived_text?: string | null;
          media_mime?: string | null;
          media_size_bytes?: number | null;
          media_storage_path?: string | null;
          media_url?: string | null;
          metadata?: NonNullable<Json>;
          organization_id?: string;
          read_at?: string | null;
          reply_to_message_id?: string | null;
          revoked_at?: string | null;
          sent_at?: string;
          sent_by_user_id?: string | null;
          sent_via?: string;
          status?: string;
          template_language?: string | null;
          template_name?: string | null;
          type?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "messages_activity_id_fkey";
            columns: ["activity_id"];
            isOneToOne: false;
            referencedRelation: "crm_lead_activities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "messages_channel_session_id_fkey";
            columns: ["channel_session_id"];
            isOneToOne: false;
            referencedRelation: "channel_sessions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "messages_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "messages_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "messages_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "messages_reply_to_message_id_fkey";
            columns: ["reply_to_message_id"];
            isOneToOne: false;
            referencedRelation: "messages";
            referencedColumns: ["id"];
          },
        ];
      };
      meta_templates: {
        Row: {
          category: string | null;
          channel_session_id: string | null;
          components: NonNullable<Json>;
          contract_hash: string;
          created_at: string;
          id: string;
          language: string;
          name: string;
          organization_id: string;
          parameter_format: string;
          quality_score: string | null;
          rejected_reason: string | null;
          status: string;
          synced_at: string;
          updated_at: string;
          waba_id: string;
        };
        Insert: {
          category?: string | null;
          channel_session_id?: string | null;
          components: NonNullable<Json>;
          contract_hash: string;
          created_at?: string;
          id?: string;
          language: string;
          name: string;
          organization_id: string;
          parameter_format?: string;
          quality_score?: string | null;
          rejected_reason?: string | null;
          status: string;
          synced_at?: string;
          updated_at?: string;
          waba_id: string;
        };
        Update: {
          category?: string | null;
          channel_session_id?: string | null;
          components?: NonNullable<Json>;
          contract_hash?: string;
          created_at?: string;
          id?: string;
          language?: string;
          name?: string;
          organization_id?: string;
          parameter_format?: string;
          quality_score?: string | null;
          rejected_reason?: string | null;
          status?: string;
          synced_at?: string;
          updated_at?: string;
          waba_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "meta_templates_channel_session_id_fkey";
            columns: ["channel_session_id"];
            isOneToOne: false;
            referencedRelation: "channel_sessions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "meta_templates_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      metrics: {
        Row: {
          created_at: string;
          id: string;
          labels: NonNullable<Json>;
          name: string;
          organization_id: string | null;
          value: number;
        };
        Insert: {
          created_at?: string;
          id?: string;
          labels?: NonNullable<Json>;
          name: string;
          organization_id?: string | null;
          value: number;
        };
        Update: {
          created_at?: string;
          id?: string;
          labels?: NonNullable<Json>;
          name?: string;
          organization_id?: string | null;
          value?: number;
        };
        Relationships: [
          {
            foreignKeyName: "metrics_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      nuvemshop_products: {
        Row: {
          available_qty: number;
          created_at: string;
          description: string | null;
          external_id: string;
          id: string;
          image_url: string | null;
          last_updated_at: string;
          organization_id: string;
          payload: NonNullable<Json>;
          price_cents: number;
          rag_chunk_count: number;
          rag_indexed_at: string | null;
          title: string;
          updated_at: string;
          url: string | null;
        };
        Insert: {
          available_qty?: number;
          created_at?: string;
          description?: string | null;
          external_id: string;
          id?: string;
          image_url?: string | null;
          last_updated_at: string;
          organization_id: string;
          payload?: NonNullable<Json>;
          price_cents: number;
          rag_chunk_count?: number;
          rag_indexed_at?: string | null;
          title: string;
          updated_at?: string;
          url?: string | null;
        };
        Update: {
          available_qty?: number;
          created_at?: string;
          description?: string | null;
          external_id?: string;
          id?: string;
          image_url?: string | null;
          last_updated_at?: string;
          organization_id?: string;
          payload?: NonNullable<Json>;
          price_cents?: number;
          rag_chunk_count?: number;
          rag_indexed_at?: string | null;
          title?: string;
          updated_at?: string;
          url?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "nuvemshop_products_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      orders: {
        Row: {
          contact_id: string | null;
          created_at: string;
          currency: string;
          customer_external_id: string | null;
          external_id: string;
          external_provider: string;
          fulfillment_status: string | null;
          id: string;
          is_anonymized: boolean;
          ordered_at: string;
          organization_id: string;
          payload: NonNullable<Json>;
          payment_method: string | null;
          status: string;
          total_cents: number;
          tracking_code: string | null;
          updated_at: string;
          updated_at_remote: string | null;
        };
        Insert: {
          contact_id?: string | null;
          created_at?: string;
          currency?: string;
          customer_external_id?: string | null;
          external_id: string;
          external_provider: string;
          fulfillment_status?: string | null;
          id?: string;
          is_anonymized?: boolean;
          ordered_at: string;
          organization_id: string;
          payload?: NonNullable<Json>;
          payment_method?: string | null;
          status: string;
          total_cents: number;
          tracking_code?: string | null;
          updated_at?: string;
          updated_at_remote?: string | null;
        };
        Update: {
          contact_id?: string | null;
          created_at?: string;
          currency?: string;
          customer_external_id?: string | null;
          external_id?: string;
          external_provider?: string;
          fulfillment_status?: string | null;
          id?: string;
          is_anonymized?: boolean;
          ordered_at?: string;
          organization_id?: string;
          payload?: NonNullable<Json>;
          payment_method?: string | null;
          status?: string;
          total_cents?: number;
          tracking_code?: string | null;
          updated_at?: string;
          updated_at_remote?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "orders_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "orders_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      org_guardrail_layers: {
        Row: {
          enabled: boolean;
          layer: string;
          organization_id: string;
          updated_at: string;
        };
        Insert: {
          enabled: boolean;
          layer: string;
          organization_id: string;
          updated_at?: string;
        };
        Update: {
          enabled?: boolean;
          layer?: string;
          organization_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "org_guardrail_layers_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      org_memory_entries: {
        Row: {
          body: string;
          created_at: string;
          created_by: string | null;
          id: string;
          organization_id: string;
          proposal_id: string | null;
          source: string;
          status: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          body: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          organization_id: string;
          proposal_id?: string | null;
          source: string;
          status?: string;
          title: string;
          updated_at?: string;
        };
        Update: {
          body?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          organization_id?: string;
          proposal_id?: string | null;
          source?: string;
          status?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "org_memory_entries_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "org_memory_entries_proposal_id_fkey";
            columns: ["proposal_id"];
            isOneToOne: false;
            referencedRelation: "flywheel_distiller_proposals";
            referencedColumns: ["id"];
          },
        ];
      };
      org_memory_pointers: {
        Row: {
          organization_id: string;
          updated_at: string;
          version_id: string;
        };
        Insert: {
          organization_id: string;
          updated_at?: string;
          version_id: string;
        };
        Update: {
          organization_id?: string;
          updated_at?: string;
          version_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "org_memory_pointers_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: true;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "org_memory_pointers_version_id_fkey";
            columns: ["version_id"];
            isOneToOne: false;
            referencedRelation: "org_memory_versions";
            referencedColumns: ["id"];
          },
        ];
      };
      org_memory_versions: {
        Row: {
          content: string;
          created_at: string;
          created_by: string | null;
          id: string;
          organization_id: string;
          version_number: number;
        };
        Insert: {
          content: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          organization_id: string;
          version_number: number;
        };
        Update: {
          content?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          organization_id?: string;
          version_number?: number;
        };
        Relationships: [
          {
            foreignKeyName: "org_memory_versions_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      organizations: {
        Row: {
          ai_budget_cents: number | null;
          bairro: string | null;
          cep: string | null;
          cidade: string | null;
          complemento: string | null;
          cnpj: string | null;
          created_at: string;
          created_by: string | null;
          display_name: string;
          dpo_email: string | null;
          id: string;
          legal_name: string;
          locale: string;
          logradouro: string | null;
          media_retention_days: number;
          numero_end: string | null;
          onboarded_at: string | null;
          onboarding_state: NonNullable<Json>;
          phone: string | null;
          privacy_policy_url: string | null;
          rate_limit_rps: number;
          redacted_at: string | null;
          settings: NonNullable<Json>;
          slug: string;
          status: string;
          suspended_at: string | null;
          suspended_by: string | null;
          suspended_reason: string | null;
          timezone: string;
          uf: string | null;
          updated_at: string;
        };
        Insert: {
          ai_budget_cents?: number | null;
          bairro?: string | null;
          cep?: string | null;
          cidade?: string | null;
          complemento?: string | null;
          cnpj?: string | null;
          created_at?: string;
          created_by?: string | null;
          display_name: string;
          dpo_email?: string | null;
          id?: string;
          legal_name: string;
          locale?: string;
          logradouro?: string | null;
          media_retention_days?: number;
          numero_end?: string | null;
          onboarded_at?: string | null;
          onboarding_state?: NonNullable<Json>;
          phone?: string | null;
          privacy_policy_url?: string | null;
          rate_limit_rps?: number;
          redacted_at?: string | null;
          settings?: NonNullable<Json>;
          slug: string;
          status?: string;
          suspended_at?: string | null;
          suspended_by?: string | null;
          suspended_reason?: string | null;
          timezone?: string;
          uf?: string | null;
          updated_at?: string;
        };
        Update: {
          ai_budget_cents?: number | null;
          bairro?: string | null;
          cep?: string | null;
          cidade?: string | null;
          complemento?: string | null;
          cnpj?: string | null;
          created_at?: string;
          created_by?: string | null;
          display_name?: string;
          dpo_email?: string | null;
          id?: string;
          legal_name?: string;
          locale?: string;
          logradouro?: string | null;
          media_retention_days?: number;
          numero_end?: string | null;
          onboarded_at?: string | null;
          onboarding_state?: NonNullable<Json>;
          phone?: string | null;
          privacy_policy_url?: string | null;
          rate_limit_rps?: number;
          redacted_at?: string | null;
          settings?: NonNullable<Json>;
          slug?: string;
          status?: string;
          suspended_at?: string | null;
          suspended_by?: string | null;
          suspended_reason?: string | null;
          timezone?: string;
          uf?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      outbound_copies: {
        Row: {
          channel_session_id: string;
          id: string;
          normalized_hash: string;
          normalized_text: string;
          organization_id: string;
          sent_at: string;
        };
        Insert: {
          channel_session_id: string;
          id?: string;
          normalized_hash: string;
          normalized_text: string;
          organization_id: string;
          sent_at?: string;
        };
        Update: {
          channel_session_id?: string;
          id?: string;
          normalized_hash?: string;
          normalized_text?: string;
          organization_id?: string;
          sent_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "outbound_copies_channel_session_id_fkey";
            columns: ["channel_session_id"];
            isOneToOne: false;
            referencedRelation: "channel_sessions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "outbound_copies_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      pacing_ledger: {
        Row: {
          channel_session_id: string;
          id: string;
          organization_id: string;
          sent_at: string;
        };
        Insert: {
          channel_session_id: string;
          id?: string;
          organization_id: string;
          sent_at?: string;
        };
        Update: {
          channel_session_id?: string;
          id?: string;
          organization_id?: string;
          sent_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "pacing_ledger_channel_session_id_fkey";
            columns: ["channel_session_id"];
            isOneToOne: false;
            referencedRelation: "channel_sessions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pacing_ledger_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      platform_admins: {
        Row: {
          granted_at: string;
          granted_by: string;
          mfa_required: boolean;
          reason: string;
          revoke_reason: string | null;
          revoked_at: string | null;
          revoked_by: string | null;
          scope: string;
          user_id: string;
        };
        Insert: {
          granted_at?: string;
          granted_by: string;
          mfa_required?: boolean;
          reason: string;
          revoke_reason?: string | null;
          revoked_at?: string | null;
          revoked_by?: string | null;
          scope?: string;
          user_id: string;
        };
        Update: {
          granted_at?: string;
          granted_by?: string;
          mfa_required?: boolean;
          reason?: string;
          revoke_reason?: string | null;
          revoked_at?: string | null;
          revoked_by?: string | null;
          scope?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      platform_branding: {
        Row: {
          accent_hex: string | null;
          app_name: string | null;
          fallback_at: string | null;
          fallback_reason: string | null;
          id: number;
          logo_path: string | null;
          logo_url: string | null;
          seeded_from_env: boolean;
          show_powered_by: boolean;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          accent_hex?: string | null;
          app_name?: string | null;
          fallback_at?: string | null;
          fallback_reason?: string | null;
          id?: number;
          logo_path?: string | null;
          logo_url?: string | null;
          seeded_from_env?: boolean;
          show_powered_by?: boolean;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          accent_hex?: string | null;
          app_name?: string | null;
          fallback_at?: string | null;
          fallback_reason?: string | null;
          id?: number;
          logo_path?: string | null;
          logo_url?: string | null;
          seeded_from_env?: boolean;
          show_powered_by?: boolean;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      platform_google_oauth: {
        Row: {
          client_id: string | null;
          client_secret_encrypted: string | null;
          id: number;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          client_id?: string | null;
          client_secret_encrypted?: string | null;
          id?: number;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          client_id?: string | null;
          client_secret_encrypted?: string | null;
          id?: number;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      playbook_pointers: {
        Row: {
          layer: string;
          organization_id: string | null;
          updated_at: string;
          version_id: string;
        };
        Insert: {
          layer: string;
          organization_id?: string | null;
          updated_at?: string;
          version_id: string;
        };
        Update: {
          layer?: string;
          organization_id?: string | null;
          updated_at?: string;
          version_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "playbook_pointers_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "playbook_pointers_version_id_fkey";
            columns: ["version_id"];
            isOneToOne: false;
            referencedRelation: "playbook_versions";
            referencedColumns: ["id"];
          },
        ];
      };
      playbook_versions: {
        Row: {
          content: string;
          created_at: string;
          id: string;
          layer: string;
          organization_id: string | null;
        };
        Insert: {
          content: string;
          created_at?: string;
          id?: string;
          layer: string;
          organization_id?: string | null;
        };
        Update: {
          content?: string;
          created_at?: string;
          id?: string;
          layer?: string;
          organization_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "playbook_versions_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      price_table_items: {
        Row: {
          created_at: string;
          id: string;
          organization_id: string;
          preco_cents: number | null;
          price_table_id: string;
          product_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          organization_id: string;
          preco_cents?: number | null;
          price_table_id: string;
          product_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          organization_id?: string;
          preco_cents?: number | null;
          price_table_id?: string;
          product_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "price_table_items_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "price_table_items_price_table_id_fkey";
            columns: ["price_table_id"];
            isOneToOne: false;
            referencedRelation: "price_tables";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "price_table_items_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "catalog_products";
            referencedColumns: ["id"];
          },
        ];
      };
      price_tables: {
        Row: {
          ativo: boolean;
          created_at: string;
          desconto_pct: number;
          id: string;
          nome: string;
          organization_id: string;
          padrao: boolean;
          updated_at: string;
        };
        Insert: {
          ativo?: boolean;
          created_at?: string;
          desconto_pct?: number;
          id?: string;
          nome: string;
          organization_id: string;
          padrao?: boolean;
          updated_at?: string;
        };
        Update: {
          ativo?: boolean;
          created_at?: string;
          desconto_pct?: number;
          id?: string;
          nome?: string;
          organization_id?: string;
          padrao?: boolean;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "price_tables_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      product_categories: {
        Row: {
          ativo: boolean;
          created_at: string;
          id: string;
          nome: string;
          organization_id: string;
          parent_id: string | null;
          posicao: number;
          updated_at: string;
        };
        Insert: {
          ativo?: boolean;
          created_at?: string;
          id?: string;
          nome: string;
          organization_id: string;
          parent_id?: string | null;
          posicao?: number;
          updated_at?: string;
        };
        Update: {
          ativo?: boolean;
          created_at?: string;
          id?: string;
          nome?: string;
          organization_id?: string;
          parent_id?: string | null;
          posicao?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "product_categories_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "product_categories_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "product_categories";
            referencedColumns: ["id"];
          },
        ];
      };
      product_images: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          organization_id: string;
          posicao: number;
          product_id: string;
          storage_path: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          organization_id: string;
          posicao?: number;
          product_id: string;
          storage_path: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          organization_id?: string;
          posicao?: number;
          product_id?: string;
          storage_path?: string;
        };
        Relationships: [
          {
            foreignKeyName: "product_images_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "product_images_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "catalog_products";
            referencedColumns: ["id"];
          },
        ];
      };
      promise_table_pointers: {
        Row: {
          organization_id: string;
          updated_at: string;
          version_id: string;
        };
        Insert: {
          organization_id: string;
          updated_at?: string;
          version_id: string;
        };
        Update: {
          organization_id?: string;
          updated_at?: string;
          version_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "promise_table_pointers_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "promise_table_pointers_version_id_fkey";
            columns: ["version_id"];
            isOneToOne: false;
            referencedRelation: "promise_table_versions";
            referencedColumns: ["id"];
          },
        ];
      };
      promise_table_versions: {
        Row: {
          created_at: string;
          id: string;
          organization_id: string;
          values: NonNullable<Json>;
        };
        Insert: {
          created_at?: string;
          id?: string;
          organization_id: string;
          values: NonNullable<Json>;
        };
        Update: {
          created_at?: string;
          id?: string;
          organization_id?: string;
          values?: NonNullable<Json>;
        };
        Relationships: [
          {
            foreignKeyName: "promise_table_versions_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      prospect_search_results: {
        Row: {
          created_at: string;
          organization_id: string;
          primeira_vez: boolean;
          prospect_id: string;
          search_id: string;
        };
        Insert: {
          created_at?: string;
          organization_id: string;
          primeira_vez?: boolean;
          prospect_id: string;
          search_id: string;
        };
        Update: {
          created_at?: string;
          organization_id?: string;
          primeira_vez?: boolean;
          prospect_id?: string;
          search_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "prospect_search_results_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "prospect_search_results_prospect_id_fkey";
            columns: ["prospect_id"];
            isOneToOne: false;
            referencedRelation: "business_prospects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "prospect_search_results_search_id_fkey";
            columns: ["search_id"];
            isOneToOne: false;
            referencedRelation: "prospecting_searches";
            referencedColumns: ["id"];
          },
        ];
      };
      prospecting_cache_hits: {
        Row: {
          hit_at: string;
          id: string;
          organization_id: string;
          search_id: string | null;
        };
        Insert: {
          hit_at?: string;
          id?: string;
          organization_id: string;
          search_id?: string | null;
        };
        Update: {
          hit_at?: string;
          id?: string;
          organization_id?: string;
          search_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "prospecting_cache_hits_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "prospecting_cache_hits_search_id_fkey";
            columns: ["search_id"];
            isOneToOne: false;
            referencedRelation: "prospecting_searches";
            referencedColumns: ["id"];
          },
        ];
      };
      prospecting_campaigns: {
        Row: {
          categorias: string[];
          cidades: NonNullable<Json>;
          created_at: string;
          created_by: string | null;
          id: string;
          nome: string;
          objetivo: string | null;
          organization_id: string;
          recorrencia_dias: number | null;
          status: string;
          ultima_execucao_at: string | null;
          updated_at: string;
        };
        Insert: {
          categorias?: string[];
          cidades?: NonNullable<Json>;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          nome: string;
          objetivo?: string | null;
          organization_id: string;
          recorrencia_dias?: number | null;
          status?: string;
          ultima_execucao_at?: string | null;
          updated_at?: string;
        };
        Update: {
          categorias?: string[];
          cidades?: NonNullable<Json>;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          nome?: string;
          objetivo?: string | null;
          organization_id?: string;
          recorrencia_dias?: number | null;
          status?: string;
          ultima_execucao_at?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "prospecting_campaigns_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      prospecting_searches: {
        Row: {
          campaign_id: string | null;
          categorias: string[];
          celulas_processadas: number;
          cidade: string | null;
          created_at: string;
          created_by: string | null;
          custo_estimado_cents: number;
          detalhes: number;
          duplicadas: number;
          encontradas: number;
          erros: number;
          estado: string | null;
          finished_at: string | null;
          grid_overlap_pct: number;
          grid_size_km: number;
          id: string;
          latitude: number | null;
          longitude: number | null;
          max_empresas: number;
          novas: number;
          organization_id: string;
          pais: string;
          provider: string;
          raio_km: number;
          requisicoes: number;
          search_hash: string | null;
          started_at: string | null;
          status: string;
          total_celulas: number;
          ultimo_erro: string | null;
          updated_at: string;
        };
        Insert: {
          campaign_id?: string | null;
          categorias?: string[];
          celulas_processadas?: number;
          cidade?: string | null;
          created_at?: string;
          created_by?: string | null;
          custo_estimado_cents?: number;
          detalhes?: number;
          duplicadas?: number;
          encontradas?: number;
          erros?: number;
          estado?: string | null;
          finished_at?: string | null;
          grid_overlap_pct?: number;
          grid_size_km?: number;
          id?: string;
          latitude?: number | null;
          longitude?: number | null;
          max_empresas?: number;
          novas?: number;
          organization_id: string;
          pais?: string;
          provider?: string;
          raio_km?: number;
          requisicoes?: number;
          search_hash?: string | null;
          started_at?: string | null;
          status?: string;
          total_celulas?: number;
          ultimo_erro?: string | null;
          updated_at?: string;
        };
        Update: {
          campaign_id?: string | null;
          categorias?: string[];
          celulas_processadas?: number;
          cidade?: string | null;
          created_at?: string;
          created_by?: string | null;
          custo_estimado_cents?: number;
          detalhes?: number;
          duplicadas?: number;
          encontradas?: number;
          erros?: number;
          estado?: string | null;
          finished_at?: string | null;
          grid_overlap_pct?: number;
          grid_size_km?: number;
          id?: string;
          latitude?: number | null;
          longitude?: number | null;
          max_empresas?: number;
          novas?: number;
          organization_id?: string;
          pais?: string;
          provider?: string;
          raio_km?: number;
          requisicoes?: number;
          search_hash?: string | null;
          started_at?: string | null;
          status?: string;
          total_celulas?: number;
          ultimo_erro?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "prospecting_searches_campaign_fk";
            columns: ["campaign_id"];
            isOneToOne: false;
            referencedRelation: "prospecting_campaigns";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "prospecting_searches_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      prospecting_settings: {
        Row: {
          cache_ttl_dias: number;
          concorrencia: number;
          created_at: string;
          google_api_key_encrypted: string | null;
          grid_size_km: number;
          limite_diario: number;
          limite_por_busca: number;
          orcamento_mensal_cents: number | null;
          organization_id: string;
          preco_busca_cents: number | null;
          preco_detalhe_cents: number | null;
          provider_ativo: string;
          raio_padrao_km: number;
          requisicoes_por_minuto: number;
          retries: number;
          timeout_ms: number;
          updated_at: string;
        };
        Insert: {
          cache_ttl_dias?: number;
          concorrencia?: number;
          created_at?: string;
          google_api_key_encrypted?: string | null;
          grid_size_km?: number;
          limite_diario?: number;
          limite_por_busca?: number;
          orcamento_mensal_cents?: number | null;
          organization_id: string;
          preco_busca_cents?: number | null;
          preco_detalhe_cents?: number | null;
          provider_ativo?: string;
          raio_padrao_km?: number;
          requisicoes_por_minuto?: number;
          retries?: number;
          timeout_ms?: number;
          updated_at?: string;
        };
        Update: {
          cache_ttl_dias?: number;
          concorrencia?: number;
          created_at?: string;
          google_api_key_encrypted?: string | null;
          grid_size_km?: number;
          limite_diario?: number;
          limite_por_busca?: number;
          orcamento_mensal_cents?: number | null;
          organization_id?: string;
          preco_busca_cents?: number | null;
          preco_detalhe_cents?: number | null;
          provider_ativo?: string;
          raio_padrao_km?: number;
          requisicoes_por_minuto?: number;
          retries?: number;
          timeout_ms?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "prospecting_settings_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: true;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      purchase_order_counters: {
        Row: {
          organization_id: string;
          ultimo_numero: number;
          updated_at: string;
        };
        Insert: {
          organization_id: string;
          ultimo_numero?: number;
          updated_at?: string;
        };
        Update: {
          organization_id?: string;
          ultimo_numero?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "purchase_order_counters_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: true;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      purchase_order_items: {
        Row: {
          created_at: string;
          custo_unit_cents: number;
          id: string;
          organization_id: string;
          product_id: string | null;
          produto_codigo: string;
          produto_nome: string;
          purchase_order_id: string;
          quantidade: number;
          recebido_qtd: number;
          subtotal_cents: number;
        };
        Insert: {
          created_at?: string;
          custo_unit_cents: number;
          id?: string;
          organization_id: string;
          product_id?: string | null;
          produto_codigo: string;
          produto_nome: string;
          purchase_order_id: string;
          quantidade: number;
          recebido_qtd?: number;
          subtotal_cents: number;
        };
        Update: {
          created_at?: string;
          custo_unit_cents?: number;
          id?: string;
          organization_id?: string;
          product_id?: string | null;
          produto_codigo?: string;
          produto_nome?: string;
          purchase_order_id?: string;
          quantidade?: number;
          recebido_qtd?: number;
          subtotal_cents?: number;
        };
        Relationships: [
          {
            foreignKeyName: "purchase_order_items_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "purchase_order_items_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "catalog_products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "purchase_order_items_purchase_order_id_fkey";
            columns: ["purchase_order_id"];
            isOneToOne: false;
            referencedRelation: "purchase_orders";
            referencedColumns: ["id"];
          },
        ];
      };
      purchase_orders: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          numero: number;
          observacoes: string | null;
          organization_id: string;
          status: string;
          supplier_id: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          numero: number;
          observacoes?: string | null;
          organization_id: string;
          status?: string;
          supplier_id?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          numero?: number;
          observacoes?: string | null;
          organization_id?: string;
          status?: string;
          supplier_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "purchase_orders_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "purchase_orders_supplier_id_fkey";
            columns: ["supplier_id"];
            isOneToOne: false;
            referencedRelation: "suppliers";
            referencedColumns: ["id"];
          },
        ];
      };
      push_subscriptions: {
        Row: {
          auth: string;
          created_at: string;
          endpoint: string;
          id: string;
          organization_id: string;
          p256dh: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          auth: string;
          created_at?: string;
          endpoint: string;
          id?: string;
          organization_id: string;
          p256dh: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          auth?: string;
          created_at?: string;
          endpoint?: string;
          id?: string;
          organization_id?: string;
          p256dh?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      reentry_knob_pointers: {
        Row: {
          organization_id: string;
          updated_at: string;
          version_id: string;
        };
        Insert: {
          organization_id: string;
          updated_at?: string;
          version_id: string;
        };
        Update: {
          organization_id?: string;
          updated_at?: string;
          version_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reentry_knob_pointers_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: true;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reentry_knob_pointers_version_id_fkey";
            columns: ["version_id"];
            isOneToOne: false;
            referencedRelation: "reentry_knob_versions";
            referencedColumns: ["id"];
          },
        ];
      };
      reentry_knob_versions: {
        Row: {
          created_at: string;
          id: string;
          knobs: NonNullable<Json>;
          organization_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          knobs: NonNullable<Json>;
          organization_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          knobs?: NonNullable<Json>;
          organization_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reentry_knob_versions_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      reentry_template_pointers: {
        Row: {
          organization_id: string;
          updated_at: string;
          version_id: string;
        };
        Insert: {
          organization_id: string;
          updated_at?: string;
          version_id: string;
        };
        Update: {
          organization_id?: string;
          updated_at?: string;
          version_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reentry_template_pointers_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: true;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reentry_template_pointers_version_id_fkey";
            columns: ["version_id"];
            isOneToOne: false;
            referencedRelation: "reentry_template_versions";
            referencedColumns: ["id"];
          },
        ];
      };
      reentry_template_versions: {
        Row: {
          created_at: string;
          id: string;
          organization_id: string;
          variants: string[];
        };
        Insert: {
          created_at?: string;
          id?: string;
          organization_id: string;
          variants: string[];
        };
        Update: {
          created_at?: string;
          id?: string;
          organization_id?: string;
          variants?: string[];
        };
        Relationships: [
          {
            foreignKeyName: "reentry_template_versions_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      send_ledger: {
        Row: {
          body_hash: string;
          contact_id: string | null;
          created_at: string;
          crm_message_id: string | null;
          id: string;
          job_id: string;
          last_error: string | null;
          organization_id: string;
          seq: number;
          status: string;
          updated_at: string;
        };
        Insert: {
          body_hash: string;
          contact_id?: string | null;
          created_at?: string;
          crm_message_id?: string | null;
          id?: string;
          job_id: string;
          last_error?: string | null;
          organization_id: string;
          seq: number;
          status?: string;
          updated_at?: string;
        };
        Update: {
          body_hash?: string;
          contact_id?: string | null;
          created_at?: string;
          crm_message_id?: string | null;
          id?: string;
          job_id?: string;
          last_error?: string | null;
          organization_id?: string;
          seq?: number;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "send_ledger_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "send_ledger_job_id_fkey";
            columns: ["job_id"];
            isOneToOne: false;
            referencedRelation: "job_queue";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "send_ledger_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      shipment_orders: {
        Row: {
          created_at: string;
          entregue_em: string | null;
          entregue_lat: number | null;
          entregue_lng: number | null;
          id: string;
          motivo: string | null;
          order_id: string;
          organization_id: string;
          separado_em: string | null;
          separado_por: string | null;
          sequencia: number;
          shipment_id: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          entregue_em?: string | null;
          entregue_lat?: number | null;
          entregue_lng?: number | null;
          id?: string;
          motivo?: string | null;
          order_id: string;
          organization_id: string;
          separado_em?: string | null;
          separado_por?: string | null;
          sequencia?: number;
          shipment_id: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          entregue_em?: string | null;
          entregue_lat?: number | null;
          entregue_lng?: number | null;
          id?: string;
          motivo?: string | null;
          order_id?: string;
          organization_id?: string;
          separado_em?: string | null;
          separado_por?: string | null;
          sequencia?: number;
          shipment_id?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "shipment_orders_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "commercial_orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "shipment_orders_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "shipment_orders_shipment_id_fkey";
            columns: ["shipment_id"];
            isOneToOne: false;
            referencedRelation: "shipments";
            referencedColumns: ["id"];
          },
        ];
      };
      shipment_positions: {
        Row: {
          em: string;
          id: string;
          latitude: number;
          longitude: number;
          organization_id: string;
          por: string | null;
          precisao_m: number | null;
          shipment_id: string;
        };
        Insert: {
          em?: string;
          id?: string;
          latitude: number;
          longitude: number;
          organization_id: string;
          por?: string | null;
          precisao_m?: number | null;
          shipment_id: string;
        };
        Update: {
          em?: string;
          id?: string;
          latitude?: number;
          longitude?: number;
          organization_id?: string;
          por?: string | null;
          precisao_m?: number | null;
          shipment_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "shipment_positions_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "shipment_positions_shipment_id_fkey";
            columns: ["shipment_id"];
            isOneToOne: false;
            referencedRelation: "shipments";
            referencedColumns: ["id"];
          },
        ];
      };
      shipment_proofs: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          observacao: string | null;
          order_id: string;
          organization_id: string;
          shipment_id: string;
          storage_path: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          observacao?: string | null;
          order_id: string;
          organization_id: string;
          shipment_id: string;
          storage_path: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          observacao?: string | null;
          order_id?: string;
          organization_id?: string;
          shipment_id?: string;
          storage_path?: string;
        };
        Relationships: [
          {
            foreignKeyName: "shipment_proofs_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "commercial_orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "shipment_proofs_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "shipment_proofs_shipment_id_fkey";
            columns: ["shipment_id"];
            isOneToOne: false;
            referencedRelation: "shipments";
            referencedColumns: ["id"];
          },
        ];
      };
      shipments: {
        Row: {
          created_at: string;
          created_by: string | null;
          distancia_m: number | null;
          duracao_s: number | null;
          finished_at: string | null;
          id: string;
          motorista_nome: string | null;
          numero: number;
          organization_id: string;
          origem_endereco: string | null;
          origem_lat: number | null;
          origem_lng: number | null;
          placa: string | null;
          retornar_origem: boolean;
          rota_em: string | null;
          rota_geojson: Json | null;
          rota_versao: number;
          started_at: string | null;
          started_by: string | null;
          status: string;
          tempo_parada_min: number;
          updated_at: string;
          veiculo_tipo: string | null;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          distancia_m?: number | null;
          duracao_s?: number | null;
          finished_at?: string | null;
          id?: string;
          motorista_nome?: string | null;
          numero: number;
          organization_id: string;
          origem_endereco?: string | null;
          origem_lat?: number | null;
          origem_lng?: number | null;
          placa?: string | null;
          retornar_origem?: boolean;
          rota_em?: string | null;
          rota_geojson?: Json | null;
          rota_versao?: number;
          started_at?: string | null;
          started_by?: string | null;
          status?: string;
          tempo_parada_min?: number;
          updated_at?: string;
          veiculo_tipo?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          distancia_m?: number | null;
          duracao_s?: number | null;
          finished_at?: string | null;
          id?: string;
          motorista_nome?: string | null;
          numero?: number;
          organization_id?: string;
          origem_endereco?: string | null;
          origem_lat?: number | null;
          origem_lng?: number | null;
          placa?: string | null;
          retornar_origem?: boolean;
          rota_em?: string | null;
          rota_geojson?: Json | null;
          rota_versao?: number;
          started_at?: string | null;
          started_by?: string | null;
          status?: string;
          tempo_parada_min?: number;
          updated_at?: string;
          veiculo_tipo?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "shipments_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      skill_activations: {
        Row: {
          created_at: string;
          id: string;
          job_id: string | null;
          organization_id: string;
          skill_name: string;
          skill_version_id: string | null;
          trigger: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          job_id?: string | null;
          organization_id: string;
          skill_name: string;
          skill_version_id?: string | null;
          trigger: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          job_id?: string | null;
          organization_id?: string;
          skill_name?: string;
          skill_version_id?: string | null;
          trigger?: string;
        };
        Relationships: [
          {
            foreignKeyName: "skill_activations_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "skill_activations_skill_version_id_fkey";
            columns: ["skill_version_id"];
            isOneToOne: false;
            referencedRelation: "skill_versions";
            referencedColumns: ["id"];
          },
        ];
      };
      skill_pointers: {
        Row: {
          name: string;
          organization_id: string | null;
          updated_at: string;
          version_id: string;
        };
        Insert: {
          name: string;
          organization_id?: string | null;
          updated_at?: string;
          version_id: string;
        };
        Update: {
          name?: string;
          organization_id?: string | null;
          updated_at?: string;
          version_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "skill_pointers_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "skill_pointers_version_id_fkey";
            columns: ["version_id"];
            isOneToOne: false;
            referencedRelation: "skill_versions";
            referencedColumns: ["id"];
          },
        ];
      };
      skill_versions: {
        Row: {
          body: string;
          created_at: string;
          description: string;
          forked_from_version_id: string | null;
          id: string;
          manifest: NonNullable<Json>;
          matcher: NonNullable<Json>;
          name: string;
          organization_id: string | null;
        };
        Insert: {
          body: string;
          created_at?: string;
          description: string;
          forked_from_version_id?: string | null;
          id?: string;
          manifest?: NonNullable<Json>;
          matcher?: NonNullable<Json>;
          name: string;
          organization_id?: string | null;
        };
        Update: {
          body?: string;
          created_at?: string;
          description?: string;
          forked_from_version_id?: string | null;
          id?: string;
          manifest?: NonNullable<Json>;
          matcher?: NonNullable<Json>;
          name?: string;
          organization_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "skill_versions_forked_from_version_id_fkey";
            columns: ["forked_from_version_id"];
            isOneToOne: false;
            referencedRelation: "skill_versions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "skill_versions_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      storage_redaction_queue: {
        Row: {
          attempts: number;
          bucket: string;
          enqueued_at: string;
          error_message: string | null;
          id: string;
          object_path: string;
          organization_id: string;
          processed_at: string | null;
          request_id: string | null;
          status: string;
        };
        Insert: {
          attempts?: number;
          bucket: string;
          enqueued_at?: string;
          error_message?: string | null;
          id?: string;
          object_path: string;
          organization_id: string;
          processed_at?: string | null;
          request_id?: string | null;
          status?: string;
        };
        Update: {
          attempts?: number;
          bucket?: string;
          enqueued_at?: string;
          error_message?: string | null;
          id?: string;
          object_path?: string;
          organization_id?: string;
          processed_at?: string | null;
          request_id?: string | null;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "storage_redaction_queue_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "storage_redaction_queue_request_id_fkey";
            columns: ["request_id"];
            isOneToOne: false;
            referencedRelation: "lgpd_requests";
            referencedColumns: ["id"];
          },
        ];
      };
      suppliers: {
        Row: {
          ativo: boolean;
          cnpj: string | null;
          created_at: string;
          email: string | null;
          id: string;
          nome: string;
          observacoes: string | null;
          organization_id: string;
          telefone: string | null;
          updated_at: string;
        };
        Insert: {
          ativo?: boolean;
          cnpj?: string | null;
          created_at?: string;
          email?: string | null;
          id?: string;
          nome: string;
          observacoes?: string | null;
          organization_id: string;
          telefone?: string | null;
          updated_at?: string;
        };
        Update: {
          ativo?: boolean;
          cnpj?: string | null;
          created_at?: string;
          email?: string | null;
          id?: string;
          nome?: string;
          observacoes?: string | null;
          organization_id?: string;
          telefone?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "suppliers_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      system_update_runs: {
        Row: {
          dispatched_at: string;
          finished_at: string | null;
          from_version: string;
          id: string;
          last_step: string | null;
          log_tail: string;
          requested_by: string | null;
          status: string;
          to_version: string;
        };
        Insert: {
          dispatched_at?: string;
          finished_at?: string | null;
          from_version?: string;
          id?: string;
          last_step?: string | null;
          log_tail?: string;
          requested_by?: string | null;
          status?: string;
          to_version?: string;
        };
        Update: {
          dispatched_at?: string;
          finished_at?: string | null;
          from_version?: string;
          id?: string;
          last_step?: string | null;
          log_tail?: string;
          requested_by?: string | null;
          status?: string;
          to_version?: string;
        };
        Relationships: [];
      };
      system_version: {
        Row: {
          agent_last_seen_at: string | null;
          changelog_raw: string;
          compare_failed: boolean;
          current_sha: string;
          current_version: string;
          has_known_release: boolean;
          id: number;
          latest_version: string;
          off_release: boolean;
          update_requested_at: string | null;
          update_requested_by: string | null;
          updated_at: string;
        };
        Insert: {
          agent_last_seen_at?: string | null;
          changelog_raw?: string;
          compare_failed?: boolean;
          current_sha?: string;
          current_version?: string;
          has_known_release?: boolean;
          id?: number;
          latest_version?: string;
          off_release?: boolean;
          update_requested_at?: string | null;
          update_requested_by?: string | null;
          updated_at?: string;
        };
        Update: {
          agent_last_seen_at?: string | null;
          changelog_raw?: string;
          compare_failed?: boolean;
          current_sha?: string;
          current_version?: string;
          has_known_release?: boolean;
          id?: number;
          latest_version?: string;
          off_release?: boolean;
          update_requested_at?: string | null;
          update_requested_by?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      tenant_integrations: {
        Row: {
          created_at: string;
          expires_at: string | null;
          id: string;
          last_health_check_at: string | null;
          last_sync_at: string | null;
          oauth_access_token_encrypted: string;
          oauth_refresh_token_encrypted: string | null;
          organization_id: string;
          provider: string;
          scopes: string[];
          status: string;
          status_reason: string | null;
          store_metadata: NonNullable<Json>;
          updated_at: string;
          webhook_path_token: string;
          webhook_secret_encrypted: string;
          webhook_subscriptions: NonNullable<Json>;
        };
        Insert: {
          created_at?: string;
          expires_at?: string | null;
          id?: string;
          last_health_check_at?: string | null;
          last_sync_at?: string | null;
          oauth_access_token_encrypted: string;
          oauth_refresh_token_encrypted?: string | null;
          organization_id: string;
          provider: string;
          scopes?: string[];
          status?: string;
          status_reason?: string | null;
          store_metadata?: NonNullable<Json>;
          updated_at?: string;
          webhook_path_token?: string;
          webhook_secret_encrypted: string;
          webhook_subscriptions?: NonNullable<Json>;
        };
        Update: {
          created_at?: string;
          expires_at?: string | null;
          id?: string;
          last_health_check_at?: string | null;
          last_sync_at?: string | null;
          oauth_access_token_encrypted?: string;
          oauth_refresh_token_encrypted?: string | null;
          organization_id?: string;
          provider?: string;
          scopes?: string[];
          status?: string;
          status_reason?: string | null;
          store_metadata?: NonNullable<Json>;
          updated_at?: string;
          webhook_path_token?: string;
          webhook_secret_encrypted?: string;
          webhook_subscriptions?: NonNullable<Json>;
        };
        Relationships: [
          {
            foreignKeyName: "tenant_integrations_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      user_organizations: {
        Row: {
          accepted_at: string | null;
          calendar_trilha: number | null;
          created_at: string;
          id: string;
          invited_at: string | null;
          invited_by: string | null;
          organization_id: string;
          revoked_at: string | null;
          role: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          accepted_at?: string | null;
          calendar_trilha?: number | null;
          created_at?: string;
          id?: string;
          invited_at?: string | null;
          invited_by?: string | null;
          organization_id: string;
          revoked_at?: string | null;
          role: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          accepted_at?: string | null;
          calendar_trilha?: number | null;
          created_at?: string;
          id?: string;
          invited_at?: string | null;
          invited_by?: string | null;
          organization_id?: string;
          revoked_at?: string | null;
          role?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_organizations_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      user_recovery_codes: {
        Row: {
          code_hash: string;
          created_at: string;
          id: string;
          used_at: string | null;
          used_ip: unknown;
          user_id: string;
        };
        Insert: {
          code_hash: string;
          created_at?: string;
          id?: string;
          used_at?: string | null;
          used_ip?: unknown;
          user_id: string;
        };
        Update: {
          code_hash?: string;
          created_at?: string;
          id?: string;
          used_at?: string | null;
          used_ip?: unknown;
          user_id?: string;
        };
        Relationships: [];
      };
      watchdog_cursors: {
        Row: {
          consumer: string;
          last_created_at: string;
          last_event_id: string;
          updated_at: string;
        };
        Insert: {
          consumer: string;
          last_created_at?: string;
          last_event_id?: string;
          updated_at?: string;
        };
        Update: {
          consumer?: string;
          last_created_at?: string;
          last_event_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      webhook_events_log: {
        Row: {
          archived_at: string | null;
          attempts: number;
          channel_session_id: string | null;
          error_message: string | null;
          event_type: string | null;
          external_id: string | null;
          headers: Json | null;
          http_method: string;
          id: string;
          organization_id: string | null;
          payload_parsed: Json | null;
          processed_at: string | null;
          provider: string;
          raw_body: string | null;
          received_at: string;
          signature_header: string | null;
          status: string;
          valid_signature: boolean | null;
          webhook_path_token: string | null;
        };
        Insert: {
          archived_at?: string | null;
          attempts?: number;
          channel_session_id?: string | null;
          error_message?: string | null;
          event_type?: string | null;
          external_id?: string | null;
          headers?: Json | null;
          http_method?: string;
          id?: string;
          organization_id?: string | null;
          payload_parsed?: Json | null;
          processed_at?: string | null;
          provider?: string;
          raw_body?: string | null;
          received_at?: string;
          signature_header?: string | null;
          status?: string;
          valid_signature?: boolean | null;
          webhook_path_token?: string | null;
        };
        Update: {
          archived_at?: string | null;
          attempts?: number;
          channel_session_id?: string | null;
          error_message?: string | null;
          event_type?: string | null;
          external_id?: string | null;
          headers?: Json | null;
          http_method?: string;
          id?: string;
          organization_id?: string | null;
          payload_parsed?: Json | null;
          processed_at?: string | null;
          provider?: string;
          raw_body?: string | null;
          received_at?: string;
          signature_header?: string | null;
          status?: string;
          valid_signature?: boolean | null;
          webhook_path_token?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "webhook_events_log_channel_session_id_fkey";
            columns: ["channel_session_id"];
            isOneToOne: false;
            referencedRelation: "channel_sessions";
            referencedColumns: ["id"];
          },
        ];
      };
      webhook_lead_captures: {
        Row: {
          captured_email: string | null;
          captured_name: string | null;
          captured_phone: string | null;
          contact_id: string | null;
          fields: NonNullable<Json>;
          id: string;
          lead_id: string | null;
          organization_id: string;
          origin: string | null;
          outcome: string;
          received_at: string;
          reject_reason: string | null;
          remote_ip: unknown;
          request_id: string | null;
          source_name: string;
          user_agent: string | null;
          utm: NonNullable<Json>;
          webhook_source_id: string | null;
        };
        Insert: {
          captured_email?: string | null;
          captured_name?: string | null;
          captured_phone?: string | null;
          contact_id?: string | null;
          fields?: NonNullable<Json>;
          id?: string;
          lead_id?: string | null;
          organization_id: string;
          origin?: string | null;
          outcome: string;
          received_at?: string;
          reject_reason?: string | null;
          remote_ip?: unknown;
          request_id?: string | null;
          source_name: string;
          user_agent?: string | null;
          utm?: NonNullable<Json>;
          webhook_source_id?: string | null;
        };
        Update: {
          captured_email?: string | null;
          captured_name?: string | null;
          captured_phone?: string | null;
          contact_id?: string | null;
          fields?: NonNullable<Json>;
          id?: string;
          lead_id?: string | null;
          organization_id?: string;
          origin?: string | null;
          outcome?: string;
          received_at?: string;
          reject_reason?: string | null;
          remote_ip?: unknown;
          request_id?: string | null;
          source_name?: string;
          user_agent?: string | null;
          utm?: NonNullable<Json>;
          webhook_source_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "webhook_lead_captures_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "webhook_lead_captures_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: false;
            referencedRelation: "crm_leads";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "webhook_lead_captures_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "webhook_lead_captures_webhook_source_id_fkey";
            columns: ["webhook_source_id"];
            isOneToOne: false;
            referencedRelation: "webhook_sources";
            referencedColumns: ["id"];
          },
        ];
      };
      webhook_sources: {
        Row: {
          created_at: string;
          created_by_user_id: string | null;
          default_pipeline_id: string;
          default_stage_id: string;
          field_map: NonNullable<Json>;
          id: string;
          is_active: boolean;
          kind: string;
          last_change_actor_kind: string | null;
          last_change_at: string | null;
          last_received_at: string | null;
          name: string;
          organization_id: string;
          path_token: string;
          redirect_to: string | null;
          secret_encrypted: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by_user_id?: string | null;
          default_pipeline_id: string;
          default_stage_id: string;
          field_map?: NonNullable<Json>;
          id?: string;
          is_active?: boolean;
          kind?: string;
          last_change_actor_kind?: string | null;
          last_change_at?: string | null;
          last_received_at?: string | null;
          name: string;
          organization_id: string;
          path_token: string;
          redirect_to?: string | null;
          secret_encrypted?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by_user_id?: string | null;
          default_pipeline_id?: string;
          default_stage_id?: string;
          field_map?: NonNullable<Json>;
          id?: string;
          is_active?: boolean;
          kind?: string;
          last_change_actor_kind?: string | null;
          last_change_at?: string | null;
          last_received_at?: string | null;
          name?: string;
          organization_id?: string;
          path_token?: string;
          redirect_to?: string | null;
          secret_encrypted?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "webhook_sources_default_pipeline_id_fkey";
            columns: ["default_pipeline_id"];
            isOneToOne: false;
            referencedRelation: "crm_pipelines";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "webhook_sources_default_stage_id_fkey";
            columns: ["default_stage_id"];
            isOneToOne: false;
            referencedRelation: "crm_stages";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "webhook_sources_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      ai_provider_credentials_safe: {
        Row: {
          api_key_last4: string | null;
          created_at: string | null;
          created_by: string | null;
          id: string | null;
          is_active: boolean | null;
          label: string | null;
          models_available: string[] | null;
          organization_id: string | null;
          provider: string | null;
          updated_at: string | null;
          validated_at: string | null;
          validation_error: string | null;
        };
        Insert: {
          api_key_last4?: string | null;
          created_at?: string | null;
          created_by?: string | null;
          id?: string | null;
          is_active?: boolean | null;
          label?: string | null;
          models_available?: string[] | null;
          organization_id?: string | null;
          provider?: string | null;
          updated_at?: string | null;
          validated_at?: string | null;
          validation_error?: string | null;
        };
        Update: {
          api_key_last4?: string | null;
          created_at?: string | null;
          created_by?: string | null;
          id?: string | null;
          is_active?: boolean | null;
          label?: string | null;
          models_available?: string[] | null;
          organization_id?: string | null;
          provider?: string | null;
          updated_at?: string | null;
          validated_at?: string | null;
          validation_error?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "ai_provider_credentials_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Functions: {
      activate_kb_version: {
        Args: { p_agent_id: string; p_version_id: string };
        Returns: undefined;
      };
      comando_da_conversa: {
        Args: { c: Database["public"]["Tables"]["conversations"]["Row"] };
        Returns: string;
      };
      emit_event: {
        Args: {
          p_entity_id: string;
          p_entity_kind: string;
          p_event_type: string;
          p_metadata?: Json;
          p_organization_id?: string;
          p_payload?: Json;
        };
        Returns: string;
      };
      fn_agent_tool_usage: {
        Args: {
          p_agent_id: string;
          p_organization_id: string;
          p_since: string;
        };
        Returns: {
          em_teste: number;
          falhas: number;
          tool_name: string;
          total: number;
          ultima_vez: string;
        }[];
      };
      fn_agora: { Args: Record<PropertyKey, never>; Returns: string };
      fn_aplicar_quadro_do_onboarding: {
        Args: {
          p_etapas: Json;
          p_nome: string;
          p_organization_id: string;
          p_pipeline_id: string;
          p_slug: string;
        };
        Returns: Json;
      };
      fn_atrito_jaccard: { Args: { a: string; b: string }; Returns: number };
      fn_atrito_metrics: {
        Args: {
          p_abandono_horas?: number;
          p_espera_horas?: number;
          p_from: string;
          p_org: string;
          p_repeticao_min?: number;
          p_to: string;
        };
        Returns: Json;
      };
      fn_attendant_metrics: {
        Args: { p_from: string; p_org: string; p_owner?: string; p_to: string };
        Returns: Json;
      };
      fn_buscar_trechos_das_fontes: {
        Args: {
          p_embedding: string;
          p_embedding_model?: string;
          p_k?: number;
          p_organization_id: string;
          p_source_ids: string[];
          p_threshold?: number;
        };
        Returns: {
          chunk_id: string;
          content: string;
          knowledge_source_id: string;
          metadata: Json;
          similarity: number;
          source_name: string;
        }[];
      };
      fn_can_view_conversation: {
        Args: { p_assigned_to_user_id: string; p_org: string };
        Returns: boolean;
      };
      fn_can_view_lead: {
        Args: { p_org: string; p_owner_user_id: string };
        Returns: boolean;
      };
      fn_claim_due_followup_enrollments: {
        Args: { p_lease_seconds: number; p_limit: number };
        Returns: {
          agent_id: string | null;
          attempts: number;
          cancel_reason: string | null;
          claimed_until: string | null;
          completed_at: string | null;
          contact_id: string;
          conversation_id: string | null;
          current_node_id: string;
          id: string;
          last_error: string | null;
          max_attempts: number;
          next_eval_at: string | null;
          organization_id: string;
          outcome: string | null;
          pointer_id: string;
          started_at: string;
          status: string;
          steps_taken: number;
          timing_plan: Json | null;
          updated_at: string;
          version_id: string;
        }[];
        SetofOptions: {
          from: "*";
          to: "followup_enrollments";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      fn_comando_da_conversa: {
        Args: {
          p_agora: string;
          p_assigned_to_user_id: string;
          p_bot_silenced_until: string;
          p_force_human: boolean;
          p_is_blocked: boolean;
          p_status: string;
        };
        Returns: string;
      };
      fn_conversation_assign: {
        Args: {
          p_conversation_id: string;
          p_enforce_expected?: boolean;
          p_expected_assignee?: string;
          p_organization_id: string;
          p_reason: string;
          p_to_user_id: string;
        };
        Returns: {
          active_agent_set_at: string | null;
          active_ai_agent_id: string | null;
          active_intent: string | null;
          assigned_at: string | null;
          assigned_to_user_id: string | null;
          assigned_to_user_name: string | null;
          assignee_kind: string | null;
          bot_silenced_until: string | null;
          channel: string;
          channel_session_id: string;
          contact_id: string;
          created_at: string;
          group_chat_id: string | null;
          id: string;
          is_group: boolean;
          last_handoff_at: string | null;
          last_handoff_reason: string | null;
          last_inbound_at: string | null;
          last_message_at: string | null;
          last_message_preview: string | null;
          last_outbound_at: string | null;
          metadata: NonNullable<Json>;
          organization_id: string;
          provider_conversation_id: string | null;
          rag_review_status: string | null;
          snooze_until: string | null;
          snoozed_at: string | null;
          snoozed_by_user_id: string | null;
          status: string;
          status_changed_at: string;
          tags: string[];
          unread_count_for_assignee: number;
          updated_at: string;
          usable_for_rag: boolean;
          usable_for_rag_marked_at: string | null;
          usable_for_rag_marked_by: string | null;
        }[];
        SetofOptions: {
          from: "*";
          to: "conversations";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      fn_decrypt_oauth: { Args: { ciphertext: string }; Returns: string };
      fn_definir_logo_da_organizacao: {
        Args: { p_actor: string; p_org: string; p_path: string };
        Returns: number;
      };
      fn_definir_marca_da_organizacao: {
        Args: { p_actor: string; p_marca: Json; p_org: string };
        Returns: number;
      };
      fn_encrypt_oauth: { Args: { plaintext: string }; Returns: string };
      fn_estampar_atribuicao_de_anuncio: {
        Args: { p_contact: string; p_metadata: Json; p_platform: string };
        Returns: undefined;
      };
      fn_expurgar_auditoria_vencida: {
        Args: { p_limite?: number; p_retencao_dias?: number };
        Returns: number;
      };
      fn_expurgar_espelho_da_agenda: {
        Args: { p_limite?: number; p_retencao_dias?: number };
        Returns: number;
      };
      fn_expurgar_nonces_de_oauth: {
        Args: { p_limite?: number; p_retencao_dias?: number };
        Returns: number;
      };
      fn_gasto_de_ia_do_mes: { Args: { p_org: string }; Returns: number };
      fn_is_platform_admin: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      fn_lgpd_cascade_redact_contact: {
        Args: {
          p_contact_id: string;
          p_organization_id: string;
          p_request_id: string;
        };
        Returns: Json;
      };
      fn_log_event: {
        Args: {
          p_event_type: string;
          p_organization_id: string;
          p_payload?: Json;
        };
        Returns: string;
      };
      fn_mark_conversation_message: {
        Args: {
          p_at: string;
          p_conv: string;
          p_direction: string;
          p_preview: string;
        };
        Returns: undefined;
      };
      fn_member_role_in_org: {
        Args: { p_org: string; p_user: string };
        Returns: string;
      };
      fn_podar_fila_de_jobs: {
        Args: { p_limite?: number; p_retencao_dias?: number };
        Returns: number;
      };
      fn_proximo_numero_carga: { Args: { p_org: string }; Returns: number };
      fn_proximo_numero_compra: { Args: { p_org: string }; Returns: number };
      fn_proximo_numero_pedido: { Args: { p_org: string }; Returns: number };
      fn_publish_ai_agent_version: {
        Args: { p_agent_id: string; p_org_id: string; p_version_id: string };
        Returns: {
          agent_id: string;
          previous_version_id: string;
          published_at: string;
          version_id: string;
        }[];
      };
      fn_publish_followup_flow_version: {
        Args: {
          p_created_by: string;
          p_graph: Json;
          p_org: string;
          p_pointer: string;
        };
        Returns: string;
      };
      fn_role_at_least: {
        Args: { p_min: string; p_org: string };
        Returns: boolean;
      };
      fn_semear_tipos_de_agendamento: {
        Args: { p_organization_id: string };
        Returns: number;
      };
      fn_upsert_wa_contact: {
        Args: {
          p_chat_id: string;
          p_kind: string;
          p_lid: string;
          p_notify: string;
          p_org: string;
          p_phone: string;
        };
        Returns: string;
      };
      fn_upsert_wa_conversation: {
        Args: { p_contact: string; p_org: string; p_session: string };
        Returns: string;
      };
      fn_user_org_ids: { Args: Record<PropertyKey, never>; Returns: string[] };
      fn_user_role_in: { Args: { p_org: string }; Returns: number };
      fn_user_role_in_org: { Args: { p_org: string }; Returns: string };
      midpoint: { Args: { p_next: number; p_prev: number }; Returns: number };
      retrieve_top_k_chunks: {
        Args: {
          p_embedding: string;
          p_k?: number;
          p_kb_version_id: string;
          p_organization_id: string;
          p_threshold?: number;
        };
        Returns: {
          chunk_id: string;
          content: string;
          knowledge_source_id: string;
          metadata: Json;
          similarity: number;
        }[];
      };
      show_limit: { Args: Record<PropertyKey, never>; Returns: number };
      show_trgm: { Args: { "": string }; Returns: string[] };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  storage: {
    Tables: {
      buckets: {
        Row: {
          allowed_mime_types: string[] | null;
          avif_autodetection: boolean | null;
          created_at: string | null;
          file_size_limit: number | null;
          id: string;
          lifecycle_configuration: Json | null;
          lifecycle_configuration_generation: string | null;
          name: string;
          owner: string | null;
          owner_id: string | null;
          public: boolean | null;
          type: Database["storage"]["Enums"]["buckettype"];
          updated_at: string | null;
          versioning_status: string;
        };
        Insert: {
          allowed_mime_types?: string[] | null;
          avif_autodetection?: boolean | null;
          created_at?: string | null;
          file_size_limit?: number | null;
          id: string;
          lifecycle_configuration?: Json | null;
          lifecycle_configuration_generation?: string | null;
          name: string;
          owner?: string | null;
          owner_id?: string | null;
          public?: boolean | null;
          type?: Database["storage"]["Enums"]["buckettype"];
          updated_at?: string | null;
          versioning_status?: string;
        };
        Update: {
          allowed_mime_types?: string[] | null;
          avif_autodetection?: boolean | null;
          created_at?: string | null;
          file_size_limit?: number | null;
          id?: string;
          lifecycle_configuration?: Json | null;
          lifecycle_configuration_generation?: string | null;
          name?: string;
          owner?: string | null;
          owner_id?: string | null;
          public?: boolean | null;
          type?: Database["storage"]["Enums"]["buckettype"];
          updated_at?: string | null;
          versioning_status?: string;
        };
        Relationships: [];
      };
      buckets_analytics: {
        Row: {
          created_at: string;
          deleted_at: string | null;
          format: string;
          id: string;
          name: string;
          type: Database["storage"]["Enums"]["buckettype"];
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          deleted_at?: string | null;
          format?: string;
          id?: string;
          name: string;
          type?: Database["storage"]["Enums"]["buckettype"];
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          deleted_at?: string | null;
          format?: string;
          id?: string;
          name?: string;
          type?: Database["storage"]["Enums"]["buckettype"];
          updated_at?: string;
        };
        Relationships: [];
      };
      buckets_vectors: {
        Row: {
          created_at: string;
          id: string;
          type: Database["storage"]["Enums"]["buckettype"];
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id: string;
          type?: Database["storage"]["Enums"]["buckettype"];
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          type?: Database["storage"]["Enums"]["buckettype"];
          updated_at?: string;
        };
        Relationships: [];
      };
      iceberg_namespaces: {
        Row: {
          bucket_name: string;
          catalog_id: string;
          created_at: string;
          id: string;
          metadata: NonNullable<Json>;
          name: string;
          updated_at: string;
        };
        Insert: {
          bucket_name: string;
          catalog_id: string;
          created_at?: string;
          id?: string;
          metadata?: NonNullable<Json>;
          name: string;
          updated_at?: string;
        };
        Update: {
          bucket_name?: string;
          catalog_id?: string;
          created_at?: string;
          id?: string;
          metadata?: NonNullable<Json>;
          name?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "iceberg_namespaces_catalog_id_fkey";
            columns: ["catalog_id"];
            isOneToOne: false;
            referencedRelation: "buckets_analytics";
            referencedColumns: ["id"];
          },
        ];
      };
      iceberg_tables: {
        Row: {
          bucket_name: string;
          catalog_id: string;
          created_at: string;
          id: string;
          location: string;
          name: string;
          namespace_id: string;
          remote_table_id: string | null;
          shard_id: string | null;
          shard_key: string | null;
          updated_at: string;
        };
        Insert: {
          bucket_name: string;
          catalog_id: string;
          created_at?: string;
          id?: string;
          location: string;
          name: string;
          namespace_id: string;
          remote_table_id?: string | null;
          shard_id?: string | null;
          shard_key?: string | null;
          updated_at?: string;
        };
        Update: {
          bucket_name?: string;
          catalog_id?: string;
          created_at?: string;
          id?: string;
          location?: string;
          name?: string;
          namespace_id?: string;
          remote_table_id?: string | null;
          shard_id?: string | null;
          shard_key?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "iceberg_tables_catalog_id_fkey";
            columns: ["catalog_id"];
            isOneToOne: false;
            referencedRelation: "buckets_analytics";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "iceberg_tables_namespace_id_fkey";
            columns: ["namespace_id"];
            isOneToOne: false;
            referencedRelation: "iceberg_namespaces";
            referencedColumns: ["id"];
          },
        ];
      };
      migrations: {
        Row: {
          executed_at: string | null;
          hash: string;
          id: number;
          name: string;
        };
        Insert: {
          executed_at?: string | null;
          hash: string;
          id: number;
          name: string;
        };
        Update: {
          executed_at?: string | null;
          hash?: string;
          id?: number;
          name?: string;
        };
        Relationships: [];
      };
      objects: {
        Row: {
          archived_at: string | null;
          bucket_id: string | null;
          created_at: string | null;
          id: string;
          is_delete_marker: boolean;
          is_versioned: boolean;
          last_accessed_at: string | null;
          metadata: Json | null;
          name: string | null;
          owner: string | null;
          owner_id: string | null;
          path_tokens: string[] | null;
          updated_at: string | null;
          user_metadata: Json | null;
          version: string | null;
        };
        Insert: {
          archived_at?: string | null;
          bucket_id?: string | null;
          created_at?: string | null;
          id?: string;
          is_delete_marker?: boolean;
          is_versioned?: boolean;
          last_accessed_at?: string | null;
          metadata?: Json | null;
          name?: string | null;
          owner?: string | null;
          owner_id?: string | null;
          path_tokens?: never;
          updated_at?: string | null;
          user_metadata?: Json | null;
          version?: string | null;
        };
        Update: {
          archived_at?: string | null;
          bucket_id?: string | null;
          created_at?: string | null;
          id?: string;
          is_delete_marker?: boolean;
          is_versioned?: boolean;
          last_accessed_at?: string | null;
          metadata?: Json | null;
          name?: string | null;
          owner?: string | null;
          owner_id?: string | null;
          path_tokens?: never;
          updated_at?: string | null;
          user_metadata?: Json | null;
          version?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "objects_bucketId_fkey";
            columns: ["bucket_id"];
            isOneToOne: false;
            referencedRelation: "buckets";
            referencedColumns: ["id"];
          },
        ];
      };
      s3_multipart_uploads: {
        Row: {
          bucket_id: string;
          created_at: string;
          id: string;
          in_progress_size: number;
          key: string;
          metadata: Json | null;
          owner_id: string | null;
          upload_signature: string;
          user_metadata: Json | null;
          version: string;
        };
        Insert: {
          bucket_id: string;
          created_at?: string;
          id: string;
          in_progress_size?: number;
          key: string;
          metadata?: Json | null;
          owner_id?: string | null;
          upload_signature: string;
          user_metadata?: Json | null;
          version: string;
        };
        Update: {
          bucket_id?: string;
          created_at?: string;
          id?: string;
          in_progress_size?: number;
          key?: string;
          metadata?: Json | null;
          owner_id?: string | null;
          upload_signature?: string;
          user_metadata?: Json | null;
          version?: string;
        };
        Relationships: [
          {
            foreignKeyName: "s3_multipart_uploads_bucket_id_fkey";
            columns: ["bucket_id"];
            isOneToOne: false;
            referencedRelation: "buckets";
            referencedColumns: ["id"];
          },
        ];
      };
      s3_multipart_uploads_parts: {
        Row: {
          bucket_id: string;
          created_at: string;
          etag: string;
          id: string;
          key: string;
          owner_id: string | null;
          part_number: number;
          size: number;
          upload_id: string;
          version: string;
        };
        Insert: {
          bucket_id: string;
          created_at?: string;
          etag: string;
          id?: string;
          key: string;
          owner_id?: string | null;
          part_number: number;
          size?: number;
          upload_id: string;
          version: string;
        };
        Update: {
          bucket_id?: string;
          created_at?: string;
          etag?: string;
          id?: string;
          key?: string;
          owner_id?: string | null;
          part_number?: number;
          size?: number;
          upload_id?: string;
          version?: string;
        };
        Relationships: [
          {
            foreignKeyName: "s3_multipart_uploads_parts_bucket_id_fkey";
            columns: ["bucket_id"];
            isOneToOne: false;
            referencedRelation: "buckets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "s3_multipart_uploads_parts_upload_id_fkey";
            columns: ["upload_id"];
            isOneToOne: false;
            referencedRelation: "s3_multipart_uploads";
            referencedColumns: ["id"];
          },
        ];
      };
      vector_indexes: {
        Row: {
          bucket_id: string;
          created_at: string;
          data_type: string;
          dimension: number;
          distance_metric: string;
          id: string;
          metadata_configuration: Json | null;
          name: string;
          updated_at: string;
        };
        Insert: {
          bucket_id: string;
          created_at?: string;
          data_type: string;
          dimension: number;
          distance_metric: string;
          id?: string;
          metadata_configuration?: Json | null;
          name: string;
          updated_at?: string;
        };
        Update: {
          bucket_id?: string;
          created_at?: string;
          data_type?: string;
          dimension?: number;
          distance_metric?: string;
          id?: string;
          metadata_configuration?: Json | null;
          name?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "vector_indexes_bucket_id_fkey";
            columns: ["bucket_id"];
            isOneToOne: false;
            referencedRelation: "buckets_vectors";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      allow_any_operation: {
        Args: { expected_operations: string[] };
        Returns: boolean;
      };
      allow_only_operation: {
        Args: { expected_operation: string };
        Returns: boolean;
      };
      can_insert_object: {
        Args: { bucketid: string; metadata: Json; name: string; owner: string };
        Returns: undefined;
      };
      extension: { Args: { name: string }; Returns: string };
      filename: { Args: { name: string }; Returns: string };
      foldername: { Args: { name: string }; Returns: string[] };
      get_common_prefix: {
        Args: { p_delimiter: string; p_key: string; p_prefix: string };
        Returns: string;
      };
      get_size_by_bucket: {
        Args: { delete_markers?: string; noncurrent_versions?: string };
        Returns: {
          bucket_id: string;
          size: number;
        }[];
      };
      list_multipart_uploads_with_delimiter: {
        Args: {
          bucket_id: string;
          delimiter_param: string;
          max_keys?: number;
          next_key_token?: string;
          next_upload_token?: string;
          prefix_param: string;
          raw_prefix_param?: string;
        };
        Returns: {
          created_at: string;
          id: string;
          key: string;
        }[];
      };
      list_objects_with_delimiter: {
        Args: {
          _bucket_id: string;
          delete_markers?: string;
          delimiter_param: string;
          max_keys?: number;
          next_token?: string;
          next_token_archived_at?: string;
          next_token_version?: string;
          noncurrent_versions?: string;
          prefix_param: string;
          sort_order?: string;
          start_after?: string;
        };
        Returns: {
          archived_at: string;
          created_at: string;
          id: string;
          is_delete_marker: boolean;
          is_versioned: boolean;
          last_accessed_at: string;
          metadata: Json;
          name: string;
          updated_at: string;
          version: string;
        }[];
      };
      operation: { Args: Record<PropertyKey, never>; Returns: string };
      search: {
        Args: {
          bucketname: string;
          delete_markers?: string;
          levels?: number;
          limits?: number;
          noncurrent_versions?: string;
          offsets?: number;
          prefix: string;
          search?: string;
          sortcolumn?: string;
          sortorder?: string;
        };
        Returns: {
          archived_at: string;
          created_at: string;
          id: string;
          is_delete_marker: boolean;
          is_versioned: boolean;
          last_accessed_at: string;
          metadata: Json;
          name: string;
          updated_at: string;
          version: string;
        }[];
      };
      search_by_timestamp: {
        Args: {
          delete_markers?: string;
          noncurrent_versions?: string;
          p_bucket_id: string;
          p_level: number;
          p_limit: number;
          p_prefix: string;
          p_sort_column: string;
          p_sort_column_after: string;
          p_sort_order: string;
          p_start_after: string;
          p_start_after_version?: string;
        };
        Returns: {
          archived_at: string;
          created_at: string;
          id: string;
          is_delete_marker: boolean;
          is_versioned: boolean;
          key: string;
          last_accessed_at: string;
          metadata: Json;
          name: string;
          updated_at: string;
          version: string;
        }[];
      };
      search_v2: {
        Args: {
          bucket_name: string;
          delete_markers?: string;
          levels?: number;
          limits?: number;
          noncurrent_versions?: string;
          prefix: string;
          sort_column?: string;
          sort_column_after?: string;
          sort_order?: string;
          start_after?: string;
          start_after_archived_at?: string;
          start_after_is_continuation?: boolean;
          start_after_version?: string;
        };
        Returns: {
          archived_at: string;
          created_at: string;
          id: string;
          is_delete_marker: boolean;
          is_versioned: boolean;
          key: string;
          last_accessed_at: string;
          metadata: Json;
          name: string;
          updated_at: string;
          version: string;
        }[];
      };
    };
    Enums: {
      buckettype: "STANDARD" | "ANALYTICS" | "VECTOR";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
  storage: {
    Enums: {
      buckettype: ["STANDARD", "ANALYTICS", "VECTOR"],
    },
  },
} as const;
