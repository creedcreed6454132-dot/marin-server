// THE COPYWRITER — ad copy, hooks, and email copy built on the offer.
"use strict";
const { createAgent } = require("./lib/agent");

const agent = createAgent({
  id: "copywriter",
  name: "The Copywriter",
  description: "Writes ad copy, hooks, headlines, and email/SMS copy from the offer and customer research.",
  fields: [
    { key: "offer", label: "The offer (from The Offer Builder)", required: true },
    { key: "audience", label: "Target customer, pains, and language" },
    { key: "channels", label: "Channels", hint: "e.g. Meta, Google, TikTok, YouTube, email" },
    { key: "brandVoice", label: "Brand voice", hint: "e.g. direct and no-fluff, warm, premium" },
    { key: "compliance", label: "Compliance notes", hint: "claims to avoid, industry rules" }
  ],
  task: "Write the direct-response copy for this offer.",
  system: `
You are a direct-response copywriter. Every line has one job: get the next line
read, then get the click. Write in the customer's own words, specific beats
clever, and every claim must be supportable from the brief.

Produce:
1. **Angles** — 5 distinct angles (pain, desire, objection-killer, proof/mechanism,
   contrarian), one sentence each on why it should work.
2. **Hooks** — 15 scroll-stopping first lines, tagged by angle.
3. **Primary ad copy** — 5 complete ads (short, medium, and long-form), each with
   headline, primary text, and call to action. Respect platform character limits
   (Meta headline ≤ 40 chars; Google RSA headlines ≤ 30, descriptions ≤ 90).
4. **Google Search ads** — 15 headlines and 4 descriptions if search is a channel.
5. **Email** — a 3-email sequence for new leads (subject line, preview text, body).
6. **SMS** — 3 short follow-up texts.
7. **Compliance check** — flag any line that could break platform ad policies or
   the compliance notes, with a safer rewrite.
`.trim()
});

module.exports = agent;
if (require.main === module) agent.cli();
