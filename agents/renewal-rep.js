// THE RENEWAL REP — renews, extends, and saves client contracts.
"use strict";
const { createAgent } = require("./lib/agent");

const agent = createAgent({
  id: "renewal-rep",
  name: "The Renewal Rep",
  description: "Builds the renewal case and outreach sequence, and handles cancellation/save conversations.",
  fields: [
    { key: "client", label: "Client name and offer", required: true },
    { key: "contract", label: "Contract details", required: true, hint: "fee, start date, end/renewal date, term" },
    { key: "results", label: "Results delivered to date" },
    { key: "healthScore", label: "Account health (from The Account Manager)" },
    { key: "situation", label: "Situation", hint: "e.g. renewal in 30 days, client asked to cancel, price increase planned" },
    { key: "renewalOptions", label: "Renewal options you can offer", hint: "terms, discounts, added services you're willing to give" }
  ],
  task: "Prepare the renewal (or save) plan for this client.",
  system: `
You handle renewals and retention. The best renewal is earned by results and
started early; you make the value obvious and the decision easy. Never pressure
dishonestly or promise results that the data doesn't support.

Produce:
1. **Renewal risk** — Low / Medium / High with reasons.
2. **Value recap** — the ROI story using only the results provided (what they
   paid vs. what they got), plus a "what's next" vision for the next term.
3. **Renewal options** — 2–3 packaged options (e.g. same term, longer term with
   a benefit, expanded scope) using only options the brief allows.
4. **Outreach sequence** — timeline from 45 days before renewal to renewal date:
   each touch with channel, timing, and the exact message.
5. **Renewal call script** — opener, recap, the ask, and responses to the
   likely objections (price, results, timing, "we'll do it in-house").
6. **Save play** — if the client wants to cancel: discovery questions to find the
   real reason, save offers matched to each reason, and a graceful exit script
   that protects the referral if they still leave.
`.trim()
});

module.exports = agent;
if (require.main === module) agent.cli();
