// Orchestrates the daily build:
//   ATS pollers + Adzuna  →  merge  →  dedupe  →  freshness filter  →
//   Claude enrichment  →  site/jobs.json
//
// Run locally:   npm run build
// Runs daily in CI via .github/workflows/refresh-jobs.yml

import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { fetchAtsJobs } from "./fetch-ats.js";
import { fetchTheirstackJobs } from "./fetch-theirstack.js";
import { enrichJobs } from "./enrich.js";
import { MAX_AGE_DAYS, daysAgo, isFellowshipRole } from "./config.js";

const OUT = new URL("../site/jobs.json", import.meta.url);

function dedupe(jobs) {
  const seen = new Map();
  for (const j of jobs) {
    // Prefer direct ATS records (canonical URLs) over aggregator dupes.
    const key = `${j.company}|${j.title}`.toLowerCase().replace(/\s+/g, " ");
    const existing = seen.get(key);
    if (!existing || (existing.source === "TheirStack" && j.source !== "TheirStack")) {
      seen.set(key, j);
    }
  }
  return [...seen.values()];
}

async function main() {
  console.log(`Building Ember Jobs — ${new Date().toISOString()}\n`);

  const [ats, theirstack] = await Promise.all([fetchAtsJobs(), fetchTheirstackJobs()]);

  // Carry forward previously fetched TheirStack jobs. TheirStack pulls use
  // discovered_at_gte so a job is only ever returned (and billed) once —
  // meaning past pulls must persist here until they age out. ATS jobs are
  // NOT carried over: their boards are re-fetched in full every build, so a
  // missing job means the role was filled and should drop off.
  let carried = [];
  if (existsSync(OUT)) {
    try {
      const prev = JSON.parse(readFileSync(OUT)).jobs || [];
      carried = prev.filter((j) => j.source === "TheirStack" && daysAgo(j.postedAt) <= MAX_AGE_DAYS);
    } catch {}
  }
  let jobs = dedupe([...ats, ...theirstack, ...carried]);

  // Freshness: hard-drop anything older than MAX_AGE_DAYS or undated aggregator rows.
  const before = jobs.length;
  jobs = jobs.filter((j) => daysAgo(j.postedAt) <= MAX_AGE_DAYS);
  console.log(`✓ Freshness filter (≤${MAX_AGE_DAYS}d): ${jobs.length}/${before} kept`);

  // Role relevance: drop trades/industrial/service titles. Curated ATS
  // companies get lenient treatment (unusual titles pass); aggregator
  // results must positively look like professional startup roles.
  const beforeRel = jobs.length;
  jobs = jobs.filter((j) => isFellowshipRole(j.title, j.source !== "TheirStack"));
  console.log(`✓ Role relevance filter: ${jobs.length}/${beforeRel} kept`);

  // Only enrich jobs we haven't seen before — reuse yesterday's classifications.
  let previous = {};
  if (existsSync(OUT)) {
    try {
      for (const j of JSON.parse(readFileSync(OUT)).jobs || []) previous[j.id] = j;
    } catch {}
  }
  const known = jobs.filter((j) => previous[j.id]).map((j) => ({ ...previous[j.id], ...j, role: previous[j.id].role, blurb: previous[j.id].blurb, earlyCareer: previous[j.id].earlyCareer }));
  const fresh = jobs.filter((j) => !previous[j.id]);
  console.log(`· ${known.length} carried over, ${fresh.length} new to enrich`);

  const enrichedFresh = await enrichJobs(fresh);
  jobs = [...known, ...enrichedFresh]
    .map(({ description, ...j }) => j) // don't ship full descriptions to the client
    .sort((a, b) => new Date(b.postedAt) - new Date(a.postedAt));

  writeFileSync(
    OUT,
    JSON.stringify(
      { updatedAt: new Date().toISOString(), count: jobs.length, newIds: enrichedFresh.map((j) => j.id), jobs },
      null, 2
    )
  );
  console.log(`\n✓ Wrote site/jobs.json — ${jobs.length} jobs`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
