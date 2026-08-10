// Tests every board token in data/companies.json against the live ATS APIs.
// Prints ✓/✗ per company so you can fix or remove dead tokens.
//
// Finding a company's token: open their careers page and look at the job-board
// URL — boards.greenhouse.io/<token>, jobs.lever.co/<token>, jobs.ashbyhq.com/<token>.

import { readFileSync } from "node:fs";

const ENDPOINTS = {
  greenhouse: (t) => `https://boards-api.greenhouse.io/v1/boards/${t}/jobs`,
  lever: (t) => `https://api.lever.co/v0/postings/${t}?mode=json&limit=1`,
  ashby: (t) => `https://api.ashbyhq.com/posting-api/job-board/${t}`,
};

const { companies } = JSON.parse(readFileSync(new URL("../data/companies.json", import.meta.url)));

let ok = 0;
for (const c of companies) {
  if (!c.token || c.token === "REPLACE_ME") {
    console.log(`– ${c.name}: no token set`);
    continue;
  }
  try {
    const res = await fetch(ENDPOINTS[c.ats](c.token));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const n = data.jobs?.length ?? data.length ?? 0;
    console.log(`✓ ${c.name} (${c.ats}/${c.token}) — ${n} open roles`);
    ok++;
  } catch (err) {
    console.log(`✗ ${c.name} (${c.ats}/${c.token}) — ${err.message}  ← fix or remove`);
  }
}
console.log(`\n${ok}/${companies.length} tokens valid`);
