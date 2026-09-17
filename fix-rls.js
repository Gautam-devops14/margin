import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
const env = fs.readFileSync('.env', 'utf8').split('\n').reduce((acc, line) => { const [k, v] = line.split('='); if(k) acc[k] = v; return acc; }, {});
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
// I can't execute SQL with supabase-js unless I have service role.
// I'll use the MCP tool instead.
