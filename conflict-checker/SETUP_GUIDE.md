# Conflict Checker — Step-by-Step Setup Guide

Follow these steps in order. Each step says **what to do**, **where to click**, and **what to paste into `.env`**.

Your `.env` file lives at:
`C:\Users\E-Learning(Ranjith)\Desktop\Conflict Checker\conflict-checker\.env`

Already done ✅ — `GROQ_API_KEY` is set.

---

## STEP 1 — Neon Database (REQUIRED, ~3 min)

Without this, nothing gets saved and the Conflict Checker can't compare against existing pages.

1. Open https://console.neon.tech/signup
2. Sign up with Google (use **marketing@edstellar.com**) — free tier is fine.
3. After login, click **"Create a project"**.
   - Project name: `conflict-checker`
   - Postgres version: keep default (17)
   - Region: pick closest to you (Asia Pacific = Singapore/Mumbai)
   - Click **Create**.
4. On the project dashboard you'll see a box titled **"Connection string"**.
   - Make sure **"Pooled connection"** is selected (toggle on the right).
   - Click the **copy** icon.
   - It looks like: `postgresql://neondb_owner:xxx@ep-xxx-pooler.region.aws.neon.tech/neondb?sslmode=require`
5. Open `.env` and paste it after `DATABASE_URL=`:
   ```
   DATABASE_URL=postgresql://neondb_owner:...
   ```
6. Save the file.
7. Tell me **"Neon done"** — I'll run `npm run db:setup` to enable pgvector and create the tables, then start ingesting your 2,478 sitemap URLs.

---

## STEP 2 — Google Search Console OAuth (for the GSC tab, ~5 min)

Only needed if you want the Search Console dashboard. Skip if you only care about conflict checking for now.

1. Open https://console.cloud.google.com/
2. Sign in with the Google account that owns Search Console for edstellar.com.
3. Top bar → click the project dropdown → **"New Project"**.
   - Name: `conflict-checker`
   - Click **Create**, then select it in the dropdown.
4. In the left menu / search bar, go to **"APIs & Services" → "Library"**.
   Direct link: https://console.cloud.google.com/apis/library
5. Search for **"Google Search Console API"** → click it → **Enable**.
6. Go to **"APIs & Services" → "OAuth consent screen"**.
   Direct link: https://console.cloud.google.com/apis/credentials/consent
   - User type: **External** → Create.
   - App name: `Conflict Checker`
   - User support email: marketing@edstellar.com
   - Developer contact: marketing@edstellar.com
   - Click **Save and Continue** through Scopes (skip), Test Users:
     - Add `marketing@edstellar.com` as a test user.
   - Save and Continue → Back to Dashboard.
7. Go to **"APIs & Services" → "Credentials"**.
   Direct link: https://console.cloud.google.com/apis/credentials
   - Click **"+ Create Credentials"** → **"OAuth client ID"**.
   - Application type: **Web application**
   - Name: `Conflict Checker Local`
   - **Authorized redirect URIs** → Add URI:
     ```
     http://localhost:3000/api/gsc/callback
     ```
   - Click **Create**.
8. A popup shows **Client ID** and **Client Secret**. Copy both.
9. Paste into `.env`:
   ```
   GOOGLE_CLIENT_ID=xxxxxxxxxx.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxx
   ```
10. Save the file. The "Connect Google" button on the Search Console tab will now work.

---

## STEP 3 — Serper (for Competitor Research, ~2 min)

Powers the Competitors tab by running Google searches for a topic. Free tier = 2,500 searches.

1. Open https://serper.dev
2. Click **"Sign up"** → use Google (marketing@edstellar.com).
3. After login, you land on the **Dashboard** — your **API Key** is shown at the top.
4. Click **Copy**.
5. Paste into `.env`:
   ```
   SERPER_API_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```
6. Save.

---

## STEP 4 — (Optional) Claude API for better summaries

You already have Groq (fast, free-ish). Claude is slower but writes higher-quality summaries.

1. Open https://console.anthropic.com/
2. Sign up → **Settings → API Keys** → **Create Key**.
3. Copy the key (starts with `sk-ant-`).
4. Paste into `.env`:
   ```
   ANTHROPIC_API_KEY=sk-ant-...
   ```
5. To actually use Claude instead of Groq, also change:
   ```
   AI_CHAT_PROVIDER=claude
   ```

---

## STEP 5 — (Skip for now) OpenAI

The codebase has OpenAI adapters wired up but inactive. When you get a key later:

1. Get key at https://platform.openai.com/api-keys
2. Paste into `.env`:
   ```
   OPENAI_API_KEY=sk-...
   AI_EMBED_PROVIDER=openai
   ```
3. Ask me to run the re-embed migration (switches vectors from 384-dim local → 1536-dim OpenAI).

---

## After Each Step

The dev server **auto-reloads `.env`** — no restart needed. Just save the file.

If you ever need to restart it manually:
- Stop: Ctrl+C in the dev terminal
- Start: `cd conflict-checker && npm run dev`

---

## Quick Priority

| Want to use… | Minimum required |
|---|---|
| Just paste a topic and see a summary | ✅ Already done (Groq key) |
| Conflict scoring against Edstellar pages | **Step 1** (Neon) |
| Search Console dashboard | **Steps 1 + 2** |
| Competitor research | **Steps 1 + 3** |
| Everything | Steps 1, 2, 3 |

**Start with Step 1.** Tell me "Neon done" when the connection string is in `.env` and I'll take it from there.
