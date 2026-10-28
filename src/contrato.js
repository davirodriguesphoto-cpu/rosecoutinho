/* Página pública de assinatura. Só chama a função de leitura (contrato_obter) e a de assinatura (contrato-assinar) com o token do link;
   o token vem depois do # e é tirado do endereço assim que a página abre. Não tem login, nem acesso a nenhuma tabela.
   Passos: 1) ler, completar dados, responder sobre o uso de imagem e concordar; 2) assinar (dedo ou imagem); 3) baixar a cópia. */
import './style.css';
import { createClient } from '@supabase/supabase-js';
import { pendentes, ROTULOS } from './lib/contrato.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const app = $('#app');
const token = location.hash.slice(1);
history.replaceState(null, '', location.pathname + location.search);

const aviso = (titulo, texto) => { app.innerHTML = `<div class="card form"><h1 style="font-size:20px">${esc(titulo)}</h1><p class="sub" style="margin:0">${esc(texto)}</p></div>`; };
const AGORA_NAO = 'Não foi possível guardar o contrato agora. O seu link continua válido: tente de novo em alguns minutos ou avise a Rose.';
const ERRO = {link: 'Este link não é mais válido. Peça um novo à Rose.', aceite: 'Marque que você leu e concorda.', assinatura: 'A assinatura não foi aceita. Desenhe de novo ou escolha outra imagem.',
  campos: 'Preencha todos os seus dados.', imagem: 'Responda sobre o uso de imagem.', drive_conexao: AGORA_NAO, drive_pasta: AGORA_NAO, drive_envio: AGORA_NAO, servidor: AGORA_NAO};

async function main(){
  const url = import.meta.env.VITE_SUPABASE_URL, key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) return aviso('Indisponível', 'Configuração pendente.');
  const sb = createClient(url, key, {auth: {persistSession: false, autoRefreshToken: false, detectSessionInUrl: false}});
  let r;
  try { const {data, error} = await sb.rpc('contrato_obter', {p_token: token}); if (error) throw error; r = data; }
  catch (e) { console.error(e); return aviso('Não foi possível abrir', 'Verifique a conexão e abra o link de novo.'); }
  if (r.estado === 'expirado') return aviso('Link expirado', 'O link vale 24 horas. Peça à Rose um novo link para assinar.');
  if (r.estado !== 'pendente') return aviso('Link indisponível', 'Este link não existe, já foi usado ou expirou.');
  tela(r, url, key);
}

