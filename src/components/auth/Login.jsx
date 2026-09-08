import { useState } from 'react';
import { supabase } from '../../supabaseClient';

// Converts phone to a stable fake email for Supabase auth
function phoneToEmail(phone) {
  const digits = phone.replace(/\D/g, '');
  return `${digits}@margin.app`;
}

export default function Login({ onLogin }) {
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit() {
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 10) { setError('Enter a valid 10-digit phone number.'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    if (isSignUp && !name.trim()) { setError('Enter your name.'); return; }

    setError('');
    setLoading(true);
    const fakeEmail = phoneToEmail(digits);

    if (isSignUp) {
      // Sign Up
      const { data, error: err } = await supabase.auth.signUp({
        email: fakeEmail,
        password,
      });
      if (err) { setError(err.message); setLoading(false); return; }

      // Save profile
      await supabase.from('profiles').upsert(
        { id: data.user.id, name: name.trim(), role: 'student' },
        { onConflict: 'id' }
      );

      // Fetch fresh profile (might already be cr if set externally)
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, name, role')
        .eq('id', data.user.id)
        .maybeSingle();

      onLogin({ ...data.user, phone: `+91 ${digits}`, profile: profile || { id: data.user.id, name: name.trim(), role: 'student' } });
    } else {
      // Sign In
      const { data, error: err } = await supabase.auth.signInWithPassword({
        email: fakeEmail,
        password,
      });
      if (err) {
        if (err.message.includes('Invalid login')) {
          setError('Wrong phone number or password.');
        } else {
          setError(err.message);
        }
        setLoading(false);
        return;
      }

      // Fetch profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, name, role')
        .eq('id', data.user.id)
        .maybeSingle();

      onLogin({ ...data.user, phone: `+91 ${digits}`, profile: profile || { id: data.user.id, name: '', role: 'student' } });
    }

    setLoading(false);
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', minHeight: '100vh', background: 'var(--bg-app)', padding: 24
    }}>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: '40px', color: 'var(--red)', marginBottom: 8 }}>Margin</div>
      <p style={{ color: 'var(--pencil)', marginBottom: 48, fontSize: 15 }}>Your class notes, in one place.</p>

      <div style={{ background: 'white', padding: 32, borderRadius: 16, border: '1px solid var(--border)', width: '100%', maxWidth: 400 }}>
        <h2 style={{ marginBottom: 24, fontSize: '22px' }}>
          {isSignUp ? 'Create Account' : 'Sign In'}
        </h2>

        {error && (
          <div style={{ background: '#fee2e2', color: '#dc2626', padding: '10px 16px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
            {error}
          </div>
        )}

        {isSignUp && (
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--pencil)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Your Name</label>
            <input
              style={{ width: '100%', padding: '12px 16px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 15, outline: 'none', boxSizing: 'border-box' }}
              type="text"
              placeholder="e.g. Priya Sharma"
              value={name}
              onChange={e => setName(e.target.value)}
              autoFocus
            />
          </div>
        )}

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--pencil)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Phone Number</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ padding: '12px 14px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 15, color: 'var(--pencil)', flexShrink: 0, background: '#fafafa' }}>+91</div>
            <input
              style={{ flex: 1, padding: '12px 16px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 15, outline: 'none', boxSizing: 'border-box' }}
              type="tel"
              placeholder="98765 43210"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            />
          </div>
        </div>

        <div style={{ marginBottom: 24 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--pencil)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Password</label>
          <input
            style={{ width: '100%', padding: '12px 16px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 15, outline: 'none', boxSizing: 'border-box' }}
            type="password"
            placeholder={isSignUp ? 'Create a password (min 6 chars)' : 'Enter your password'}
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          />
        </div>

        <button
          className="btn primary"
          style={{ width: '100%', padding: '13px', fontSize: 15 }}
          onClick={handleSubmit}
          disabled={loading}
        >
          {loading ? '...' : isSignUp ? 'Create Account' : 'Sign In'}
        </button>

        <div style={{ textAlign: 'center', marginTop: 20 }}>
          <button
            className="btn ghost"
            style={{ fontSize: 14, color: 'var(--pencil)', padding: '4px 0' }}
            onClick={() => { setIsSignUp(!isSignUp); setError(''); }}
          >
            {isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
          </button>
        </div>
      </div>

      <p style={{ marginTop: 32, fontSize: 12, color: 'var(--pencil)' }}>Simple. Focused. For Students.</p>
    </div>
  );
}
