/* Assina o contrato: valida o link de 24h, gera o PDF e guarda no Google Drive, na pasta da paciente.
   Nada do contrato assinado fica no banco: só a data, o código de verificação e o id do arquivo no Drive.
   Só marca como assinado DEPOIS que o Drive confirmou o arquivo; se o Drive falhar, o link continua valendo.
   Pública (sem login): quem protege é o token do link (43 caracteres aleatórios, uso único, 24 horas).
   Precisa de: segredos GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET (os mesmos do painel) e a conexão feita em Agenda > Conectar com o Google:
   o token fica cifrado em google_tokens e é aberto por token.js. A permissão é a restrita (drive.file): o painel e esta função enxergam as pastas que o painel criou. */
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { montarPdf } from './pdf.js';
import { abrirToken } from './token.js';

const ORIGENS = (Deno.env.get('CONTRATO_ORIGENS') ?? 'https://contrato.rosecoutinho.com.br,http://localhost:5173').split(',');
const CAMPOS = ['cpf', 'rg', 'endereco', 'cep', 'nascimento', 'telefone'];

const cors = (req: Request) => {
  const o = req.headers.get('origin') ?? '';
  return {'Access-Control-Allow-Origin': ORIGENS.includes(o) ? o : ORIGENS[0], 'Access-Control-Allow-Headers': 'content-type, apikey, authorization, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Vary': 'Origin'};
};
const resp = (req: Request, body: unknown, status = 200) => new Response(JSON.stringify(body), {status, headers: {...cors(req), 'Content-Type': 'application/json'}});
const erro = (codigo: string) => Object.assign(new Error(codigo), {codigo});

async function tokenDoGoogle(sb: any): Promise<string> {
  const id = Deno.env.get('GOOGLE_CLIENT_ID'), segredo = Deno.env.get('GOOGLE_CLIENT_SECRET');
  const {data} = await sb.from('google_tokens').select('refresh_token').order('updated_at', {ascending: false}).limit(1).maybeSingle();
  if (!id || !segredo || !data) throw erro('drive_conexao');
  const r = await fetch('https://oauth2.googleapis.com/token', {method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body: new URLSearchParams({client_id: id, client_secret: segredo, refresh_token: await abrirToken(data.refresh_token, segredo), grant_type: 'refresh_token'})});
  if (!r.ok) throw erro('drive_conexao');
  return (await r.json()).access_token;
}

