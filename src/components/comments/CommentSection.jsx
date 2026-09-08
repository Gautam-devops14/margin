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

export default function CommentSection({ noteId, user }) {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState('');
  const [posting, setPosting] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null);
  const [replyText, setReplyText] = useState('');

  useEffect(() => { loadComments(); }, [noteId]);

  async function loadComments() {
    setLoading(true);
    // Fetch top-level comments and replies together, join profile names
    const { data } = await supabase
      .from('comments')
      .select('id, content, created_at, user_id, parent_comment_id, profiles(name)')
      .eq('note_id', noteId)
      .order('created_at', { ascending: true });

    if (data) {
      const top = data.filter(c => !c.parent_comment_id);
      const replies = data.filter(c => c.parent_comment_id);
      const structured = top.map(c => ({
        ...c,
        replies: replies.filter(r => r.parent_comment_id === c.id)
      }));
      setComments(structured);
    }
    setLoading(false);
  }

  async function postComment() {
    if (!newComment.trim() || posting) return;
    setPosting(true);
    const { error } = await supabase.from('comments').insert({
      note_id: noteId,
      user_id: user.id,
      content: newComment.trim(),
      parent_comment_id: null
    });
    if (!error) { setNewComment(''); loadComments(); }
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
    await supabase.from('comments').delete().eq('id', id);
    loadComments();
  }

  const totalCount = comments.reduce((acc, c) => acc + 1 + (c.replies?.length || 0), 0);

  return (
    <div className="comments-section">
      <h3 style={{ marginBottom: 24 }}>💬 Comments ({loading ? '...' : totalCount})</h3>

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
                  <span className="comment-author">{c.profiles?.name || 'Anonymous'}</span>
                  <span className="comment-time">{timeAgo(c.created_at)}</span>
                </div>
                <div className="comment-body">{c.content}</div>
                <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                  <button className="btn ghost" style={{ padding: '2px 0', fontSize: 13 }}
                    onClick={() => setReplyingTo(replyingTo === c.id ? null : c.id)}>
                    Reply
                  </button>
                  {(user.id === c.user_id || user.profile?.role === 'cr') && (
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
                          <span className="comment-author">{r.profiles?.name || 'Anonymous'}</span>
                          <span className="comment-time">{timeAgo(r.created_at)}</span>
                        </div>
                        <div className="comment-body">{r.content}</div>
                        {(user.id === r.user_id || user.profile?.role === 'cr') && (
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
          {posting ? '...' : 'Post'}
        </button>
      </div>
    </div>
  );
}
