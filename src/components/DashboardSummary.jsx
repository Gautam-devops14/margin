import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { subjectById } from '../lib/subjects';

export default function DashboardSummary({ session, setAppSection }) {
  const [dueRevisions, setDueRevisions] = useState([]);
  const [groupActivity, setGroupActivity] = useState({ doubts: 0, homework: 0 });

  useEffect(() => {
    if (!session) return;
    loadSummary();
  }, [session]);

  async function loadSummary() {
    // Fetch Revisions due today
    const now = new Date();
    const { data: revData } = await supabase
      .from('revisions')
      .select('*, note:notes(title, topic, subject_id)')
      .eq('user_id', session.user.id)
      .is('completed_at', null)
      .lte('scheduled_for', now.toISOString());
    
    if (revData) setDueRevisions(revData);

    // Fetch Group Activity (open posts)
    // RLS ensures we only fetch open posts from groups we are members of
    const { data: postData } = await supabase
      .from('group_posts')
      .select('id, type')
      .eq('status', 'open');
    
    if (postData) {
      const doubts = postData.filter(p => p.type === 'doubt').length;
      const homework = postData.filter(p => p.type === 'homework').length;
      setGroupActivity({ doubts, homework });
    }
  }

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  
  const email = session.user?.email || '';
  let name = email.split('@')[0];
  if (name.startsWith('phone_')) name = 'Student';

  return (
    <div style={{ marginBottom: 40 }}>
      <h2 style={{ fontFamily: 'var(--font-read)', fontSize: '24px', fontWeight: 600, color: 'var(--ink)', marginBottom: 24 }}>
        {greeting}, {name}.
      </h2>
      
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        {/* Revisions Summary */}
        <div style={{ flex: 1, minWidth: 280, padding: 20, border: '1px solid rgba(0,0,0,0.06)', borderRadius: 8, background: '#fff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
            <span style={{ fontWeight: 600, color: 'var(--ink)' }}>🔔 Today's Revisions</span>
            {dueRevisions.length > 0 && (
              <span style={{ background: '#fee2e2', color: '#dc2626', padding: '2px 8px', borderRadius: 12, fontSize: '12px', fontWeight: 600 }}>
                {dueRevisions.length} due
              </span>
            )}
          </div>
          
          {dueRevisions.length > 0 ? (
            <div style={{ fontSize: '14px', color: 'var(--ink)', marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {dueRevisions.slice(0, 2).map((rev, i) => (
                <div key={i} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  <span style={{ color: 'var(--pencil)', marginRight: 6 }}>{subjectById(rev.note?.subject_id)?.code}</span>
                  {rev.note?.topic || rev.note?.title}
                </div>
              ))}
              {dueRevisions.length > 2 && <div style={{ color: 'var(--pencil)' }}>+ {dueRevisions.length - 2} more...</div>}
            </div>
          ) : (
            <div style={{ fontSize: '14px', color: 'var(--pencil)', marginBottom: 20 }}>
              You're all caught up for today!
            </div>
          )}
          
          <button className="btn primary" style={{ width: '100%', justifyContent: 'center' }} onClick={() => setAppSection('revisions')}>
            {dueRevisions.length > 0 ? 'Start Revision →' : 'View Schedule'}
          </button>
        </div>

        {/* Group Summary */}
        <div style={{ flex: 1, minWidth: 280, padding: 20, border: '1px solid rgba(0,0,0,0.06)', borderRadius: 8, background: '#fff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
            <span style={{ fontWeight: 600, color: 'var(--ink)' }}>👥 Study Group</span>
          </div>
          
          <div style={{ fontSize: '14px', color: 'var(--pencil)', marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {groupActivity.doubts === 0 && groupActivity.homework === 0 ? (
               <span>No active doubts right now.</span>
            ) : (
               <>
                 {groupActivity.doubts > 0 && <span style={{ color: 'var(--ink)' }}><strong style={{ color: '#d6455c' }}>{groupActivity.doubts}</strong> open doubt(s)</span>}
                 {groupActivity.homework > 0 && <span style={{ color: 'var(--ink)' }}><strong>{groupActivity.homework}</strong> new homework</span>}
               </>
            )}
          </div>
          
          <button className="btn ghost" style={{ width: '100%', justifyContent: 'center', background: '#f4f3ec' }} onClick={() => setAppSection('groups')}>
            Open Groups →
          </button>
        </div>
      </div>
    </div>
  );
}
