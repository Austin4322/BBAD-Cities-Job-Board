# Ember Jobs

A daily-updated startup job board for the Ember Fellowship cities — Atlanta, Birmingham, Detroit, and Baltimore/DC. Runs on GitHub Actions + a static site: no servers, no database, ~$0–12/month depending on which integrations you switch on.

## How it works

Two scheduled GitHub Actions do all the work:

```
DAILY · 6/7am ET · refresh-jobs.yml
┌────────────────────────────────────────────────────────────────┐
│ npm run build  (scripts/build.js orchestrates)                 │
│                                                                │
│  1. SOURCE — three fetchers run in parallel:                   │
│     • fetch-ats.js      Greenhouse/Lever/Ashby public APIs     │
│                         for every company in companies.json    │
│                         (free, no keys, exact posting dates)   │
│     • fetch-theirstack.js  TheirStack aggregator (352k+       │
│                         sources, deduplicated, startup-        │
│                         filtered). Self-budgets its credits:   │
│                         weekly pulls on the free tier, daily   │
│                         on the paid plan [THEIRSTACK_API_KEY]  │
│                                                                │
│  2. FILTER — merge → dedupe (ATS records beat aggregator       │
│     dupes) → match locations to the 4 metros → hard-drop       │
│     anything older than 30 days                                │
│                                                                │
│  3. ENRICH — only jobs not seen yesterday go to Claude         │
│     (role tag, one-line blurb, early-career flag, filters      │
│     out staffing agencies/non-startups)   [ANTHROPIC_API_KEY]  │
│                                                                │
│  4. PUBLISH — writes site/jobs.json (incl. newIds for the      │
│     digest), commits it → GitHub Pages redeploys the site      │
│                                                                │
│ node scripts/digest.js                                         │
│  5. NOTIFY (optional) — emails today's NEW roles via Resend    │
│     to the DIGEST_BCC secret; silent when nothing is new and   │
│     entirely skipped if unconfigured                           │
│     [RESEND_API_KEY, DIGEST_FROM, DIGEST_BCC]                  │
└────────────────────────────────────────────────────────────────┘

WEEKLY · Mondays · discover-companies.yml
┌────────────────────────────────────────────────────────────────┐
│ npm run discover  (scripts/discover-companies.js)              │
│  Claude + web search finds new startups per city → extracts    │
│  their ATS board tokens → validates each token against the     │
│  live Greenhouse/Lever/Ashby APIs → commits verified boards    │
│  to companies.json; failures go to rejected.json (never        │
│  retried). The curated list grows itself.  [ANTHROPIC_API_KEY] │
└────────────────────────────────────────────────────────────────┘
```

Every integration in [brackets] is optional — each fetcher/step checks for its key and skips gracefully, so the pipeline never breaks as you add or remove keys.

## The files

