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
│     • fetch-adzuna.js   wide-net metro search      [ADZUNA_*]  │
│     • fetch-jsearch.js  Google for Jobs via JSearch:           │
│                         LinkedIn/Wellfound/Built In/Indeed     │
│                         listings              [RAPIDAPI_KEY]   │
│                                                                │
│  2. FILTER — merge → dedupe (ATS records beat aggregator       │
│     dupes) → match locations to the 4 metros → hard-drop       │
│     anything older than 21 days                                │
│                                                                │
│  3. ENRICH — only jobs not seen yesterday go to Claude         │
│     (role tag, one-line blurb, early-career flag, filters      │
│     out staffing agencies/non-startups)   [ANTHROPIC_API_KEY]  │
│                                                                │
│  4. PUBLISH — writes site/jobs.json (incl. newIds for the      │
│     digest), commits it → GitHub Pages redeploys the site      │
│                                                                │
│ node scripts/digest.js                                         │
│  5. NOTIFY — emails today's NEW roles to subscribers.json      │
│     via Resend; silent when there's nothing new                │
│     [RESEND_API_KEY, DIGEST_FROM]                              │
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
  subscribers.json   Plain array of emails for the morning digest.

scripts/
  config.js          Shared config: city definitions + location matchers
                     (Birmingham requires the ", AL" signal so Birmingham UK
                     never leaks in; DMV covers Baltimore + DC suburbs),
                     freshness windows, role list, and the keyword-fallback
                     classifier used when no Claude key is set.
  fetch-ats.js       Polls each company's public job-board API. Normalizes
                     Greenhouse/Lever/Ashby responses to one job shape and
                     keeps only postings located in a target metro (hybrid
                     roles fall back to the company's home city).
  fetch-adzuna.js    One Adzuna search per metro, capped at 21-day-old
                     posts, sorted by date.
  fetch-jsearch.js   Two queries per metro against JSearch (Google for Jobs),
                     past week only, remote-only listings excluded.
  build.js           The orchestrator (steps 1–4 above). Reuses yesterday's
                     Claude classifications for jobs it has already seen, so
                     enrichment cost stays at pennies. Strips descriptions
                     before publishing so jobs.json stays small.
  enrich.js          Batches new jobs 15 at a time to Claude Haiku for
                     role/blurb/early-career/keep decisions; falls back to
                     the keyword classifier per-batch on any API error.
  digest.js          Builds and BCCs the morning email from jobs.json's
                     newIds. Sends nothing on zero-new-job days.
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
  refresh-jobs.yml       Daily build + digest + commit.
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

5. **Deploy the site.** Settings → Pages → deploy from branch, folder `/site`. The daily Action's commit auto-redeploys it. (Vercel/Netlify: point them at `site/`.)

6. **Personalize:** put fellows' emails in `data/subscribers.json`, and update the "Suggest it here" link in `site/index.html` to your repo's issues page.

## Costs & keys

| Spend | Key(s) | What it unlocks |
|---|---|---|
| $0 | — | ATS polling of your curated list + the full site. Fully functional. |
| $0 | `ADZUNA_APP_ID`, `ADZUNA_APP_KEY` (developer.adzuna.com) | Wide-net metro coverage beyond the curated list |
| ~$10/mo | `RAPIDAPI_KEY` (rapidapi.com → JSearch) | Google for Jobs aggregation — LinkedIn/Wellfound/Built In listings. Biggest coverage win. |
| ~$1–2/mo | `ANTHROPIC_API_KEY` (console.anthropic.com) | Daily enrichment **and** the weekly self-growing company list. Docs: https://docs.claude.com/en/api/overview |
| $0 | `RESEND_API_KEY`, `DIGEST_FROM`, optional `SITE_URL` (resend.com) | Morning email digest of new roles (free tier: 100 emails/day) |
| ~$1/mo (optional) | — | A custom domain pointed at GitHub Pages |

## Daily operation

Nothing. Jobs refresh at 6/7am ET; discovery runs Mondays. Manual refresh anytime: repo → Actions → pick a workflow → **Run workflow**.

## Tuning

- **Freshness window:** `MAX_AGE_DAYS` in `scripts/config.js` (default 21). **NEW badge:** `NEW_BADGE_DAYS` (default 3).
- **Aggregator search terms:** `QUERY` in `fetch-adzuna.js`, `QUERIES` in `fetch-jsearch.js`.
- **Location matching:** `match`/`exclude` lists per city in `config.js`.
- **Digest send time:** the cron in `refresh-jobs.yml` (UTC).
- **Discovery appetite:** `MAX_NEW_PER_RUN` in `discover-companies.js`.

## Honest limitations

- Coverage = `companies.json` + the aggregators. Wellfound and Built In have no clean public APIs; JSearch reaches their Google-indexed listings, and the curated ATS list is how serious niche boards get their best data.
- Greenhouse exposes `updated_at` rather than a strict first-posted date, so a repost can look fresh. Lever and Ashby give true creation/publish dates.
- LLM blurbs and tags are generated; the apply link always goes to the company's real posting, which is the source of truth.
- Discovery only adds companies on Greenhouse/Lever/Ashby — startups on Workday, iCIMS, etc. need manual research or arrive via the aggregators.
