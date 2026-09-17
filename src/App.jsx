import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

// App shell
import DesktopNav from './components/app/DesktopNav';
import MobileNav from './components/app/MobileNav';
import TopBar from './components/app/TopBar';

// Auth
import Login from './components/auth/Login';

// Student
import NotesHome from './components/notes/NotesHome';
import NoteReader from './components/notes/NoteReader';
import Activity from './components/activity/Activity';
import Profile from './components/profile/Profile';

// CR
import ManageNotes from './components/admin/ManageNotes';
import CreateEditNote from './components/admin/CreateEditNote';

function getViewFromURL() {
  const params = new URLSearchParams(window.location.search);
  return {
    view: params.get('view') || 'notes',
    noteId: params.get('id') || null
  };
}

export default function App() {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null); // { ...supabase user, profile: { name, role } }
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('notes');
  const [activeNoteRef, setActiveNoteRef] = useState(null);

  // Bootstrap auth
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (s) bootstrapUser(s);
      else setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      if (s) bootstrapUser(s);
      else { setUser(null); setSession(null); setLoading(false); }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function bootstrapUser(s) {
    setSession(s);
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, name, role')
      .eq('id', s.user.id)
      .maybeSingle();

    const fullUser = { ...s.user, profile: profile || { id: s.user.id, name: '', role: 'student' } };
    setUser(fullUser);
    setLoading(false);

    // Restore deep link
    const { view: v, noteId } = getViewFromURL();
    if (v === 'reader' && noteId) {
      navigate('reader', { id: noteId });
    } else if (['notes', 'manage', 'activity', 'profile'].includes(v)) {
      setView(v);
    }
  }

  function navigate(newView, noteRef = null) {
    setView(newView);
    setActiveNoteRef(noteRef);
    const params = new URLSearchParams();
    params.set('view', newView);
    if (noteRef?.id) params.set('id', noteRef.id);
    window.history.pushState(null, '', `/?${params.toString()}`);
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg-app)' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 32, color: 'var(--red)' }}>Margin</div>
      </div>
    );
  }

  if (!user || !session) {
    return <Login onLogin={(supabaseUser) => bootstrapUser({ user: supabaseUser })} />;
  }

  // If profile has no name, first-time user stuck — Login handles this, but safety fallback:
  if (!user.profile?.name) {
    return <Login onLogin={(supabaseUser) => bootstrapUser({ user: supabaseUser })} />;
  }

  const isCR = user.profile?.role === 'cr';

  return (
    <div className="app-shell">
      <DesktopNav role={user.profile?.role} currentView={view} setView={navigate} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <TopBar userName={user.profile?.name || 'Student'} />

        <main className="app-main">
          {view === 'notes' && (
            <NotesHome
              user={user}
              openNote={(n) => navigate('reader', n)}
            />
          )}

          {view === 'reader' && (
            <NoteReader
              noteRef={activeNoteRef}
              user={user}
              onBack={() => navigate('notes')}
              onEdit={(loadedNote) => navigate('edit', loadedNote)}
            />
          )}

          {view === 'manage' && isCR && (
            <ManageNotes
              user={user}
              onEdit={(n) => navigate('edit', n)}
              onCreate={() => navigate('edit', null)}
            />
          )}

          {view === 'edit' && isCR && (
            <CreateEditNote
              note={activeNoteRef}
              user={user}
              onBack={() => navigate('manage')}
              onSaved={() => navigate('manage')}
            />
          )}

          {view === 'activity' && <Activity user={user} />}

          {view === 'profile' && (
            <Profile
              user={user}
              onLogout={() => { setUser(null); setSession(null); window.history.pushState(null, '', '/'); }}
            />
          )}

          {/* Redirect non-CR users away from manage */}
          {view === 'manage' && !isCR && <NotesHome user={user} openNote={(n) => navigate('reader', n)} />}
        </main>

        <MobileNav role={user.profile?.role} currentView={view} setView={navigate} />
      </div>
    </div>
  );
}
