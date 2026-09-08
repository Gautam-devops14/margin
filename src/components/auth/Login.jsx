import { useState } from 'react';
import { supabase } from '../../supabaseClient';

export default function Login({ onLogin }) {
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [name, setName] = useState('');
  const [step, setStep] = useState('phone'); // 'phone' | 'otp' | 'name'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const COUNTRY_CODE = '+91';

  async function sendOtp() {
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length < 10) { setError('Enter a valid 10-digit phone number.'); return; }
    setError('');
    setLoading(true);
    const fullPhone = `${COUNTRY_CODE}${cleaned}`;
    const { error: err } = await supabase.auth.signInWithOtp({ phone: fullPhone });
    setLoading(false);
    if (err) { setError(err.message); return; }
    setStep('otp');
  }

  async function verifyOtp() {
    const cleaned = phone.replace(/\D/g, '');
    const fullPhone = `${COUNTRY_CODE}${cleaned}`;
    if (!otp || otp.length < 4) { setError('Enter the OTP sent to your phone.'); return; }
    setError('');
    setLoading(true);
    const { data, error: err } = await supabase.auth.verifyOtp({ phone: fullPhone, token: otp, type: 'sms' });
    setLoading(false);
    if (err) { setError(err.message); return; }

    // Check if profile already exists
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, name, role')
      .eq('id', data.user.id)
      .maybeSingle();

    if (profile && profile.name) {
      // Returning user — pass profile up
      onLogin({ ...data.user, profile });
    } else {
      // First time — ask for name
      setStep('name');
    }
  }

  async function saveName() {
    if (!name.trim()) { setError('Please enter your name.'); return; }
    setError('');
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error: err } = await supabase
      .from('profiles')
      .upsert({ id: user.id, name: name.trim(), role: 'student' }, { onConflict: 'id' });
    setLoading(false);
    if (err) { setError(err.message); return; }

    // Fetch the fresh profile (role may have been pre-set to 'cr')
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, name, role')
      .eq('id', user.id)
      .maybeSingle();

    onLogin({ ...user, profile: profile || { id: user.id, name: name.trim(), role: 'student' } });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg-app)', padding: 24 }}>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: '40px', color: 'var(--red)', marginBottom: 8 }}>Margin</div>
      <p style={{ color: 'var(--pencil)', marginBottom: 48, fontSize: 15 }}>Your class notes, in one place.</p>

      <div style={{ background: 'white', padding: 32, borderRadius: 16, border: '1px solid var(--border)', width: '100%', maxWidth: 400 }}>
        {error && (
          <div style={{ background: '#fee2e2', color: '#dc2626', padding: '10px 16px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
            {error}
          </div>
        )}

        {step === 'phone' && (
          <>
            <h2 style={{ marginBottom: 8, fontSize: '22px' }}>Welcome to Margin</h2>
            <p style={{ color: 'var(--pencil)', marginBottom: 24, fontSize: 14 }}>Enter your phone number to continue.</p>
            <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
              <div style={{ padding: '12px 16px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 15, color: 'var(--pencil)', flexShrink: 0 }}>+91</div>
              <input
                style={{ flex: 1, padding: '12px 16px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 15, outline: 'none' }}
                type="tel"
                placeholder="98765 43210"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendOtp()}
              />
            </div>
            <button className="btn primary" style={{ width: '100%', padding: '13px', fontSize: 15 }} onClick={sendOtp} disabled={loading}>
              {loading ? 'Sending...' : 'Send OTP'}
            </button>
          </>
        )}

        {step === 'otp' && (
          <>
            <h2 style={{ marginBottom: 8, fontSize: '22px' }}>Verify your number</h2>
            <p style={{ color: 'var(--pencil)', marginBottom: 24, fontSize: 14 }}>Enter the 6-digit OTP sent to +91 {phone}</p>
            <input
              style={{ width: '100%', padding: '16px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 22, textAlign: 'center', letterSpacing: '8px', outline: 'none', marginBottom: 20, boxSizing: 'border-box' }}
              type="number"
              placeholder="------"
              value={otp}
              onChange={e => setOtp(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && verifyOtp()}
              maxLength={6}
            />
            <button className="btn primary" style={{ width: '100%', padding: '13px', fontSize: 15 }} onClick={verifyOtp} disabled={loading}>
              {loading ? 'Verifying...' : 'Verify'}
            </button>
            <button className="btn ghost" style={{ width: '100%', padding: '13px', fontSize: 14, marginTop: 8 }} onClick={() => { setStep('phone'); setError(''); }}>
              Change number
            </button>
          </>
        )}

        {step === 'name' && (
          <>
            <h2 style={{ marginBottom: 8, fontSize: '22px' }}>What's your name?</h2>
            <p style={{ color: 'var(--pencil)', marginBottom: 24, fontSize: 14 }}>This will be shown on your comments.</p>
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
