import { defineConfig } from 'vite';
/* duas páginas: o painel (index.html, fechado por login) e a assinatura de contrato (contrato.html, pública, sem acesso a tabelas) */
export default defineConfig({ build: { target: 'es2020', rollupOptions: { input: { main: 'index.html', contrato: 'contrato.html' } } } });
