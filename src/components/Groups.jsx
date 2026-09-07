import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { subjectById } from '../lib/subjects';

function GroupView({ group, onBack, session, openNote, toast }) {
  const [posts, setPosts] = useState([]);
  const [newPostType, setNewPostType] = useState('doubt');
  const [newPostContent, setNewPostContent] = useState('');
  const [newPostNoteRef, setNewPostNoteRef] = useState('');
  
  const [members, setMembers] = useState([]);
  const [myNotes, setMyNotes] = useState([]);

  // Replier state
  const [replyingTo, setReplyingTo] = useState(null);
  const [replyContent, setReplyContent] = useState('');

  const isAdmin = group.role === 'admin' || group.created_by === session.user.id;

  useEffect(() => {
    loadGroupData();
    loadMyNotes();
  }, [group.id]);

  async function loadGroupData() {
    // Load members
    const { data: mData } = await supabase
      .from('group_members')
      .select('user_id, role, users:auth.users(email)')
      .eq('group_id', group.id);
    if (mData) setMembers(mData);

    // Load posts & replies (Since auth.users join might not work unless we use a profile view, 
    // we'll just fetch posts and rely on RLS)
    const { data: pData } = await supabase
      .from('group_posts')
      .select('*, replies:group_replies(*), note:notes(id, title, topic)')
      .eq('group_id', group.id)
      .order('created_at', { ascending: false });
    
    if (pData) {
      // Sort replies by created_at ascending
      pData.forEach(p => p.replies && p.replies.sort((a,b) => new Date(a.created_at) - new Date(b.created_at)));
      setPosts(pData);
    }
  }

  async function loadMyNotes() {
    const { data } = await supabase.from('notes').select('id, title, topic, subject_id').eq('user_id', session.user.id);
    if (data) setMyNotes(data);
  }

  async function submitPost() {
    if (!newPostContent.trim()) return;
    const { error } = await supabase.from('group_posts').insert({
      group_id: group.id,
      user_id: session.user.id,
      type: newPostType,
      content: newPostContent.trim(),
      referenced_note_id: newPostNoteRef || null
    });
    if (error) { toast(error.message); return; }
    setNewPostContent('');
    setNewPostNoteRef('');
    loadGroupData();
  }

  async function submitReply(postId) {
    if (!replyContent.trim()) return;
    const { error } = await supabase.from('group_replies').insert({
      post_id: postId,
      user_id: session.user.id,
      content: replyContent.trim()
    });
    if (error) { toast(error.message); return; }
    setReplyContent('');
    setReplyingTo(null);
    loadGroupData();
  }

  async function toggleStatus(post) {
    const nextStatus = post.status === 'open' ? 'resolved' : 'open';
    const { error } = await supabase.from('group_posts').update({ status: nextStatus }).eq('id', post.id);
    if (error) toast(error.message);
    else loadGroupData();
  }

  return (
    <div className="sheetbody">
      <div className="editorbar">
        <button className="btn ghost" onClick={onBack}>‹ Back to Groups</button>
      </div>

      <div className="listhead" style={{ marginTop: 24, marginBottom: 8 }}>
        <h2>{group.name}</h2>
        <span className="stencil-tag private">JOIN CODE: {group.join_code}</span>
      </div>
      <p style={{ fontSize: '13px', color: 'var(--pencil)', marginBottom: 24 }}>
        {members.length} members in this group.
      </p>

      {/* New Post Box */}
      <div className="friends-card" style={{ marginBottom: 32, background: 'var(--desk)' }}>
        <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
          <button className={`btn ${newPostType === 'doubt' ? 'primary' : 'ghost'}`} onClick={() => setNewPostType('doubt')}>❓ Ask Doubt</button>
          <button className={`btn ${newPostType === 'homework' ? 'primary' : 'ghost'}`} onClick={() => setNewPostType('homework')}>📝 Post Homework</button>
        </div>
        <textarea
          className="field"
          placeholder={newPostType === 'doubt' ? "What's your question?" : "Describe the homework or assignment..."}
          rows={3}
          value={newPostContent}
          onChange={e => setNewPostContent(e.target.value)}
          style={{ width: '100%', marginBottom: 12, resize: 'vertical' }}
        />
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <select className="field" value={newPostNoteRef} onChange={e => setNewPostNoteRef(e.target.value)} style={{ flex: 1 }}>
            <option value="">(Optional) Reference one of your notes...</option>
            {myNotes.map(n => (
              <option key={n.id} value={n.id}>
                {subjectById(n.subject_id)?.code} - {n.topic || n.title || 'Untitled'}
              </option>
            ))}
          </select>
          <button className="btn primary" onClick={submitPost}>Post</button>
        </div>
      </div>

      {/* Posts Feed */}
      <div className="notelist">
        {posts.length === 0 && <div className="empty" style={{ margin: 0 }}>No posts in this group yet.</div>}
        
        {posts.map(post => {
          const isAuthor = post.user_id === session.user.id;
          const canResolve = isAuthor || isAdmin;

          return (
            <div key={post.id} className="notecard-v2" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                <div className="notecard-tags">
                  <span className={`stencil-tag ${post.type === 'doubt' ? 'private' : 'shared'}`}>
                    {post.type.toUpperCase()}
                  </span>
                  {post.type === 'doubt' && (
                    <span className={`stencil-tag ${post.status === 'resolved' ? 'shared' : 'private'}`} style={{ color: post.status === 'resolved' ? 'green' : '#d6455c' }}>
                      {post.status.toUpperCase()}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--pencil)' }}>
                  {new Date(post.created_at).toLocaleString()}
                </div>
              </div>
              
              <div style={{ fontSize: '14px', lineHeight: '1.5', whiteSpace: 'pre-wrap', marginBottom: 12 }}>
                {post.content}
              </div>

              {post.note && (
                <div style={{ background: 'var(--paper)', padding: '8px 12px', border: '1px solid var(--paper-line)', borderRadius: 4, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: '12px', color: 'var(--pencil)' }}>📎 Referenced Note:</span>
                  <button className="btn ghost" style={{ fontSize: '12px', padding: '4px 8px' }} onClick={() => openNote(post.note)}>
                    Open "{post.note.topic || post.note.title}"
                  </button>
                </div>
              )}

              <div style={{ display: 'flex', gap: 12, borderBottom: '1px solid var(--paper-line)', paddingBottom: 12, marginBottom: 12 }}>
                <button className="btn ghost" style={{ fontSize: '12px', padding: '4px 8px' }} onClick={() => setReplyingTo(replyingTo === post.id ? null : post.id)}>
                  💬 Reply ({post.replies?.length || 0})
                </button>
                {post.type === 'doubt' && canResolve && (
                  <button className="btn ghost" style={{ fontSize: '12px', padding: '4px 8px' }} onClick={() => toggleStatus(post)}>
                    {post.status === 'open' ? '✓ Mark Resolved' : '↺ Reopen'}
                  </button>
                )}
              </div>

              {/* Replies */}
              {post.replies && post.replies.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12, paddingLeft: 12, borderLeft: '2px solid var(--paper-line)' }}>
                  {post.replies.map(reply => (
                    <div key={reply.id} style={{ fontSize: '13px', background: 'var(--desk)', padding: '8px', borderRadius: 4 }}>
                      <div style={{ whiteSpace: 'pre-wrap' }}>{reply.content}</div>
                      <div style={{ fontSize: '10px', color: 'var(--pencil)', marginTop: 4, textAlign: 'right' }}>
                        {new Date(reply.created_at).toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Reply Box */}
              {replyingTo === post.id && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <input 
                    type="text" 
                    className="field" 
                    placeholder="Type your reply..." 
                    value={replyContent}
                    onChange={e => setReplyContent(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && submitReply(post.id)}
                    style={{ flex: 1 }}
                  />
                  <button className="btn primary" onClick={() => submitReply(post.id)}>Send</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function Groups({ session, openNote, toast }) {
  const [groups, setGroups] = useState([]);
  const [activeGroup, setActiveGroup] = useState(null);
  const [loading, setLoading] = useState(true);

  // Create Group
  const [showCreate, setShowCreate] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');

  // Join Group
  const [joinCode, setJoinCode] = useState('');

  useEffect(() => {
    if (session) loadGroups();
  }, [session]);

  async function loadGroups() {
    setLoading(true);
    // User can see groups they are a member of, or created
    const { data: memberData } = await supabase
      .from('group_members')
      .select('role, groups(*)')
      .eq('user_id', session.user.id);
      
    if (memberData) {
      const gList = memberData.map(m => ({ ...m.groups, role: m.role }));
      setGroups(gList);
    }
    setLoading(false);
  }

  async function createGroup() {
    if (!newGroupName.trim()) return;
    const code = Math.random().toString(36).slice(2, 8).toUpperCase();
    
    // Create group
    const { data, error } = await supabase.from('groups').insert({
      name: newGroupName.trim(),
      join_code: code,
      created_by: session.user.id
    }).select().single();
    
    if (error) { toast(error.message); return; }

    // Add self as admin
    await supabase.from('group_members').insert({
      group_id: data.id,
      user_id: session.user.id,
      role: 'admin'
    });

    toast(`Group "${newGroupName}" created!`);
    setNewGroupName('');
    setShowCreate(false);
    loadGroups();
  }

  async function joinGroup() {
    if (!joinCode.trim()) return;
    try {
      const { data, error } = await supabase.rpc('join_group_by_code', { p_code: joinCode.trim().toUpperCase() });
      if (error) throw error;
      toast(`Joined group successfully!`);
      setJoinCode('');
      loadGroups();
    } catch (err) {
      toast(err.message || 'Could not join group.');
    }
  }

  if (activeGroup) {
    return <GroupView group={activeGroup} onBack={() => { setActiveGroup(null); loadGroups(); }} session={session} openNote={openNote} toast={toast} />;
  }

  return (
    <div className="sheetbody">
      <div className="listhead" style={{ marginBottom: '16px' }}>
        <h2>👥 Study Groups</h2>
        <button className="btn primary" onClick={() => setShowCreate(true)}>+ New Group</button>
      </div>

      <div className="joinrow" style={{ marginBottom: 32 }}>
        <div style={{ flex: 1 }}>
          <label htmlFor="group-code-input" className="joinlabel">Enter group join code</label>
          <input
            id="group-code-input"
            className="field code-input"
            placeholder="e.g. A1B2C3"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && joinGroup()}
          />
        </div>
        <button className="btn ghost" onClick={joinGroup}>Join Group</button>
      </div>

      {showCreate && (
        <div className="modal-backdrop" onClick={() => setShowCreate(false)}>
          <div className="sheet modal" onClick={e => e.stopPropagation()}>
            <div className="modalhead">
              <h3>Create a Study Group</h3>
              <p>Private space for doubts and homework.</p>
            </div>
            <div className="sheetbody">
              <label>Group Name</label>
              <input 
                className="field" 
                placeholder="e.g. Physics 101 Study Group" 
                value={newGroupName} 
                onChange={e => setNewGroupName(e.target.value)} 
                style={{ width: '100%', marginBottom: 20 }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                <button className="btn ghost" onClick={() => setShowCreate(false)}>Cancel</button>
                <button className="btn primary" onClick={createGroup}>Create</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="empty">Loading groups...</div>
      ) : (
        <div className="notelist">
          {groups.length === 0 && <div className="empty" style={{ margin: 0 }}>You aren't in any groups yet.</div>}
          {groups.map(g => (
            <div key={g.id} className="notecard-v2" onClick={() => setActiveGroup(g)}>
              <div style={{ flex: 1 }}>
                <div className="notecard-tags">
                  <span className={`stencil-tag ${g.role === 'admin' ? 'shared' : 'private'}`}>
                    {g.role.toUpperCase()}
                  </span>
                </div>
                <h3 className="notecard-title">{g.name}</h3>
                <div className="notecard-meta-line">Created: {new Date(g.created_at).toLocaleDateString()}</div>
              </div>
              <div className="notecard-right" style={{ justifyContent: 'center' }}>
                <button className="btn primary card-btn-primary">Open Group</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
