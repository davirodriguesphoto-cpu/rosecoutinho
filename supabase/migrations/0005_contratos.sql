-- Contrato com assinatura online.
-- O painel continua 100% fechado. A paciente abre um link (página pública em outro endereço) que vale 24 horas.
-- O contrato ASSINADO não fica no banco: a função de servidor `contrato-assinar` gera o PDF e envia ao Google Drive,
-- na pasta da paciente. Aqui ficam só a data da assinatura, o código de verificação e o id do arquivo no Drive.
-- Não apaga nem altera dados existentes.

-- Dados da paciente que o contrato puxa do painel (o que faltar, a paciente completa na página de assinatura)
alter table public.pacientes
  add column if not exists cpf      text,
  add column if not exists rg       text,
  add column if not exists endereco text,
  add column if not exists cep      text,
  -- resposta da paciente no contrato: pode usar as imagens dela em publicidade? (a mesma pergunta também fica no contrato assinado)
  add column if not exists imagem_publicidade    text check (imagem_publicidade in ('sim', 'nao')),
  add column if not exists imagem_publicidade_em date;

alter table public.documentos
  add column if not exists token         text,          -- link de uso único; apagado ao assinar ou ao expirar
  add column if not exists expira_em     timestamptz,   -- 24 horas depois da criação
  add column if not exists assinando_em  timestamptz,   -- trava curta contra assinatura em duplicidade
  add column if not exists drive_file_id text;          -- onde o contrato assinado está guardado
create unique index if not exists documentos_token_idx on public.documentos (token) where token is not null;

-- Lê o contrato pendente de um token. Devolve só título, texto e nome.
-- Token inexistente, já usado ou vencido não revela nada; ao vencer, o texto do contrato é apagado do banco.
create or replace function public.contrato_obter(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare d record;
begin
  if p_token is null or length(p_token) < 32 then return jsonb_build_object('estado', 'invalido'); end if;
  select dc.id, dc.titulo, dc.texto_final, dc.expira_em, pa.nome into d
    from public.documentos dc join public.pacientes pa on pa.id = dc.paciente_id
    where dc.token = p_token and dc.assinado_em is null;
  if not found then return jsonb_build_object('estado', 'invalido'); end if;
  if d.expira_em is not null and d.expira_em < now() then
    update public.documentos set texto_final = null, token = null where id = d.id;
    return jsonb_build_object('estado', 'expirado');
  end if;
  return jsonb_build_object('estado', 'pendente', 'titulo', d.titulo, 'texto', d.texto_final, 'nome', d.nome);
end $$;

-- Só o papel anônimo (a página pública) pode chamar. A assinatura em si passa pela função de servidor, não por aqui.
revoke all on function public.contrato_obter(text) from public, anon, authenticated;
grant execute on function public.contrato_obter(text) to anon;

-- Contratos que venceram sem assinatura perdem o texto e o link (a cada 15 minutos).
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('limpa-contratos-vencidos', '*/15 * * * *',
  $$update public.documentos set texto_final = null, token = null
    where assinado_em is null and expira_em < now() and (texto_final is not null or token is not null)$$);
