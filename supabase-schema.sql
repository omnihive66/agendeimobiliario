-- ============================================================
-- SPIN Agent · Nova Luziânia · Schema Supabase
-- Execute este SQL no painel do Supabase (SQL Editor)
-- ============================================================

-- Extensão UUID
create extension if not exists "uuid-ossp";

-- ─── Leads ────────────────────────────────────────────────────
create table if not exists leads (
  id              uuid primary key default uuid_generate_v4(),
  phone           text unique not null,          -- número do WhatsApp (chave principal)
  name            text,                          -- coletado na etapa S
  spin_stage      text default 'S',              -- S | P | I | N | DONE
  situacao        text,                          -- moradia atual, renda, família
  dor_principal   text,                          -- maior problema identificado
  implicacao      text,                          -- consequências que o agente explorou
  interesse       text,                          -- o que o lead quer resolver
  lote_interesse  text,                          -- tipo de lote preferido
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- ─── Mensagens (histórico de conversa) ────────────────────────
create table if not exists mensagens (
  id          uuid primary key default uuid_generate_v4(),
  lead_phone  text not null references leads(phone) on delete cascade,
  role        text not null check (role in ('user','assistant')),
  content     text not null,
  media_type  text,                              -- text | audio | image | document
  created_at  timestamptz default now()
);

-- ─── Agendamentos ─────────────────────────────────────────────
create table if not exists agendamentos (
  id              uuid primary key default uuid_generate_v4(),
  lead_phone      text not null references leads(phone) on delete cascade,
  lead_name       text,
  dor_principal   text,
  data_visita     date not null,
  hora_visita     time not null,
  status          text default 'pendente' check (status in ('pendente','confirmado','cancelado','realizado')),
  corretor_notif  boolean default false,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- ─── Índices ──────────────────────────────────────────────────
create index if not exists idx_mensagens_phone on mensagens(lead_phone);
create index if not exists idx_mensagens_created on mensagens(created_at desc);
create index if not exists idx_agend_status on agendamentos(status);
create index if not exists idx_agend_data on agendamentos(data_visita);

-- ─── Trigger: updated_at automático ──────────────────────────
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger leads_updated_at
  before update on leads
  for each row execute function set_updated_at();

create trigger agend_updated_at
  before update on agendamentos
  for each row execute function set_updated_at();

-- ─── RLS (Row Level Security) ─────────────────────────────────
alter table leads        enable row level security;
alter table mensagens    enable row level security;
alter table agendamentos enable row level security;

-- Service role tem acesso total (usado pela API)
create policy "service_all_leads"        on leads        for all using (true);
create policy "service_all_mensagens"    on mensagens    for all using (true);
create policy "service_all_agendamentos" on agendamentos for all using (true);

-- ─── Config (prompt customizável e outras configs) ─────────────
create table if not exists config (
  key         text primary key,
  value       text not null,
  updated_at  timestamptz default now()
);

alter table config enable row level security;
create policy "service_all_config" on config for all using (true);

-- Insere prompt padrão (pode ser sobrescrito pelo painel)
insert into config (key, value) values ('agent_prompt', '')
  on conflict (key) do nothing;
