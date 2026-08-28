import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import { SUBJECTS, subjectById } from './lib/subjects';
import Auth from './components/Auth';
import Editor from './components/Editor';

function fmtDate(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export default function App() {
  const [session, setSession] = useState(null);
  const [ready, setReady] = useState(false);
  const [view, setView] = useState('home');
  const [subject, setSubject] = useState(SUBJECTS[0].id);
  const [notes, setNotes] = useState([]);
  const [shared, setShared] = useState([]);
  const [friends, setFriends] = useState([]);
  const [friendEmail, setFriendEmail] = useState('');
  const [current, setCurrent] = useState(null);
  const [joinCode, setJoinCode] = useState('');
  const [msg, setMsg] = useState('');

  // Admin states
  const [adminMode, setAdminMode] = useState('notebook'); // 'notebook' | 'console'
  const [adminSearch, setAdminSearch] = useState('');
  const [adminSubject, setAdminSubject] = useState('all');

  const [showNew, setShowNew] = useState(false);
  const [newChapter, setNewChapter] = useState('');
  const [newTopic, setNewTopic] = useState('');

  // Persistent Auth Session setup
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const userEmail = (session?.user?.email || '').toLowerCase();
  const isAdmin = userEmail === 'gmkicoding159@gmail.com' ||
                  userEmail.includes('gmkicoding') ||
                  userEmail.includes('phone_9999999999') ||
                  userEmail.includes('phone_1234567890');

  const loadNotes = useCallback(async () => {
    if (!session) return;
    if (isAdmin) {
      // Admin reads all notes in system with full access
      const { data, error } = await supabase
        .from('notes')
        .select('*')
        .order('updated_at', { ascending: false });
      if (error) {
        const { data: ownData } = await supabase.from('notes').select('*').eq('user_id', session.user.id).order('updated_at', { ascending: false });
        setNotes(ownData || []);
      } else {
        setNotes(data || []);
      }
    } else {
      // Student reads their own notes
      const { data, error } = await supabase
        .from('notes')
        .select('*')
        .eq('user_id', session.user.id)
        .order('updated_at', { ascending: false });
      if (error) toast(error.message);
      setNotes(data || []);
    }
  }, [session, isAdmin]);

  const loadFriends = useCallback(async () => {
    if (!session) return;
    const { data } = await supabase
      .from('friends')
      .select('*')
      .eq('user_id', session.user.id);
    setFriends(data || []);
  }, [session]);

  const loadShared = useCallback(async () => {
    if (!session) return;

    // 1. Direct shared access via share code
    const { data: codeData } = await supabase
      .from('shared_access').select('permission, note:notes(*)')
      .eq('user_id', session.user.id);

    // 2. Notes shared by friends (where share_with_friends is true)
    const { data: friendData } = await supabase
      .from('notes').select('*')
      .eq('share_with_friends', true)
      .neq('user_id', session.user.id);

    const fromCode = (codeData || []).map((r) => ({ ...r.note, _perm: r.permission })).filter((n) => n && n.id);
    const fromFriends = (friendData || []).map((n) => ({ ...n, _perm: 'view' })).filter((n) => n && n.id);

    // Merge shared notes without duplicate IDs
    const map = new Map();
    [...fromCode, ...fromFriends].forEach((n) => map.set(n.id, n));
    setShared(Array.from(map.values()));
  }, [session]);

  // Restore subject & note from URL query or localStorage on mount/session
  useEffect(() => {
    if (session) {
      loadNotes();
      loadShared();
      loadFriends();

      const params = new URLSearchParams(window.location.search);
      let noteId = params.get('note');
      let subjId = params.get('subject');

      if (!subjId) {
        subjId = localStorage.getItem('margin_last_subject') || SUBJECTS[0].id;
      }
      if (!noteId) {
        noteId = localStorage.getItem('margin_last_note');
      }

      if (subjId && SUBJECTS.some((s) => s.id === subjId)) {
        setSubject(subjId);
      }

      if (noteId) {
        supabase.from('notes').select('*').eq('id', noteId).maybeSingle().then(({ data }) => {
          if (data) {
            setSubject(data.subject_id);
            setCurrent({ ...data, _perm: data.user_id === session.user.id || isAdmin ? 'edit' : 'view' });
            setView('editor');
            window.history.replaceState(null, '', `/?subject=${data.subject_id}&note=${data.id}`);
          } else {
            localStorage.removeItem('margin_last_note');
            window.history.replaceState(null, '', `/?subject=${subjId}`);
          }
        });
      } else if (subjId) {
        window.history.replaceState(null, '', `/?subject=${subjId}`);
      }
    }
  }, [session, loadNotes, loadShared, loadFriends, isAdmin]);

  function selectSubject(subjId) {
    setSubject(subjId);
    localStorage.setItem('margin_last_subject', subjId);
    window.history.replaceState(null, '', `/?subject=${subjId}`);
  }

  function toast(m) { setMsg(m); setTimeout(() => setMsg(''), 3200); }

  function openNewModal() { setNewChapter(''); setNewTopic(''); setShowNew(true); }

  async function createNote() {
    const ch = newChapter.trim() || 'General Notes';
    const tp = newTopic.trim();
    const noteTitle = tp || ch;

    const { data, error } = await supabase
      .from('notes')
      .insert({
        user_id: session.user.id,
        subject_id: subject,
        chapter: ch,
        topic: tp,
        title: noteTitle,
        content: '',
        share_with_friends: false
      })
      .select().single();
    if (error) { toast(error.message || 'Could not create note'); return; }
    setShowNew(false);
    localStorage.setItem('margin_last_subject', subject);
    localStorage.setItem('margin_last_note', data.id);
    window.history.replaceState(null, '', `/?subject=${subject}&note=${data.id}`);
    setCurrent({ ...data, _perm: 'edit' }); setView('editor');
  }

  function openNote(n) {
    setSubject(n.subject_id);
    localStorage.setItem('margin_last_subject', n.subject_id);
    localStorage.setItem('margin_last_note', n.id);
    window.history.replaceState(null, '', `/?subject=${n.subject_id}&note=${n.id}`);
    setCurrent({ ...n, _perm: n.user_id === session.user.id || isAdmin ? 'edit' : (n._perm || 'view') });
    setView('editor');
  }

  function copyDirectNoteLink(n, e) {
    if (e) e.stopPropagation();
    const link = `${window.location.origin}/?subject=${n.subject_id}&note=${n.id}`;
    navigator.clipboard.writeText(link).then(() => {
      toast('Copied direct note permalink to clipboard!');
    }).catch(() => {
      toast('Could not copy link');
    });
  }

  async function backFromEditor() {
    setView('home'); setCurrent(null);
    localStorage.removeItem('margin_last_note');
    window.history.replaceState(null, '', `/?subject=${subject}`);
    await loadNotes(); await loadShared(); await loadFriends();
  }

  async function toggleNoteShare(n, e) {
    if (e) e.stopPropagation();
    const nextVal = !n.share_with_friends;

    // Optimistic UI update in notes state
    setNotes((prev) =>
      prev.map((item) => (item.id === n.id ? { ...item, share_with_friends: nextVal } : item))
    );

    const { error } = await supabase
      .from('notes')
      .update({ share_with_friends: nextVal, updated_at: new Date().toISOString() })
      .eq('id', n.id);

    if (error) {
      toast(error.message || 'Could not update share setting');
      loadNotes();
    } else {
      toast(nextVal ? '🤝 Note is now shared with friends!' : '🔒 Note is now private');
    }
  }

  async function deleteNote(n, e) {
    e.stopPropagation();
    if (!confirm('Delete this note?')) return;
    await supabase.from('notes').delete().eq('id', n.id);
    loadNotes();
  }

  async function addFriend() {
    const raw = friendEmail.trim();
    if (!raw) { toast('Enter classmate phone number'); return; }
    
    let target = raw.toLowerCase();
    if (!target.includes('@')) {
      const digits = target.replace(/\D/g, '');
      if (digits.length < 5) { toast('Enter a valid phone number'); return; }
      target = `phone_${digits}@margin.app`;
    }

    if (target === session?.user?.email?.toLowerCase()) { toast('You cannot add yourself'); return; }

    const { error } = await supabase
      .from('friends')
      .upsert({ user_id: session.user.id, friend_email: target, status: 'accepted' });

    if (error) { toast(error.message || 'Could not add friend'); return; }
    setFriendEmail('');
    toast(`Added ${raw} to your friends!`);
    loadFriends();
  }

  function formatFriendDisplay(emailStr) {
    if (!emailStr) return '';
    if (emailStr.startsWith('phone_') && emailStr.endsWith('@margin.app')) {
      return emailStr.replace('phone_', '').replace('@margin.app', '');
    }
    return emailStr;
  }

  async function removeFriend(fId) {
    await supabase.from('friends').delete().eq('id', fId);
    loadFriends();
  }

  async function joinByCode() {
    const code = joinCode.trim().toUpperCase();
    if (!code) { toast('Enter a share code'); return; }
    
    try {
      const { data, error } = await supabase.rpc('join_note_by_code', { p_code: code });
      if (!error && data) {
        setJoinCode('');
        toast('Note added to Shared with me!');
        loadShared();
        return;
      }
      
      const { data: share, error: shareErr } = await supabase
        .from('note_shares').select('note_id, permission')
        .eq('code', code).maybeSingle();
      if (shareErr || !share) throw new Error(shareErr?.message || 'No note found for that code');
      
      const { error: accessErr } = await supabase
        .from('shared_access')
        .upsert({ note_id: share.note_id, user_id: session.user.id, permission: share.permission });
      if (accessErr) throw accessErr;
      
      setJoinCode('');
      toast('Note added to Shared with me!');
      loadShared();
    } catch (err) {
      toast(err.message || 'Could not join note');
    }
  }

  if (!ready) return null;
  if (!session) return <Auth />;

  if (view === 'editor' && current) {
    return (
      <Editor
        note={current}
        subject={subjectById(current.subject_id)}
        me={session.user.id}
        onBack={backFromEditor}
      />
    );
  }

  // Filtered notes for Admin System Console
  const filteredAdminNotes = notes.filter((n) => {
    const matchesSub = adminSubject === 'all' || n.subject_id === adminSubject;
    const q = adminSearch.trim().toLowerCase();
    const matchesQuery = !q ||
      (n.chapter || '').toLowerCase().includes(q) ||
      (n.topic || '').toLowerCase().includes(q) ||
      (n.title || '').toLowerCase().includes(q) ||
      (n.content || '').toLowerCase().includes(q);
    return matchesSub && matchesQuery;
  });

  const mine = notes.filter((n) => n.subject_id === subject);
  const subj = subjectById(subject) || SUBJECTS[0];

  return (
    <div className="desk">
      <div className="sheet">
        <header className="masthead">
          <div className="brand">
            <div>
              <div className="brandname">
                Margin<mark>*</mark>
                {isAdmin && <span className="tag perm-edit" style={{ marginLeft: 10, fontSize: '11px' }}>👑 Admin Active</span>}
              </div>
              <div className="brandsub">
                {isAdmin ? `system admin — ${userEmail}` : 'your college notes, shared'}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {isAdmin && (
              <button
                className="btn ghost"
                style={{ background: adminMode === 'console' ? 'var(--highlighter)' : 'var(--paper)', color: 'var(--ink)' }}
                onClick={() => setAdminMode(adminMode === 'notebook' ? 'console' : 'notebook')}
              >
                {adminMode === 'notebook' ? '👑 System Console' : '📚 Notebook Mode'}
              </button>
            )}
            <button className="btn ghost" onClick={() => supabase.auth.signOut()}>Sign out</button>
          </div>
        </header>

        {isAdmin && adminMode === 'console' ? (
          /* ================================================= ADMIN SYSTEM CONSOLE ================================================= */
          <div className="sheetbody">
            <div className="friends-card" style={{ marginTop: 18, background: '#fcfbf7' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <h3 style={{ margin: 0 }}>👑 All Student Notes Console</h3>
                  <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--pencil)' }}>
                    Admin Full Access: Inspect, edit, copy text, or manage all student notes in the database.
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn primary" onClick={() => setAdminMode('notebook')}>📚 Go to Notebook Mode</button>
                  <div className="tag perm-edit" style={{ fontSize: '12px', padding: '6px 10px' }}>
                    {notes.length} Total Notes
                  </div>
                </div>
              </div>
            </div>

            {/* Admin Subject Filters */}
            <div style={{ marginTop: 20 }}>
              <span className="joinlabel">Filter by Subject</span>
              <nav className="tabs" style={{ padding: '6px 0 0', borderBottom: 'none' }}>
                <button
                  className="tab"
                  aria-selected={adminSubject === 'all'}
                  onClick={() => setAdminSubject('all')}
                  style={{ minWidth: 80 }}
                >
                  <span className="code">ALL</span>
                  <span className="name">All Subjects</span>
                </button>
                {SUBJECTS.map((s) => (
                  <button
                    key={s.id}
                    className="tab"
                    aria-selected={adminSubject === s.id}
                    onClick={() => setAdminSubject(s.id)}
                    style={{ minWidth: 90 }}
                  >
                    <span className="code">{s.code}</span>
                    <span className="name">{s.name}</span>
                  </button>
                ))}
              </nav>
            </div>

            {/* Admin Search Bar */}
            <div className="joinrow" style={{ marginTop: 14 }}>
              <div style={{ flex: 1 }}>
                <label htmlFor="admin-search-input" className="joinlabel">Search Notes Content / Chapter / Topic</label>
                <input
                  id="admin-search-input"
                  name="adminSearch"
                  className="field"
                  placeholder="Type to search all student notes…"
                  value={adminSearch}
                  onChange={(e) => setAdminSearch(e.target.value)}
                />
              </div>
            </div>

            <div className="listhead" style={{ marginTop: 22 }}>
              <h2>All Notes ({filteredAdminNotes.length})</h2>
              <span className="count">Full Admin Access</span>
            </div>

            <div className="notelist">
              {filteredAdminNotes.length === 0 && (
                <div className="empty">No notes match your search/filter criteria.</div>
              )}
              {filteredAdminNotes.map((n) => (
                <div key={n.id} className="notecard">
                  <div style={{ flex: 1 }} onClick={() => openNote(n)}>
                    <div className="chaptertag">
                      {n.chapter || 'Chapter'}
                      <span className="tag">{subjectById(n.subject_id)?.code || 'NOTE'}</span>
                      {n.share_with_friends && <span className="tag perm-edit">Shared with Friends</span>}
                    </div>
                    <h3>{n.topic || n.title || 'Untitled topic'}</h3>
                  </div>

                  <div className="cardright" style={{ gap: 8, alignItems: 'center' }}>
                    <label className="toggle-wrap" style={{ margin: 0, cursor: 'pointer' }} onClick={(e) => toggleNoteShare(n, e)} title="Toggle Share with Friends">
                      <div className={`toggle-switch ${n.share_with_friends ? 'on' : ''}`}>
                        <div className="toggle-slider" />
                      </div>
                      <span style={{ fontSize: '11px', fontWeight: 600 }}>{n.share_with_friends ? 'Shared' : 'Private'}</span>
                    </label>
                    <span className="meta">{fmtDate(n.updated_at)}</span>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn ghost" style={{ padding: '4px 8px', fontSize: '11px' }} onClick={(e) => copyNoteText(n, e)} title="Copy note text to clipboard">
                        📋 Copy Text
                      </button>
                      <button className="btn primary" style={{ padding: '4px 8px', fontSize: '11px' }} onClick={() => openNote(n)} title="Open and Edit Note">
                        ✏️ Edit Note
                      </button>
                      <button className="del" title="Delete note" onClick={(e) => deleteNote(n, e)}>✕</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* ================================================= NOTEBOOK VIEW (STUDENT & ADMIN CREATOR) ================================================= */
          <>
            <nav className="tabs" role="tablist">
              {SUBJECTS.map((s) => (
                <button
                  key={s.id}
                  role="tab"
                  aria-selected={s.id === subject}
                  className="tab"
                  onClick={() => selectSubject(s.id)}
                >
                  <span className="code">{s.code}</span>
                  <span className="name">{s.name}</span>
                </button>
              ))}
            </nav>

            <div className="sheetbody">
              <div className="joinrow">
                <div style={{ flex: 1 }}>
                  <label htmlFor="join-code-input" className="joinlabel">Enter friend's share code</label>
                  <input
                    id="join-code-input"
                    name="joinCode"
                    className="field code-input"
                    placeholder="e.g. X7K9P2"
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && joinByCode()}
                  />
                </div>
                <button className="btn ghost" onClick={joinByCode}>Join note</button>
              </div>

              <div className="listhead">
                <h2>{subj.name}</h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span className="count">{mine.length} {mine.length === 1 ? 'note' : 'notes'}</span>
                  <button className="btn primary" onClick={openNewModal}>+ New note</button>
                </div>
              </div>

              <div className="notelist">
                {mine.length === 0 && (
                  <div className="empty">No notes in {subj.name} yet. Click <b>+ New note</b> to begin a chapter.</div>
                )}
                {mine.map((n) => (
                  <div key={n.id} className="notecard" onClick={() => openNote(n)}>
                    <div style={{ flex: 1 }}>
                      <div className="chaptertag">
                        {n.chapter || 'Chapter'}
                        {n.share_with_friends && <span className="tag perm-edit">Shared with Friends</span>}
                      </div>
                      <h3>{n.topic || n.title || 'Untitled topic'}</h3>
                    </div>
                    <div className="cardright" style={{ gap: 8, alignItems: 'center' }}>
                      <label className="toggle-wrap" style={{ margin: 0, cursor: 'pointer' }} onClick={(e) => toggleNoteShare(n, e)} title="Toggle Share with Friends">
                        <div className={`toggle-switch ${n.share_with_friends ? 'on' : ''}`}>
                          <div className="toggle-slider" />
                        </div>
                        <span style={{ fontSize: '11px', fontWeight: 600 }}>{n.share_with_friends ? 'Shared' : 'Private'}</span>
                      </label>
                      <span className="meta">{fmtDate(n.updated_at)}</span>
                      <button className="btn ghost" style={{ padding: '3px 8px', fontSize: '11px' }} onClick={(e) => copyDirectNoteLink(n, e)} title="Copy direct ID permalink for this note">
                        🔗 Link
                      </button>
                      <button className="del" title="Delete note" onClick={(e) => deleteNote(n, e)}>✕</button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Friends Section */}
              <div className="friends-card">
                <h3>👥 Your Friends List</h3>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                  <div style={{ flex: 1 }}>
                    <label htmlFor="friend-phone-input" className="joinlabel">Add friend by Phone Number</label>
                    <input
                      id="friend-phone-input"
                      name="friendPhone"
                      className="field"
                      placeholder="e.g. 9876543210"
                      value={friendEmail}
                      onChange={(e) => setFriendEmail(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && addFriend()}
                    />
                  </div>
                  <button className="btn ghost" onClick={addFriend}>Add Friend</button>
                </div>

                <div className="friend-list">
                  {friends.length === 0 ? (
                    <div style={{ fontSize: '13px', color: 'var(--pencil)', marginTop: 8 }}>No friends added yet. Add friends by phone number to share notes automatically with one toggle!</div>
                  ) : (
                    friends.map((f) => (
                      <span key={f.id} className="friend-chip">
                        <span>{formatFriendDisplay(f.friend_email)}</span>
                        <button className="del" style={{ padding: 0 }} onClick={() => removeFriend(f.id)}>✕</button>
                      </span>
                    ))
                  )}
                </div>
              </div>

              {shared.length > 0 && (
                <>
                  <div className="listhead" style={{ marginTop: 36 }}>
                    <h2>Shared with me</h2>
                    <span className="count">{shared.length} {shared.length === 1 ? 'note' : 'notes'}</span>
                  </div>
                  <div className="notelist">
                    {shared.map((n) => (
                      <div key={n.id} className="notecard" onClick={() => openNote(n)}>
                        <div style={{ flex: 1 }}>
                          <div className="chaptertag">
                            {n.chapter || 'Chapter'}
                            <span className="tag">{subjectById(n.subject_id)?.code || 'NOTE'}</span>
                            <span className={`tag perm-${n._perm}`}>{n._perm}</span>
                          </div>
                          <h3>{n.topic || n.title || 'Untitled topic'}</h3>
                        </div>
                        <div className="cardright">
                          <span className="meta">{fmtDate(n.updated_at)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>

      {showNew && (
        <div className="modal-backdrop" onClick={() => setShowNew(false)}>
          <div className="sheet modal" onClick={(e) => e.stopPropagation()}>
            <div className="modalhead">
              <h3>New Note</h3>
              <p>Create a new note page for {subj.name}. Topic name is optional.</p>
            </div>
            <div className="sheetbody">
              <div className="fieldrow">
                <label htmlFor="new-chapter-input">Chapter name</label>
                <input
                  id="new-chapter-input"
                  name="chapter"
                  className="field"
                  placeholder="e.g. Chapter 3: Combinational Circuits"
                  autoFocus
                  value={newChapter}
                  onChange={(e) => setNewChapter(e.target.value)}
                />
              </div>
              <div className="fieldrow">
                <label htmlFor="new-topic-input">Topic name (Optional)</label>
                <input
                  id="new-topic-input"
                  name="topic"
                  className="field"
                  placeholder="e.g. Multiplexers & Decoders (Optional)"
                  value={newTopic}
                  onChange={(e) => setNewTopic(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && createNote()}
                />
              </div>
              <div className="modalactions">
                <button className="btn ghost" onClick={() => setShowNew(false)}>Cancel</button>
                <button className="btn primary" onClick={createNote}>Create note</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {msg && <div className="toast">{msg}</div>}
    </div>
  );
}
