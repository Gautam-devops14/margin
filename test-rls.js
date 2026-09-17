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
  
  console.log('1. Signing up new student...');
  const { data: authData, error: authErr } = await supabase.auth.signUp({ email: fakeEmail, password });
  if (authErr) { console.error('Auth err:', authErr); return; }
  
  const userId = authData.user.id;
  console.log('User ID:', userId);

  console.log('2. Creating profile row (role=student)...');
  const { error: insertErr } = await supabase.from('profiles').insert({ id: userId, name: 'Test Student', role: 'student' });
  if (insertErr) { console.error('Insert err:', insertErr); }

  console.log('3. Attempting to escalate role to cr...');
  const { data: updateData, error: updateErr } = await supabase.from('profiles').update({ role: 'cr' }).eq('id', userId);
  if (updateErr) {
    console.log('Role escalation blocked as expected:', updateErr.message);
  } else {
    console.log('Role escalation SUCCEEDED! (VULNERABILITY EXISTS)');
  }
  
  console.log('4. Attempting to update name...');
  const { error: nameErr } = await supabase.from('profiles').update({ name: 'Safe Name' }).eq('id', userId);
  if (nameErr) {
    console.log('Name update failed:', nameErr.message);
  } else {
    console.log('Name update SUCCEEDED! (Normal functionality works)');
  }
}
run();
