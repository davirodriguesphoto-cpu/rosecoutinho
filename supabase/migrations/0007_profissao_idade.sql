-- Profissão e idade informada (para fichas sem data de nascimento): idade_ref vale na data idade_ref_em e o painel soma os anos que passaram.
alter table public.pacientes add column if not exists profissao text;
alter table public.pacientes add column if not exists idade_ref integer check (idade_ref is null or (idade_ref >= 0 and idade_ref < 120));
alter table public.pacientes add column if not exists idade_ref_em date;
