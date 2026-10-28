import assert from 'node:assert/strict';
import { preencher, pendentes, faltando, novoToken, cpfValido } from '../src/lib/contrato.js';

let n = 0; const ok = m => console.log(`ok ${++n} - ${m}`);
const modelo = 'Nome: {{nome}}\nCPF: {{cpf}}\nObjeto: {{objeto}}\nValor: {{valor_total}}\nAssinado em {{data_hora}}\nNasc: {{nascimento}}';

{ const t = preencher(modelo, {nome: 'Ana', objeto: '8 sessões', valor_total: 'R$ 700', cpf: '', nascimento: '  '});
  assert.ok(t.includes('Nome: Ana') && t.includes('Objeto: 8 sessões') && t.includes('Valor: R$ 700'));
  assert.ok(t.includes('{{cpf}}') && t.includes('{{nascimento}}') && t.includes('{{data_hora}}')); ok('preencher troca o que tem valor e mantém o que está vazio'); }

{ assert.deepEqual(pendentes(modelo), ['cpf', 'nascimento']);
  assert.deepEqual(pendentes(preencher(modelo, {cpf: '1', nascimento: '2'})), []); ok('pendentes lista só o que a paciente completa'); }

{ assert.deepEqual(faltando(modelo), ['nome', 'objeto', 'valor_total']);
  assert.deepEqual(faltando(preencher(modelo, {nome: 'A', objeto: 'B', valor_total: 'C'})), []); ok('faltando aponta campo da clínica em branco, ignorando os da paciente e do banco'); }

{ assert.equal(preencher('{{nome}} e {{nome}}', {nome: 'Ana'}), 'Ana e Ana');
  assert.equal(preencher('R$ {{v}}', {v: '$&'}), 'R$ $&'); ok('valor com símbolos especiais entra como texto'); }

{ const a = novoToken(), b = novoToken();
  assert.match(a, /^[A-Za-z0-9_-]{43}$/); assert.notEqual(a, b); ok('token tem 43 caracteres seguros para URL e não repete'); }

{ assert.equal(cpfValido(''), true); assert.equal(cpfValido('529.982.247-25'), true); assert.equal(cpfValido('52998224725'), true);
  assert.equal(cpfValido('529.982.247-24'), false); assert.equal(cpfValido('111.111.111-11'), false); assert.equal(cpfValido('123'), false); ok('CPF: aceita válido e vazio, recusa dígito errado, repetido e curto'); }

console.log(`\n${n} testes passaram`);
