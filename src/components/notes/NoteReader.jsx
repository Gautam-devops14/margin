import { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { SUBJECTS } from '../../lib/subjects';
import CommentSection from '../comments/CommentSection';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css'; // Or bubble

export default function NoteReader({ noteRef, user, onBack }) {
  const [note, setNote] = useState(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const isCR = user?.profile?.role === 'cr';

  useEffect(() => {
    if (noteRef?.id) loadNote(noteRef.id);
    else setUnavailable(true);
  }, [noteRef?.id]);

  async function loadNote(id) {
    setLoading(true);
    setUnavailable(false);
    const { data, error } = await supabase
      .from('notes')
      .select('id, subject_id, chapter, topic, content, published, updated_at')
      .eq('id', id)
      .maybeSingle();

    if (error || !data || (!data.published && !isCR)) {
      setUnavailable(true);
    } else {
      setNote(data);
      supabase.rpc('record_note_view', { p_note: id }).catch(() => {});
    }
    setLoading(false);
  }

  if (loading) {
    return (
      <div>
        <button className="btn ghost" style={{ padding: '8px 0', color: 'var(--pencil)', marginBottom: 32 }} onClick={onBack}>← Back to Notes</button>
        <div className="notebook-container" style={{ minHeight: 400 }}>
          <div className="notebook-binding" />
          <div className="notebook-content">
            <div style={{ background: '#e5e7eb', borderRadius: 4, height: 14, width: '30%', marginBottom: 32 }} />
            <div style={{ background: '#e5e7eb', borderRadius: 4, height: 28, width: '60%', marginBottom: 48 }} />
            {[1,2,3,4,5].map(i => (
              <div key={i} style={{ background: '#e5e7eb', borderRadius: 4, height: 12, width: i % 2 === 0 ? '90%' : '70%', marginBottom: 28 }} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (unavailable) {
    return (
      <div style={{ textAlign: 'center', padding: 80 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>📄</div>
        <h2 style={{ marginBottom: 8 }}>Note unavailable.</h2>
        <p style={{ color: 'var(--pencil)', marginBottom: 32 }}>This note may have been unpublished or removed.</p>
        <button className="btn primary" onClick={onBack}>← Back to Notes</button>
      </div>
    );
  }

  const subj = SUBJECTS.find(s => s.id === note.subject_id);

  // Parse content — support plain text, Quill Delta JSON, or HTML
  let parsedContent = note.content || '';
  try {
    const parsed = JSON.parse(note.content || '{}');
    if (parsed.ops) {
      parsedContent = parsed;
    }
  } catch {
    // If JSON parse fails, it's plain text or HTML, which ReactQuill handles safely
  }

  return (
    <div>
      <button className="btn ghost" style={{ padding: '8px 0', color: 'var(--pencil)', marginBottom: 32 }} onClick={onBack}>← Back to Notes</button>

      {isCR && !note.published && (
        <div style={{ background: '#fef08a', border: '1px solid #ca8a04', color: '#92400e', padding: '10px 16px', borderRadius: 8, marginBottom: 24, fontSize: 14 }}>
          ⚠️ Draft preview — students cannot see this note yet.
        </div>
      )}

      <div className="notebook-container">
        <div className="notebook-binding" />
        <div className="notebook-content" style={{ padding: 0 }}>
          <div style={{ padding: '32px 48px 0 64px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--pencil)', textTransform: 'uppercase', letterSpacing: 1 }}>
                {subj?.name || note.subject_id}
              </span>
              <span className="badge draft">🔒 Read Only</span>
            </div>

            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, marginBottom: 4, borderBottom: '2px solid var(--ink)', display: 'inline-block', paddingBottom: 4 }}>
              {note.chapter || note.topic || 'Note'}
            </h1>
            <div style={{ fontSize: 13, color: 'var(--pencil)', marginBottom: 24 }}>
              Posted {new Date(note.updated_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
            </div>
          </div>
          
          <ReactQuill 
            value={parsedContent}
            readOnly={true}
            theme="bubble"
            className="reader-quill"
          />
        </div>
      </div>

      <CommentSection noteId={note.id} user={user} notePublished={note.published} />
    </div>
  );
}
