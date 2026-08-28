# Margin — college notes (React PWA + Supabase + Gemini)

A student notes app: notes by subject, share to friends by code, notebook-style
writing with power/base math shortcuts, images, and an AI that asks *doubting
questions* about each note. Works on PC and installs to a phone home screen.

## What's inside
- `src/` — the React app (Vite)
- `supabase/schema.sql` — database tables + security rules
- `supabase/functions/doubting-questions/` — the Gemini edge function (keeps your key server-side)
- `public/` — PWA manifest, service worker, icons

---

## Setup (do these in order)

### 1. Install
```bash
npm install
```

### 2. Make a Supabase project
- Go to supabase.com → New project.
- Project Settings → API → copy the **Project URL** and the **anon public key**.
- Copy `.env.example` to `.env` and paste those two values in.

### 3. Create the database
- Supabase → SQL Editor → New query → paste all of `supabase/schema.sql` → Run.

### 4. Get a Gemini key
- Go to Google AI Studio → get an API key (free tier, no card needed).

### 5. Deploy the AI function
Install the Supabase CLI once (`npm i -g supabase`), then:
```bash
supabase login
supabase link --project-ref YOUR-PROJECT-REF        # ref is in your project URL
supabase secrets set GEMINI_API_KEY=your-gemini-key  # key stays server-side
supabase functions deploy doubting-questions
```

### 6. Run it
```bash
npm run dev
```
Open the printed URL. Create an account, pick a subject, start a note.

> If sign-up asks for email confirmation and that's annoying during testing:
> Supabase → Authentication → Providers → Email → turn **Confirm email** off.

---

## Put it on your phone
Deploy the site (easiest: push to GitHub, import to **Vercel** or **Netlify**,
add the two `VITE_` env vars there, deploy). Open the live URL on your phone →
browser menu → **Add to Home Screen**. It opens fullscreen like a real app and
works offline after the first load.

---

## How the features work
- **Math shortcuts** — in a note, type `^` then a number for a power (x²), `_`
  for a base (x₁). Space ends the mode. A badge shows which mode you're in.
- **Images** — paste a screenshot, or use the 🖼 button.
- **Share by code** — open your note → *Get view code* or *Get edit code* → send
  the code to a friend. They type it into the box on the home screen → the note
  shows under **Shared with me**.
- **AI doubting questions** — write a note, tap the button. Gemini reads *your*
  text and returns 4 questions. They're saved with the note.

## Swapping the AI model
If the AI errors with "model not found", the free model IDs changed. Open
`supabase/functions/doubting-questions/index.ts`, change the `MODEL` line to a
Flash model that currently has a free row in AI Studio, and redeploy the function.

## Known limits (next steps)
- Share codes: any signed-in user who has a code can join. Fine for friends;
  before a public launch, move the join into a security-definer function (noted
  in `schema.sql`).
- Images are stored inline in the note. Fine for a few; for heavy image use,
  switch to Supabase Storage.
- Shapes/drawing (Excalidraw) and full math (fractions, matrices) aren't in yet.
