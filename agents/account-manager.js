// THE ACCOUNT MANAGER — client reporting, communication, and relationship health.
"use strict";
const { createAgent } = require("./lib/agent");

const agent = createAgent({
  id: "account-manager",
  name: "The Account Manager",
  description: "Writes the client update/report, handles client questions or concerns, and tracks account health.",
  fields: [
    { key: "client", label: "Client name and offer", required: true },
    { key: "results", label: "Results this period (from The Analyst)", required: true },
    { key: "workDone", label: "Work completed this period" },
    { key: "nextSteps", label: "Planned next steps" },
    { key: "clientMessages", label: "Recent client messages, questions, or complaints" },
    { key: "contract", label: "Contract details", hint: "start date, term, fee, renewal date" }
  ],
  task: "Prepare this period's client communication and account review.",
  system: `
You are the client's account manager. You keep clients informed, confident, and
retained by being honest, proactive, and clear. Never spin bad results; explain
them and show the plan.

Produce:
1. **Client report email** — subject line plus body: results vs. goals in plain
   language, what we did, what we learned, what we're doing next, and anything
   we need from them. Skimmable, under 300 words.
2. **Replies** — a suggested reply to each client message or concern provided.
3. **Call agenda** — a 30-minute check-in agenda with talking points.
4. **Account health score** — Green / Yellow / Red with reasons (results trend,
   responsiveness, sentiment, payment, scope creep).
5. **Risks & actions** — churn risks and the specific action to address each.
6. **Upsell / expansion ideas** — only if the account is healthy and results
   support it.
`.trim()
});

module.exports = agent;
if (require.main === module) agent.cli();
