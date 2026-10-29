# Painel Rose Coutinho

Painel da clínica (pacientes, fichas, atendimentos, serviços; depois agenda, documentos, estoque e financeiro).
App web instalável no celular (PWA). Front em Vite, banco e login no Supabase, hospedagem em serviço de sites estáticos.

Endereço previsto: `painel.rosecoutinho.com.br`

## O que já está pronto

| Fase | Conteúdo | Estado |
|---|---|---|
| 1 | Pacientes, avaliação, anamnese, atendimentos, catálogo de serviços, importação CSV, login com senha + código no celular, sincronização | **pronto** |
| 1+ | Painel de Início: KPIs vs mês anterior, receita 6 meses, ranking de serviços e categorias, retornos vencidos, pacientes sumidos com botão de WhatsApp, resumo melhorou/piorou/ação | **pronto** (usa os atendimentos já registrados) |
| 2 | Agenda interna **sincronizada com o Google Agenda**, fotos no Google Drive, backup diário no Drive; registro de mensagens e mensagens editáveis | **pronto** (precisa da conexão do Google, seção 6) |
| 3 | Termos, contratos, assinatura na tela, fotos antes/depois | banco e arquivos privados prontos, telas a fazer |
| 4 | Estoque (mínimo, validade, curva ABC, baixa automática), financeiro e fluxo de caixa, a receber de pacotes, ponto de equilíbrio, precificação | banco pronto, telas a fazer |

O arquivo `supabase/migrations/0001_schema.sql` já cria as tabelas de **todas** as fases, com segurança ligada em cada uma.

## Colocar no ar (primeira vez)

### 1. Supabase (banco e login)
> O projeto `painel-rosecoutinho` (região São Paulo) já foi criado na organização da Rose e o banco já recebeu a migração. Restam os itens 3 a 6 abaixo.

1. Crie o projeto em supabase.com. Região: **South America (São Paulo)**. Guarde a senha do banco.
2. Abra **SQL Editor**, cole todo o conteúdo de `supabase/migrations/0001_schema.sql` e execute.
3. Crie o acesso da Rose: **Authentication > Users > Add user**, com e-mail e senha, marcando "Auto Confirm User".
4. Libere esse usuário no painel. No SQL Editor, troque o e-mail e execute:
   ```sql
   insert into public.membros (user_id, nome)
   select id, 'Rose' from auth.users where email = 'EMAIL-DA-ROSE@exemplo.com';
   ```
   Repita para cada pessoa que for usar (o Davi, por exemplo). Quem não está em `membros` não vê nada.
5. Siga os ajustes da seção **Segurança e LGPD** abaixo (cadastro aberto desligado, senha mínima, 2FA).
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

### 6. Google (fotos no Drive, Agenda e backup)

Uma única conexão com a conta Google da clínica serve para tudo:
- **Fotos** (aba Fotos, em *Histórico* na ficha): pasta **Pacientes Rose** no Drive, uma pasta por paciente (criada ao cadastrar) e, dentro dela, uma por dia de atendimento: `27-10-26-Nome do Paciente`. Visualizador em tela cheia, passa as fotos com o dedo, compara antes e depois, troca o tipo e apaga (vai para a lixeira do Drive). Cada foto é reduzida a 2400 px antes do envio (a Vercel aceita 4,5 MB por envio). O Supabase guarda só a referência.
- **Agenda:** a agenda do painel é a fonte da verdade e fica igual ao Google Agenda (`rosecoutinho.estetica@gmail.com`). Cada horário vira um evento `ATENDIMENTO · Nome — Serviço` (só nome e serviço, sem telefone nem dados de saúde); remarcar atualiza, cancelar ou faltar remove, excluir no painel remove. Eventos criados direto no Google com **PACIENTE** ou **ATENDIMENTO** no título aparecem no dia, em "No Google Agenda"; os demais (pessoais) aparecem só como horário **ocupado**, sem título, e geram aviso ao agendar no mesmo horário. Se um evento do painel for apagado direto no Google, o painel não o recria.
- **Backup:** seção 7.

