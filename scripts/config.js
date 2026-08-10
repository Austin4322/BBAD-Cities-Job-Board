// Central config for the Ember Jobs pipeline.

export const CITIES = {
  atl: {
    label: "Atlanta",
    // Substrings matched (case-insensitively) against a job's location string.
    match: ["atlanta", ", ga", "georgia"],
    exclude: ["georgia country", "tbilisi"],
    tsPatterns: ["atlanta"],
  },
  bhm: {
    label: "Birmingham",
    // "Birmingham" alone collides with Birmingham, UK — require the AL signal.
    match: ["birmingham, al", "birmingham, alabama", "birmingham al"],
    exclude: ["united kingdom", ", uk", "england", "west midlands"],
    tsPatterns: ["birmingham.{0,4}al", "birmingham, alabama"],
  },
  det: {
    label: "Detroit",
    match: ["detroit", "ann arbor", "royal oak", "ferndale", ", mi", "michigan"],
    exclude: [],
    tsPatterns: ["detroit", "ann arbor", "royal oak"],
  },
  dmv: {
    label: "Baltimore / DC",
    match: [
      "baltimore",
      "washington, d",
      "washington dc",
      "district of columbia",
      "arlington, va",
      "alexandria, va",
      "bethesda",
      "silver spring",
      "college park",
      ", md",
      "maryland",
    ],
    exclude: ["washington state", "seattle", ", wa"],
    tsPatterns: ["baltimore", "washington.{0,4}dc", "district of columbia", "arlington.{0,4}va", "bethesda", "silver spring"],
  },
};

// Jobs older than this are dropped — the "time relevant" guarantee.
// 30 gives a fuller board; drop to 21 or 14 once you have more companies.
export const MAX_AGE_DAYS = 30;

// Jobs newer than this get a "New" badge on the site.
export const NEW_BADGE_DAYS = 3;

export const ROLES = [
  "Engineering",
  "Product",
  "Design",
  "Growth & Marketing",
  "Sales",
  "Operations",
  "Data",
  "Other",
];

/** Match a free-text location string to one of our cities. Returns cityId or null. */
export function matchCity(location) {
  if (!location) return null;
  const loc = location.toLowerCase();
  for (const [id, city] of Object.entries(CITIES)) {
    if (city.exclude.some((e) => loc.includes(e))) continue;
    if (city.match.some((m) => loc.includes(m))) return id;
  }
  return null;
}

/**
 * Does this location string indicate a remote/distributed role?
 * Many startups HQ'd in our cities post roles as "Remote - US" with no city.
 * Those still matter to a fellow living there, so we keep them, attribute them
 * to the company's home city, and tag them so the board can show/hide them.
 */
export function isRemote(location) {
  return /\b(remote|distributed|anywhere|work from home|wfh)\b/i.test(location || "");
}

/** Cheap keyword fallback for role classification (used when no ANTHROPIC_API_KEY). */
export function heuristicRole(title) {
  const t = (title || "").toLowerCase();
  if (/(engineer|developer|devops|sre|infrastructure|software|security|qa\b)/.test(t)) return "Engineering";
  if (/(product manager|product owner|\bpm\b|product analyst)/.test(t)) return "Product";
  if (/(designer|ux|ui|brand|creative)/.test(t)) return "Design";
  if (/(marketing|growth|content|seo|social|community|demand gen|brand)/.test(t)) return "Growth & Marketing";
  if (/(sales|account executive|\bae\b|\bsdr\b|\bbdr\b|business development|partnerships)/.test(t)) return "Sales";
  if (/(operations|ops\b|chief of staff|people|recruit|talent|hr\b|finance|accounting|legal|support|success)/.test(t)) return "Operations";
  if (/(data|analytics|analyst|machine learning|\bml\b|\bai\b|scientist)/.test(t)) return "Data";
  return "Other";
}

export function daysAgo(iso) {
  if (!iso) return Infinity;
  return (Date.now() - new Date(iso).getTime()) / 86400000;
}
