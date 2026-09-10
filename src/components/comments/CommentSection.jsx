import { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';

function timeAgo(ts) {
  const secs = Math.floor((Date.now() - new Date(ts)) / 1000);
  if (secs < 60) return 'just now';
  if (secs < 3600) return `${Math.floor(secs / 60)} min ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return new Date(ts).toLocaleDateString();
}

function Avatar({ name }) {
  return (
    <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--red-light)', color: 'var(--red)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, flexShrink: 0 }}>
      {(name || '?').charAt(0).toUpperCase()}
    </div>
  );
}

export default function CommentSection({ noteId, user, notePublished }) {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState('');
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState('');
  const [replyingTo, setReplyingTo] = useState(null);
  const [replyText, setReplyText] = useState('');
  const isCR = user?.profile?.role === 'cr';

  useEffect(() => { loadComments(); }, [noteId]);

  async function loadComments() {
    setLoading(true);
    const { data, error } = await supabase
      .from('comments')
      .select('id, content, created_at, user_id, parent_comment_id, profiles(name, role)')
      .eq('note_id', noteId)
      .order('created_at', { ascending: true });

    if (!error && data) {
      const top = data.filter(c => !c.parent_comment_id);
      const replies = data.filter(c => c.parent_comment_id);
      setComments(top.map(c => ({ ...c, replies: replies.filter(r => r.parent_comment_id === c.id) })));
    }
    setLoading(false);
  }

  async function postComment() {
    if (!newComment.trim() || posting) return;
    // Prevent commenting on unpublished notes (belt & suspenders, RLS handles real enforcement)
    if (!notePublished && !isCR) { setPostError('You cannot comment on an unpublished note.'); return; }
    setPosting(true);
    setPostError('');
    const { error } = await supabase.from('comments').insert({
      note_id: noteId,
      user_id: user.id,
      content: newComment.trim(),
      parent_comment_id: null
    });
    if (error) {
      setPostError('Comment failed. Please try again.');
    } else {
      setNewComment('');
      loadComments();
    }
    setPosting(false);
  }

  async function postReply(parentId) {
    if (!replyText.trim() || posting) return;
    setPosting(true);
    const { error } = await supabase.from('comments').insert({
      note_id: noteId,
      user_id: user.id,
      content: replyText.trim(),
      parent_comment_id: parentId
    });
    if (!error) { setReplyText(''); setReplyingTo(null); loadComments(); }
    setPosting(false);
  }

  async function deleteComment(id) {
    const { error } = await supabase.from('comments').delete().eq('id', id);
    if (!error) loadComments();
  }

  const totalCount = comments.reduce((acc, c) => acc + 1 + (c.replies?.length || 0), 0);

  return (
    <div className="comments-section">
      <h3 style={{ marginBottom: 24 }}>💬 Comments ({loading ? '…' : totalCount})</h3>

      {loading ? (
        <p style={{ color: 'var(--pencil)' }}>Loading comments...</p>
      ) : comments.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 32, color: 'var(--pencil)' }}>
          <p>No comments yet. Be the first to ask a question.</p>
        </div>
      ) : (
        comments.map(c => (
          <div key={c.id} className="comment-bubble">
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <Avatar name={c.profiles?.name} />
              <div style={{ flex: 1 }}>
                <div className="comment-header">
                  <span className="comment-author">
                    {c.profiles?.name || 'Anonymous'}
                    {c.profiles?.role === 'cr' && <span style={{ marginLeft: 6, fontSize: 11, background: 'var(--red-light)', color: 'var(--red)', padding: '1px 6px', borderRadius: 8, fontWeight: 600 }}>CR</span>}
                  </span>
                  <span className="comment-time">{timeAgo(c.created_at)}</span>
                </div>
                <div className="comment-body">{c.content}</div>
                <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                  {notePublished && (
                    <button className="btn ghost" style={{ padding: '2px 0', fontSize: 13 }}
                      onClick={() => setReplyingTo(replyingTo === c.id ? null : c.id)}>
                      Reply
                    </button>
                  )}
                  {(user.id === c.user_id || isCR) && (
                    <button className="btn ghost" style={{ padding: '2px 0', fontSize: 13, color: 'var(--red)' }}
                      onClick={() => deleteComment(c.id)}>
                      Delete
                    </button>
                  )}
                </div>

                {replyingTo === c.id && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    <input
                      style={{ flex: 1, padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 14, outline: 'none' }}
                      placeholder="Write a reply..."
                      value={replyText}
                      onChange={e => setReplyText(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && postReply(c.id)}
                      autoFocus
                    />
                    <button className="btn primary" style={{ padding: '8px 14px' }} onClick={() => postReply(c.id)} disabled={posting}>Send</button>
                  </div>
                )}

                {c.replies?.map(r => (
                  <div key={r.id} className="reply-block" style={{ marginTop: 12 }}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      <Avatar name={r.profiles?.name} />
                      <div style={{ flex: 1 }}>
                        <div className="comment-header">
                          <span className="comment-author">
                            {r.profiles?.name || 'Anonymous'}
                            {r.profiles?.role === 'cr' && <span style={{ marginLeft: 6, fontSize: 11, background: 'var(--red-light)', color: 'var(--red)', padding: '1px 6px', borderRadius: 8, fontWeight: 600 }}>CR</span>}
                          </span>
                          <span className="comment-time">{timeAgo(r.created_at)}</span>
                        </div>
                        <div className="comment-body">{r.content}</div>
                        {(user.id === r.user_id || isCR) && (
                          <button className="btn ghost" style={{ padding: '2px 0', fontSize: 12, color: 'var(--red)', marginTop: 4 }}
                            onClick={() => deleteComment(r.id)}>
                            Delete
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))
      )}

      {/* Only show comment input on published notes (students), or always for CR */}
      {(notePublished || isCR) && (
        <div className="comment-input-box" style={{ marginTop: 32 }}>
          <Avatar name={user.profile?.name} />
          <textarea
            className="comment-input"
            rows={2}
            placeholder="Write a comment..."
            value={newComment}
            onChange={e => setNewComment(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); postComment(); } }}
          />
          <button className="btn primary" style={{ alignSelf: 'flex-end' }} onClick={postComment} disabled={posting}>
            {posting ? '…' : 'Post'}
          </button>
        </div>
      )}
      {postError && <p style={{ color: 'var(--red)', fontSize: 13, marginTop: 8 }}>{postError}</p>}
    </div>
  );
}