function tela(r, url, key){
  const pend = pendentes(r.texto);
  app.innerHTML = `<section id="p1">
      <div><h1 style="font-size:22px">${esc(r.titulo)}</h1><p class="sub">${esc(r.nome)}, leia com atenção. Depois toque em Assinar.</p></div>
      <div class="card"><div id="texto" class="contrato-texto"></div></div>
      ${pend.length ? `<section class="card form"><h2>Seus dados</h2>${pend.map(k => `<div class="f"><label for="c-${k}">${ROTULOS[k]}</label><input id="c-${k}" type="${k === 'nascimento' ? 'date' : k === 'telefone' ? 'tel' : 'text'}" maxlength="200" autocomplete="off"></div>`).join('')}</section>` : ''}
      <section class="card form"><h2>Uso de imagem para publicidade</h2>
        <p class="sub" style="margin:0">Podemos usar fotos e vídeos seus, inclusive de antes e depois, nas redes sociais, no site e em materiais da Rose Coutinho? Isso não muda o registro em prontuário previsto no contrato.</p>
        <label class="check"><input type="radio" name="img" value="sim"><span>Autorizo o uso das minhas imagens para publicidade</span></label>
        <label class="check"><input type="radio" name="img" value="nao"><span>Não autorizo o uso das minhas imagens para publicidade</span></label></section>
      <section class="card form"><label class="check"><input type="checkbox" id="aceite"><span>Li e concordo com o contrato.</span></label>
        <button class="btn" id="seguir" type="button" disabled>Assinar</button></section>
      <p class="src">Ao assinar, ficam registrados a data e a hora, o seu aparelho e o seu endereço de internet, como prova. O contrato assinado é guardado no arquivo da clínica e esta página não guarda login nem cookies.</p>
    </section>
    <section id="p2" hidden>
      <div><h1 style="font-size:22px">Sua assinatura</h1><p class="sub">Desenhe com o dedo ou envie uma imagem da sua assinatura.</p></div>
      <section class="card form">
        <div class="seg" role="group" aria-label="Como assinar" style="align-self:flex-start"><button type="button" data-m="dedo" aria-pressed="true">Desenhar com o dedo</button><button type="button" data-m="arq" aria-pressed="false">Enviar imagem</button></div>
        <div class="assina"><canvas id="cv" width="640" height="220" aria-label="Área da assinatura"></canvas></div>
        <div id="m-dedo" class="actions"><button class="btn ghost small" id="limpa" type="button">Limpar</button></div>
        <div id="m-arq" class="actions" hidden><label class="btn ghost small" for="arq">Escolher imagem da assinatura</label><input type="file" id="arq" accept="image/png,image/jpeg" hidden></div>
        <p class="sub" id="erro" role="alert" style="margin:0;color:var(--bad)"></p>
        <div class="actions"><button class="btn ghost" id="voltar" type="button">Voltar</button><button class="btn" id="assinar" type="button" disabled>Confirmar e assinar</button></div>
      </section>
    </section>`;

  const campos = () => Object.fromEntries(pend.map(k => [k, $('#c-' + k).value.trim()]));
  const formata = (k, v) => k === 'nascimento' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v.split('-').reverse().join('/') : v;
  const imagem = () => { const e = document.querySelector('input[name="img"]:checked'); return e ? e.value : ''; };
  const pinta = () => { let t = r.texto; const c = campos(); pend.forEach(k => { t = t.split('{{' + k + '}}').join(c[k] ? formata(k, c[k]) : '________'); }); $('#texto').textContent = t.split('{{data_hora}}').join('(data e hora da assinatura)'); };
  const valida1 = () => { $('#seguir').disabled = !($('#aceite').checked && imagem() && pend.every(k => campos()[k])); };
  [...pend.map(k => 'c-' + k), 'aceite'].forEach(id => $('#' + id).addEventListener('input', () => { pinta(); valida1(); }));
  document.querySelectorAll('input[name="img"]').forEach(e => e.addEventListener('change', valida1));
  pinta();
  const passo = n => { $('#p1').hidden = n !== 1; $('#p2').hidden = n !== 2; window.scrollTo(0, 0); };
  $('#seguir').onclick = () => passo(2);
  $('#voltar').onclick = () => passo(1);

  /* assinatura: um só canvas, com fundo branco e traço preto (legível em qualquer tema); no modo "imagem" a foto da assinatura é desenhada nele */
  const cv = $('#cv'), cx = cv.getContext('2d'); let modo = 'dedo', desenha = false, tracos = 0, temArquivo = false, ultimo = null;
  const erroMsg = t => { $('#erro').textContent = t || ''; };
  const valida2 = () => { $('#assinar').disabled = !(modo === 'dedo' ? tracos > 12 : temArquivo); };
  const limpa = () => { cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height); cx.strokeStyle = '#000'; cx.lineWidth = 3; cx.lineCap = 'round'; cx.lineJoin = 'round'; tracos = 0; temArquivo = false; valida2(); };
  const ponto = e => { const b = cv.getBoundingClientRect(); return [(e.clientX - b.left) * cv.width / b.width, (e.clientY - b.top) * cv.height / b.height]; };
  cv.addEventListener('pointerdown', e => { if (modo !== 'dedo') return; desenha = true; ultimo = ponto(e); cv.setPointerCapture(e.pointerId); cx.beginPath(); cx.moveTo(...ultimo); cx.lineTo(ultimo[0] + .1, ultimo[1] + .1); cx.stroke(); tracos++; e.preventDefault(); });
  cv.addEventListener('pointermove', e => { if (!desenha) return; const p = ponto(e); cx.beginPath(); cx.moveTo(...ultimo); cx.lineTo(...p); cx.stroke(); ultimo = p; tracos++; valida2(); e.preventDefault(); });
  ['pointerup', 'pointercancel'].forEach(ev => cv.addEventListener(ev, () => { desenha = false; valida2(); }));
  limpa();
  $('#limpa').onclick = () => { limpa(); erroMsg(''); };
  document.querySelectorAll('.seg button').forEach(b => b.onclick = () => {
    modo = b.dataset.m; document.querySelectorAll('.seg button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    $('#m-dedo').hidden = modo !== 'dedo'; $('#m-arq').hidden = modo !== 'arq'; cv.style.cursor = modo === 'dedo' ? 'crosshair' : 'default'; limpa(); erroMsg(''); });
  $('#arq').onchange = e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    if (!/^image\/(png|jpeg)$/.test(f.type) || f.size > 5e6) { limpa(); return erroMsg('Escolha uma imagem PNG ou JPG de até 5 MB.'); }
    const u = URL.createObjectURL(f), img = new Image();
    img.onload = () => { limpa(); const k = Math.min((cv.width - 24) / img.width, (cv.height - 24) / img.height), w = img.width * k, h = img.height * k;
      cx.drawImage(img, (cv.width - w) / 2, (cv.height - h) / 2, w, h); URL.revokeObjectURL(u); temArquivo = true; erroMsg(''); valida2(); };
    img.onerror = () => { URL.revokeObjectURL(u); limpa(); erroMsg('Não foi possível ler essa imagem.'); };
    img.src = u;
  };

  $('#assinar').onclick = async () => {
    const btn = $('#assinar'); btn.disabled = true; btn.textContent = 'Assinando…'; erroMsg('');
    const c = campos(); pend.forEach(k => { c[k] = formata(k, c[k]); });
    const assinatura = modo === 'arq' ? cv.toDataURL('image/jpeg', .88) : cv.toDataURL('image/png');
    try {
      const res = await fetch(url + '/functions/v1/contrato-assinar', {method: 'POST', headers: {'Content-Type': 'application/json', apikey: key}, body: JSON.stringify({token, campos: c, assinatura, imagem: imagem(), aceite: true})});
      const data = await res.json().catch(() => ({}));
      if (!data.ok) { erroMsg(ERRO[data.erro] || 'Não foi possível assinar.'); btn.textContent = 'Confirmar e assinar'; return valida2(); }
      pronto(r, data);
    } catch (e) { console.error(e); erroMsg('Não foi possível assinar agora. Verifique a conexão e tente de novo.'); btn.textContent = 'Confirmar e assinar'; valida2(); }
  };
}

/* a cópia em PDF só existe aqui, no aparelho da paciente: o servidor guarda o original no Drive da clínica e não mantém cópia */
function pronto(r, d){
  const quando = new Date(d.assinado_em).toLocaleString('pt-BR', {dateStyle: 'short', timeStyle: 'short'});
  app.innerHTML = `<div class="card form"><h1 style="font-size:20px">Contrato assinado</h1><p class="sub" style="margin:0">Obrigada, ${esc(r.nome)}! Assinado em ${esc(quando)}. Baixe a sua cópia agora: este link não abre de novo.</p>
    <div class="actions"><button class="btn" id="baixar" type="button">Baixar a minha cópia (PDF)</button></div><p class="src" style="margin:0">Código de verificação: ${esc(String(d.hash).slice(0, 16))}</p></div>`;
  $('#baixar').onclick = () => {
    const bin = atob(d.pdf), bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([bytes], {type: 'application/pdf'})); a.download = d.arquivo_nome || 'contrato.pdf'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };
  window.scrollTo(0, 0);
}

main();
