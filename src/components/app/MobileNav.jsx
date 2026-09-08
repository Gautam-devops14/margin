export default function MobileNav({ role, currentView, setView }) {
  const isCR = role === 'admin';
  return (
    <nav className="mobile-bottom-nav">
      <button className={`mobile-nav-item ${currentView === 'notes' ? 'active' : ''}`} onClick={() => setView('notes')}>
        <span style={{ fontSize: '20px' }}>📚</span> Notes
      </button>
      
      {isCR && (
        <button className={`mobile-nav-item ${currentView === 'manage' ? 'active' : ''}`} onClick={() => setView('manage')}>
          <span style={{ fontSize: '20px' }}>✏️</span> Manage
        </button>
      )}
      
      <button className={`mobile-nav-item ${currentView === 'activity' ? 'active' : ''}`} onClick={() => setView('activity')}>
        <span style={{ fontSize: '20px' }}>💬</span> Activity
      </button>
      
      <button className={`mobile-nav-item ${currentView === 'profile' ? 'active' : ''}`} onClick={() => setView('profile')}>
        <span style={{ fontSize: '20px' }}>👤</span> Profile
      </button>
    </nav>
  );
}
