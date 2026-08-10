// Enrichment layer: uses the Claude API to classify each job's role type,
// write a one-line blurb, flag early-career-friendly roles, and filter out
// obvious non-startups from aggregator results (staffing agencies, F500s).
//
// Requires env var ANTHROPIC_API_KEY. Without it, falls back to keyword
// heuristics — the board still works, just with plainer metadata.
//
// API reference: https://docs.claude.com/en/api/overview

import { ROLES, heuristicRole } from "./config.js";

const MODEL = "claude-haiku-4-5-20251001"; // fast + cheap; fine for classification
const BATCH = 15;

async function classifyBatch(batch, apiKey) {
  const list = batch
    .map(
      (j, i) =>
        `${i}. title="${j.title}" company="${j.company}" source="${j.source}" desc="${(j.description || "").slice(0, 200)}"`
    )
    .join("\n");

  const prompt = `You are classifying job postings for a startup-fellowship job board (early-career audience, startup roles only).

For each numbered job below, return a JSON array (same order, same length, no markdown fences) of objects:
- "role": one of ${JSON.stringify(ROLES)}
- "blurb": ≤15 words describing the company/role plainly (no hype)
- "earlyCareer": true if plausibly open to 0–4 yrs experience (not Senior/Staff/Director/VP)
- "keep": false if (a) clearly not a startup job: staffing/recruiting agencies, franchises, Fortune-500s, gig work, spammy listings; OR (b) not a professional/business/technical role relevant to a startup-fellowship audience — exclude manual trades (welder, machinist), warehouse/logistics floor work, food prep, retail floor, clinical care, and facilities roles. Professional roles of ALL kinds pass: engineering, product, design, sales/SDR/BDR, customer success, support, ops, analyst, finance, grants, program/GM/management roles. When unsure, true.

Jobs:
${list}

Respond with ONLY the JSON array.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Claude API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = (data.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");
  const clean = text.replace(/```json|```/g, "").trim();
  const start = clean.indexOf("[");
  const end = clean.lastIndexOf("]");
  return JSON.parse(clean.slice(start, end + 1));
}

export async function enrichJobs(jobs) {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    console.log("· Claude enrichment skipped (set ANTHROPIC_API_KEY to enable) — using heuristics");
    return jobs.map((j) => ({
      ...j,
      role: heuristicRole(j.title),
      blurb: "",
      earlyCareer: !/senior|staff|principal|director|vp\b|head of|chief/i.test(j.title),
    }));
  }

  const enriched = [];
  for (let i = 0; i < jobs.length; i += BATCH) {
    const batch = jobs.slice(i, i + BATCH);
    try {
      const results = await classifyBatch(batch, apiKey);
      batch.forEach((job, k) => {
        const r = results[k] || {};
        if (r.keep === false) return; // filtered out as non-startup
        enriched.push({
          ...job,
          role: ROLES.includes(r.role) ? r.role : heuristicRole(job.title),
          blurb: typeof r.blurb === "string" ? r.blurb : "",
          earlyCareer: r.earlyCareer !== false,
        });
      });
    } catch (err) {
      console.warn(`⚠ Enrichment batch failed (${err.message}) — keeping batch with heuristics`);
      batch.forEach((job) =>
        enriched.push({
          ...job,
          role: heuristicRole(job.title),
          blurb: "",
          earlyCareer: !/senior|staff|principal|director|vp\b|head of|chief/i.test(job.title),
        })
      );
    }
  }
  console.log(`✓ Enrichment: ${enriched.length}/${jobs.length} jobs kept`);
  return enriched;
}
