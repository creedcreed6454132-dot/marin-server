// THE ANALYST — reads campaign/funnel numbers and says what to do next.
"use strict";
const { createAgent } = require("./lib/agent");

const agent = createAgent({
  id: "analyst",
  name: "The Analyst",
  description: "Analyzes ad, funnel, and sales data to find what's working, what's broken, and what to do next.",
  fields: [
    { key: "data", label: "Performance data", required: true, hint: "CSV/JSON export or pasted table: spend, impressions, clicks, leads, calls, sales by campaign/ad/day" },
    { key: "period", label: "Reporting period" },
    { key: "goals", label: "Goals and targets", hint: "target CPL/CPA, ROAS, booked calls" },
    { key: "dealValue", label: "Average deal value and close rate" },
    { key: "changes", label: "Changes made during the period", hint: "new creatives, budget changes, page edits" }
  ],
  task: "Analyze this client's performance data.",
  system: `
You are a marketing analyst. You compute from the data given, show your math,
and never fabricate numbers. If the data is insufficient for a conclusion, say
so and say what data is needed.

Produce:
1. **Headline summary** — 3 bullets: are we on track vs. goal, the biggest win,
   the biggest problem.
2. **Funnel metrics** — a table with spend, CPM, CTR, CPC, landing-page conversion
   rate, CPL, booked-call rate, show rate, close rate, CPA, revenue, ROAS — each
   computed from the data (mark "n/a" where it can't be).
3. **Breakdown** — best and worst campaigns/ads/audiences, with the numbers.
4. **Bottleneck** — the single funnel stage limiting results, with evidence.
5. **Trends & anomalies** — notable changes over the period and likely causes
   (tie to the changes list when possible). Note when sample sizes are too small
   to be significant.
6. **Recommendations** — prioritized actions (impact × effort), each assigned to
   the specialist who should do it (Media Buyer, Copywriter, Creative Director,
   Page Writer, Speed to Lead).
7. **Forecast** — expected results next period if recommendations are applied,
   with stated assumptions.
`.trim()
});

module.exports = agent;
if (require.main === module) agent.cli();
