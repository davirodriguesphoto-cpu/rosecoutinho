/* Envia as fichas lidas por scripts/fichas.py para o Supabase (sem valores financeiros).
   Simula por padrão. Para gravar: node scripts/importar-fichas.mjs "<fichas.json>" --gravar
   Precisa de SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente (a chave secret, só na sua máquina).
   Quem já existe com o mesmo nome é pulado, então dá para rodar de novo sem duplicar. */
import fs from 'node:fs';

const [, , arq, flag] = process.argv;
if (!arq) { console.error('Uso: node scripts/importar-fichas.mjs "<fichas.json>" [--gravar]'); process.exit(1); }
const gravar = flag === '--gravar';
const docs = JSON.parse(fs.readFileSync(arq, 'utf8'));
const chave = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

const { createClient } = await import('@supabase/supabase-js');
const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('Faltam SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.'); process.exit(1); }
const sb = createClient(url, key, { auth: { persistSession: false } });
const ok = r => { if (r.error) throw new Error(r.error.message); return r.data; };

const existentes = new Set(ok(await sb.from('pacientes').select('nome')).map(p => chave(p.nome)));
const novos = docs.filter(d => !existentes.has(chave(d.nome)));
const vistos = new Set(), unicos = novos.filter(d => !vistos.has(chave(d.nome)) && vistos.add(chave(d.nome)));
const pacientes = unicos.map(d => ({ id: crypto.randomUUID(), nome: d.nome, nascimento: d.nascimento, telefone: d.telefone, origem: 'Ficha em papel', observacoes: d.ficha || null }));
const porNome = new Map(unicos.map((d, i) => [chave(d.nome), pacientes[i].id]));
const atendimentos = unicos.flatMap(d => d.atendimentos.map(a => ({ id: crypto.randomUUID(), paciente_id: porNome.get(chave(d.nome)), data: a.data, evolucao: a.evolucao, produto: a.produto, lote: a.lote })));

console.log(`${docs.length} fichas lidas; ${docs.length - novos.length} já existiam; ${novos.length - unicos.length} nomes repetidos no lote.`);
console.log(`A gravar: ${pacientes.length} pacientes e ${atendimentos.length} atendimentos.`);
if (!gravar) { console.log('Simulação. Nada foi gravado. Rode de novo com --gravar.'); process.exit(0); }

for (let i = 0; i < pacientes.length; i += 50) ok(await sb.from('pacientes').insert(pacientes.slice(i, i + 50)));
for (let i = 0; i < atendimentos.length; i += 100) ok(await sb.from('atendimentos').insert(atendimentos.slice(i, i + 100)));
console.log('Pronto.');
