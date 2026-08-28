import { useEffect, useRef, useState } from 'react';
import { supabase } from '../supabaseClient';
import { enhanceWritingNote, getDoubtingQuestions, scanNoteImage } from '../lib/gemini';

function sanitizeHtml(html) {
  if (!html) return '';
  const div = document.createElement('div');
  div.innerHTML = html;
  div.querySelectorAll('script, iframe, object, embed, form, input, button').forEach((el) => el.remove());
  div.querySelectorAll('*').forEach((el) => {
    Array.from(el.attributes).forEach((attr) => {
      if (attr.name.startsWith('on') || attr.value.trim().toLowerCase().startsWith('javascript:')) {
        el.removeAttribute(attr.name);
      }
    });
  });
  return div.innerHTML;
}

export default function Editor({ note, subject, me, onBack }) {
  const ref = useRef(null);
  const fileRef = useRef(null);
  const scanRef = useRef(null);
  const superOn = useRef(false);
  const subOn = useRef(false);

  const [chapter, setChapter] = useState(note.chapter || '');
  const [topic, setTopic] = useState(note.topic || '');
  const [title, setTitle] = useState(note.title || note.topic || '');
  const [questions, setQuestions] = useState(note.questions || null);
  const [shareWithFriends, setShareWithFriends] = useState(note.share_with_friends || false);
  
  const [mode, setMode] = useState('');
  const [busy, setBusy] = useState(false);
  const [enhancing, setEnhancing] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [status, setStatus] = useState('');
  const [code, setCode] = useState(null);

  // Image Resizer Popover state
  const [selectedImg, setSelectedImg] = useState(null);
  const [popoverPos, setPopoverPos] = useState({ top: 0, left: 0 });

  // Offline status & Local Draft state
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [hasDraft, setHasDraft] = useState(false);

  const isOwner = note.user_id === me;
  const canEdit = isOwner || note._perm === 'edit';

  const draftKey = `margin_draft_${note.id}`;

  // Undo & Redo History Stack State
  const undoStack = useRef([]);
  const redoStack = useRef([]);
  const isUndoRedoAction = useRef(false);

  function pushHistory() {
    if (isUndoRedoAction.current || !ref.current) return;
    const currentHtml = ref.current.innerHTML;
    const last = undoStack.current[undoStack.current.length - 1];
    if (last !== currentHtml) {
      undoStack.current.push(currentHtml);
      if (undoStack.current.length > 50) undoStack.current.shift();
      redoStack.current = [];
    }
  }

  function handleUndo() {
    if (!ref.current) return;
    if (undoStack.current.length > 1) {
      isUndoRedoAction.current = true;
      const currentVal = undoStack.current.pop();
      redoStack.current.push(currentVal);
      const prevVal = undoStack.current[undoStack.current.length - 1];
      ref.current.innerHTML = prevVal;
      saveLocalDraft();
      flash('↶ Undo (Ctrl+Z)');
      setTimeout(() => { isUndoRedoAction.current = false; }, 50);
    } else {
      flash('Nothing to undo');
    }
  }

  function handleRedo() {
    if (!ref.current) return;
    if (redoStack.current.length > 0) {
      isUndoRedoAction.current = true;
      const nextVal = redoStack.current.pop();
      undoStack.current.push(nextVal);
      ref.current.innerHTML = nextVal;
      saveLocalDraft();
      flash('↷ Redo (Ctrl+Y)');
      setTimeout(() => { isUndoRedoAction.current = false; }, 50);
    } else {
      flash('Nothing to redo');
    }
  }

  // Restore local draft on mount if available
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const savedDraft = localStorage.getItem(draftKey);
    const noteTime = note.updated_at ? new Date(note.updated_at).getTime() : 0;
    
    let useLocalDraft = false;
    if (savedDraft) {
      try {
        const parsed = JSON.parse(savedDraft);
        const draftTime = parsed.timestamp || 0;
        // Only use local draft if it is newer than the cloud update
        if (draftTime > noteTime + 2000 && (parsed.content || parsed.chapter || parsed.topic)) {
          useLocalDraft = true;
          if (parsed.chapter) setChapter(parsed.chapter);
          if (parsed.topic) setTopic(parsed.topic);
          if (parsed.title) setTitle(parsed.title);
          if (ref.current && parsed.content) {
            ref.current.innerHTML = parsed.content;
            undoStack.current = [parsed.content];
          }
          setHasDraft(true);
          flash('📶 Restored local offline draft');
        }
      } catch {
        useLocalDraft = false;
      }
    }

    if (!useLocalDraft && ref.current) {
      ref.current.innerHTML = note.content || '';
      undoStack.current = [note.content || ''];
      setHasDraft(false);
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.id]);

  // Version History Snapshots State
  const [versionSnapshots, setVersionSnapshots] = useState([]);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const autoSaveTimer = useRef(null);
  const lastSnapshotTime = useRef(0);

  function pushVersionSnapshot() {
    if (!ref.current || !canEdit) return;
    const now = Date.now();
    if (now - lastSnapshotTime.current < 8000) return;
    lastSnapshotTime.current = now;

    const currentContent = ref.current.innerHTML;
    if (!currentContent || currentContent === '<p><br></p>') return;

    const rawText = currentContent.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const wordCount = rawText ? rawText.split(/\s+/).length : 0;
    const label = `${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })} (${wordCount} words)`;

    const key = `margin_history_snapshots_${note.id}`;
    const existing = JSON.parse(localStorage.getItem(key) || '[]');
    if (existing.length > 0 && existing[0].content === currentContent) return;

    const updated = [{ timestamp: now, label, content: currentContent, chapter, topic }, ...existing].slice(0, 20);
    localStorage.setItem(key, JSON.stringify(updated));
    setVersionSnapshots(updated);
  }

  function openHistoryModal() {
    const key = `margin_history_snapshots_${note.id}`;
    const existing = JSON.parse(localStorage.getItem(key) || '[]');
    setVersionSnapshots(existing);
    setShowHistoryModal(true);
  }

  function restoreVersionSnapshot(snap) {
    if (!ref.current) return;
    ref.current.innerHTML = snap.content;
    if (snap.chapter) setChapter(snap.chapter);
    if (snap.topic) setTopic(snap.topic);
    saveLocalDraft();
    pushHistory();
    setShowHistoryModal(false);
    flash(`Restored version from ${snap.label}!`);
  }

  function scheduleCloudAutoSave() {
    if (!canEdit) return;
    saveLocalDraft();
    pushVersionSnapshot();

    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      save({ silent: true });
    }, 2000);
  }

  function saveLocalDraft() {
    if (!canEdit) return;
    const currentContent = ref.current ? ref.current.innerHTML : '';
    pushHistory();
    const draftData = {
      chapter,
      topic,
      title,
      content: currentContent,
      timestamp: Date.now()
    };
    localStorage.setItem(draftKey, JSON.stringify(draftData));
    setHasDraft(true);
  }

  // Link Popover state
  const [selectedLink, setSelectedLink] = useState(null);
  const [linkPopoverPos, setLinkPopoverPos] = useState({ top: 0, left: 0 });

  function flash(m) {
    setStatus(m);
    setTimeout(() => setStatus(''), 2500);
  }

  function onPaperClick(e) {
    const anchor = e.target.closest ? e.target.closest('a') : null;
    if (anchor && anchor.getAttribute('href')) {
      const url = anchor.getAttribute('href');
      // Open immediately if Ctrl/Cmd held or bookmark chip or view-only mode
      if (e.ctrlKey || e.metaKey || anchor.classList.contains('link-bookmark-chip') || !canEdit) {
        window.open(url, '_blank', 'noopener,noreferrer');
        return;
      }

      const rect = anchor.getBoundingClientRect();
      const parentRect = ref.current ? ref.current.getBoundingClientRect() : { top: 0, left: 0 };
      setSelectedLink(anchor);
      setLinkPopoverPos({
        top: Math.max(0, rect.top - parentRect.top - 42),
        left: Math.max(0, rect.left - parentRect.left),
      });
      setSelectedImg(null);
      return;
    }

    setSelectedLink(null);

    if (e.target.tagName === 'IMG') {
      const img = e.target;
      const rect = img.getBoundingClientRect();
      const parentRect = ref.current.getBoundingClientRect();
      setSelectedImg(img);
      setPopoverPos({
        top: rect.top - parentRect.top - 42,
        left: Math.max(0, rect.left - parentRect.left),
      });
    } else {
      setSelectedImg(null);
    }
  }

  function setImgWidth(percent) {
    if (!selectedImg) return;
    selectedImg.className = `img-w-${percent}`;
    selectedImg.style.width = `${percent}%`;
    setSelectedImg(null);
  }

  function removeImg() {
    if (!selectedImg) return;
    selectedImg.remove();
    setSelectedImg(null);
  }

  function insertTable() {
    if (!canEdit || !ref.current) return;
    ref.current.focus();
    const tableHtml = `
      <table>
        <thead>
          <tr>
            <th>Concept / Input</th>
            <th>Description / Logic</th>
            <th>Output / State</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Input A = 1, B = 0</td>
            <td>AND Gate evaluation</td>
            <td>Output Y = 0</td>
          </tr>
          <tr>
            <td>Input A = 1, B = 1</td>
            <td>AND Gate evaluation</td>
            <td>Output Y = 1</td>
          </tr>
        </tbody>
      </table>
      <p><br></p>
    `;
    document.execCommand('insertHTML', false, tableHtml);
  }

  function insertTree() {
    if (!canEdit || !ref.current) return;
    ref.current.focus();
    const treeHtml = `
      <div class="tree-box" contenteditable="true">
        <div class="tree-title">Main System / Topic</div>
        <div class="tree-branch">
          ├── Component A<br>
          │&nbsp;&nbsp;&nbsp;&nbsp;├── Sub-feature 1.1<br>
          │&nbsp;&nbsp;&nbsp;&nbsp;└── Sub-feature 1.2<br>
          └── Component B<br>
          &nbsp;&nbsp;&nbsp;&nbsp;├── Sub-feature 2.1<br>
          &nbsp;&nbsp;&nbsp;&nbsp;└── Sub-feature 2.2
        </div>
      </div>
      <p><br></p>
    `;
    document.execCommand('insertHTML', false, treeHtml);
  }

  function handleScanFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    e.target.value = '';

    const mimeType = file.type || 'image/jpeg';
    const reader = new FileReader();

    reader.onload = async () => {
      const dataUrl = reader.result;
      const base64 = String(dataUrl).replace(/^data:image\/[a-z]+;base64,/, '');

      setIsScanning(true);
      setStatus('AI is scanning & transcribing note image…');

      try {
        const scannedHtml = await scanNoteImage(base64, mimeType, subject?.name || '', chapter, topic);
        if (ref.current && scannedHtml) {
          ref.current.innerHTML += `<br><h3>📷 Scanned Notes (${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})</h3>` + scannedHtml;
          flash('Notes scanned and transcribed cleanly!');
        } else {
          flash('Could not extract text from image');
        }
      } catch (err) {
        handleAiError(err);
      } finally {
        setIsScanning(false);
      }
    };

    reader.readAsDataURL(file);
  }

  function onKeyDown(e) {
    if (!canEdit) { e.preventDefault(); return; }

    // Intercept Undo (Ctrl+Z / Cmd+Z) and Redo (Ctrl+Y / Cmd+Shift+Z / Cmd+Y)
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) {
        handleRedo();
      } else {
        handleUndo();
      }
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      handleRedo();
      return;
    }

    if (e.key === '^') {
      e.preventDefault();
      if (subOn.current) { document.execCommand('subscript'); subOn.current = false; }
      document.execCommand('superscript');
      superOn.current = !superOn.current;
      setMode(superOn.current ? 'power' : '');
      return;
    }
    if (e.key === '_') {
      e.preventDefault();
      if (superOn.current) { document.execCommand('superscript'); superOn.current = false; }
      document.execCommand('subscript');
      subOn.current = !subOn.current;
      setMode(subOn.current ? 'base' : '');
      return;
    }
    if ((e.key === ' ' || e.key === 'Enter') && (superOn.current || subOn.current)) {
      if (superOn.current) { document.execCommand('superscript'); superOn.current = false; }
      if (subOn.current) { document.execCommand('subscript'); subOn.current = false; }
      setMode('');
      if (e.key === ' ') { e.preventDefault(); document.execCommand('insertText', false, ' '); }
    }
  }

  function isUrlString(str) {
    if (!str) return false;
    const s = str.trim();
    return /^https?:\/\/[^\s]+$/i.test(s) || /^www\.[^\s]+$/i.test(s);
  }

  function onPaste(e) {
    const items = e.clipboardData && e.clipboardData.items;
    if (items) {
      for (const it of items) {
        if (it.type.indexOf('image') === 0) {
          e.preventDefault();
          insertImage(it.getAsFile());
          return;
        }
      }
    }

    // Auto-hyperlink when user highlights text and presses Ctrl+V / Cmd+V with a URL
    const selection = window.getSelection();
    const selectedText = selection ? selection.toString().trim() : '';
    const pastedText = e.clipboardData ? e.clipboardData.getData('text').trim() : '';

    if (selectedText && isUrlString(pastedText)) {
      e.preventDefault();
      let cleanUrl = pastedText;
      if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
        cleanUrl = 'https://' + cleanUrl;
      }

      document.execCommand('createLink', false, cleanUrl);
      
      if (ref.current) {
        ref.current.querySelectorAll('a').forEach((a) => {
          a.setAttribute('target', '_blank');
          a.setAttribute('rel', 'noopener noreferrer');
        });
      }

      saveLocalDraft();
      flash('🔗 Hyperlinked selected text to URL!');
    }
  }

  function insertImage(file) {
    const r = new FileReader();
    r.onload = () => {
      ref.current.focus();
      document.execCommand('insertHTML', false, `<img src="${r.result}" class="img-w-100" alt="Note image">`);
    };
    r.readAsDataURL(file);
  }

  async function save(overrides = {}) {
    if (!canEdit) return;
    const content = ref.current ? ref.current.innerHTML : '';
    const updatedShare = overrides.shareWithFriends !== undefined ? overrides.shareWithFriends : shareWithFriends;
    
    // Always persist local draft backup
    const draftData = { chapter, topic, title, content, timestamp: Date.now() };
    localStorage.setItem(draftKey, JSON.stringify(draftData));
    setHasDraft(false);

    if (!isOnline) {
      if (!overrides.silent) flash('📶 Offline Mode — Saved to local phone/laptop draft!');
      return;
    }

    const { error } = await supabase
      .from('notes')
      .update({
        chapter: chapter.trim(),
        topic: topic.trim(),
        title: title.trim() || topic.trim() || 'Untitled note',
        content,
        share_with_friends: updatedShare,
        updated_at: new Date().toISOString()
      })
      .eq('id', note.id);
      
    if (error) {
      if (!overrides.silent) flash(error.message || 'Saved to local offline draft');
    } else {
      if (!overrides.silent) flash('Saved to notebook cloud');
    }
  }

  async function toggleShareWithFriends() {
    if (!isOwner) return;
    const nextVal = !shareWithFriends;
    setShareWithFriends(nextVal);
    await save({ shareWithFriends: nextVal });
  }

  // Gemini API Key Modal state
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [geminiKeyInput, setGeminiKeyInput] = useState(localStorage.getItem('margin_gemini_key') || '');

  function handleAiError(e) {
    if (e?.code === 'GEMINI_KEY_REQUIRED' || e?.message?.includes('GEMINI_KEY_REQUIRED')) {
      setShowKeyModal(true);
      setStatus('Please set your free Gemini API Key below.');
    } else {
      setStatus(e.message || 'AI error');
    }
  }

  function saveGeminiKey() {
    const k = geminiKeyInput.trim();
    if (!k) { flash('Enter a valid Gemini API Key'); return; }
    localStorage.setItem('margin_gemini_key', k);
    setShowKeyModal(false);
    flash('Saved Gemini API Key! Try your AI action again.');
  }

  async function ai() {
    const text = (ref.current ? ref.current.innerText : '').trim();
    if (text.length < 15) { flash('Write a bit more first before asking AI'); return; }
    setBusy(true); setStatus('Reading your notes…');
    try {
      const qs = await getDoubtingQuestions(text, subject?.name || '', chapter, topic);
      setQuestions(qs);
      await supabase.from('notes').update({ questions: qs }).eq('id', note.id);
      setStatus('');
    } catch (e) {
      handleAiError(e);
    } finally {
      setBusy(false);
    }
  }

  // AI Enhance Modal state & custom precision prompt
  const [showEnhanceModal, setShowEnhanceModal] = useState(false);
  const [customAiPrompt, setCustomAiPrompt] = useState('');

  function openEnhanceModal() {
    const text = (ref.current ? ref.current.innerText : '').trim();
    if (text.length < 15) { flash('Write a bit more text first to enhance'); return; }
    setShowEnhanceModal(true);
  }

  async function runEnhanceWriting() {
    const text = (ref.current ? ref.current.innerText : '').trim();
    if (text.length < 15) { flash('Write a bit more text first to enhance'); return; }
    setShowEnhanceModal(false);
    setEnhancing(true); setStatus('AI is enhancing your writing…');
    try {
      const enhancedHtml = await enhanceWritingNote(text, subject?.name || '', chapter, topic, customAiPrompt);
      if (ref.current && enhancedHtml) {
        ref.current.innerHTML = sanitizeHtml(enhancedHtml);
        saveLocalDraft();
        flash('Writing enhanced cleanly!');
      }
      setStatus('');
    } catch (e) {
      handleAiError(e);
    } finally {
      setEnhancing(false);
    }
  }

  async function share(perm) {
    try {
      const { data, error } = await supabase.rpc('share_note', { p_note: note.id, p_permission: perm });
      if (!error && data) {
        setCode({ value: data, perm });
        return;
      }
      const c = Math.random().toString(36).slice(2, 8).toUpperCase();
      const { error: insertErr } = await supabase
        .from('note_shares')
        .insert({ note_id: note.id, code: c, permission: perm, created_by: me });
      if (insertErr) throw insertErr;
      setCode({ value: c, perm });
    } catch (err) {
      flash(err.message || 'Could not create share code');
    }
  }

  // External Link Modal state
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkTitle, setLinkTitle] = useState('');
  const [hasSelection, setHasSelection] = useState(false);

  function openLinkModal() {
    const selection = window.getSelection();
    const selectedText = selection ? selection.toString().trim() : '';
    setLinkUrl('');
    if (selectedText) {
      setLinkTitle(selectedText);
      setHasSelection(true);
    } else {
      setLinkTitle('');
      setHasSelection(false);
    }
    setShowLinkModal(true);
  }

  function insertExternalLink() {
    let url = linkUrl.trim();
    if (!url) { flash('Enter a valid URL'); return; }
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }

    const titleText = linkTitle.trim() || url.replace(/^https?:\/\//, '').split('/')[0];
    
    if (hasSelection) {
      document.execCommand('createLink', false, url);
      if (ref.current) {
        ref.current.querySelectorAll('a').forEach((a) => {
          a.setAttribute('target', '_blank');
          a.setAttribute('rel', 'noopener noreferrer');
        });
      }
      flash('🔗 Hyperlinked selected text!');
    } else {
      const isPdf = url.toLowerCase().includes('.pdf') || url.toLowerCase().includes('drive.google.com') || url.toLowerCase().includes('docs.google.com');
      const isVideo = url.toLowerCase().includes('youtube.com') || url.toLowerCase().includes('youtu.be');
      const icon = isPdf ? '📄 PDF' : isVideo ? '🎥 Video' : '🔗 Web';

      const linkHtml = `
        <span class="note-link-block" contenteditable="false" style="display:inline-block; margin:4px 4px 4px 0;">
          <a href="${url}" target="_blank" rel="noopener noreferrer" class="link-bookmark-chip" title="${url}">
            <span class="chip-icon">${icon}</span>
            <span class="chip-title">${titleText}</span>
            <span class="chip-arrow">↗</span>
          </a>
        </span>&nbsp;`;

      ref.current.focus();
      document.execCommand('insertHTML', false, linkHtml);
      flash('Attached study link bookmark to note page!');
    }

    saveLocalDraft();
    setShowLinkModal(false);
  }

  function exportPdf() {
    window.print();
  }

  const isGraphPaper = subject?.id === 'dm';

  return (
    <div className="desk">
      <div className="sheet">
        <div className="editorbar">
          <button className="btn ghost" onClick={async () => { await save(); onBack(); }}>‹ Back</button>
          {!isOnline ? (
            <div className="modebadge" style={{ background: '#d6455c', color: '#fff' }}>📶 Offline (Draft Auto-Saved)</div>
          ) : hasDraft ? (
            <div className="modebadge" style={{ background: '#f5e05f' }}>📶 Unsynced Local Draft</div>
          ) : mode ? (
            <div className="modebadge">{mode === 'power' ? 'power — x²' : 'base — x₁'}</div>
          ) : (
            <div className="modebadge idle">math mode off</div>
          )}
          <div className="spacer" />
          {canEdit && <button className="btn ghost" onClick={handleUndo} title="Undo (Ctrl+Z / Cmd+Z)">↶ Undo</button>}
          {canEdit && <button className="btn ghost" onClick={handleRedo} title="Redo (Ctrl+Y / Cmd+Shift+Z)">↷ Redo</button>}
          {canEdit && <button className="btn ghost" onClick={() => scanRef.current?.click()} title="Scan handwritten note image with AI">📷 Scan Notes</button>}
          {canEdit && <button className="btn ghost" onClick={openLinkModal} title="Attach External PDF / Google Drive / Lecture Link">🔗 Add Link</button>}
          {canEdit && <button className="btn ghost" onClick={insertTable} title="Insert Ruled Table">📊 Table</button>}
          {canEdit && <button className="btn ghost" onClick={insertTree} title="Insert Tree Diagram">🌳 Tree</button>}
          {canEdit && <button className="btn ghost" onClick={() => fileRef.current?.click()} title="Upload Image">🖼 Image</button>}
          {canEdit && <button className="btn ghost" onClick={() => { ref.current?.focus(); document.execCommand('bold'); }}><b>B</b></button>}
          <button className="btn ghost" onClick={exportPdf} title="Export Notebook Page to PDF">📄 Export PDF</button>
          {canEdit && <button className="btn primary" onClick={() => save()}>Save</button>}
          
          <input ref={fileRef} type="file" accept="image/*" hidden
            onChange={(e) => { const f = e.target.files[0]; if (f) insertImage(f); e.target.value = ''; }} />
          <input ref={scanRef} type="file" accept="image/*" hidden
            onChange={handleScanFile} />
        </div>

        {/* Printed Notebook Page Header */}
        <div className="pagehead">
          <div className="row">
            <div className="cell">
              <label htmlFor="edit-chapter-input" className="k">Chapter</label>
              {canEdit ? (
                <input
                  id="edit-chapter-input"
                  name="chapter"
                  className="field"
                  style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 'var(--t-md)' }}
                  value={chapter}
                  onChange={(e) => setChapter(e.target.value)}
                  placeholder="Chapter name"
                />
              ) : (
                <div className="v">{chapter || '—'}</div>
              )}
            </div>
            <div className="cell">
              <label htmlFor="edit-topic-input" className="k">Topic</label>
              {canEdit ? (
                <input
                  id="edit-topic-input"
                  name="topic"
                  className="field"
                  style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 'var(--t-md)' }}
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="Topic name"
                />
              ) : (
                <div className="v">{topic || '—'}</div>
              )}
            </div>
            <div className="cell" style={{ flex: '0 0 auto' }}>
              <span className="k">Subject</span>
              <div className="v subject">{subject?.name || 'Subject'} ({subject?.code || ''})</div>
            </div>
          </div>
        </div>

        {canEdit ? (
          <div className="shortcuts">
            Type <kbd>^</kbd> for <b>power/superscript</b> (x²), <kbd>_</kbd> for <b>base/subscript</b> (x₁). Click <b>📷 Scan Notes</b> to transcribe handwritten note photos.
          </div>
        ) : (
          <div className="shortcuts">You have view-only access to this shared note.</div>
        )}

        <div className="sheetbody">
          <div className="page scan-container" style={{ position: 'relative' }}>
            {isScanning && (
              <div className="scan-overlay">
                <div className="scan-laser" />
                <div className="scan-badge">📷 AI is scanning & transcribing note image…</div>
              </div>
            )}

            {selectedImg && (
              <div className="img-popover" style={{ top: popoverPos.top, left: popoverPos.left }}>
                <span>Size:</span>
                <button onClick={() => setImgWidth(25)}>25%</button>
                <button onClick={() => setImgWidth(50)}>50%</button>
                <button onClick={() => setImgWidth(75)}>75%</button>
                <button onClick={() => setImgWidth(100)}>100%</button>
                <button onClick={removeImg} style={{ background: '#d6455c' }}>🗑</button>
              </div>
            )}

            {selectedLink && (
              <div className="img-popover" style={{ top: linkPopoverPos.top, left: linkPopoverPos.left, background: '#1e293b', color: '#fff' }}>
                <span style={{ fontSize: '11px', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#94a3b8' }}>
                  {selectedLink.getAttribute('href')}
                </span>
                <button onClick={() => window.open(selectedLink.getAttribute('href'), '_blank', 'noopener,noreferrer')} style={{ background: '#2563eb', color: '#fff', fontWeight: 600 }}>
                  Open ↗
                </button>
                <button onClick={() => { navigator.clipboard.writeText(selectedLink.getAttribute('href')); flash('Copied link to clipboard!'); }}>
                  Copy
                </button>
                {canEdit && (
                  <button onClick={() => { selectedLink.replaceWith(document.createTextNode(selectedLink.innerText)); setSelectedLink(null); saveLocalDraft(); }} style={{ background: '#dc2626', color: '#fff' }}>
                    Unlink
                  </button>
                )}
              </div>
            )}

            <div
              ref={ref}
              className={`paper ${isGraphPaper ? 'graph' : ''}`}
              contentEditable={canEdit && !isScanning}
              suppressContentEditableWarning
              spellCheck={false}
              onClick={onPaperClick}
              onInput={scheduleCloudAutoSave}
              onKeyDown={onKeyDown}
              onPaste={onPaste}
              data-placeholder="Write your notes here..."
            />
          </div>

          {isOwner && (
            <div className="sharebox">
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <span className="sharelabel">Share note:</span>
                <label className="toggle-wrap" onClick={toggleShareWithFriends}>
                  <div className={`toggle-switch ${shareWithFriends ? 'on' : ''}`}>
                    <div className="toggle-slider" />
                  </div>
                  <span>{shareWithFriends ? 'Shared with Friends (ON)' : 'Share with Friends (OFF)'}</span>
                </label>
              </div>

              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
                <span className="sharelabel">Or get code:</span>
                <button className="btn ghost" onClick={() => share('view')}>Get view code</button>
                <button className="btn ghost" onClick={() => share('edit')}>Get edit code</button>
                {code && (
                  <span className="codepill">
                    {code.value} <small>({code.perm})</small>
                  </span>
                )}
              </div>
            </div>
          )}

          <div className="aizone">
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              {canEdit && (
                <button className="btn accent" onClick={openEnhanceModal} disabled={enhancing || isScanning}>
                  {enhancing ? 'Enhancing…' : '✨ Enhance Writing with AI'}
                </button>
              )}
              <button className="btn ghost" onClick={ai} disabled={busy || isScanning}>
                {busy ? 'Thinking…' : 'Ask AI for doubting questions'}
              </button>
              <button className="btn ghost" style={{ fontSize: '11px' }} onClick={() => setShowKeyModal(true)} title="Set or update Gemini API Key">
                ⚙️ Gemini Key
              </button>
              {canEdit && (
                <button className="btn ghost" style={{ fontSize: '11px' }} onClick={openHistoryModal} title="View & restore past version snapshots">
                  📜 Version History
                </button>
              )}
            </div>

            {status && <div className={`statusline ${status.includes('error') ? 'bad' : ''}`}>{status}</div>}
            {questions && questions.length > 0 && (
              <div className="aiout">
                <h4>Doubting questions to test your understanding</h4>
                <ol>{questions.map((q, i) => <li key={i}>{q}</li>)}</ol>
              </div>
            )}
          </div>
        </div>
      </div>

      {showHistoryModal && (
        <div className="modal-backdrop" onClick={() => setShowHistoryModal(false)}>
          <div className="sheet modal" onClick={(e) => e.stopPropagation()}>
            <div className="modalhead">
              <h3>📜 Version History & Snapshot Recovery</h3>
              <p>Restore any timestamped version of your note saved in browser history.</p>
            </div>
            <div className="sheetbody">
              {versionSnapshots.length === 0 ? (
                <div style={{ fontSize: '13px', color: 'var(--pencil)', padding: '12px 0' }}>
                  No version snapshots captured yet for this note. Snapshots are created automatically while you type.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: '320px', overflowY: 'auto' }}>
                  {versionSnapshots.map((snap, idx) => (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: '#fcfbf7', border: '1px solid var(--paper-line)', borderRadius: '6px' }}>
                      <div>
                        <strong style={{ fontSize: '13px', display: 'block' }}>Version {versionSnapshots.length - idx}: {snap.label}</strong>
                        <span style={{ fontSize: '11px', color: 'var(--pencil)' }}>{snap.chapter || 'Chapter'} • {snap.topic || 'Topic'}</span>
                      </div>
                      <button className="btn primary" style={{ fontSize: '11px', padding: '4px 10px' }} onClick={() => restoreVersionSnapshot(snap)}>
                        Restore Version
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="modalactions" style={{ marginTop: 14 }}>
                <button className="btn ghost" onClick={() => setShowHistoryModal(false)}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showEnhanceModal && (
        <div className="modal-backdrop" onClick={() => setShowEnhanceModal(false)}>
          <div className="sheet modal" onClick={(e) => e.stopPropagation()}>
            <div className="modalhead">
              <h3>✨ AI Note Enhancer & Precision Prompt</h3>
              <p>Give Gemini instructions on how you want your notes enhanced (length, format, or focus).</p>
            </div>
            <div className="sheetbody">
              <div className="fieldrow">
                <label htmlFor="custom-ai-prompt-input">Custom AI Instruction (Optional)</label>
                <input
                  id="custom-ai-prompt-input"
                  name="customAiPrompt"
                  className="field"
                  placeholder='e.g. "Keep it short & concise", "Bullet points only", "Highlight formulas"'
                  autoFocus
                  value={customAiPrompt}
                  onChange={(e) => setCustomAiPrompt(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && runEnhanceWriting()}
                />
              </div>

              <div style={{ margin: '12px 0 16px' }}>
                <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--pencil)', display: 'block', marginBottom: 6 }}>
                  QUICK PRESETS (CLICK TO APPLY):
                </span>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button className="btn ghost" style={{ fontSize: '11px', padding: '3px 8px' }} onClick={() => setCustomAiPrompt('Preserve 100% of all content, sections, and lines without shortening.')}>
                    📚 Full Detail (No Shortening)
                  </button>
                  <button className="btn ghost" style={{ fontSize: '11px', padding: '3px 8px' }} onClick={() => setCustomAiPrompt('Keep it short, concise, and straight to the point.')}>
                    ⚡ Short & Concise
                  </button>
                  <button className="btn ghost" style={{ fontSize: '11px', padding: '3px 8px' }} onClick={() => setCustomAiPrompt('Format strictly as clean bullet points.')}>
                    📌 Bullet Points Only
                  </button>
                  <button className="btn ghost" style={{ fontSize: '11px', padding: '3px 8px' }} onClick={() => setCustomAiPrompt('Highlight all key math formulas and equations.')}>
                    🧮 Focus on Formulas
                  </button>
                  <button className="btn ghost" style={{ fontSize: '11px', padding: '3px 8px' }} onClick={() => setCustomAiPrompt('Format as an exam cheat sheet with key definitions.')}>
                    📝 Exam Cheat Sheet
                  </button>
                </div>
              </div>

              <div className="modalactions">
                <button className="btn ghost" onClick={() => setShowEnhanceModal(false)}>Cancel</button>
                <button className="btn primary" onClick={runEnhanceWriting}>✨ Enhance Note</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showLinkModal && (
        <div className="modal-backdrop" onClick={() => setShowLinkModal(false)}>
          <div className="sheet modal" onClick={(e) => e.stopPropagation()}>
            <div className="modalhead">
              <h3>🔗 Attach External Study Link</h3>
              <p>Add Google Drive PDFs, lecture video URLs, textbook links, or reference sites to your note.</p>
            </div>
            <div className="sheetbody">
              <div className="fieldrow">
                <label htmlFor="link-url-input">Resource / PDF Web URL *</label>
                <input
                  id="link-url-input"
                  name="linkUrl"
                  className="field"
                  placeholder="https://drive.google.com/file/d/... or https://university.edu/paper.pdf"
                  autoFocus
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                />
              </div>
              <div className="fieldrow">
                <label htmlFor="link-title-input">Display Label / Title (Optional)</label>
                <input
                  id="link-title-input"
                  name="linkTitle"
                  className="field"
                  placeholder="e.g. Unit 3 Reference Syllabus PDF"
                  value={linkTitle}
                  onChange={(e) => setLinkTitle(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && insertExternalLink()}
                />
              </div>
              <div className="modalactions">
                <button className="btn ghost" onClick={() => setShowLinkModal(false)}>Cancel</button>
                <button className="btn primary" onClick={insertExternalLink}>Attach Link</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showKeyModal && (
        <div className="modal-backdrop" onClick={() => setShowKeyModal(false)}>
          <div className="sheet modal" onClick={(e) => e.stopPropagation()}>
            <div className="modalhead">
              <h3>⚙️ Enter Gemini API Key</h3>
              <p>Set your free Gemini API key to enable AI Writing Enhancer, AI Note Scanner, and Doubting Questions.</p>
            </div>
            <div className="sheetbody">
              <div className="fieldrow">
                <label htmlFor="gemini-key-input">Gemini API Key *</label>
                <input
                  id="gemini-key-input"
                  name="geminiKey"
                  type="password"
                  className="field"
                  placeholder="AIzaSy..."
                  autoFocus
                  value={geminiKeyInput}
                  onChange={(e) => setGeminiKeyInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && saveGeminiKey()}
                />
              </div>
              <div style={{ margin: '8px 0 16px', fontSize: '12px' }}>
                <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--ink)', fontWeight: 600 }}>
                  Need a key? Get a free API Key from Google AI Studio ↗
                </a>
              </div>
              <div className="modalactions">
                <button className="btn ghost" onClick={() => setShowKeyModal(false)}>Cancel</button>
                <button className="btn primary" onClick={saveGeminiKey}>Save Key</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
