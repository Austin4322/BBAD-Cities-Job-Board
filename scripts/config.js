// Central config for the Ember Jobs pipeline.

export const CITIES = {
  atl: {
    label: "Atlanta",
    // Substrings matched (case-insensitively) against a job's location string.
    match: ["atlanta", ", ga", "georgia"],
    exclude: ["georgia country", "tbilisi"],
    tsPatterns: ["atlanta"],
    tsLocationIds: [4180439], // Atlanta (GeoNames)
  },
  bhm: {
    label: "Birmingham",
    // "Birmingham" alone collides with Birmingham, UK — require the AL signal.
    match: ["birmingham, al", "birmingham, alabama", "birmingham al"],
    exclude: ["united kingdom", ", uk", "england", "west midlands"],
    tsPatterns: ["birmingham.{0,4}al", "birmingham, alabama"],
    tsLocationIds: [4049979], // Birmingham, AL (GeoNames)
  },
  det: {
    label: "Detroit",
    match: ["detroit", "ann arbor", "royal oak", "ferndale", ", mi", "michigan"],
    exclude: [],
    tsPatterns: ["detroit", "ann arbor", "royal oak"],
    tsLocationIds: [4990729, 4984247], // Detroit, Ann Arbor (GeoNames)
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
    tsLocationIds: [4347778, 4140963, 4744709], // Baltimore, Washington DC, Arlington VA (GeoNames)
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

/* ── Role relevance ─────────────────────────
   The fellowship audience wants professional startup roles: engineering,
   product, sales/BDR, customer success, ops, analyst, growth, etc. Aggregators
   also carry trades, warehouse, food-service and clinical listings from small
   companies, so titles pass through a blacklist-then-whitelist check. */

// Hard exclusions — manual trades, industrial, facilities, food prep, retail
// floor, clinical, and transport roles. Word-boundary matched.
const TRADE_RE = /\b(welder|welding|fabricator|machinist|mailroom|warehouse|forklift|assembler|production operator|machine operator|driver|courier|delivery|mechanic|electrician|plumber|hvac|janitor|custodian|custodial|housekeep\w*|groundskeeper|landscap\w*|roofer|roofing|carpenter|carpentry|painter|drywall|mason|laborer|lineman|installer|technician|maintenance|dishwasher|cook|chef|barista|bartender|line cook|prep cook|busser|host(?:ess)?|cashier|stocker|security guard|guard|nurse|rn\b|lpn|cna|phlebotom\w*|medical assistant|dental|caregiver|home health|therapist|physician|veterinar\w*|cdl|dock worker|picker|packer|order selector|apprentice|crew member|team member|shift lead(?:er)?)\b/i;

// Professional-role signals — matches every title family in the fellowship's
// examples (analyst, associate, SDR/BDR, engineer, success, ops, PM, growth…).
const PRO_RE = /\b(engineer|developer|analyst|associate|representative|manager|specialist|coordinator|strategist|designer|scientist|consultant|generalist|builder|trainer|marketer|recruiter|product|program|project|operations|success|sales|growth|marketing|partnership\w*|business development|account executive|sdr|bdr|data|finance|financial|investment|grants?|research|community|content|brand|people|talent|chief of staff|founder|counsel|accountant|deployment|revenue|strategy|customer|support|solutions|implementation)\b/i;

/**
 * Is this a fellowship-relevant role?
 * Blacklist always wins. Then: whitelisted titles pass; unrecognized titles
 * pass only in lenient mode (curated companies are pre-vetted startups, so
 * an unusual title there is probably fine; from aggregators, accuracy wins).
 */
export function isFellowshipRole(title, lenient = false) {
  const t = title || "";
  if (TRADE_RE.test(t)) return false;
  if (PRO_RE.test(t)) return true;
  return lenient;
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
