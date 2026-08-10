// OPTIONAL morning digest: emails the day's NEW listings via Resend.
//
// PRIVACY: recipient addresses live ONLY in the DIGEST_BCC GitHub secret —
// never in this public repo. Nobody's email is ever committed. If DIGEST_BCC
// is unset, this step no-ops and the board works exactly as normal; fellows
// just visit the site, which requires no signup and collects nothing.
//
// To enable: add repo secrets
//   RESEND_API_KEY  — from resend.com
//   DIGEST_FROM     — e.g. "Ember Jobs <jobs@yourdomain.com>"
//   DIGEST_BCC      — comma-separated recipients
//   SITE_URL        — optional link back to the board

import { readFileSync } from "node:fs";
import { CITIES, ROLES } from "./config.js";

const JOBS_PATH = new URL("../site/jobs.json", import.meta.url);

function jobRow(j) {
  return `<tr>
    <td style="padding:10px 0;border-bottom:1px solid #DFDEDA">
      <div style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#E8501F;font-family:monospace">${j.role} · ${CITIES[j.cityId]?.label || ""}</div>
      <div style="font-size:16px;font-weight:700;margin:2px 0">${j.title}</div>
      <div style="font-size:13px">${j.company}${j.salary ? " · " + j.salary : ""}</div>
      <a href="${j.url}" style="font-size:13px;color:#E8501F">Apply on ${j.source} →</a>
    </td>
  </tr>`;
}

async function main() {
  const { RESEND_API_KEY, DIGEST_FROM, DIGEST_BCC, SITE_URL } = process.env;

  if (!RESEND_API_KEY || !DIGEST_FROM || !DIGEST_BCC) {
    console.log("· Digest skipped (optional — set RESEND_API_KEY, DIGEST_FROM, DIGEST_BCC to enable)");
    return;
  }

  const recipients = DIGEST_BCC.split(",").map((e) => e.trim()).filter((e) => e.includes("@"));
  if (!recipients.length) {
    console.log("· Digest skipped (DIGEST_BCC contained no valid addresses)");
    return;
  }

  const { jobs, newIds = [] } = JSON.parse(readFileSync(JOBS_PATH));
  const fresh = jobs.filter((j) => newIds.includes(j.id));
  if (!fresh.length) {
    console.log("· Digest skipped (no new jobs today)");
    return;
  }

  const sorted = [...fresh].sort((a, b) => ROLES.indexOf(a.role) - ROLES.indexOf(b.role));
  const html = `
  <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;color:#17161A">
    <div style="font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#E8501F;font-family:monospace">Ember Fellowship</div>
    <h1 style="font-size:24px;margin:4px 0 2px">${fresh.length} new startup role${fresh.length === 1 ? "" : "s"} this morning</h1>
    <p style="color:#6C6A70;font-size:13px;margin:0 0 12px">Fresh postings across Atlanta, Birmingham, Detroit &amp; Baltimore/DC.</p>
    <table style="width:100%;border-collapse:collapse">${sorted.map(jobRow).join("")}</table>
    ${SITE_URL ? `<p style="margin-top:16px"><a href="${SITE_URL}" style="color:#E8501F;font-size:13px">See the full board →</a></p>` : ""}
    <p style="color:#6C6A70;font-size:11px;margin-top:20px">Sent to the Ember Fellowship cohort. Reply to be removed.</p>
  </div>`;

  // BCC keeps every recipient's address hidden from the others.
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
    body: JSON.stringify({
      from: DIGEST_FROM,
      to: DIGEST_FROM.match(/<(.+)>/)?.[1] || DIGEST_FROM,
      bcc: recipients,
      subject: `Ember Jobs — ${fresh.length} new startup role${fresh.length === 1 ? "" : "s"} · ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
      html,
    }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
  console.log(`✓ Digest sent to ${recipients.length} recipients (${fresh.length} new jobs)`);
}

main().catch((err) => { console.error(err); process.exit(1); });
