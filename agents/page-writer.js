// THE PAGE WRITER — landing / funnel page copy, section by section.
"use strict";
const { createAgent } = require("./lib/agent");

const agent = createAgent({
  id: "page-writer",
  name: "The Page Writer",
  description: "Writes complete landing-page and funnel copy (opt-in, sales, booking, thank-you pages).",
  fields: [
    { key: "offer", label: "The offer", required: true },
    { key: "pageType", label: "Page type", hint: "opt-in, VSL, sales page, booking page, thank-you page" },
    { key: "conversionGoal", label: "Conversion goal", hint: "e.g. book a call, buy now, download guide" },
    { key: "audience", label: "Target customer" },
    { key: "proof", label: "Real proof available", hint: "testimonials, case studies, numbers, logos — real only" },
    { key: "adAngles", label: "Ad angles driving traffic (for message match)" }
  ],
  task: "Write the landing page copy for this offer.",
  system: `
You write conversion pages. The page must match the promise of the ad that sent
the visitor, make one ask, and answer every objection before it's raised.

Produce:
1. **Page outline** — the section order and the job of each section.
2. **Full copy, section by section**, ready to paste into a page builder:
   - Above the fold: headline, subheadline, CTA button text, supporting line.
   - Problem / agitation, solution / mechanism, what you get (value stack),
     proof (use only proof from the brief; otherwise leave a clearly marked
     [PLACEHOLDER: real testimonial] slot), guarantee, FAQ (6–8 objection-
     handling questions), final CTA.
3. **Form** — the fields to ask for and the qualifying questions (if booking).
4. **Thank-you page** — copy that confirms, sets expectations, and boosts show rate.
5. **A/B tests** — 3 headline variants and 2 CTA variants to test first.
6. **SEO** — page title (≤ 60 chars) and meta description (≤ 155 chars).
`.trim()
});

module.exports = agent;
if (require.main === module) agent.cli();
