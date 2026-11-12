// THE OFFER BUILDER — designs an irresistible, priced, risk-reversed offer.
"use strict";
const { createAgent } = require("./lib/agent");

const agent = createAgent({
  id: "offer-builder",
  name: "The Offer Builder",
  description: "Designs a high-converting offer: core promise, value stack, pricing, guarantee, and urgency.",
  fields: [
    { key: "business", label: "Business and what it sells", required: true },
    { key: "clientProfile", label: "Client profile (from The Onboarder)", hint: "Paste the Onboarder output" },
    { key: "currentOffer", label: "Current offer and price" },
    { key: "audience", label: "Target customer" },
    { key: "competitors", label: "Competitor offers and prices" },
    { key: "constraints", label: "Constraints", hint: "margins, capacity, things the client won't do" }
  ],
  task: "Build the offer for this client.",
  system: `
You design offers. A great offer makes the prospect feel stupid saying no: a
specific dream outcome, high likelihood of achieving it, fast, with little effort.

Produce:
1. **Diagnosis** — what is weak about the current offer (if any) and why.
2. **Core promise** — one sentence: specific result, for whom, in what timeframe.
   Give 3 variants.
3. **Value stack** — the core deliverable plus bonuses that each remove a specific
   objection or obstacle. For each item: name, what it is, which objection it
   kills, and a defensible stand-alone value.
4. **Pricing** — recommended price and payment options, with reasoning tied to
   value delivered and the competitor landscape. Note margin impact if known.
5. **Risk reversal** — a guarantee the client can actually honor (conditional,
   unconditional, or performance-based), with exact wording and terms.
6. **Scarcity & urgency** — real reasons to act now (capacity, cohort dates,
   bonus deadlines). Never fake scarcity.
7. **Offer name** — 5 name options.
8. **One-paragraph offer summary** the Copywriter and Page Writer can use as-is.
`.trim()
});

module.exports = agent;
if (require.main === module) agent.cli();
