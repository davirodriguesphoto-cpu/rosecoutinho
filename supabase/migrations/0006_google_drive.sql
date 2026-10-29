-- Pasta do paciente no Google Drive e e-mail da conta Google conectada ao painel.
-- (Se o banco já tem estas colunas, nada muda: "if not exists".)
alter table public.pacientes     add column if not exists drive_folder_id text;
alter table public.google_tokens add column if not exists email text;
-- google_tokens.refresh_token passa a guardar o token CIFRADO ("v1.…"); só o servidor (service role) lê.
-- Fotos: fotos.arquivo_path guarda 'drive:<id do arquivo no Drive>' (os arquivos ficam no Drive, não no Supabase).
