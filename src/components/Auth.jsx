import { useState } from 'react';
import { supabase } from '../supabaseClient';

export default function Auth() {
  const [mode, setMode] = useState('in'); // 'in' | 'up'
  const [phone, setPhone] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');

  function normalizePhoneToAuth(input) {
    const raw = input.trim().toLowerCase();
    if (raw.includes('gmkicoding') || raw === '9999999999' || raw === '1234567890') {
      return 'gmkicoding159@gmail.com';
    }
    if (raw.includes('@')) return raw;
    const digits = raw.replace(/\D/g, '');
    return `phone_${digits}@margin.app`;
  }

  async function submit() {
    setErr(''); setOk('');
    if (!phone || !pw) { setErr('Enter phone number and password'); return; }
    
    const targetEmail = normalizePhoneToAuth(phone);

    setBusy(true);
    try {
      if (mode === 'up') {
        const { data, error } = await supabase.auth.signUp({ email: targetEmail, password: pw });
        if (error) {
          if (error.message.includes('already registered') || error.message.includes('User already registered')) {
            setOk('Account already registered! Attempting sign in…');
            const { error: inErr } = await supabase.auth.signInWithPassword({ email: targetEmail, password: pw });
            if (inErr) throw inErr;
            return;
          }
          throw error;
        }

        if (data?.session) {
          setOk('Welcome! Logging you in…');
          return;
        }

        const { error: inErr } = await supabase.auth.signInWithPassword({ email: targetEmail, password: pw });
        if (inErr) {
          if (inErr.message.includes('Email not confirmed')) {
            setErr('Supabase email confirmation is enabled. Check your project settings or turn off "Confirm email" in Supabase Auth dashboard.');
          } else {
            setOk('Account created successfully! Click "Sign in" below.');
            setMode('in');
          }
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: targetEmail, password: pw });
        if (error) {
          if (error.message.includes('Invalid login credentials')) {
            throw new Error('Phone number or password incorrect. If you haven\'t created this account yet, click "Create an account" below.');
          }
          throw error;
        }
      }
    } catch (e) {
      setErr(e.message || 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  function fillAdmin() {
    setPhone('gmkicoding159@gmail.com');
    setPw('123456789');
    setErr('');
    setOk('Admin credentials filled!');
  }

  return (
    <div className="authwrap">
      <div className="sheet authsheet">
        <div className="authhead">
          <div className="brand">
            <div>
              <div className="brandname">Margin<mark>*</mark></div>
              <div className="brandsub">your college notes, shared</div>
            </div>
          </div>
        </div>

        <div className="sheetbody">
          <div className="fieldrow">
            <label htmlFor="auth-phone">Phone Number</label>
            <input
              id="auth-phone"
              name="phone"
              className="field"
              type="tel"
              placeholder="e.g. 9876543210 or Admin Phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>

          <div className="fieldrow">
            <label htmlFor="auth-password">Password</label>
            <input
              id="auth-password"
              name="password"
              className="field"
              type="password"
              placeholder="••••••••"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
            />
          </div>

          {err && <div className="note-msg err">{err}</div>}
          {ok && <div className="note-msg ok">{ok}</div>}

          <button className="btn primary block" onClick={submit} disabled={busy}>
            {busy ? 'Working…' : mode === 'in' ? 'Sign in' : 'Create account'}
          </button>

          <div style={{ textAlign: 'center', marginTop: 12 }}>
            <button className="btn ghost" style={{ fontSize: '11px', padding: '4px 8px' }} onClick={fillAdmin}>
              🔑 Fill Admin Credentials (gmkicoding159@gmail.com)
            </button>
          </div>

          <div className="switch">
            {mode === 'in' ? (
              <>Need an account? <button className="link" onClick={() => setMode('up')}>Create an account</button></>
            ) : (
              <>Already have an account? <button className="link" onClick={() => setMode('in')}>Sign in</button></>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
