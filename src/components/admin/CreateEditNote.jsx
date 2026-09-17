import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../supabaseClient';
import { SUBJECTS } from '../../lib/subjects';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';

export default function CreateEditNote({ note, user, onBack, onSaved }) {
  const isEditing = !!note;
  const [subjectId, setSubjectId] = useState(note?.subject_id || SUBJECTS[0].id);
  const [chapter, setChapter] = useState(note?.chapter || '');
  
  // State for Quill
  const [content, setContent] = useState('');
  
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [publishModal, setPublishModal] = useState(false);
  
  const quillRef = useRef(null);

  useEffect(() => {
    if (note?.id) {
      // Fetch full content because list views might not include it
      supabase.from('notes').select('content').eq('id', note.id).single().then(({ data }) => {
        if (data) {
          try {
            const parsed = JSON.parse(data.content || '{}');
            if (parsed.ops) {
              setContent(parsed); // It's a Delta
            } else {
              setContent(data.content || '');
            }
          } catch {
            setContent(data.content || ''); // Plain HTML or text
          }
        }
      });
    }
  }, [note?.id]);

  // Handle saving
  async function saveNote(publish = false) {
    if (!chapter.trim()) { setError('Please enter a chapter title.'); return; }
    setError('');
    setSaving(true);

    // Get the editor's contents
    let finalContent = content;
    if (quillRef.current) {
      // Save as Delta JSON for the richest format
      finalContent = JSON.stringify(quillRef.current.getEditor().getContents());
    } else if (typeof content !== 'string') {
      finalContent = JSON.stringify(content);
    }

    if (isEditing) {
      const { error: err } = await supabase
        .from('notes')
        .update({ subject_id: subjectId, chapter: chapter.trim(), content: finalContent, published: publish ? true : note.published, updated_at: new Date().toISOString() })
        .eq('id', note.id);
      if (err) { setError(err.message); setSaving(false); return; }
      if (publish) {
        await supabase.rpc('publish_note', { p_note_id: note.id, p_publish: true });
      }
    } else {
      const { data, error: err } = await supabase
        .from('notes')
        .insert({ user_id: user.id, subject_id: subjectId, chapter: chapter.trim(), topic: chapter.trim(), content: finalContent, published: publish })
        .select('id')
        .single();
      if (err) { setError(err.message); setSaving(false); return; }
    }

    setSaving(false);
    setPublishModal(false);
    onSaved?.();
    onBack();
  }

  const modules = {
    toolbar: [
      [{ 'header': [1, 2, 3, false] }],
      ['bold', 'italic', 'underline'],
      [{ 'list': 'ordered'}, { 'list': 'bullet' }],
      ['link'],
      ['clean']
    ]
  };

  return (
    <div>
      <div className="flex-between" style={{ marginBottom: 32 }}>
        <button className="btn ghost" style={{ padding: '8px 0', color: 'var(--pencil)' }} onClick={onBack}>← Back</button>
        {isEditing && (
          <span className={`badge ${note.published ? 'published' : 'draft'}`}>
            {note.published ? '● Published' : '○ Draft'}
          </span>
        )}
      </div>

      <div className="page-header">
        <h1 className="page-title">{isEditing ? 'Edit Note' : 'Create Note'}</h1>
      </div>

      {error && <div style={{ background: '#fee2e2', color: '#dc2626', padding: '12px 16px', borderRadius: 8, marginBottom: 20, fontSize: 14 }}>{error}</div>}

      <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <div style={{ flex: '0 0 200px' }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--pencil)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Subject</label>
          <select
            style={{ width: '100%', padding: '12px 16px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 15, outline: 'none', background: 'white' }}
            value={subjectId}
            onChange={e => setSubjectId(e.target.value)}
          >
            {SUBJECTS.map(s => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
          </select>
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--pencil)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Chapter / Title</label>
          <input
            style={{ width: '100%', padding: '12px 16px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 15, outline: 'none', boxSizing: 'border-box' }}
            placeholder="e.g. Number Systems"
            value={chapter}
            onChange={e => setChapter(e.target.value)}
          />
        </div>
      </div>

      <div className="notebook-container" style={{ minHeight: 480, margin: '0 0 32px' }}>
        <div className="notebook-binding" />
        <div style={{ padding: 0 }}>
          <ReactQuill
            ref={quillRef}
            theme="snow"
            value={content}
            onChange={setContent}
            modules={modules}
            placeholder="Start writing your note here..."
          />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
        <button className="btn ghost" onClick={() => saveNote(false)} disabled={saving}>
          {saving ? 'Saving...' : 'Save Draft'}
        </button>
        <button className="btn primary" onClick={() => setPublishModal(true)} disabled={saving}>
          Publish to Class
        </button>
      </div>

      {publishModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 24 }}>
          <div style={{ background: 'white', borderRadius: 12, padding: 32, maxWidth: 400, width: '100%' }}>
            <h3 style={{ marginBottom: 8 }}>Publish to your class?</h3>
            <p style={{ color: 'var(--pencil)', marginBottom: 8 }}>"{chapter}"</p>
            <p style={{ color: 'var(--pencil)', fontSize: 14, marginBottom: 24 }}>Once published, all students in your class will be able to read this note.</p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button className="btn ghost" onClick={() => setPublishModal(false)}>Cancel</button>
              <button className="btn primary" onClick={() => saveNote(true)} disabled={saving}>
                {saving ? '...' : 'Publish'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
