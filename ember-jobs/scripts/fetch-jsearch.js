// JSearch (RapidAPI) — aggregates Google for Jobs, which indexes LinkedIn,
// Wellfound, Built In, Indeed, and company career sites. This is the paid
// coverage upgrade (~$10/mo tier is plenty for 4 cities × daily).
// Get a key: rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch
// Requires env var: RAPIDAPI_KEY (skipped gracefully if absent).

import { CITIES } from "./config.js";

const QUERIES = ["startup", "software startup"]; // per-city search terms; tune freely

export async function fetchJsearchJobs() {
  const key = process.env.RAPIDAPI_KEY;
  if (!key) {
    console.log("· JSearch skipped (set RAPIDAPI_KEY to enable)");
    return [];
  }

  const jobs = [];
  for (const [cityId, city] of Object.entries(CITIES)) {
    for (const q of QUERIES) {
      const url =
        `https://jsearch.p.rapidapi.com/search?query=${encodeURIComponent(`${q} in ${city.adzunaWhere}`)}` +
        `&page=1&num_pages=1&date_posted=week&country=us`;
      try {
        const res = await fetch(url, {
          headers: { "X-RapidAPI-Key": key, "X-RapidAPI-Host": "jsearch.p.rapidapi.com" },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        for (const j of data.data || []) {
          if (j.job_is_remote) continue; // fellowship wants in-city roles
          jobs.push({
            id: `js-${j.job_id}`,
            title: j.job_title,
            company: j.employer_name || "Unknown",
            cityId,
            location: [j.job_city, j.job_state].filter(Boolean).join(", "),
            url: j.job_apply_link,
            postedAt: j.job_posted_at_datetime_utc || null,
            source: j.job_publisher || "JSearch",
            salary:
              j.job_min_salary && j.job_max_salary
                ? `$${Math.round(j.job_min_salary / 1000)}k–$${Math.round(j.job_max_salary / 1000)}k`
                : "",
            description: (j.job_description || "").slice(0, 400),
          });
        }
      } catch (err) {
        console.warn(`⚠ JSearch ${city.label} "${q}": ${err.message}`);
      }
    }
  }
  console.log(`✓ JSearch: ${jobs.length} jobs`);
  return jobs;
}
