import { useState } from 'react';
import { supabase } from '../../supabaseClient';

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [name, setName] = useState('');
  const [step, setStep] = useState('email'); // 'email' | 'otp' | 'name'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function sendOtp() {
    if (!email.trim() || !email.includes('@')) {
      setError('Enter a valid email address.');
      return;
    }
    setError('');
    setLoading(true);
    const { error: err } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { shouldCreateUser: true }
    });
    setLoading(false);
    if (err) { setError(err.message); return; }
    setStep('otp');
  }

  async function verifyOtp() {
    if (!otp || otp.length < 4) { setError('Enter the 6-digit code sent to your email.'); return; }
    setError('');
    setLoading(true);
    const { data, error: err } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: otp,
      type: 'email'
    });
    setLoading(false);
    if (err) { setError(err.message); return; }

    // Check if profile already exists with a name
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, name, role')
      .eq('id', data.user.id)
      .maybeSingle();

    if (profile && profile.name) {
      onLogin({ ...data.user, profile });
    } else {
      setStep('name');
    }
  }

  async function saveName() {
    if (!name.trim()) { setError('Please enter your name.'); return; }
    setError('');
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('profiles').upsert(
      { id: user.id, name: name.trim(), role: 'student' },
      { onConflict: 'id' }
    );
    setLoading(false);

    // Fetch fresh profile (might already be cr if set externally)
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, name, role')
      .eq('id', user.id)
      .maybeSingle();

    onLogin({ ...user, profile: profile || { id: user.id, name: name.trim(), role: 'student' } });
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', height: '100vh', background: 'var(--bg-app)', padding: 24
    }}>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: '40px', color: 'var(--red)', marginBottom: 8 }}>Margin</div>
      <p style={{ color: 'var(--pencil)', marginBottom: 48, fontSize: 15 }}>Your class notes, in one place.</p>

      <div style={{ background: 'white', padding: 32, borderRadius: 16, border: '1px solid var(--border)', width: '100%', maxWidth: 400 }}>
        {error && (
          <div style={{ background: '#fee2e2', color: '#dc2626', padding: '10px 16px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
            {error}
          </div>
        )}

        {step === 'email' && (
          <>
            <h2 style={{ marginBottom: 8, fontSize: '22px' }}>Welcome to Margin</h2>
            <p style={{ color: 'var(--pencil)', marginBottom: 24, fontSize: 14 }}>Enter your email to get a sign-in code.</p>
            <input
              style={{ width: '100%', padding: '12px 16px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 15, outline: 'none', marginBottom: 20, boxSizing: 'border-box' }}
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendOtp()}
              autoFocus
            />
            <button className="btn primary" style={{ width: '100%', padding: '13px', fontSize: 15 }} onClick={sendOtp} disabled={loading}>
              {loading ? 'Sending...' : 'Send Code'}
            </button>
          </>
        )}

        {step === 'otp' && (
          <>
            <h2 style={{ marginBottom: 8, fontSize: '22px' }}>Check your email</h2>
            <p style={{ color: 'var(--pencil)', marginBottom: 24, fontSize: 14 }}>
              We sent a 6-digit code to <strong>{email}</strong>
            </p>
            <input
              style={{ width: '100%', padding: '16px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 22, textAlign: 'center', letterSpacing: '8px', outline: 'none', marginBottom: 20, boxSizing: 'border-box' }}
              type="number"
              placeholder="------"
              value={otp}
              onChange={e => setOtp(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && verifyOtp()}
              maxLength={6}
              autoFocus
            />
            <button className="btn primary" style={{ width: '100%', padding: '13px', fontSize: 15 }} onClick={verifyOtp} disabled={loading}>
              {loading ? 'Verifying...' : 'Verify →'}
            </button>
            <button className="btn ghost" style={{ width: '100%', padding: '10px', fontSize: 13, marginTop: 8 }} onClick={() => { setStep('email'); setError(''); }}>
              ← Change email
            </button>
          </>
        )}

        {step === 'name' && (
          <>
            <h2 style={{ marginBottom: 8, fontSize: '22px' }}>What's your name?</h2>
            <p style={{ color: 'var(--pencil)', marginBottom: 24, fontSize: 14 }}>This will appear on your comments.</p>
            <input
              style={{ width: '100%', padding: '12px 16px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 15, outline: 'none', marginBottom: 20, boxSizing: 'border-box' }}
              type="text"
              placeholder="Enter your name"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && saveName()}
              autoFocus
            />
            <button className="btn primary" style={{ width: '100%', padding: '13px', fontSize: 15 }} onClick={saveName} disabled={loading}>
              {loading ? 'Saving...' : 'Continue →'}
            </button>
          </>
        )}
      </div>

      <p style={{ marginTop: 32, fontSize: 12, color: 'var(--pencil)' }}>Simple. Focused. For Students.</p>
    </div>
  );
}
