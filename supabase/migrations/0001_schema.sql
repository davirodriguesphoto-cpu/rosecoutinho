-- Painel Rose Coutinho: schema completo (todas as fases).
-- Rodar uma vez no SQL Editor do Supabase. Idempotente onde possível.
-- Acesso: somente usuários listados em public.membros (RLS em todas as tabelas).

-- ============ acesso ============
create table if not exists public.membros (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  nome       text,
  papel      text not null default 'admin',
  created_at timestamptz not null default now()
);

create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.membros where user_id = auth.uid())
$$;
revoke all on function public.is_member() from public;
grant execute on function public.is_member() to authenticated;

create or replace function public.set_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

-- ============ catálogo e pacientes (Fase 1) ============
create table if not exists public.servicos (
  id            text primary key default gen_random_uuid()::text,
  categoria     text not null,
  nome          text not null,
  preco_pix     numeric(10,2),
  preco_cartao  numeric(10,2),
  duracao_min   int,
  retorno_dias  int,
  pacotes       jsonb not null default '[]',   -- [[4, 220], [8, 400]] = sessões e total
  ordem         int not null default 0,
  ativo         boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.pacientes (
  id                text primary key default gen_random_uuid()::text,
  nome              text not null,
  telefone          text,
  nascimento        date,
  instagram         text,
  origem            text,
  observacoes       text,
  consentimento_ok  boolean not null default false,
  consentimento_em  date,
  avaliacao         jsonb not null default '{}',
  anamnese          jsonb not null default '{}',   -- dado de saúde: sensível pela LGPD
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists pacientes_nome_idx on public.pacientes (lower(nome));

create table if not exists public.atendimentos (
  id               text primary key default gen_random_uuid()::text,
  paciente_id      text not null references public.pacientes(id) on delete cascade,
  servico_id       text references public.servicos(id) on delete set null,
  data             date not null,
  regiao           text,
  produto          text,
  lote             text,
  sessao           text,
  valor            numeric(10,2),
  evolucao         text,
  retorno_em       date,
  forma_pagamento  text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists atendimentos_paciente_idx on public.atendimentos (paciente_id);
create index if not exists atendimentos_data_idx     on public.atendimentos (data);
create index if not exists atendimentos_retorno_idx  on public.atendimentos (retorno_em);

-- ============ agenda, retorno e "Oi sumida" (Fase 2) ============
create table if not exists public.agendamentos (
  id               text primary key default gen_random_uuid()::text,
  paciente_id      text references public.pacientes(id) on delete set null,
  servico_id       text references public.servicos(id) on delete set null,
  inicio           timestamptz not null,
  fim              timestamptz not null,
  google_event_id  text unique,
  status           text not null default 'agendado' check (status in ('agendado','confirmado','realizado','faltou','cancelado')),
  observacoes      text,
  created_at       timestamptz not null default now()
);
create index if not exists agendamentos_inicio_idx on public.agendamentos (inicio);

create table if not exists public.mensagens (
  id           text primary key default gen_random_uuid()::text,
  paciente_id  text not null references public.pacientes(id) on delete cascade,
  tipo         text not null check (tipo in ('retorno','sumida','outro')),
  texto        text,
  enviado_em   timestamptz not null default now()
);
create index if not exists mensagens_paciente_idx on public.mensagens (paciente_id, enviado_em desc);

-- Token do Google fica só no servidor (função do Supabase com service role): RLS ligado e nenhuma política.
create table if not exists public.google_tokens (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  refresh_token  text not null,
  calendar_id    text not null default 'primary',
  updated_at     timestamptz not null default now()
);

-- ============ documentos, termos, assinatura e fotos (Fase 3) ============
create table if not exists public.modelos_documento (
  id         text primary key default gen_random_uuid()::text,
  tipo       text not null check (tipo in ('termo','contrato','ficha')),
  titulo     text not null,
  texto      text not null,
  servicos   text[] not null default '{}',     -- serviços aos quais o termo se aplica
  ativo      boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.documentos (
  id               text primary key default gen_random_uuid()::text,
  paciente_id      text not null references public.pacientes(id) on delete cascade,
  modelo_id        text references public.modelos_documento(id) on delete set null,
  tipo             text not null check (tipo in ('termo','contrato','ficha','outro')),
  titulo           text not null,
  texto_final      text,                        -- texto exato que foi assinado
  arquivo_path     text,                        -- PDF no bucket "documentos"
  assinatura_path  text,                        -- imagem da assinatura no bucket "documentos"
  assinado_em      timestamptz,
  hash_sha256      text,
  created_at       timestamptz not null default now()
);
create index if not exists documentos_paciente_idx on public.documentos (paciente_id);

create table if not exists public.fotos (
  id              text primary key default gen_random_uuid()::text,
  paciente_id     text not null references public.pacientes(id) on delete cascade,
  atendimento_id  text references public.atendimentos(id) on delete set null,
  tipo            text not null default 'outra' check (tipo in ('antes','depois','outra')),
  arquivo_path    text not null,                -- bucket "fotos"
  tirada_em       date,
  legenda         text,
  created_at      timestamptz not null default now()
);
create index if not exists fotos_paciente_idx on public.fotos (paciente_id);

-- ============ estoque e custos (Fase 4) ============
create table if not exists public.estoque_itens (
  id                      text primary key default gen_random_uuid()::text,
  nome                    text not null,
  categoria               text,
  unidade                 text not null default 'un',
  custo_embalagem         numeric(10,2),        -- ex.: caixa de luvas R$ 25
  unidades_embalagem      numeric(10,2),        -- ex.: 100 unidades
  minimo                  numeric(10,2) not null default 0,
  ativo                   boolean not null default true,
  created_at              timestamptz not null default now()
);

create table if not exists public.estoque_lotes (
  id              text primary key default gen_random_uuid()::text,
  item_id         text not null references public.estoque_itens(id) on delete cascade,
  lote            text,
  validade        date,
  quantidade      numeric(10,2) not null,
  custo_unitario  numeric(10,2),
  recebido_em     date not null default current_date
);
create index if not exists estoque_lotes_item_idx on public.estoque_lotes (item_id, validade);

create table if not exists public.estoque_movimentos (
  id              text primary key default gen_random_uuid()::text,
  item_id         text not null references public.estoque_itens(id) on delete cascade,
  lote_id         text references public.estoque_lotes(id) on delete set null,
  tipo            text not null check (tipo in ('entrada','saida','ajuste','descarte')),
  quantidade      numeric(10,2) not null,
  atendimento_id  text references public.atendimentos(id) on delete set null,
  obs             text,
  data            timestamptz not null default now()
);

create table if not exists public.servico_insumos (   -- o que cada serviço consome (baixa e custo)
  servico_id      text not null references public.servicos(id) on delete cascade,
  item_id         text not null references public.estoque_itens(id) on delete cascade,
  quantidade_uso  numeric(10,4) not null,
  primary key (servico_id, item_id)
);

-- ============ financeiro (Fase 4) ============
create table if not exists public.lancamentos (
  id               text primary key default gen_random_uuid()::text,
  data             date not null,
  tipo             text not null check (tipo in ('entrada','saida')),
  categoria        text,
  descricao        text,
  valor            numeric(12,2) not null,
  forma_pagamento  text,
  pago             boolean not null default true,
  paciente_id      text references public.pacientes(id) on delete set null,
  atendimento_id   text references public.atendimentos(id) on delete set null,
  created_at       timestamptz not null default now()
);
create index if not exists lancamentos_data_idx on public.lancamentos (data);

create table if not exists public.pacotes_paciente (
  id              text primary key default gen_random_uuid()::text,
  paciente_id     text not null references public.pacientes(id) on delete cascade,
  servico_id      text references public.servicos(id) on delete set null,
  sessoes_total   int not null,
  sessoes_usadas  int not null default 0,
  valor_total     numeric(10,2),
  valor_pago      numeric(10,2) not null default 0,
  criado_em       date not null default current_date,
  validade        date
);

create table if not exists public.config (
  chave       text primary key,
  valor       jsonb not null,
  updated_at  timestamptz not null default now()
);
insert into public.config (chave, valor) values
  ('taxa_cartao',     '0.0729'),
  ('ocupacao_alvo',   '0.6'),
  ('horas_mes',       '180'),
  ('dias_sumida',     '90'),
  ('msg_sumida',      '"Oi, {nome}! Tudo bem? Faz um tempinho que não te vejo por aqui na Rose Coutinho. Como você está? Posso ver um horário pra você essa semana?"'),
  ('msg_retorno',     '"Oi, {nome}! Está chegando a hora do seu retorno ({servico}). Quer que eu veja um horário pra você?"')
on conflict (chave) do nothing;

-- ============ visão para "Oi sumida" e retornos ============
create or replace view public.v_pacientes_resumo with (security_invoker = true) as
select p.id, p.nome, p.telefone,
       count(a.id)  as total_atendimentos,
       max(a.data)  as ultimo_atendimento
from public.pacientes p
left join public.atendimentos a on a.paciente_id = p.id
group by p.id;

-- ============ segurança: RLS em tudo, acesso só para membros ============
alter table public.membros enable row level security;
drop policy if exists "ver o próprio cadastro" on public.membros;
create policy "ver o próprio cadastro" on public.membros for select to authenticated using (user_id = auth.uid());

alter table public.google_tokens enable row level security;   -- sem políticas: só a service role acessa

do $$
declare t text;
begin
  foreach t in array array[
    'servicos','pacientes','atendimentos','agendamentos','mensagens',
    'modelos_documento','documentos','fotos',
    'estoque_itens','estoque_lotes','estoque_movimentos','servico_insumos',
    'lancamentos','pacotes_paciente','config'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "acesso de membros" on public.%I', t);
    execute format('create policy "acesso de membros" on public.%I for all to authenticated using (public.is_member()) with check (public.is_member())', t);
  end loop;

  foreach t in array array['servicos','pacientes','atendimentos','config'] loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- ============ arquivos privados (fotos e documentos assinados) ============
insert into storage.buckets (id, name, public) values ('fotos', 'fotos', false), ('documentos', 'documentos', false)
on conflict (id) do nothing;

drop policy if exists "membros acessam arquivos da clínica" on storage.objects;
create policy "membros acessam arquivos da clínica" on storage.objects for all to authenticated
  using (bucket_id in ('fotos','documentos') and public.is_member())
  with check (bucket_id in ('fotos','documentos') and public.is_member());
