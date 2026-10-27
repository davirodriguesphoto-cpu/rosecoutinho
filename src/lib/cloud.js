import { createClient } from '@supabase/supabase-js';
import { createCloud } from './cloud-core.js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

/* Sem as duas variáveis o app roda em modo de teste (dados só no navegador). */
export const cloud = url && key ? createCloud(createClient(url, key)) : null;