**Configuração (uma vez, logada na conta Google da clínica):**
1. console.cloud.google.com > novo projeto **Painel Rose**. Não precisa de faturamento.
2. *APIs e serviços > Biblioteca*: ative **Google Drive API** e **Google Calendar API**.
3. *Google Auth Platform*: tipo **Externo**; nome "Painel Rose"; e-mail de suporte; em *Branding*: página inicial `https://painel.rosecoutinho.com.br`, política de privacidade `https://painel.rosecoutinho.com.br/privacidade.html`, termos `https://painel.rosecoutinho.com.br/termos.html`, domínio autorizado `rosecoutinho.com.br`.
4. *Acesso a dados*: escopos `.../auth/drive.file` e `.../auth/calendar.events`.
5. *Público*: adicione os dois e-mails como usuários de teste e depois **Publicar app** (Em produção). Sem isso a autorização expira a cada 7 dias. O app não é verificado pelo Google: no login clique em *Avançado > Acessar Painel Rose*. É normal para uso interno.
6. *Clientes > Criar cliente*: **Aplicativo da Web**; URI de redirecionamento: `https://painel.rosecoutinho.com.br/api/google?action=callback`. Copie o ID e a chave secreta.
7. **Vercel** (Environment Variables, sem prefixo `VITE_`, Sensitive): `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SUPABASE_SERVICE_ROLE_KEY` (Supabase > Project Settings > API Keys, a chave `service_role`/`secret`) e `CRON_SECRET` (texto longo aleatório, para o backup). Faça um novo deploy.
8. **Supabase > Edge Functions > Secrets:** `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` (os mesmos), para o contrato assinado ir ao Drive.
9. No painel, **Agenda > Conectar com o Google**, com a conta da clínica.

**Segurança:** o app só enxerga os arquivos que ele mesmo criou (`drive.file`), nunca o resto do Drive. A autorização do Google fica cifrada no banco e só o servidor a lê. Todas as chamadas exigem login com segundo fator. Ative a **verificação em duas etapas** na conta Google da clínica e não compartilhe as pastas Pacientes Rose e Backup: quem abrir o Drive direto vê o conteúdo sem passar pelo painel. Se mudar o nome do paciente, a pasta no Drive mantém o nome antigo.

### 7. Backup automático no Drive

Todo dia por volta das 3h (Brasília) o servidor copia **todas as tabelas** para um único arquivo `backup-painel-AAAA-MM-DD.json` na pasta **Backup Painel Rose Coutinho**. O arquivo novo é conferido e só então o anterior é apagado de vez: fica sempre **um** backup. As fotos já estão no Drive e entram só como referência; os tokens do Google ficam de fora. Em **Agenda** (rodapé) dá para ver o último e fazer um na hora.
- Para ligar o automático: `CRON_SECRET` na Vercel (seção 6, passo 7). O agendamento está em `vercel.json`.
- **Proteção:** se o banco tiver menos da metade dos registros do último backup bom, o anterior é **mantido** e o painel avisa. Depois de conferir, "Fazer backup agora" aceita o novo tamanho.
- O arquivo é legível e tem dados de saúde: mesma sensibilidade da pasta Pacientes Rose.
- **Restaurar:** `SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/restaurar.mjs backup.json` mostra o que faria; com `--executar` grava (regrava os registros do backup e não apaga o que existir só no banco).
- Um backup por dia não ajuda se o problema só for notado depois de 24 h. O plano Pro do Supabase guarda 7 dias de backups próprios e complementa.

## Como o painel calcula
- **Comparação justa:** dias 1 a N do mês atual contra dias 1 a N do mês anterior, nunca mês parcial contra mês cheio.
- **Receita:** soma só atendimentos com valor informado. **Paciente novo:** primeira visita registrada no app (com a base antiga importada sem histórico, o número fica baixo até os atendimentos entrarem).
- **Retorno vencido:** o retorno do último atendimento passou e a última visita tem menos de 90 dias. **Sumido:** última visita entre 90 dias e 1 ano. Mais de 1 ano é "inativo" e só aparece como contagem.
- O botão **Chamar** abre o WhatsApp com a mensagem pronta (o texto está em `MSG_SUMIDA` e `MSG_RETORNO`, em `src/main.js`). Ela só toca em enviar.

