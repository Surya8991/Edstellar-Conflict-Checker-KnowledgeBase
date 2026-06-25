# Pre-push Checklist

Run through this list before **every** `git push` to `main`. Five minutes here saves a broken Vercel deploy and a confused team an hour later.

Quick paste-this-in-terminal version at the bottom.

---

## 1. Code health (must pass)

- [ ] `npx tsc --noEmit` exits 0 — no TypeScript errors anywhere.
- [ ] `npx next build` completes — Next's strict build will catch async/await mistakes and `metadata` shape errors that `tsc` misses.
- [ ] Search for accidental `.only` / `.skip` / `console.log` / `debugger` left in changed files. Use:
  ```bash
  git diff --staged | grep -nE "^\+.*(console\.(log|warn|error)|debugger|\.only\(|\.skip\()" || echo "clean"
  ```

## 2. Secrets safety (must pass)

- [ ] `git diff --staged` shows **no** `.env`, `.env.local`, or any file matching `*.pem`, `*.key`, `*credentials*`.
- [ ] No hardcoded `gsk_…` / `sk-…` / `GOCSPX-…` / `npg_…` in staged content. Grep:
  ```bash
  git diff --staged | grep -nE "(gsk_|sk-ant-|sk-proj-|GOCSPX-|npg_)" || echo "clean"
  ```
- [ ] `.env.example` mentions every new `process.env.X` that was introduced. Grep new env reads in the diff and reconcile:
  ```bash
  git diff --staged | grep -oE "process\.env\.[A-Z_]+" | sort -u
  ```

## 3. Docs in sync (highly recommended)

A stale doc is worse than no doc. If your change touched any of these, update accordingly:

| You changed… | Update… |
|---|---|
| Public API (route signatures, response shapes) | [`README.md`](README.md) "How it works" + relevant `docs/*.md` |
| Env vars added/renamed/removed | [`.env.example`](.env.example) + [`SETUP_GUIDE.md`](SETUP_GUIDE.md) + [`VERCEL_GITHUB_GUIDE.md`](VERCEL_GITHUB_GUIDE.md) |
| Cron schedule / cron count | [`vercel.json`](vercel.json) + `VERCEL_GITHUB_GUIDE.{md,html}` §3 |
| New dependency | `package.json` + `package-lock.json` committed, no `npm install` only-on-disk |
| New script in `scripts/` | README repo-layout block + `docs/data-sources.md` |
| Schema (`drizzle/*.sql` or `lib/db/schema.ts`) | Migration file numbered correctly + `docs/data-sources.md` storage table |
| Anything user-visible | `PROJECTLOG.md` — append a one-line batch entry to the current session |

## 4. Vercel will be happy

- [ ] Any new runtime dep that uses native bindings (loads `.node`, `.so`, `.dll`) is in `serverExternalPackages` in `next.config.ts` AND included in `outputFileTracingIncludes` if it ships platform-specific binaries. (See `next.config.ts` for the pattern — `@xenova/transformers` + `onnxruntime-node` are the existing examples.)
- [ ] Any new runtime `readFileSync(...)` with a dynamic path (e.g. `join(process.cwd(), …)`) → the file's directory must be in `outputFileTracingIncludes['/*']`.
- [ ] Any new route hitting an external API (LLM, GSC, Serper) has explicit `export const maxDuration = N` and `export const runtime = "nodejs"`.
- [ ] Any new env var is documented in `.env.example` AND you've added it to Vercel → Settings → Environment Variables for **Production** (and likely Preview + Development).
- [ ] Any new cron entry in `vercel.json` doesn't push the total above the plan limit (Hobby = 2 crons, daily; Pro = unlimited).

## 5. GitHub will be happy

- [ ] On `main` (or feature branch off `main`), **not** on a detached HEAD.
- [ ] `git pull --rebase origin main` shows no surprises (you're not pushing a stale branch).
- [ ] Commit message: imperative subject (under 72 chars), blank line, body explaining the WHY. No "wip" / "fixes" / "stuff" subjects.
- [ ] No `--force` to `main`. Period.

## 6. End-to-end smoke (recommended for non-trivial changes)

- [ ] `npm run dev` boots without errors.
- [ ] The route(s) you changed actually work: paste a real URL into `/conflict-checker`, or load `/audit`, etc.
- [ ] Spot-check the previous result is unchanged: run a check that should score ~75 and confirm it still scores ~75.
- [ ] After push, watch the Vercel build (~90s). If it fails, fix-forward immediately — don't leave `main` red.

---

## Quick paste version

```bash
# 1. Code health
npx tsc --noEmit && \
  git diff --staged | grep -nE "^\+.*(console\.(log|warn|error)|debugger|\.only\(|\.skip\()" && echo "WARN: debug debris staged" || true

# 2. Secrets
git diff --staged | grep -nE "(gsk_|sk-ant-|sk-proj-|GOCSPX-|npg_)" && echo "ABORT: secret in diff" || echo "secrets clean"
git status --short | grep -E "^\?\?\s+\.env$" && echo "ABORT: .env tracked" || echo ".env ignored"

# 3. New env vars not in .env.example?
new_envs=$(git diff --staged -- '*.ts' '*.tsx' | grep -oE "process\.env\.[A-Z_]+" | sort -u)
for v in $new_envs; do
  name=${v#process.env.}
  grep -q "^$name=" .env.example || echo "WARN: $name not in .env.example"
done

# 4. Vercel build (optional but recommended)
npx next build 2>&1 | tail -5
```

---

## After-push verification

The first 90 seconds after a push to `main`:

- [ ] Vercel Deployments tab → the new build is queued/building.
- [ ] Build goes green. If red, click in → read the log → fix-forward (don't revert blindly).
- [ ] Production URL still serves: `curl -sI https://edstellar-conflict-checker-knowledg.vercel.app/ | head -1` should show `HTTP/1.1 200`.
- [ ] If you changed a public route, test it with curl/browser.
- [ ] If you changed an env var dependency, you may need to **Redeploy** (Vercel doesn't pick up env-var changes automatically).

If any step fails, see [`VERCEL_GITHUB_GUIDE.md`](VERCEL_GITHUB_GUIDE.md) §6 Troubleshooting.
