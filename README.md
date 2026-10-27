# Painel Rose Coutinho

Painel da clínica (pacientes, fichas, atendimentos, serviços; depois agenda, documentos, estoque e financeiro).
App web instalável no celular (PWA). Front em Vite, banco e login no Supabase, hospedagem em serviço de sites estáticos.

Endereço previsto: `painel.rosecoutinho.com.br`

## O que já está pronto

| Fase | Conteúdo | Estado |
|---|---|---|
| 1 | Pacientes, avaliação, anamnese, atendimentos, catálogo de serviços, importação CSV, login, sincronização | **pronto** |
| 2 | Agenda ligada ao Google, retorno, "Oi sumida" | banco pronto, telas a fazer |
| 3 | Termos, contratos, assinatura na tela, fotos antes/depois | banco e arquivos privados prontos, telas a fazer |
| 4 | Estoque, financeiro, fluxo de caixa, precificação | banco pronto, telas a fazer |

O arquivo `supabase/migrations/0001_schema.sql` já cria as tabelas de **todas** as fases, com segurança ligada em cada uma.

## Colocar no ar (primeira vez)

### 1. Supabase (banco e login)
1. Crie o projeto em supabase.com. Região: **South America (São Paulo)**. Guarde a senha do banco.
2. Abra **SQL Editor**, cole todo o conteúdo de `supabase/migrations/0001_schema.sql` e execute.
3. Crie o acesso da Rose: **Authentication > Users > Add user**, com e-mail e senha, marcando "Auto Confirm User".
4. Libere esse usuário no painel. No SQL Editor, troque o e-mail e execute:
   ```sql
   insert into public.membros (user_id, nome)
   select id, 'Rose' from auth.users where email = 'EMAIL-DA-ROSE@exemplo.com';
   ```
   Repita para cada pessoa que for usar (o Davi, por exemplo). Quem não está em `membros` não vê nada.
5. Em **Authentication > Sign In / Providers**, desligue "Allow new users to sign up". O cadastro é só por convite.
6. Em **Project Settings > API**, copie `Project URL` e a chave `anon public`.

### 2. GitHub
Crie um repositório **privado** (ex.: `painel-rosecoutinho`) e envie estes arquivos. Pelo navegador: *Add file > Upload files*, arrastando o conteúdo da pasta (sem `node_modules` e sem `dist`).

### 3. Hospedagem (Vercel)
1. Em vercel.com, **Add New > Project** e escolha o repositório. O Vercel detecta Vite sozinho.
2. Em **Environment Variables**, cadastre:
   - `VITE_SUPABASE_URL` = o Project URL
   - `VITE_SUPABASE_ANON_KEY` = a chave anon public
3. **Deploy.** Cada alteração enviada ao GitHub publica uma nova versão.

### 4. Domínio
1. Na Vercel: **Project > Settings > Domains > Add** `painel.rosecoutinho.com.br`.
2. No painel onde o domínio está registrado (DNS), crie um registro **CNAME** com nome `painel` apontando para o valor que a Vercel mostrar na tela.
3. Aguarde alguns minutos até a Vercel marcar como válido. O HTTPS é automático.
4. No Supabase, **Authentication > URL Configuration**, coloque `https://painel.rosecoutinho.com.br` em "Site URL".

### 5. Instalar no celular
Abrir o endereço no navegador e usar "Adicionar à tela inicial".

## Importar a base antiga
Em **Pacientes > Importar**, enviar um CSV com cabeçalho. Colunas reconhecidas: `nome`, `telefone` (ou celular, whatsapp), `nascimento` (dd/mm/aaaa ou aaaa-mm-dd), `observações`. Duplicados (mesmo nome e telefone) são ignorados.

## Rodar no computador
```bash
npm install
cp .env.example .env.local   # preencher as duas chaves
npm run dev                  # http://localhost:5173
npm test                     # testes da sincronização
npm run build                # gera dist/
```
Sem as duas variáveis o app abre em **modo de teste**: dados só no navegador, com 3 pacientes de exemplo.

## Segurança e LGPD (importante, são dados de saúde)
- Todas as tabelas têm RLS: só quem está em `membros` lê ou grava. A chave `anon` é pública por desenho; quem protege os dados são essas regras. **Nunca** coloque a chave `service_role` no front nem no GitHub.
- Fotos e documentos assinados ficam em buckets **privados**.
- O token do Google (Fase 2) fica numa tabela sem nenhuma política: só a função de servidor acessa.
- O service worker guarda só os arquivos do app, nunca respostas do Supabase.
- Ative **2FA** na conta do GitHub, do Supabase e da Vercel.
- Antes de cadastrar pacientes reais, confira o plano do Supabase: o gratuito pausa projetos parados e não tem backup diário. Para dados de pacientes vale o plano pago com backups.
- Confira os termos de uso comercial da hospedagem escolhida. O plano gratuito da Vercel é para uso não comercial.
- Os textos dos termos de consentimento e contratos devem ser validados por quem responde juridicamente pela clínica.

## Estrutura
```
index.html                 casca do app
src/main.js                telas e regras
src/style.css              identidade visual
src/services.json          catálogo inicial (da planilha de preços)
src/lib/cloud-core.js      sincronização com o Supabase (testada)
src/lib/cloud.js           liga o Supabase pelas variáveis de ambiente
supabase/migrations/       banco completo
public/                    ícones, manifest, service worker
tests/                     testes da sincronização
```