## Contrato com assinatura online
O painel continua 100% fechado. A assinatura acontece em **outra página** (`contrato.html`, endereço `contrato.rosecoutinho.com.br`), pública, que não tem login nem acesso a nenhuma tabela.

**Como funciona**
1. Na ficha da paciente, **Documentos > Novo documento**: escolha o modelo (e o pacote, se houver). O painel preenche nome, nascimento, telefone, CPF, RG, endereço, CEP, objeto, valor e pagamento a partir da ficha e do pacote.
2. **Enviar por WhatsApp** abre a conversa com a mensagem e o link prontos. O link tem um código aleatório de 43 caracteres, vale **24 horas** e uma única vez. Depois disso, ou depois de assinado, ele não abre mais, nem para assinar nem para consultar. O texto de um contrato vencido e não assinado é apagado do banco (a cada 15 minutos).
3. A paciente abre no celular, lê, completa o que faltar, responde se **autoriza ou não o uso de imagem em publicidade** e toca em **Assinar**. Ela assina **desenhando com o dedo** ou **enviando uma imagem** da assinatura, confirma e **baixa a cópia em PDF**.
4. A função de servidor `contrato-assinar` gera o PDF (com data, hora, IP, aparelho e código de verificação) e envia para a **pasta da paciente no Google Drive**. O contrato assinado **não fica** no app, no Supabase, na Vercel nem no GitHub. No banco ficam só: data da assinatura, código de verificação e o id do arquivo no Drive (botão **Abrir no Drive** na ficha). A resposta sobre imagem também é gravada na ficha (campo **Uso de imagem em publicidade**).
5. Se o Drive falhar, nada é marcado como assinado e o link continua valendo; a paciente vê uma mensagem para tentar de novo.

**Ligação com o Google Drive (necessária para assinar de verdade)**
- Use a **mesma conexão do painel** (seção 6): em **Agenda > Conectar com o Google**. O token fica cifrado em `google_tokens` e a função o abre com o segredo do Google (`token.js`).
- Segredos da função (Supabase > Edge Functions > Secrets): `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET`, **os mesmos** da Vercel.
- A permissão é a restrita (`drive.file`): o painel e a função enxergam as pastas que o painel criou. A pasta da paciente fica dentro de **Pacientes Rose**, a mesma das fotos (`config.drive_root`). Se `pacientes.drive_folder_id` estiver vazio, a função cria a pasta e grava o id.
- Sem isso a página responde "não foi possível guardar agora" e nada é perdido.

**Modelos:** ficam no banco (`modelos_documento`), não no código. Edite em **Documentos > Modelos**. Campos: `{{nome}} {{nascimento}} {{telefone}} {{cpf}} {{rg}} {{endereco}} {{cep}} {{data}} {{objeto}} {{valor_total}} {{pagamento}}` (painel) e `{{data_hora}}` (data e hora da assinatura). O que faltar na ficha, a paciente completa ao assinar.

**Colocar no ar o endereço de contratos**
1. Vercel > Project > Settings > Domains > Add `contrato.rosecoutinho.com.br` (o mesmo projeto do painel).
2. No DNS, registro **CNAME** `contrato` apontando para o valor que a Vercel mostrar.
3. Se usar outro endereço, defina `VITE_CONTRATO_URL` (sem barra no fim) na Vercel e `CONTRATO_ORIGENS` nos segredos da função.
4. Teste com uma paciente de teste: criar o documento, abrir o link no celular e assinar.

**Atenção jurídica:** é assinatura eletrônica simples com registro de prova, não certificado digital (ICP-Brasil). Os textos dos modelos devem ser revisados por quem responde juridicamente pela clínica.

**Repositório:** mantenha-o **privado**. Dados e textos da clínica não devem ficar em repositório público.

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
Sem as duas variáveis o app abre em **modo de teste** (só no `npm run dev`): dados só no navegador, com pacientes de exemplo e sem login.

## Segurança e LGPD (dados de saúde)

