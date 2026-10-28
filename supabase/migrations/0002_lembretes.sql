-- Lembretes por WhatsApp: tipos novos, chave anti-repetição e ciclo menstrual.
-- Não apaga nem altera dados existentes.

-- ciclo: {inicios: ['2026-09-01', ...]} (datas de início da menstruação, dado de saúde: RLS já cobre a tabela)
alter table public.pacientes add column if not exists ciclo jsonb not null default '{}';

-- chave evita lembrar duas vezes a mesma coisa (ex.: 'aniversario:2026', 'manutencao:<id do atendimento>')
alter table public.mensagens add column if not exists chave text;
create index if not exists mensagens_chave_idx on public.mensagens (paciente_id, chave);

-- a única restrição de tipo em mensagens é a do CREATE original; recria com os tipos novos
do $$
declare c text;
begin
  for c in select conname from pg_constraint where conrelid = 'public.mensagens'::regclass and contype = 'c' loop
    execute format('alter table public.mensagens drop constraint %I', c);
  end loop;
end $$;
alter table public.mensagens add constraint mensagens_tipo_check
  check (tipo in ('retorno','sumida','aniversario','manutencao','procedimento','pagamento','fim_plano','periodo','pos','contrato','outro'));
