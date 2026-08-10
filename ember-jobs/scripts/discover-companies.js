// Weekly discovery agent: uses Claude with web search to find venture-backed
// startups in each fellowship city, guesses their ATS board tokens, VALIDATES
// each token against the live Greenhouse/Lever/Ashby APIs, and merges only
// verified boards into data/companies.json. Failed guesses go to
// data/rejected.json so they're never retried.
//
// This makes the curated list — the board's biggest quality lever — self-growing.
// Requires: ANTHROPIC_API_KEY. Cost: a few cents per weekly run.
// Run: npm run discover   (also runs Mondays via discover-companies.yml)

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { CITIES } from "./config.js";

const COMPANIES_PATH = new URL("../data/companies.json", import.meta.url);
const REJECTED_PATH = new URL("../data/rejected.json", import.meta.url);
const MAX_NEW_PER_RUN = 12;

const ATS_CHECK = {
  greenhouse: (t) => `https://boards-api.greenhouse.io/v1/boards/${t}/jobs`,
  lever: (t) => `https://api.lever.co/v0/postings/${t}?mode=json&limit=1`,
  ashby: (t) => `https://api.ashbyhq.com/posting-api/job-board/${t}`,
};

async function askClaude(city, knownNames, apiKey) {
  const prompt = `Search the web to find venture-backed or seed/Series-A/B startups headquartered or with major offices in ${city.adzunaWhere} that are actively hiring. Exclude: ${knownNames.join(", ") || "none yet"}.

For each startup, find its careers page and determine which applicant tracking system it uses and the board token:
- Greenhouse → careers URL like boards.greenhouse.io/<token> or job-boards.greenhouse.io/<token>
- Lever → jobs.lever.co/<token>
- Ashby → jobs.ashbyhq.com/<token>

Respond with ONLY a JSON array (no fences, no commentary) of up to 8 objects:
{"name": "...", "ats": "greenhouse"|"lever"|"ashby", "token": "..."}

Only include companies where you actually saw the careers URL in search results — never guess tokens. Skip companies using Workday, iCIMS, or other systems.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
      tools: [{ type: "web_search_20250305", name: "web_search" }],
    }),
  });
  if (!res.ok) throw new Error(`Claude API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
  const clean = text.replace(/```json|```/g, "").trim();
  const s = clean.indexOf("["), e = clean.lastIndexOf("]");
  if (s === -1 || e === -1) return [];
  try { return JSON.parse(clean.slice(s, e + 1)); } catch { return []; }
}

async function validateToken(ats, token) {
  if (!ATS_CHECK[ats]) return false;
  try {
    const res = await fetch(ATS_CHECK[ats](token));
    if (!res.ok) return false;
    const data = await res.json();
    return (data.jobs?.length ?? data.length ?? 0) >= 0; // board exists
  } catch { return false; }
}

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) { console.log("· Discovery skipped (set ANTHROPIC_API_KEY)"); return; }

  const db = JSON.parse(readFileSync(COMPANIES_PATH));
  const rejected = existsSync(REJECTED_PATH) ? JSON.parse(readFileSync(REJECTED_PATH)) : [];
  const knownTokens = new Set(db.companies.map((c) => `${c.ats}/${c.token}`));
  const rejectedTokens = new Set(rejected.map((r) => `${r.ats}/${r.token}`));
  let added = 0;

  for (const [cityId, city] of Object.entries(CITIES)) {
    if (added >= MAX_NEW_PER_RUN) break;
    const knownNames = db.companies.filter((c) => c.city === cityId).map((c) => c.name);
    let candidates = [];
    try {
      candidates = await askClaude(city, knownNames, apiKey);
    } catch (err) {
      console.warn(`⚠ Discovery ${city.label}: ${err.message}`);
      continue;
    }

    for (const c of candidates) {
      if (added >= MAX_NEW_PER_RUN) break;
      if (!c?.name || !c?.ats || !c?.token) continue;
      const token = String(c.token).toLowerCase().replace(/[^a-z0-9_-]/g, "");
      const key = `${c.ats}/${token}`;
      if (knownTokens.has(key) || rejectedTokens.has(key)) continue;

      if (await validateToken(c.ats, token)) {
        db.companies.push({
          name: c.name, city: cityId, ats: c.ats, token,
          verified: true, discoveredAt: new Date().toISOString().slice(0, 10),
        });
        knownTokens.add(key);
        added++;
        console.log(`✓ Added ${c.name} (${key}) → ${city.label}`);
      } else {
        rejected.push({ name: c.name, ats: c.ats, token, reason: "token failed validation" });
        rejectedTokens.add(key);
        console.log(`✗ Rejected ${c.name} (${key})`);
      }
    }
  }

  writeFileSync(COMPANIES_PATH, JSON.stringify(db, null, 2));
  writeFileSync(REJECTED_PATH, JSON.stringify(rejected, null, 2));
  console.log(`\nDiscovery done — ${added} companies added.`);
}

main().catch((err) => { console.error(err); process.exit(1); });
