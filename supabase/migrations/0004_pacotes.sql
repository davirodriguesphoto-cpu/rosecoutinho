-- Pacotes e pagamentos: cada parcela de um pacote é um lançamento de entrada ligado ao pacote.
-- pago + pago_em dizem se e quando foi recebida; a data do lançamento é o vencimento.
-- Não apaga nem altera dados existentes.
alter table public.lancamentos add column if not exists pacote_id text references public.pacotes_paciente(id) on delete cascade;
alter table public.lancamentos add column if not exists pago_em date;
create index if not exists lancamentos_pacote_idx on public.lancamentos (pacote_id);
