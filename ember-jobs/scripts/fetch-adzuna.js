// Adzuna aggregator — casts a wide net across each metro so the board isn't
// limited to the curated company list. Free tier: https://developer.adzuna.com
// Requires env vars: ADZUNA_APP_ID, ADZUNA_APP_KEY (skipped gracefully if absent).

import { CITIES, MAX_AGE_DAYS } from "./config.js";

const QUERY = "startup"; // bias results toward startup roles; tune freely

export async function fetchAdzunaJobs() {
  const { ADZUNA_APP_ID, ADZUNA_APP_KEY } = process.env;
  if (!ADZUNA_APP_ID || !ADZUNA_APP_KEY) {
    console.log("· Adzuna skipped (set ADZUNA_APP_ID / ADZUNA_APP_KEY to enable)");
    return [];
  }

  const jobs = [];
  for (const [cityId, city] of Object.entries(CITIES)) {
    const url =
      `https://api.adzuna.com/v1/api/jobs/us/search/1` +
      `?app_id=${ADZUNA_APP_ID}&app_key=${ADZUNA_APP_KEY}` +
      `&results_per_page=25&what=${encodeURIComponent(QUERY)}` +
      `&where=${encodeURIComponent(city.adzunaWhere)}&distance=25` +
      `&max_days_old=${MAX_AGE_DAYS}&sort_by=date&content-type=application/json`;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      for (const j of data.results || []) {
        jobs.push({
          id: `az-${j.id}`,
          title: j.title?.replace(/<[^>]+>/g, ""),
          company: j.company?.display_name || "Unknown",
          cityId,
          location: j.location?.display_name || "",
          url: j.redirect_url,
          postedAt: j.created || null,
          source: "Adzuna",
          salary:
            j.salary_min && j.salary_max
              ? `$${Math.round(j.salary_min / 1000)}k–$${Math.round(j.salary_max / 1000)}k`
              : "",
          description: (j.description || "").slice(0, 400),
        });
      }
    } catch (err) {
      console.warn(`⚠ Adzuna ${city.label}: ${err.message}`);
    }
  }
  console.log(`✓ Adzuna: ${jobs.length} jobs`);
  return jobs;
}