```
data/
  companies.json     The curated startup list — the board's highest-leverage
                     file. Each entry: { name, city, ats, token }. Grown
                     weekly by the discovery agent; edit freely by hand.
  rejected.json      ATS tokens that failed validation, so discovery never
                     re-suggests them.
  theirstack-usage.json  Auto-managed credit ledger: month, credits used,
                     last pull time. Committed by the daily workflow.

scripts/
  config.js          Shared config: city definitions + location matchers
                     (Birmingham requires the ", AL" signal so Birmingham UK
                     never leaks in; DMV covers Baltimore + DC suburbs),
                     freshness windows, role list, and the keyword-fallback
                     classifier used when no Claude key is set.
  fetch-ats.js       Polls each company's public job-board API. Normalizes
                     Greenhouse/Lever/Ashby responses to one job shape. Keeps
                     a posting if it names a target metro, is hybrid, or is
                     remote at a company based in one of the four cities —
                     remote-first startups post most roles without a city, so
                     excluding them empties the board. Remote roles carry a
                     remote:true flag for filtering.
  fetch-theirstack.js  The aggregator. One query per metro with server-side
                     startup filters (direct employers only, ≤500 employees,
                     full-time, senior+ titles excluded) so credits are never
                     spent on irrelevant jobs. Tracks its own monthly credit
                     budget in data/theirstack-usage.json, uses
                     discovered_at_gte so the same job is never paid for
                     twice, and strictly re-verifies every location locally.
  build.js           The orchestrator (steps 1–4 above). Reuses yesterday's
                     Claude classifications for jobs it has already seen, so
                     enrichment cost stays at pennies. Strips descriptions
                     before publishing so jobs.json stays small.
  enrich.js          Batches new jobs 15 at a time to Claude Haiku for
                     role/blurb/early-career/keep decisions; falls back to
                     the keyword classifier per-batch on any API error.
  digest.js          Optional. BCCs a morning email of jobs.json's newIds to
                     the addresses in the DIGEST_BCC secret. Sends nothing on
                     zero-new-job days; no-ops entirely if unconfigured.
  discover-companies.js  The weekly discovery agent (see diagram). Caps
                     additions at 12/run; only web-search-sourced tokens
                     that pass live validation are ever committed.
  validate-companies.js  `npm run validate` — tests every token in
                     companies.json against the live APIs and prints ✓/✗.

site/
  index.html         The public board: city tabs with counts, role filters,
                     search, early-career toggle, NEW badges (≤3 days),
                     relative post dates. Pure static HTML/JS reading
                     jobs.json — deploy anywhere.
  jobs.json          Generated output (ships with sample data so the site
                     previews before your first build).

.github/workflows/
  refresh-jobs.yml       Daily build + digest + commit + Pages deploy.
  discover-companies.yml Weekly discovery + commit.
```

## Setup (~15 minutes)

1. **Push this folder to a GitHub repo.**

