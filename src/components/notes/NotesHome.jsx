import { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { SUBJECTS } from '../../lib/subjects';

const ALL_SUBJECTS = [{ id: 'all', code: 'All', name: 'All Subjects' }, ...SUBJECTS];

export default function NotesHome({ user, openNote }) {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  useEffect(() => {
    loadNotes();
  }, [subjectFilter]);

  async function loadNotes() {
    setLoading(true);
    setError('');
    let query = supabase
      .from('notes')
      .select('id, subject_id, chapter, topic, updated_at')
      .eq('published', true)
      .order('updated_at', { ascending: false })
      .limit(50);

    if (subjectFilter !== 'all') {
      query = query.eq('subject_id', subjectFilter);
    }

    const { data, error: err } = await query;
    if (err) { setError('Unable to load notes. Please try again.'); }
    else { setNotes(data || []); }
    setLoading(false);
  }

  const displayNotes = searchQuery.trim()
    ? notes.filter(n =>
        (n.chapter || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (n.topic || '').toLowerCase().includes(searchQuery.toLowerCase())
      )
    : notes;

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">{greeting}, {user.profile?.name || 'Student'}.</h1>
        <p className="page-subtitle">Your class notes, all in one place.</p>
      </div>

      <input
        className="search-bar"
        placeholder="Search notes..."
        value={searchQuery}
        onChange={e => setSearchQuery(e.target.value)}
      />

      <div className="pill-row">
        {ALL_SUBJECTS.map(s => (
          <button
            key={s.id}
            className={`pill ${subjectFilter === s.id ? 'active' : ''}`}
            onClick={() => setSubjectFilter(s.id)}
          >
            {s.code}
          </button>
        ))}
      </div>

      {error && (
        <div style={{ padding: 20, background: '#fee2e2', color: '#dc2626', borderRadius: 8, marginBottom: 16 }}>
          {error} <button className="btn ghost" style={{ padding: '4px 12px', marginLeft: 12 }} onClick={loadNotes}>Try Again</button>
        </div>
      )}

      {loading ? (
        <div className="notes-grid">
          {[1,2,3,4].map(i => (
            <div key={i} style={{ background: 'white', border: '1px solid var(--border)', borderRadius: 12, padding: 20, height: 140 }}>
              <div style={{ background: '#f3f4f6', borderRadius: 4, height: 12, width: '40%', marginBottom: 12 }} />
              <div style={{ background: '#f3f4f6', borderRadius: 4, height: 18, width: '75%', marginBottom: 8 }} />
              <div style={{ background: '#f3f4f6', borderRadius: 4, height: 12, width: '55%' }} />
            </div>
          ))}
        </div>
      ) : displayNotes.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 64, color: 'var(--pencil)' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📚</div>
          {searchQuery ? (
            <>
              <p style={{ fontWeight: 600, marginBottom: 8 }}>No notes found.</p>
              <p style={{ fontSize: 14 }}>Try another search or subject filter.</p>
            </>
          ) : (
            <>
              <p style={{ fontWeight: 600, marginBottom: 8 }}>No notes yet.</p>
              <p style={{ fontSize: 14 }}>Class notes will appear here once your CR publishes them.</p>
            </>
          )}
        </div>
      ) : (
        <div className="notes-grid">
          {displayNotes.map(n => {
            const subj = SUBJECTS.find(s => s.id === n.subject_id);
            const daysAgo = Math.floor((Date.now() - new Date(n.updated_at)) / 86400000);
            const dateLabel = daysAgo === 0 ? 'Today' : daysAgo === 1 ? 'Yesterday' : `${daysAgo} days ago`;
            return (
              <div key={n.id} className="note-card" onClick={() => openNote(n)}>
                <div className="card-subject">{subj?.name || n.subject_id}</div>
                <div className="card-title">{n.chapter || n.topic || 'Untitled'}</div>
                <div className="card-meta">
                  <span>{subj?.code} · {dateLabel}</span>
                  <span style={{ color: 'var(--red)', fontWeight: 600, fontSize: 13 }}>Open →</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
