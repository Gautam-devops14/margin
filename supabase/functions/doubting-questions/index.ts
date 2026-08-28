// Supabase Edge Function: doubting-questions
// Handles mode: 'doubting' | 'enhance' | 'scan'
// GEMINI_API_KEY is read from Supabase secrets and never reaches the browser.

const MODEL = 'gemini-3.6-flash';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-requested-with',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

function parseQuestions(raw: string): string[] {
  const text = raw.replace(/```(?:json)?/gi, '').trim();
  const asArray = (v: unknown): string[] | null =>
    Array.isArray(v) && v.every((x) => typeof x === 'string') ? (v as string[]) : null;

  try {
    const hit = asArray(JSON.parse(text));
    if (hit) return hit;
  } catch { /* fall through */ }

  const span = text.match(/\[[\s\S]*\]/);
  if (span) {
    try {
      const hit = asArray(JSON.parse(span[0]));
      if (hit) return hit;
    } catch { /* fall through */ }
  }

  return text
    .split(/\r?\n+/)
    .map((s) => s.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').replace(/^["'\s]+|["',\s]+$/g, '').trim())
    .filter((s) => s.length > 8);
}

Deno.serve(async (req) => {
  // Return explicit HTTP status 200 for CORS OPTIONS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: cors });
  }
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405);

  try {
    const payload = await req.json().catch(() => ({}));
    const { text, subject, chapter, topic, mode = 'doubting', imageBase64, mimeType = 'image/jpeg', customInstruction = '' } = payload;

    const key = Deno.env.get('GEMINI_API_KEY');
    if (!key) return json({ error: 'GEMINI_API_KEY is not set on the function. Set it via: supabase secrets set GEMINI_API_KEY=your_key' }, 500);

    const where = [subject, chapter, topic].filter(Boolean).join(' → ') || 'their course';

    let parts: unknown[] = [];

    if (mode === 'scan') {
      if (!imageBase64) return json({ error: 'No image provided for scanning' }, 400);

      const prompt =
        `You are a top college AI note scanner and OCR transcription assistant.\n` +
        `Examine this image of a student note page for ${where}.\n` +
        `Transcribe all handwriting, text, headings, formulas, and bullet points into clean, beautifully structured HTML fragments.\n` +
        `1. Use <h3> for section headers, <p> for paragraphs, <ul>/<li> for bullet lists.\n` +
        `2. Preserve math powers with <sup> and bases with <sub>.\n` +
        `3. Fix minor spelling/reading errors caused by messy handwriting.\n` +
        `4. Return ONLY valid clean HTML fragments that can be inserted into a contentEditable note page. Do NOT include markdown code fences or <html>/<body> tags.` +
        (customInstruction ? `\n5. Follow this custom instruction: "${customInstruction}"` : '');

      parts = [
        { text: prompt },
        { inline_data: { mime_type: mimeType, data: imageBase64 } }
      ];
    } else if (mode === 'enhance') {
      const body = String(text ?? '').trim();
      if (body.length < 10) return json({ error: 'Write a bit more first' }, 400);

      const prompt =
        `You are a top college professor's writing assistant.\n` +
        `A student wrote these raw notes for ${where}:\n\n${body.slice(0, 16000)}\n\n` +
        `Enhance these notes while preserving ALL content, details, and facts:\n` +
        `1. CRITICAL REQUIREMENT: DO NOT SHORTEN, CONDENSE, OR OMIT ANY SECTIONS. PRESERVE 100% OF ALL CONTENT, EXAMPLES, AND DETAIL LEVEL FROM THE ORIGINAL NOTES UNLESS THE STUDENT EXPLICITLY ASKS TO SHORTEN IT.\n` +
        `2. Fix typos, spelling mistakes, and grammar.\n` +
        `3. Use clean HTML structure: <h3> for section headers, <p> for paragraphs, <ul>/<li> for bullet lists, <strong> for emphasis.\n` +
        `4. If tables are requested or data is tabular, generate clean <table class="ruled-table"><thead><tr><th>Header</th></tr></thead><tbody><tr><td>Data</td></tr></tbody></table>.\n` +
        `5. If tree diagrams or classifications are requested, generate tree boxes using:\n` +
        `   <div class="tree-box" contenteditable="true"><div class="tree-title">Tree Title</div><div class="tree-branch">├── Branch 1<br>│   ├── Sub-branch 1.1<br>└── Branch 2</div></div>\n` +
        `6. Use <sub> for base subscripts (e.g. [N]<sub>10</sub>, [N]<sub>b</sub>) and <sup> for exponents (e.g. 10<sup>1</sup>).\n` +
        `7. Do NOT add markdown code fences or <html>/<body> tags. Return ONLY valid clean HTML fragments.` +
        (customInstruction ? `\n8. STRICTLY follow this specific student instruction: "${customInstruction}"` : '');

      parts = [{ text: prompt }];
    } else {
      const body = String(text ?? '').trim();
      if (body.length < 10) return json({ error: 'Write a bit more first' }, 400);

      const prompt =
        `A student wrote the notes below for ${where}.\n\n` +
        `Write exactly 4 short "doubting questions" that push them past what they ` +
        `actually wrote: challenge a hidden assumption, probe an edge case ("when ` +
        `does this stop being true?"), ask what they could NOT conclude from these ` +
        `notes, and connect it to a real use. Ask about their specific content, not ` +
        `the topic in general. One sentence each, no preamble.\n\n` +
        `Return ONLY a JSON array of 4 strings.\n\nNotes:\n${body.slice(0, 16000)}`;

      parts = [{ text: prompt }];
    }

    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: { temperature: 0.4, maxOutputTokens: 8192 },
        }),
      },
    );

    const data = await r.json().catch(() => null);

    if (!r.ok) {
      const msg = data?.error?.message || `Gemini returned ${r.status}`;
      return json({ error: msg }, 502);
    }

    const resParts = data?.candidates?.[0]?.content?.parts ?? [];
    const raw = resParts.map((p: { text?: string }) => p?.text ?? '').join('');

    if (!raw.trim()) {
      return json({ error: 'Gemini returned an empty response' }, 502);
    }

    if (mode === 'scan') {
      const cleanHtml = raw.replace(/```(?:html)?/gi, '').replace(/```/g, '').trim();
      return json({ scannedHtml: cleanHtml });
    }

    if (mode === 'enhance') {
      const cleanHtml = raw.replace(/```(?:html)?/gi, '').replace(/```/g, '').trim();
      return json({ enhancedHtml: cleanHtml });
    }

    const questions = parseQuestions(raw).slice(0, 4);
    if (!questions.length) return json({ error: 'Could not parse questions' }, 502);

    return json({ questions });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
