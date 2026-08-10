// Polls the free public job-board APIs of Greenhouse, Lever, and Ashby
// for every company in data/companies.json. No API keys required.
//
// Returns normalized jobs:
// { id, title, company, cityId, location, url, postedAt, source, salary, description }

import { readFileSync } from "node:fs";
import { matchCity, isRemote } from "./config.js";

const UA = { "User-Agent": "ember-jobs-board (fellowship job aggregator)" };

async function getJSON(url) {
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

function stripHtml(html, max = 400) {
  return (html || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

// ── Greenhouse: https://boards-api.greenhouse.io/v1/boards/{token}/jobs ──
async function greenhouse(company) {
  const data = await getJSON(
    `https://boards-api.greenhouse.io/v1/boards/${company.token}/jobs?content=true`
  );
  return (data.jobs || []).map((j) => ({
    id: `gh-${company.token}-${j.id}`,
    title: j.title,
    company: company.name,
    location: j.location?.name || "",
    url: j.absolute_url,
    postedAt: j.updated_at || j.first_published || null,
    source: "Greenhouse",
    salary: "",
    description: stripHtml(j.content),
  }));
}

// ── Lever: https://api.lever.co/v0/postings/{token}?mode=json ──
async function lever(company) {
  const data = await getJSON(`https://api.lever.co/v0/postings/${company.token}?mode=json`);
  return (data || []).map((j) => ({
    id: `lv-${company.token}-${j.id}`,
    title: j.text,
    company: company.name,
    location: j.categories?.location || "",
    url: j.hostedUrl,
    postedAt: j.createdAt ? new Date(j.createdAt).toISOString() : null,
    source: "Lever",
    salary: j.salaryRange
      ? `$${Math.round(j.salaryRange.min / 1000)}k–$${Math.round(j.salaryRange.max / 1000)}k`
      : "",
    description: stripHtml(j.descriptionPlain || j.description),
  }));
}

// ── Ashby: https://api.ashbyhq.com/posting-api/job-board/{token} ──
async function ashby(company) {
  const data = await getJSON(
    `https://api.ashbyhq.com/posting-api/job-board/${company.token}?includeCompensation=true`
  );
  return (data.jobs || []).map((j) => ({
    id: `ab-${company.token}-${j.id}`,
    title: j.title,
    company: company.name,
    location: j.location || "",
    url: j.jobUrl || j.applyUrl,
    postedAt: j.publishedAt || null,
    source: "Ashby",
    salary: j.compensation?.compensationTierSummary || "",
    description: stripHtml(j.descriptionPlain || ""),
  }));
}

const FETCHERS = { greenhouse, lever, ashby };

export async function fetchAtsJobs() {
  const { companies } = JSON.parse(readFileSync(new URL("../data/companies.json", import.meta.url)));
  const jobs = [];
  const failures = [];

  await Promise.allSettled(
    companies
      .filter((c) => c.token && c.token !== "REPLACE_ME")
      .map(async (company) => {
        try {
          const raw = await FETCHERS[company.ats](company);
          for (const job of raw) {
            // Three ways a role at a curated company counts:
            //  1. It names one of our metros outright.
            //  2. It's hybrid — assume the company's home city.
            //  3. It's remote at a company based in one of our cities. These
            //     are real opportunities for a fellow living there, so keep
            //     them, attribute to the home city, and flag remote:true so
            //     the board can filter them.
            const named = matchCity(job.location);
            const remote = isRemote(job.location);
            const cityId =
              named || (remote || /hybrid/i.test(job.location) || !job.location ? company.city : null);
            if (cityId) jobs.push({ ...job, cityId, remote: remote && !named });
          }
        } catch (err) {
          failures.push(`${company.name} (${company.ats}/${company.token}): ${err.message}`);
        }
      })
  );

  if (failures.length) {
    console.warn(`⚠ ATS fetch failures (${failures.length}):\n  ` + failures.join("\n  "));
    console.warn("  Run `npm run validate` to check board tokens.");
  }
  console.log(`✓ ATS pollers: ${jobs.length} in-city jobs`);
  return jobs;
}
