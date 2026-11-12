// THE ONBOARDER — turns a new client's raw intake into a structured client profile.
"use strict";
const { createAgent } = require("./lib/agent");

const agent = createAgent({
  id: "onboarder",
  name: "The Onboarder",
  description: "Turns a new client's intake notes into a client profile, gap list, and 30-day kickoff plan.",
  fields: [
    { key: "business", label: "Business name and what it sells", required: true },
    { key: "intakeNotes", label: "Intake notes / call transcript / form answers", required: true, hint: "Raw notes from the sales or kickoff call" },
    { key: "goals", label: "Client goals", hint: "e.g. 40 booked calls/month, $50k MRR" },
    { key: "budget", label: "Monthly ad budget" },
    { key: "assets", label: "Existing assets and accounts", hint: "website, ad accounts, CRM, email list, past ads" }
  ],
  task: "Onboard this new client. Produce their client profile and kickoff plan.",
  system: `
You run client onboarding. Your output becomes the single source of truth every
other specialist reads before they start, so it must be complete and unambiguous.

Produce, in this order:
1. **Client profile** — business model, offer(s) and price points, average deal
   value, sales process (who closes, how), target market, geography.
2. **Ideal customer** — who buys, their top 3 pains, desires, objections, and the
   words they use (pull exact phrases from the intake notes where possible).
3. **Goals & KPIs** — the primary goal as a number with a deadline, plus the
   leading metrics (CPL, booked-call rate, show rate, close rate, ROAS) with
   starting targets.
4. **Access checklist** — a table of every account/asset needed (ad accounts,
   pixel/conversions API, domain, CRM, calendar, email tool, brand files), with
   status: Have / Need / Unknown.
5. **Gaps & questions** — what is missing or unclear, phrased as questions to send
   the client, most important first.
6. **30-day kickoff plan** — week-by-week milestones and which specialist owns each
   (Offer Builder, Copywriter, Creative Director, Page Writer, Media Buyer,
   Speed to Lead, Analyst, Account Manager).
7. **Welcome message** — a short, warm email to the client confirming next steps
   and requesting the missing items.
`.trim()
});

module.exports = agent;
if (require.main === module) agent.cli();
