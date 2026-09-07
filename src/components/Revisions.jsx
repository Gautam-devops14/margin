import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { subjectById } from '../lib/subjects';

export default function Revisions({ session, openNote, toast }) {
  const [revisions, setRevisions] = useState([]);
  const [settings, setSettings] = useState({ timezone: 'Asia/Kolkata', evening_time: '18:00:00' });
  const [loading, setLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);

  // AI Modal
  const [activeRevision, setActiveRevision] = useState(null);
  const [noteToRevise, setNoteToRevise] = useState(null);

  useEffect(() => {
    if (session) {
      loadSettings();
      loadRevisions();
    }
  }, [session]);

  async function loadSettings() {
    const { data } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', session.user.id)
      .maybeSingle();
    if (data) setSettings({ timezone: data.timezone, evening_time: data.evening_time });
  }

  async function saveSettings() {
    const { error } = await supabase
      .from('user_settings')
      .upsert({ user_id: session.user.id, timezone: settings.timezone, evening_time: settings.evening_time });
    if (error) {
      toast(error.message);
    } else {
      toast('Settings saved!');
      setShowSettings(false);
    }
  }

  async function loadRevisions() {
    setLoading(true);
    const { data, error } = await supabase
      .from('revisions')
      .select('*, note:notes(*)')
      .eq('user_id', session.user.id)
      .order('scheduled_for', { ascending: true });
    if (error) {
      toast(error.message);
    } else {
      setRevisions(data || []);
    }
    setLoading(false);
  }

  async function markComplete(revId) {
    const { error } = await supabase.rpc('mark_revision_complete', { p_revision_id: revId });
    if (error) {
      toast(error.message);
    } else {
      toast('Revision marked as complete! 🎉');
      loadRevisions();
    }
  }

  function startRevisionFlow(rev) {
    setActiveRevision(rev);
    setNoteToRevise(rev.note);
  }

  function handleOpenNote() {
    openNote(noteToRevise);
    setActiveRevision(null);
    setNoteToRevise(null);
  }

  const now = new Date();
  const dueRevisions = revisions.filter(r => !r.completed_at && new Date(r.scheduled_for) <= now);
  const upcomingRevisions = revisions.filter(r => !r.completed_at && new Date(r.scheduled_for) > now);
  const completedRevisions = revisions.filter(r => r.completed_at);

  return (
    <div className="sheetbody">
      <div className="listhead" style={{ marginBottom: '16px' }}>
        <h2>🔔 Revisions (Spaced Repetition)</h2>
        <button className="btn ghost" onClick={() => setShowSettings(!showSettings)}>⚙️ Settings</button>
      </div>

      {showSettings && (
        <div className="friends-card" style={{ marginBottom: 20 }}>
          <h3>Revision Settings</h3>
          <p style={{ fontSize: '13px', color: 'var(--pencil)', marginBottom: 10 }}>
            Timezone changes will only affect the scheduling of <strong>new</strong> notes.
          </p>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <label className="joinlabel">Timezone</label>
              <select 
                className="field" 
                value={settings.timezone}
                onChange={e => setSettings({ ...settings, timezone: e.target.value })}
              >
                <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
                <option value="America/New_York">America/New_York (EST/EDT)</option>
                <option value="Europe/London">Europe/London (GMT/BST)</option>
                <option value="UTC">UTC</option>
              </select>
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <label className="joinlabel">Evening Revision Time</label>
              <input 
                type="time"
                className="field" 
                value={settings.evening_time}
                onChange={e => setSettings({ ...settings, evening_time: e.target.value })}
              />
            </div>
            <button className="btn primary" onClick={saveSettings}>Save</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="empty">Loading schedules...</div>
      ) : (
        <>
          <h3 style={{ borderBottom: '2px solid var(--margin)', display: 'inline-block', marginBottom: 12 }}>
            Due Now ({dueRevisions.length})
          </h3>
          <div className="notelist" style={{ marginBottom: 32 }}>
            {dueRevisions.length === 0 && <div className="empty" style={{ margin: 0 }}>You're all caught up!</div>}
            {dueRevisions.map(rev => (
              <div key={rev.id} className="notecard-v2" style={{ borderLeft: '4px solid #d6455c' }}>
                <div style={{ flex: 1 }}>
                  <div className="notecard-tags">
                    <span className="subject-pill-tag">{subjectById(rev.note?.subject_id)?.code}</span>
                    <span className="stencil-tag" style={{ color: '#d6455c' }}>{rev.schedule_type.toUpperCase()}</span>
                  </div>
                  <h3 className="notecard-title">{rev.note?.topic || rev.note?.title || 'Untitled'}</h3>
                  <div className="notecard-meta-line">Scheduled for: {new Date(rev.scheduled_for).toLocaleString()}</div>
                </div>
                <div className="notecard-right" style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
                  <button className="btn primary" onClick={() => startRevisionFlow(rev)}>Start Revision</button>
                  <button className="btn ghost" style={{ fontSize: '11px', padding: '4px 8px' }} onClick={() => markComplete(rev.id)}>Mark Complete ✓</button>
                </div>
              </div>
            ))}
          </div>

          <h3 style={{ borderBottom: '2px solid var(--paper-line)', display: 'inline-block', marginBottom: 12 }}>
            Upcoming ({upcomingRevisions.length})
          </h3>
          <div className="notelist" style={{ marginBottom: 32 }}>
            {upcomingRevisions.length === 0 && <div className="empty" style={{ margin: 0 }}>No upcoming revisions scheduled.</div>}
            {upcomingRevisions.map(rev => (
              <div key={rev.id} className="notecard-v2" style={{ opacity: 0.8 }}>
                <div style={{ flex: 1 }}>
                  <div className="notecard-tags">
                    <span className="subject-pill-tag">{subjectById(rev.note?.subject_id)?.code}</span>
                    <span className="stencil-tag private">{rev.schedule_type.toUpperCase()}</span>
                  </div>
                  <h3 className="notecard-title">{rev.note?.topic || rev.note?.title || 'Untitled'}</h3>
                  <div className="notecard-meta-line">Scheduled for: {new Date(rev.scheduled_for).toLocaleString()}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {activeRevision && noteToRevise && (
        <div className="modal-backdrop" onClick={() => setActiveRevision(null)}>
          <div className="sheet modal" style={{ maxWidth: 500 }} onClick={e => e.stopPropagation()}>
            <div className="modalhead">
              <h3>Revision: {noteToRevise.topic || noteToRevise.title}</h3>
            </div>
            <div className="sheetbody">
              {noteToRevise.questions && Array.isArray(noteToRevise.questions) && noteToRevise.questions.length > 0 ? (
                <>
                  <p style={{ color: 'var(--pencil)', fontSize: '13px', marginBottom: 16 }}>
                    Before opening your notes, see if you can answer these conceptual questions:
                  </p>
                  <ul style={{ marginBottom: 24, paddingLeft: 20 }}>
                    {noteToRevise.questions.slice(0, 3).map((q, i) => (
                      <li key={i} style={{ marginBottom: 12 }}><strong>Q:</strong> {q.question || q}</li>
                    ))}
                  </ul>
                </>
              ) : (
                <p style={{ color: 'var(--pencil)', fontSize: '14px', marginBottom: 24 }}>
                  Ready to review your notes? (No cached AI questions available for this note).
                </p>
              )}
              
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                <button className="btn ghost" onClick={() => setActiveRevision(null)}>Cancel</button>
                <button className="btn primary" onClick={handleOpenNote}>Open Note</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
