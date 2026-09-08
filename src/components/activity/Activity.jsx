import { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { SUBJECTS } from '../../lib/subjects';

export default function Activity({ user }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadActivity(); }, []);

  async function loadActivity() {
    setLoading(true);
    // Fetch recently published notes (last 10)
    const { data: recentNotes } = await supabase
      .from('notes')
      .select('id, chapter, subject_id, updated_at')
      .eq('published', true)
      .order('updated_at', { ascending: false })
      .limit(10);

    // Fetch recent comments on notes
    const { data: recentComments } = await supabase
      .from('comments')
      .select('id, content, created_at, note_id, profiles(name), notes(chapter, subject_id, published)')
      .order('created_at', { ascending: false })
      .limit(20);

    const feed = [];

    (recentNotes || []).forEach(n => {
      feed.push({ id: `note-${n.id}`, type: 'note', chapter: n.chapter, subject_id: n.subject_id, time: n.updated_at });
    });

    (recentComments || []).filter(c => c.notes?.published).forEach(c => {
      feed.push({ id: `comment-${c.id}`, type: 'comment', author: c.profiles?.name || 'Someone', chapter: c.notes?.chapter, subject_id: c.notes?.subject_id, content: c.content, time: c.created_at });
    });

    // Sort by time descending
    feed.sort((a, b) => new Date(b.time) - new Date(a.time));
    setItems(feed.slice(0, 20));
    setLoading(false);
  }

  function timeAgo(ts) {
    const secs = Math.floor((Date.now() - new Date(ts)) / 1000);
    if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
    if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
    return `${Math.floor(secs / 86400)}d ago`;
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Activity</h1>
        <p className="page-subtitle">Recent class updates.</p>
      </div>

      {loading ? (
        <p style={{ color: 'var(--pencil)' }}>Loading activity...</p>
      ) : items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 64, color: 'var(--pencil)' }}>
          <p style={{ fontWeight: 600 }}>You're all caught up.</p>
          <p style={{ fontSize: 14 }}>No recent activity to show.</p>
        </div>
      ) : (
        <div className="activity-list">
          {items.map(item => {
            const subj = SUBJECTS.find(s => s.id === item.subject_id);
            return (
              <div key={item.id} className="activity-item">
                <div className="activity-icon">{item.type === 'note' ? '📚' : '💬'}</div>
                <div className="activity-content">
                  <div style={{ fontWeight: 500, marginBottom: 4 }}>
                    {item.type === 'note' ? (
                      <>New note published: <strong>{item.chapter}</strong></>
                    ) : (
                      <><strong>{item.author}</strong> commented on <strong>{item.chapter}</strong></>
                    )}
                  </div>
                  {item.type === 'comment' && (
                    <div style={{ fontSize: 13, color: 'var(--pencil)', marginBottom: 4 }}>"{item.content?.slice(0, 80)}{item.content?.length > 80 ? '...' : ''}"</div>
                  )}
                  <div style={{ fontSize: 12, color: 'var(--pencil)' }}>{subj?.code} · {timeAgo(item.time)}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
