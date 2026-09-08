import { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { SUBJECTS } from '../../lib/subjects';

export default function ManageNotes({ user, onEdit, onCreate }) {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('published');
  const [confirmModal, setConfirmModal] = useState(null); // { type: 'publish'|'unpublish'|'delete', note }
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => { loadNotes(); }, []);

  async function loadNotes() {
    setLoading(true);
    const { data } = await supabase
      .from('notes')
      .select('id, subject_id, chapter, topic, published, updated_at')
      .order('updated_at', { ascending: false });
    setNotes(data || []);
    setLoading(false);
  }

  async function executeAction() {
    if (!confirmModal) return;
    setActionLoading(true);
    const { type, note } = confirmModal;

    if (type === 'delete') {
      await supabase.from('notes').delete().eq('id', note.id);
    } else {
      await supabase.rpc('publish_note', { p_note_id: note.id, p_publish: type === 'publish' });
    }

    setConfirmModal(null);
    setActionLoading(false);
    loadNotes();
  }

  const published = notes.filter(n => n.published);
  const drafts = notes.filter(n => !n.published);
  const displayNotes = tab === 'published' ? published : drafts;

  return (
    <div>
      <div className="flex-between page-header">
        <div>
          <h1 className="page-title">Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'}, {user.profile?.name}.</h1>
          <p className="page-subtitle">Manage Class Notes</p>
        </div>
        <button className="btn primary" onClick={onCreate}>+ New Note</button>
      </div>

      <div style={{ display: 'flex', gap: 24, borderBottom: '1px solid var(--border)', marginBottom: 24 }}>
        {[['published', `Published (${published.length})`], ['drafts', `Drafts (${drafts.length})`]].map(([key, label]) => (
          <button key={key}
            style={{ background: 'transparent', border: 'none', padding: '12px 0', fontSize: 15, fontWeight: 600, borderBottom: tab === key ? '2px solid var(--red)' : '2px solid transparent', color: tab === key ? 'var(--ink)' : 'var(--pencil)' }}
            onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <p style={{ color: 'var(--pencil)' }}>Loading...</p>
      ) : displayNotes.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 64, color: 'var(--pencil)' }}>
          <p style={{ fontWeight: 600 }}>{tab === 'published' ? 'No published notes.' : 'No drafts.'}</p>
          {tab === 'drafts' && <button className="btn primary" style={{ marginTop: 16 }} onClick={onCreate}>+ Create Note</button>}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {displayNotes.map(n => {
            const subj = SUBJECTS.find(s => s.id === n.subject_id);
            return (
              <div key={n.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'white', padding: 20, borderRadius: 10, border: '1px solid var(--border)', flexWrap: 'wrap', gap: 12 }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--pencil)', marginBottom: 4, textTransform: 'uppercase' }}>{subj?.name || n.subject_id}</div>
                  <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 4 }}>{n.chapter || n.topic || 'Untitled'}</div>
                  <div style={{ fontSize: 13, color: 'var(--pencil)' }}>{new Date(n.updated_at).toLocaleDateString()}</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
                  <span className={`badge ${n.published ? 'published' : 'draft'}`}>
                    {n.published ? '● Published' : '○ Draft'}
                  </span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn ghost" style={{ padding: '6px 14px' }} onClick={() => onEdit(n)}>Edit</button>
                    {n.published
                      ? <button className="btn ghost" style={{ padding: '6px 14px', color: 'var(--pencil)' }} onClick={() => setConfirmModal({ type: 'unpublish', note: n })}>Unpublish</button>
                      : <button className="btn primary" style={{ padding: '6px 14px' }} onClick={() => setConfirmModal({ type: 'publish', note: n })}>Publish</button>
                    }
                    <button className="btn ghost" style={{ padding: '6px 14px', color: 'var(--red)' }} onClick={() => setConfirmModal({ type: 'delete', note: n })}>Delete</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 24 }}>
          <div style={{ background: 'white', borderRadius: 12, padding: 32, maxWidth: 400, width: '100%' }}>
            {confirmModal.type === 'publish' && (
              <>
                <h3 style={{ marginBottom: 8 }}>Publish to your class?</h3>
                <p style={{ color: 'var(--pencil)', marginBottom: 8 }}>"{confirmModal.note.chapter}"</p>
                <p style={{ color: 'var(--pencil)', fontSize: 14, marginBottom: 24 }}>Once published, all students in your class will be able to read this note.</p>
              </>
            )}
            {confirmModal.type === 'unpublish' && (
              <>
                <h3 style={{ marginBottom: 8 }}>Unpublish this note?</h3>
                <p style={{ color: 'var(--pencil)', marginBottom: 8 }}>"{confirmModal.note.chapter}"</p>
                <p style={{ color: 'var(--pencil)', fontSize: 14, marginBottom: 24 }}>Students will no longer be able to access this note.</p>
              </>
            )}
            {confirmModal.type === 'delete' && (
              <>
                <h3 style={{ marginBottom: 8, color: 'var(--red)' }}>Delete this note?</h3>
                <p style={{ color: 'var(--pencil)', marginBottom: 8 }}>"{confirmModal.note.chapter}"</p>
                <p style={{ color: 'var(--pencil)', fontSize: 14, marginBottom: 24 }}>This note will be permanently removed. Comments will also be deleted.</p>
              </>
            )}
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button className="btn ghost" onClick={() => setConfirmModal(null)}>Cancel</button>
              <button
                className="btn primary"
                style={{ background: confirmModal.type === 'delete' ? 'var(--red)' : undefined }}
                onClick={executeAction}
                disabled={actionLoading}
              >
                {actionLoading ? '...' : confirmModal.type === 'publish' ? 'Publish' : confirmModal.type === 'unpublish' ? 'Unpublish' : 'Delete Note'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
