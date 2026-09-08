export default function DesktopNav({ role, currentView, setView }) {
  const isCR = role === 'admin';
  return (
    <nav className="desktop-nav">
      <div className="brand">Margin<span style={{color: 'var(--ink)'}}>*</span></div>
      
      <button className={`nav-item ${currentView === 'notes' ? 'active' : ''}`} onClick={() => setView('notes')}>
        <span className="nav-icon">📚</span> Notes
      </button>
      
      {isCR && (
        <button className={`nav-item ${currentView === 'manage' ? 'active' : ''}`} onClick={() => setView('manage')}>
          <span className="nav-icon">✏️</span> Manage Notes
        </button>
      )}
      
      <button className={`nav-item ${currentView === 'activity' ? 'active' : ''}`} onClick={() => setView('activity')}>
        <span className="nav-icon">💬</span> Activity
      </button>
      
      <button className={`nav-item ${currentView === 'profile' ? 'active' : ''}`} onClick={() => setView('profile')}>
        <span className="nav-icon">👤</span> Profile
      </button>
    </nav>
  );
}
