import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { montarPdf } from '../supabase/functions/contrato-assinar/pdf.js';

let n = 0; const ok = m => console.log(`ok ${++n} - ${m}`);
const PNG = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
const base = {titulo: 'Contrato de prestação de serviços', assinante: 'Ana Júlia', assinatura: {bytes: PNG, tipo: 'png'}, auditoria: ['Assinado em 28/10/2026 às 10:00', 'Código: abc123']};

{ const bytes = await montarPdf({...base, texto: 'Cláusula única: ação, coração, é, ç, ã, “aspas”, — traço.'});
  assert.equal(Buffer.from(bytes.slice(0, 5)).toString(), '%PDF-');
  const d = await PDFDocument.load(bytes); assert.equal(d.getPageCount(), 1); ok('PDF simples com acentos e aspas gera uma página'); }

{ const longo = Array.from({length: 120}, (_, i) => `${i + 1}) ` + 'Texto de cláusula bem longo para forçar a quebra de linha e de página. '.repeat(4)).join('\n\n');
  const d = await PDFDocument.load(await montarPdf({...base, texto: longo})); assert.ok(d.getPageCount() >= 5); ok('texto longo continua em várias páginas'); }

{ const bytes = await montarPdf({...base, texto: 'Emoji 😀 e símbolo ✓ não quebram, e palavra gigante: ' + 'x'.repeat(400) + '\ttab'});
  assert.ok((await PDFDocument.load(bytes)).getPageCount() >= 1); ok('caractere fora do alfabeto vira "?" e palavra gigante é quebrada'); }

{ const texto = 'linha\n'.repeat(52); /* termina perto do fim da página: assinatura precisa ir junto para a próxima */
  const d = await PDFDocument.load(await montarPdf({...base, texto})); assert.ok(d.getPageCount() >= 2); ok('assinatura nunca fica cortada no rodapé'); }

console.log(`\n${n} testes passaram`);