/* pasta raiz "Pacientes Rose": a mesma que o painel usa (config.drive_root). Se ainda não existe, procura ou cria. */
async function pastaRaiz(sb: any, at: string): Promise<string | null> {
  const H = {Authorization: `Bearer ${at}`, 'Content-Type': 'application/json'};
  for (const chave of ['drive_root', 'drive_pasta_raiz']) {
    const {data} = await sb.from('config').select('valor').eq('chave', chave).maybeSingle();
    if (typeof data?.valor === 'string' && data.valor) return data.valor;
  }
  const q = encodeURIComponent("name='Pacientes Rose' and mimeType='application/vnd.google-apps.folder' and trashed=false");
  const f = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&pageSize=1`, {headers: H});
  let id = f.ok ? (await f.json()).files?.[0]?.id : null;
  if (!id) {
    const c = await fetch('https://www.googleapis.com/drive/v3/files?fields=id', {method: 'POST', headers: H, body: JSON.stringify({name: 'Pacientes Rose', mimeType: 'application/vnd.google-apps.folder'})});
    if (!c.ok) throw erro('drive_pasta');
    id = (await c.json()).id;
  }
  await sb.from('config').upsert({chave: 'drive_root', valor: id}, {onConflict: 'chave'});
  return id;
}

async function pastaDaPaciente(sb: any, at: string, pac: {id: string; nome: string; drive_folder_id: string | null}): Promise<string> {
  if (pac.drive_folder_id) return pac.drive_folder_id;
  const raiz = await pastaRaiz(sb, at);
  const r = await fetch('https://www.googleapis.com/drive/v3/files?fields=id', {method: 'POST', headers: {Authorization: `Bearer ${at}`, 'Content-Type': 'application/json'},
    body: JSON.stringify({name: pac.nome, mimeType: 'application/vnd.google-apps.folder', ...(raiz ? {parents: [raiz]} : {})})});
  if (!r.ok) throw erro('drive_pasta');
  const id = (await r.json()).id as string;
  await sb.from('pacientes').update({drive_folder_id: id}).eq('id', pac.id);
  return id;
}

async function enviarAoDrive(at: string, pasta: string, nome: string, pdf: Uint8Array): Promise<string> {
  const lim = 'contrato' + crypto.randomUUID(), enc = new TextEncoder();
  const meta = JSON.stringify({name: nome, parents: [pasta], mimeType: 'application/pdf'});
  const partes = [enc.encode(`--${lim}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${lim}\r\nContent-Type: application/pdf\r\n\r\n`), pdf, enc.encode(`\r\n--${lim}--`)];
  const corpo = new Uint8Array(partes.reduce((s, p) => s + p.length, 0)); let o = 0; for (const p of partes) { corpo.set(p, o); o += p.length; }
  const r = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {method: 'POST', headers: {Authorization: `Bearer ${at}`, 'Content-Type': `multipart/related; boundary=${lim}`}, body: corpo});
  if (!r.ok) throw erro('drive_envio');
  return (await r.json()).id as string;
}

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
const base64 = (b: Uint8Array) => { let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s); };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, {status: 204, headers: cors(req)});
  if (req.method !== 'POST') return resp(req, {ok: false, erro: 'metodo'}, 405);
  let b: any; try { b = await req.json(); } catch { return resp(req, {ok: false, erro: 'link'}, 400); }
  const token = String(b?.token ?? ''), assinatura = String(b?.assinatura ?? ''), imagem = String(b?.imagem ?? '');
  if (token.length < 32 || token.length > 200) return resp(req, {ok: false, erro: 'link'}, 400);
  if (b.aceite !== true) return resp(req, {ok: false, erro: 'aceite'}, 400);
  if (imagem !== 'sim' && imagem !== 'nao') return resp(req, {ok: false, erro: 'imagem'}, 400);
  const tipoAss = /^data:image\/(png|jpeg);base64,/.exec(assinatura)?.[1] as 'png' | 'jpeg' | undefined;
  if (!tipoAss || assinatura.length > 600000 || !/^data:image\/(png|jpeg);base64,[A-Za-z0-9+\/=]+$/.test(assinatura)) return resp(req, {ok: false, erro: 'assinatura'}, 400);

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {auth: {persistSession: false}});
  const agora = new Date(), iso = agora.toISOString(), duasMin = new Date(agora.getTime() - 120000).toISOString();

  /* trava: só uma assinatura por vez; vale só para link vivo (não assinado e dentro das 24h) */
  const {data: d, error: e1} = await sb.from('documentos').update({assinando_em: iso}).eq('token', token).is('assinado_em', null).gt('expira_em', iso)
    .or(`assinando_em.is.null,assinando_em.lt.${duasMin}`).select('id,paciente_id,titulo,texto_final').maybeSingle();
  if (e1) { console.error('trava', e1.message); return resp(req, {ok: false, erro: 'servidor'}, 500); }
  if (!d) return resp(req, {ok: false, erro: 'link'}, 410);
  const liberar = () => sb.from('documentos').update({assinando_em: null}).eq('id', d.id);
  if (!d.texto_final) { await liberar(); return resp(req, {ok: false, erro: 'link'}, 410); }

  try {
    let txt: string = d.texto_final; const campos = b.campos ?? {};
    for (const k of CAMPOS) if (txt.includes(`{{${k}}}`)) {
      const v = String(campos[k] ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 200);
      if (!v) { await liberar(); return resp(req, {ok: false, erro: 'campos'}, 400); }
      txt = txt.split(`{{${k}}}`).join(v);
    }
    const quando = new Intl.DateTimeFormat('pt-BR', {timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short'}).format(agora).replace(', ', ' às ');
    txt = txt.split('{{data_hora}}').join(quando);
    /* a resposta sobre o uso de imagem entra no texto assinado (e, portanto, no código de verificação) */
    txt += '\n\nUSO DE IMAGEM PARA PUBLICIDADE\n' + (imagem === 'sim'
      ? 'AUTORIZO o uso das minhas imagens (fotos e vídeos, inclusive de antes e depois) para publicidade da Rose Coutinho, em redes sociais, site e materiais de divulgação.'
      : 'NÃO AUTORIZO o uso das minhas imagens para publicidade. O registro em prontuário previsto neste contrato permanece.');

    const {data: pac, error: e2} = await sb.from('pacientes').select('id,nome,drive_folder_id').eq('id', d.paciente_id).single();
    if (e2 || !pac) throw erro('servidor');

    const hash = hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(txt + '|' + assinatura + '|' + iso)));
    const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim().slice(0, 60), ua = (req.headers.get('user-agent') ?? '').slice(0, 200);
    const bytesAss = Uint8Array.from(atob(assinatura.split(',')[1]), c => c.charCodeAt(0));
    const pdf = await montarPdf({titulo: d.titulo, texto: txt, assinante: pac.nome, assinatura: {bytes: bytesAss, tipo: tipoAss},
      auditoria: [`Assinado eletronicamente em ${quando} (horário de Brasília).`, `Código de verificação (SHA-256): ${hash}`, `Registro: IP ${ip || 'não informado'}; aparelho ${ua || 'não informado'}.`]});

    const at = await tokenDoGoogle(sb);
    const pasta = await pastaDaPaciente(sb, at, pac);
    const nome = `${d.titulo} - ${pac.nome} - ${iso.slice(0, 10)}.pdf`.replace(/[\/\\]/g, '-');
    const arquivo = await enviarAoDrive(at, pasta, nome, pdf);

    /* o arquivo já está no Drive: agora o banco só guarda o recibo e apaga o texto e o link */
    const fim = {assinado_em: iso, drive_file_id: arquivo, hash_sha256: hash, texto_final: null, token: null, assinando_em: null};
    let salvo = false; for (let i = 0; i < 3 && !salvo; i++) { const {error} = await sb.from('documentos').update(fim).eq('id', d.id); salvo = !error; if (!salvo) console.error('finalizar', error?.message); }
    await sb.from('pacientes').update({imagem_publicidade: imagem, imagem_publicidade_em: iso.slice(0, 10)}).eq('id', pac.id);
    return resp(req, {ok: true, assinado_em: iso, hash, pdf: base64(pdf), arquivo_nome: nome});
  } catch (e) {
    const codigo = (e as any).codigo ?? 'servidor';
    console.error('assinar', codigo, (e as Error).message);
    await liberar();
    return resp(req, {ok: false, erro: codigo}, codigo === 'servidor' ? 500 : 503);
  }
});
