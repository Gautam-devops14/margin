import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Read .env manually
const envPath = path.resolve('.env');
const envFile = fs.readFileSync(envPath, 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) env[match[1]] = match[2];
});

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const fakeEmail = `test${Date.now()}@margin.app`;
  const password = 'password123';
  await supabase.auth.signUp({ email: fakeEmail, password });
  
  // Try to insert as CR directly
  const { data: authData } = await supabase.auth.getUser();
  const userId = authData.user.id;
  console.log('Attempting to insert with role=cr...');
  const { error: insertErr } = await supabase.from('profiles').insert({ id: userId, name: 'Test Student', role: 'cr' });
  if (insertErr) {
    console.log('Insert escalation blocked:', insertErr.message);
  } else {
    console.log('Insert escalation SUCCEEDED! (Vulnerability exists)');
  }
}
run();
