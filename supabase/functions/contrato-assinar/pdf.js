/* Monta o PDF do contrato assinado. Roda na função de servidor (Deno) e nos testes (Node): o import 'pdf-lib' vem do deno.json na função. */
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const W = 595.28, H = 841.89, M = 56, LARG = W - 2 * M, TAM = 10.5, ENT = 15;

/* assinatura: {bytes, tipo: 'png' | 'jpeg'} (desenhada na tela = png; imagem enviada = jpeg) */
export async function montarPdf({titulo, texto, assinante, assinatura, auditoria}){
  const pdf = await PDFDocument.create();
  pdf.setTitle(titulo); pdf.setProducer('Rose Coutinho');
  const fonte = await pdf.embedFont(StandardFonts.Helvetica), negrito = await pdf.embedFont(StandardFonts.HelveticaBold);
  /* a fonte padrão só tem os caracteres do Latin-1 (acentos do português inclusos); o que não couber vira "?" em vez de quebrar */
  const limpa = (f, s) => [...String(s).replace(/\t/g, '    ')].map(ch => { try { f.encodeText(ch); return ch; } catch { return '?'; } }).join('');
  let pagina = pdf.addPage([W, H]), y = H - M;
  const nova = () => { pagina = pdf.addPage([W, H]); y = H - M; };
  const quebra = (s, f, tam) => {
    if (!s.trim()) return [''];
    const out = []; let atual = '';
    for (let p of s.split(' ')) {
      while (f.widthOfTextAtSize(p, tam) > LARG) { /* palavra maior que a linha */
        let i = p.length; while (i > 1 && f.widthOfTextAtSize(p.slice(0, i), tam) > LARG) i--;
        if (atual) { out.push(atual); atual = ''; }
        out.push(p.slice(0, i)); p = p.slice(i);
      }
      const t = atual ? atual + ' ' + p : p;
      if (f.widthOfTextAtSize(t, tam) <= LARG) atual = t; else { out.push(atual); atual = p; }
    }
    out.push(atual); return out;
  };
  const linha = (s, f = fonte, tam = TAM, cor = rgb(0, 0, 0), centro = false) => {
    if (y - ENT < M) nova();
    const x = centro ? (W - f.widthOfTextAtSize(s, tam)) / 2 : M;
    pagina.drawText(s, {x, y: y - tam, size: tam, font: f, color: cor}); y -= ENT;
  };

  quebra(limpa(negrito, titulo), negrito, 14).forEach(l => linha(l, negrito, 14, rgb(0, 0, 0), true)); y -= 8;
  String(texto).split(/\r?\n/).forEach(par => quebra(limpa(fonte, par), fonte, TAM).forEach(l => linha(l)));

  /* assinatura e registro, sempre juntos no fim */
  if (y - 230 < M) nova();
  y -= 22; linha(limpa(negrito, 'Assinatura de ' + assinante), negrito, TAM);
  const img = assinatura.tipo === 'jpeg' ? await pdf.embedJpg(assinatura.bytes) : await pdf.embedPng(assinatura.bytes), esc = Math.min(1, 240 / img.width), iw = img.width * esc, ih = img.height * esc;
  pagina.drawRectangle({x: M, y: y - ih - 4, width: iw + 8, height: ih + 8, borderColor: rgb(.6, .6, .6), borderWidth: .5});
  pagina.drawImage(img, {x: M + 4, y: y - ih, width: iw, height: ih}); y -= ih + 22;
  (auditoria || []).forEach(a => quebra(limpa(fonte, a), fonte, 8.5).forEach(l => linha(l, fonte, 8.5, rgb(.35, .35, .35))));
  return await pdf.save();
}
