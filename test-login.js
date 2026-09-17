import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
const env = fs.readFileSync('.env', 'utf8').split('\n').reduce((acc, line) => { const [k, v] = line.split('='); if(k) acc[k] = v; return acc; }, {});
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
async function run() {
  const { data, error } = await supabase.auth.signInWithPassword({ email: '9999999999@margin.app', password: 'password123' });
  console.log("Error:", error ? error.message : "None");
  console.log("User:", data?.user?.id);
}
run();
