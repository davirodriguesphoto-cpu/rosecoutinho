/* Restaura o banco a partir de um arquivo de backup (backup-painel-AAAA-MM-DD.json).
   Uso:  SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/restaurar.mjs arquivo.json            (só mostra o que faria)
         SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/restaurar.mjs arquivo.json --executar  (grava)
   Regrava (upsert) os registros do backup; não apaga o que existe só no banco. Não restaura "membros" nem tokens. */
import { readFileSync } from 'node:fs';

const ORDEM = [['servicos', 'id'], ['pacientes', 'id'], ['atendimentos', 'id'], ['estoque_itens', 'id'], ['estoque_lotes', 'id'], ['estoque_movimentos', 'id'], ['servico_insumos', 'servico_id,item_id'], ['agendamentos', 'id'], ['mensagens', 'id'], ['modelos_documento', 'id'], ['documentos', 'id'], ['fotos', 'id'], ['lancamentos', 'id'], ['pacotes_paciente', 'id'], ['config', 'chave']];

export async function restaurar(sb, dump, { executar = false, log = console.log } = {}){
  if (!dump || dump.app !== 'painel-rosecoutinho' || !dump.tabelas) throw new Error('Arquivo não parece um backup do painel.');
  for (const [t, pk] of ORDEM) {
    const rows = dump.tabelas[t] || [];
    log(`${t}: ${rows.length} registros`);
    if (!executar || !rows.length) continue;
    for (let i = 0; i < rows.length; i += 400) { const { error } = await sb.from(t).upsert(rows.slice(i, i + 400), { onConflict: pk }); if (error) throw new Error(`${t}: ${error.message}`); }
  }
  log(executar ? 'Restauração concluída.' : 'Simulação: nada foi gravado. Rode de novo com --executar para gravar.');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [arq, ...flags] = process.argv.slice(2);
  if (!arq) { console.error('Informe o arquivo de backup.'); process.exit(1); }
  const { createClient } = await import('@supabase/supabase-js');
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  await restaurar(sb, JSON.parse(readFileSync(arq, 'utf8')), { executar: flags.includes('--executar') });
}
