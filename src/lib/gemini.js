import { supabase } from '../supabaseClient';

function getClientGeminiKey() {
  return localStorage.getItem('margin_gemini_key') || import.meta.env.VITE_GEMINI_API_KEY || '';
}

async function callDirectGemini(parts, apiKey) {
  const key = apiKey || getClientGeminiKey();
  if (!key) return null;
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: { temperature: 0.4, maxOutputTokens: 8192 },
    }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error?.message || `Gemini API returned ${res.status}`);
  return data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';
}

function parseQuestions(raw) {
  const text = raw.replace(/```(?:json)?/gi, '').trim();
  try {
    const arr = JSON.parse(text);
    if (Array.isArray(arr)) return arr.slice(0, 4);
  } catch { /* fall through */ }
  const span = text.match(/\[[\s\S]*\]/);
  if (span) {
    try {
      const arr = JSON.parse(span[0]);
      if (Array.isArray(arr)) return arr.slice(0, 4);
    } catch { /* fall through */ }
  }
  return text
    .split(/\r?\n+/)
    .map((s) => s.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').replace(/^["'\s]+|["',\s]+$/g, '').trim())
    .filter((s) => s.length > 8)
    .slice(0, 4);
}

export async function getDoubtingQuestions(text, subject, chapter, topic) {
  try {
    const { data, error } = await supabase.functions.invoke('doubting-questions', {
      body: { text, subject, chapter, topic, mode: 'doubting' },
    });
    if (!error && data?.questions) return data.questions;
    if (data?.error && !data.error.includes('GEMINI_API_KEY')) throw new Error(data.error);
  } catch {
    /* Fallback to direct client call if Edge function key is missing */
  }

  const clientKey = getClientGeminiKey();
  if (clientKey) {
    const where = [subject, chapter, topic].filter(Boolean).join(' → ') || 'their course';
    const prompt = `A student wrote the notes below for ${where}.\n\nWrite exactly 4 short "doubting questions" that push them past what they actually wrote. One sentence each. Return ONLY a JSON array of 4 strings.\n\nNotes:\n${String(text).slice(0, 12000)}`;
    const raw = await callDirectGemini([{ text: prompt }], clientKey);
    if (raw) return parseQuestions(raw);
  }

  const err = new Error('GEMINI_KEY_REQUIRED');
  err.code = 'GEMINI_KEY_REQUIRED';
  throw err;
}

export async function enhanceWritingNote(text, subject, chapter, topic, customInstruction = '') {
  try {
    const { data, error } = await supabase.functions.invoke('doubting-questions', {
      body: { text, subject, chapter, topic, mode: 'enhance', customInstruction },
    });
    if (!error && data?.enhancedHtml) return data.enhancedHtml;
    if (data?.error && !data.error.includes('GEMINI_API_KEY')) throw new Error(data.error);
  } catch {
    /* Fallback to direct client call */
  }

  const clientKey = getClientGeminiKey();
  if (clientKey) {
    const where = [subject, chapter, topic].filter(Boolean).join(' → ') || 'their course';
    const prompt = `You are a top college professor's writing assistant.\nEnhance these raw notes for ${where} while preserving ALL content, details, and facts:\n1. CRITICAL REQUIREMENT: DO NOT SHORTEN, CONDENSE, OR OMIT ANY SECTIONS. PRESERVE 100% OF ALL CONTENT, EXAMPLES, AND DETAIL LEVEL FROM THE ORIGINAL NOTES UNLESS THE STUDENT EXPLICITLY ASKS TO SHORTEN IT.\n2. Fix typos, spelling, and grammar.\n3. Use clean HTML: <h3> for section headers, <p> for paragraphs, <ul>/<li> for bullet lists, <strong> for emphasis.\n4. If tables are requested or data is tabular, generate clean <table class="ruled-table"><thead><tr><th>Header</th></tr></thead><tbody><tr><td>Data</td></tr></tbody></table>.\n5. If tree diagrams or classifications are requested, generate tree boxes using:\n   <div class="tree-box" contenteditable="true"><div class="tree-title">Tree Title</div><div class="tree-branch">├── Branch 1<br>│   ├── Sub-branch 1.1<br>└── Branch 2</div></div>\n6. Use <sub> for base subscripts (e.g. [N]<sub>10</sub>, [N]<sub>b</sub>) and <sup> for exponents (e.g. 10<sup>1</sup>).\n7. Do NOT add markdown code fences. Return ONLY clean HTML fragments.` +
      (customInstruction ? `\n8. STRICTLY and FULLY follow this specific instruction: "${customInstruction}"` : '') +
      `\n\nNotes:\n${String(text).slice(0, 16000)}`;
    const raw = await callDirectGemini([{ text: prompt }], clientKey);
    if (raw) return raw.replace(/```(?:html)?/gi, '').replace(/```/g, '').trim();
  }

  const err = new Error('GEMINI_KEY_REQUIRED');
  err.code = 'GEMINI_KEY_REQUIRED';
  throw err;
}

export async function scanNoteImage(imageBase64, mimeType, subject, chapter, topic) {
  try {
    const { data, error } = await supabase.functions.invoke('doubting-questions', {
      body: { imageBase64, mimeType, subject, chapter, topic, mode: 'scan' },
    });
    if (!error && data?.scannedHtml) return data.scannedHtml;
    if (data?.error && !data.error.includes('GEMINI_API_KEY')) throw new Error(data.error);
  } catch {
    /* Fallback to direct client call */
  }

  const clientKey = getClientGeminiKey();
  if (clientKey) {
    const where = [subject, chapter, topic].filter(Boolean).join(' → ') || 'their course';
    const prompt = `Transcribe all handwriting from this note page for ${where} into clean HTML fragments (<h3>, <p>, <ul>, <li>, <sup>, <sub>). Fix minor handwriting spelling errors. Return ONLY clean HTML.`;
    const parts = [{ text: prompt }, { inline_data: { mime_type: mimeType, data: imageBase64 } }];
    const raw = await callDirectGemini(parts, clientKey);
    if (raw) return raw.replace(/```(?:html)?/gi, '').replace(/```/g, '').trim();
  }

  const err = new Error('GEMINI_KEY_REQUIRED');
  err.code = 'GEMINI_KEY_REQUIRED';
  throw err;
}
