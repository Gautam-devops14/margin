import { supabase } from '../../supabaseClient';

export default function Profile({ user, onLogout }) {
  const profile = user.profile || {};

  async function handleSignOut() {
    await supabase.auth.signOut();
    onLogout();
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Profile</h1>
      </div>

      <div style={{ background: 'white', padding: 32, borderRadius: 12, border: '1px solid var(--border)', maxWidth: 480, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'var(--red-light)', color: 'var(--red)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, fontWeight: 700 }}>
          {(profile.name || 'S').charAt(0).toUpperCase()}
        </div>
        <div style={{ textAlign: 'center' }}>
          <h2 style={{ fontSize: 24, marginBottom: 4 }}>{profile.name || 'Student'}</h2>
          <p style={{ color: 'var(--pencil)', fontSize: 15 }}>
            {profile.role === 'cr' ? 'Class Representative (CR)' : 'Student'}
          </p>
        </div>

        <div style={{ width: '100%', borderTop: '1px solid var(--border)', marginTop: 8 }} />

        <div style={{ width: '100%', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
            <span style={{ color: 'var(--pencil)' }}>Phone</span>
            <span style={{ fontWeight: 500 }}>{user.phone || '—'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0' }}>
            <span style={{ color: 'var(--pencil)' }}>Account Type</span>
            <span style={{ fontWeight: 500 }}>{profile.role === 'cr' ? 'CR / Admin' : 'Student'}</span>
          </div>
        </div>

        <div style={{ width: '100%', borderTop: '1px solid var(--border)', marginTop: 8 }} />

        {['Notifications', 'Appearance', 'Help & Support'].map(label => (
          <button key={label} className="btn ghost" style={{ width: '100%', justifyContent: 'flex-start', padding: 16, border: '1px solid var(--border)', fontSize: 15 }}>
            {label}
          </button>
        ))}

        <button className="btn ghost" style={{ width: '100%', justifyContent: 'center', marginTop: 16, color: 'var(--red)', fontSize: 15, padding: 16 }} onClick={handleSignOut}>
          Sign Out
        </button>
      </div>
    </div>
  );
}
