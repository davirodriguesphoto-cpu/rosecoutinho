import { handler, member, db, query, jsonBody, rawBody, E, pastaPaciente, ensureFolder, nomeDia, uploadImagem, baixar, lixeira, clean } from './_lib.js';

export const config = { api: { bodyParser: false }, maxDuration: 30 };
const MAX = 4 * 1024 * 1024; /* limite da Vercel é 4,5 MB; o app reduz a foto antes de enviar */
const TIPOS = ['antes', 'depois', 'outra'];
const DATA = /^\d{4}-\d{2}-\d{2}$/;

export default handler(async (req, res) => {
  await member(req);
  const q = query(req), d = await db();

  if (q.action === 'pasta' && req.method === 'POST') {
    const { paciente } = await jsonBody(req);
    const p = await pastaPaciente(String(paciente));
    return { pasta: p.id };
  }

  if (q.action === 'upload' && req.method === 'POST') {
    const { paciente, data, tipo } = q;
    if (!paciente || !DATA.test(data || '') || !TIPOS.includes(tipo)) throw E(400, 'Pedido inválido.');
    const mime = String(req.headers['content-type'] || '').split(';')[0];
    if (!/^image\/(jpeg|png|webp)$/.test(mime)) throw E(415, 'Envie uma imagem JPG, PNG ou WebP.');
    const bytes = await rawBody(req, MAX);
    if (!bytes.length) throw E(400, 'Arquivo vazio.');
    const pac = await pastaPaciente(paciente);
    const dia = await ensureFolder(nomeDia(data, pac.nome), pac.id);
    const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
    const arq = await uploadImagem(dia, `${tipo}-${new Date().toISOString().slice(11, 19).replace(/:/g, '')}-${Math.random().toString(36).slice(2, 6)}.${ext}`, mime, bytes);
    const foto = await d.insert('fotos', { paciente_id: paciente, tipo, arquivo_path: 'drive:' + arq.id, tirada_em: data, legenda: q.legenda ? clean(q.legenda).slice(0, 200) : null });
    return { foto };
  }

  if (q.action === 'img' && req.method === 'GET') {
    const f = await d.get('fotos', { id: q.id });
    if (!f || !String(f.arquivo_path).startsWith('drive:')) throw E(404, 'Foto não encontrada.');
    const r = await baixar(f.arquivo_path.slice(6), q.t === '1');
    if (!r.ok) throw E(404, 'Foto indisponível no Drive.');
    res.statusCode = 200;
    res.setHeader('content-type', r.headers.get('content-type') || 'image/jpeg');
    res.setHeader('cache-control', 'private, max-age=600');
    res.end(Buffer.from(await r.arrayBuffer()));
    return;
  }

  if (q.action === 'apagar' && req.method === 'POST') {
    const { id } = await jsonBody(req);
    const f = await d.get('fotos', { id });
    if (!f) throw E(404, 'Foto não encontrada.');
    if (String(f.arquivo_path).startsWith('drive:')) { try { await lixeira(f.arquivo_path.slice(6)); } catch (e) { if (e.status !== 404) throw e; } }
    await d.del('fotos', { id });
    return { ok: true };
  }
  throw E(404, 'Ação desconhecida.');
});