**Camadas de proteção**
1. **Senha** individual, com cadastro aberto desligado (só entra quem a administradora criar).
2. **Código de 6 dígitos** no celular (app autenticador). No primeiro acesso o app mostra o QR code; nos seguintes pede só o código.
3. **O banco exige o código também.** A função `is_member()` só libera dados para quem entrou com senha **e** código (`aal2`). Se a senha vazar, sem o celular ninguém lê nada. Testado: com só a senha o banco devolve zero linhas.
4. **Lista de membros:** só quem está em `membros` lê ou grava.
5. **Saída automática** após 15 minutos sem usar (ajustável em `IDLE_MIN`, `src/main.js`). Alterações pendentes são enviadas antes de sair.
6. **Em produção o app não abre sem login:** se as variáveis do Supabase faltarem, aparece "Configuração pendente" em vez de abrir uma versão sem proteção. O modo de teste só existe no computador (`npm run dev`) ou com `VITE_DEMO=1`. **Nunca** defina `VITE_DEMO` na Vercel.
7. **Cabeçalhos de segurança** (`vercel.json`): CSP restritiva, bloqueio de iframe, HTTPS forçado.
8. **Fotos e documentos assinados** em buckets privados. O token do Google (Fase 2) fica numa tabela sem nenhuma política, só a função de servidor acessa.
9. O service worker guarda só os arquivos do app, nunca respostas do Supabase, e com login ativo os dados dos pacientes não ficam gravados no aparelho.

**Configurar no Supabase (uma vez)**
- **Authentication > Sign In / Providers**: desligar "Allow new users to sign up".
- **Authentication > Providers > Email**: senha mínima de 12 caracteres e, se o plano permitir, a proteção contra senhas vazadas.
- **Authentication > Multi-Factor**: conferir que TOTP está habilitado (vem ligado por padrão).
- Ativar **2FA** também na conta do Supabase, do GitHub e da Vercel.

**Dia a dia**
- **Celular reserva:** no primeiro acesso, escaneie o mesmo QR também no celular do Davi. Os dois passam a gerar o mesmo código.
- **Perdeu o celular:** a administradora remove o fator e o próximo login cadastra um novo QR. No SQL Editor:
  ```sql
  delete from auth.mfa_factors where user_id = (select id from auth.users where email = 'EMAIL@exemplo.com');
  ```
- **Esqueceu a senha:** em Authentication > Users, definir uma nova senha para o usuário.
- **Saiu alguém da equipe:** `delete from public.membros where user_id = (select id from auth.users where email = 'EMAIL@exemplo.com');` e remover o usuário em Authentication > Users.
- **Computador compartilhado:** usar o botão **Sair** ao terminar. A saída automática é uma rede de segurança.

**Antes de cadastrar pacientes reais**
- Confira o plano do Supabase: o gratuito pausa projetos parados e não tem backup diário. Para dados de pacientes vale o plano pago com backups.
- Confira os termos de uso comercial da hospedagem. O plano gratuito da Vercel é para uso não comercial.
- Os textos de termos de consentimento e contratos devem ser validados por quem responde juridicamente pela clínica.
- Nunca coloque a chave `service_role` no front nem no GitHub. A chave `anon` é pública por desenho; quem protege os dados são as regras do banco.
- **Não cadastre pacientes reais na prévia do Claude** nem em nenhum ambiente em modo de teste: lá não há login.

## Estrutura
```
index.html                 casca do app
src/main.js                telas e regras
src/style.css              identidade visual
src/services.json          catálogo inicial (da planilha de preços)
src/lib/cloud-core.js      sincronização com o Supabase (testada)
src/lib/cloud.js           liga o Supabase pelas variáveis de ambiente
src/google.js              fotos no Drive (visualizador), sincronia da agenda com o Google e backup (telas)
api/                       funções do servidor (Vercel): Google, Drive, Agenda e backup
scripts/restaurar.mjs      restaura o banco a partir de um backup
supabase/functions/        assinatura de contratos (Edge Function)
supabase/migrations/       banco completo
public/                    ícones, manifest, service worker
tests/                     testes da sincronização, dos contratos e das funções do Google (com Google simulado)
```