2. **Clean the seed list.** The starter `companies.json` is a best-guess seed — run:
   ```bash
   npm run validate
   ```
   Fix or remove any ✗ tokens (find a company's token in its careers URL: `boards.greenhouse.io/<token>`, `jobs.lever.co/<token>`, `jobs.ashbyhq.com/<token>`). Good hunting grounds: Atlanta Tech Village, Built In ATL/DC, TechBirmingham, TechTown Detroit, Baltimore Tech Hub.

3. **Add repo secrets** (Settings → Secrets and variables → Actions) for whichever integrations you want — see the cost table below. Zero secrets is a working board.

4. **Test locally:**
   ```bash
   npm run build     # full pipeline → site/jobs.json
   npm run serve     # preview at localhost:3000
   npm run discover  # optional: run the discovery agent once by hand
   ```

5. **Deploy the site.** Settings → Pages → set **Source = "GitHub Actions"** (not "Deploy from a branch" — branch deploys only allow `/` or `/docs`, and this site lives in `site/`). The daily workflow builds the data and publishes `site/` to Pages in the same run, so the live board always matches the data just fetched. Delete any other Pages workflow GitHub may have added (e.g. `static.yml`), or the two will fight over deployments. (Vercel/Netlify instead: point them at `site/`.)

6. **Personalize:** update the "Suggest it here" link in `site/index.html` to your repo's issues page. (The email digest is optional — see Privacy below.)

## Costs & keys

| Spend | Key(s) | What it unlocks |
|---|---|---|
| $0 | — | ATS polling of your curated list + the full site. Fully functional. |
| $0 | `THEIRSTACK_API_KEY` (theirstack.com, free tier) | 200 credits/month of aggregator coverage — the script pulls weekly, ~10 fresh startup jobs per city per pull |
| $49/mo when ready | same key + set repo **variable** `THEIRSTACK_MONTHLY_CREDITS` to `1500` | Same source, 7.5x the volume — the script automatically switches to daily pulls. No code changes. |
| ~$1–2/mo | `ANTHROPIC_API_KEY` (console.anthropic.com) | Daily enrichment **and** the weekly self-growing company list. Docs: https://docs.claude.com/en/api/overview |
| $0 | `RESEND_API_KEY`, `DIGEST_FROM`, `DIGEST_BCC`, optional `SITE_URL` (resend.com) | Optional morning email digest of new roles (free tier: 100 emails/day) |
| ~$1/mo (optional) | — | A custom domain pointed at GitHub Pages |

## Privacy & secrets

This repo is public, so nothing sensitive ever lives in a file:

- **API keys** exist only as GitHub Actions secrets — encrypted at rest, injected as environment variables at run time, and auto-masked in logs. The scripts read them via `process.env`. The only file published to the web is `site/jobs.json`, which contains job listings and nothing else. Never paste a key into a file; if you ever do, revoke it at the provider and issue a new one, since public git history is permanent.
- **No one has to hand over an email.** The board requires no signup, no login, and collects no visitor data — fellows just open the URL. There's no analytics or tracking in `index.html`.
- **The digest is opt-in and off by default.** If you do want a morning email, put the recipients in a `DIGEST_BCC` secret (comma-separated) rather than a file — addresses stay out of the repo, and BCC hides every recipient from the others. `data/subscribers.json` is gitignored so a stray local copy can't be committed by accident. Leave `DIGEST_BCC` unset and the digest step simply skips.

## Daily operation

Nothing. Jobs refresh at 6/7am ET; discovery runs Mondays. Manual refresh anytime: repo → Actions → pick a workflow → **Run workflow**.

## Tuning

- **Freshness window:** `MAX_AGE_DAYS` in `scripts/config.js` (default 30 — tighten to 21 or 14 once you have more companies). **NEW badge:** `NEW_BADGE_DAYS` (default 3).
- **Remote roles:** a role posted as "Remote - US" by a company in `companies.json` is kept, attributed to that company's home city, and tagged `remote: true` so the site's "Hide remote" toggle can filter it. To exclude them entirely, remove the `remote` branch in `fetch-ats.js`.
- **Aggregator filters:** `TITLE_EXCLUDES` and the server-side filters (employee cap, employment type) in `fetch-theirstack.js`; location regexes via `tsPatterns` in `config.js`.
- **Credit budget:** repo variable `THEIRSTACK_MONTHLY_CREDITS` (default 200). ≥1200 switches pulls from weekly to daily.
- **Location matching:** `match`/`exclude` lists per city in `config.js`.
- **Digest send time:** the cron in `refresh-jobs.yml` (UTC).
- **Discovery appetite:** `MAX_NEW_PER_RUN` in `discover-companies.js`.

## If the board looks thin

Roles shown = (companies in `companies.json` × their open in-city roles) + TheirStack's weekly pull. With a handful of companies you'll see single digits. In order of impact:

1. **Run discovery** — `npm run discover`, or Actions → "Discover new startups weekly" → Run workflow. Each run adds up to 12 validated companies. Run it a few times.
2. **Add companies by hand** to `data/companies.json` — the fastest single lever. Find a startup's careers page, copy the token from the URL, run `npm run validate`.
3. **Check TheirStack has pulled** — on the free tier it runs weekly, so the first days after setup lean entirely on your curated list. The build log prints its credit balance and next pull time.
4. **Widen the window** — raise `MAX_AGE_DAYS` in `scripts/config.js`.

## Honest limitations

- Coverage = `companies.json` (daily, free, unlimited) + TheirStack (weekly on the free tier). On free credits the aggregator adds ~40 jobs/week; the curated ATS list carries daily freshness until you upgrade.
- Greenhouse exposes `updated_at` rather than a strict first-posted date, so a repost can look fresh. Lever and Ashby give true creation/publish dates.
- LLM blurbs and tags are generated; the apply link always goes to the company's real posting, which is the source of truth.
- Discovery only adds companies on Greenhouse/Lever/Ashby — startups on Workday, iCIMS, etc. need manual research or arrive via the aggregators.
