-- Agenda interna: histórico de remarcações (com motivo) em cada agendamento.
-- remarcacoes: [{de: '2026-10-30T14:30', motivo: 'periodo'|'paciente'|'clinica'|'outro', em: '<data e hora>'}]
-- Não apaga nem altera dados existentes. A ligação com o Google usa a coluna google_event_id que já existe.
alter table public.agendamentos add column if not exists remarcacoes jsonb not null default '[]';
