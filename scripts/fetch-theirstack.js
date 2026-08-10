// TheirStack fetcher — the sole aggregator. Docs: theirstack.com/en/docs/api-reference
//
// CREDITS: 1 API credit per job RETURNED. Free tier = 200/month, the $49 plan
// = 1,500/month. This script budgets itself so it can never blow through an
// allowance:
//   • THEIRSTACK_MONTHLY_CREDITS (default 200) sets the budget.
//   • Budget < 1200  → runs WEEKLY, splitting ~1/5 of the budget per run.
//   • Budget ≥ 1200  → runs DAILY, splitting ~1/31 of the budget per run.
//   • Usage + last-run state persists in data/theirstack-usage.json
//     (committed by the workflow) and resets each calendar month.
//   • discovered_at_gte = last run time, so the same job is never paid for
//     twice (TheirStack's own recommended pattern).
//
// UPGRADING LATER: change the THEIRSTACK_MONTHLY_CREDITS secret to 1500.
// Nothing else — the script switches itself to daily pulls.
//
// Requires env var: THEIRSTACK_API_KEY (skipped gracefully if absent).

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { CITIES, MAX_AGE_DAYS, matchCity } from "./config.js";

const STATE_PATH = new URL("../data/theirstack-usage.json", import.meta.url);
const API = "https://api.theirstack.com/v1/jobs/search";

// Server-side filters that keep credits from being spent on non-startup or
// senior roles. Titles here are excluded before jobs are returned (and billed).
const TITLE_EXCLUDES = ["senior", "staff engineer", "principal", "director", "vp", "vice president", "chief", "head of"];

function loadState() {
  const month = new Date().toISOString().slice(0, 7); // "2026-08"
  let state = { month, used: 0, lastRun: null };
  if (existsSync(STATE_PATH)) {
    try {
      const saved = JSON.parse(readFileSync(STATE_PATH));
      if (saved.month === month) state = saved; // new month → fresh budget
    } catch {}
  }
  return state;
}

export async function fetchTheirstackJobs() {
  const key = process.env.THEIRSTACK_API_KEY;
  if (!key) {
    console.log("· TheirStack skipped (set THEIRSTACK_API_KEY to enable)");
    return [];
  }

  const budget = parseInt(process.env.THEIRSTACK_MONTHLY_CREDITS || "200", 10);
  const daily = budget >= 1200;
  const state = loadState();

  // Cadence gate: free tier pulls weekly, paid pulls daily.
  const daysSinceRun = state.lastRun ? (Date.now() - new Date(state.lastRun)) / 864e5 : Infinity;
  const interval = daily ? 0.9 : 6.5; // slight slack so a late cron still runs
  if (daysSinceRun < interval) {
    console.log(`· TheirStack skipped (next pull in ~${Math.ceil(interval - daysSinceRun)}d — ${daily ? "daily" : "weekly"} cadence, ${budget - state.used}/${budget} credits left this month)`);
    return [];
  }

  const runsPerMonth = daily ? 31 : 5;
  const remaining = Math.max(0, budget - state.used);
  const perRun = Math.min(Math.floor(budget / runsPerMonth), remaining);
  const perCity = Math.floor(perRun / Object.keys(CITIES).length);
  if (perCity < 1) {
    console.log(`· TheirStack skipped (monthly credit budget exhausted: ${state.used}/${budget})`);
    return [];
  }

  const jobs = [];
  let spent = 0;

  for (const [cityId, city] of Object.entries(CITIES)) {
    try {
      const res = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          posted_at_max_age_days: MAX_AGE_DAYS,
          // Only jobs TheirStack discovered since our last pull — never pay
          // for the same job twice across runs.
          ...(state.lastRun ? { discovered_at_gte: state.lastRun } : {}),
          job_country_code_or: ["US"],
          job_location_pattern_or: city.tsPatterns,
          company_type: "direct_employer",     // no staffing/recruiting agencies
          max_employee_count_or_null: 500,     // startup-sized (unknown sizes kept)
          employment_statuses_or: ["full_time"],
          remote: false,                       // fellowship wants in-city roles
          job_title_not: TITLE_EXCLUDES,       // don't spend credits on senior+ roles
          limit: perCity,
          page: 0,
        }),
      });

      if (res.status === 402) {
        console.warn("⚠ TheirStack: out of credits (402) — stopping for this run");
        break;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);

      const data = await res.json();
      const returned = data.data || [];
      spent += returned.length; // 1 credit per job returned

      for (const j of returned) {
        const loc = j.short_location || j.location || j.long_location || "";
        // Strict local double-check: their location patterns are broad, our
        // matcher is exact (e.g. Birmingham must be the Alabama one). Jobs
        // whose location we can't confirm are dropped — accuracy over volume.
        if (matchCity(loc) !== cityId) continue;
        jobs.push({
          id: `ts-${j.id}`,
          title: j.job_title,
          company: j.company_object?.name || j.company || "Unknown",
          cityId,
          location: loc,
          url: j.final_url || j.url || j.source_url,
          postedAt: j.date_posted || j.discovered_at || null,
          source: "TheirStack",
          salary:
            j.salary_string ||
            (j.min_annual_salary_usd && j.max_annual_salary_usd
              ? `$${Math.round(j.min_annual_salary_usd / 1000)}k–$${Math.round(j.max_annual_salary_usd / 1000)}k`
              : ""),
          description: (j.description || j.company_object?.long_description || "").slice(0, 400),
        });
      }
    } catch (err) {
      console.warn(`⚠ TheirStack ${city.label}: ${err.message}`);
    }
  }

  // Persist spend + run time so the next run budgets correctly.
  writeFileSync(
    STATE_PATH,
    JSON.stringify(
      { month: state.month, used: state.used + spent, lastRun: new Date().toISOString() },
      null,
      2
    )
  );

  console.log(`✓ TheirStack: ${jobs.length} in-city jobs (${spent} credits spent, ${budget - state.used - spent}/${budget} left this month)`);
  return jobs;
}
