// Gerado automaticamente via Supabase MCP — não editar manualmente
// Projeto: loteamentos-intel (aohtryeawadcaaevecdx)

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Permite ao createClient selecionar os overloads corretos de queries
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      agendamentos: {
        Row: {
          corretor_notif: boolean | null
          created_at: string | null
          data_visita: string
          dor_principal: string | null
          hora_visita: string
          id: string
          lead_name: string | null
          lead_phone: string
          status: string | null
          updated_at: string | null
        }
        Insert: {
          corretor_notif?: boolean | null
          created_at?: string | null
          data_visita: string
          dor_principal?: string | null
          hora_visita: string
          id?: string
          lead_name?: string | null
          lead_phone: string
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          corretor_notif?: boolean | null
          created_at?: string | null
          data_visita?: string
          dor_principal?: string | null
          hora_visita?: string
          id?: string
          lead_name?: string | null
          lead_phone?: string
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agendamentos_lead_phone_fkey"
            columns: ["lead_phone"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["phone"]
          },
        ]
      }
      config: {
        Row: {
          key: string
          updated_at: string | null
          value: string
        }
        Insert: {
          key: string
          updated_at?: string | null
          value: string
        }
        Update: {
          key?: string
          updated_at?: string | null
          value?: string
        }
        Relationships: []
      }
      leads: {
        Row: {
          client_profile: string | null
          created_at: string | null
          dor_principal: string | null
          followup_count: number | null
          id: string
          implicacao: string | null
          interesse: string | null
          last_objection: string | null
          lote_interesse: string | null
          name: string | null
          phone: string
          situacao: string | null
          spin_stage: string | null
          updated_at: string | null
        }
        Insert: {
          client_profile?: string | null
          created_at?: string | null
          dor_principal?: string | null
          followup_count?: number | null
          id?: string
          implicacao?: string | null
          interesse?: string | null
          last_objection?: string | null
          lote_interesse?: string | null
          name?: string | null
          phone: string
          situacao?: string | null
          spin_stage?: string | null
          updated_at?: string | null
        }
        Update: {
          client_profile?: string | null
          created_at?: string | null
          dor_principal?: string | null
          followup_count?: number | null
          id?: string
          implicacao?: string | null
          interesse?: string | null
          last_objection?: string | null
          lote_interesse?: string | null
          name?: string | null
          phone?: string
          situacao?: string | null
          spin_stage?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      mensagens: {
        Row: {
          content: string
          created_at: string | null
          id: string
          lead_phone: string
          media_type: string | null
          role: string
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          lead_phone: string
          media_type?: string | null
          role: string
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          lead_phone?: string
          media_type?: string | null
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "mensagens_lead_phone_fkey"
            columns: ["lead_phone"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["phone"]
          },
        ]
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
