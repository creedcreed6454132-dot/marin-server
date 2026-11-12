# The 10 AI Agents

Ten separate AI agents, one per job on a growth/marketing team. Each agent is its own file and runs on its own. They all use Claude through the official Anthropic SDK.

| # | Agent | File | What it produces |
|---|-------|------|------------------|
| 1 | The Onboarder | `onboarder.js` | Client profile, ideal customer, KPIs, access checklist, 30-day kickoff plan, welcome email |
| 2 | The Offer Builder | `offer-builder.js` | Core promise, value stack, pricing, guarantee, urgency, offer names |
| 3 | The Copywriter | `copywriter.js` | Angles, hooks, ad copy, Google ads, email + SMS sequences, compliance check |
| 4 | The Creative Director | `creative-director.js` | Video scripts, static ad concepts + image prompts, production brief, test matrix |
| 5 | The Page Writer | `page-writer.js` | Full landing-page copy, form, thank-you page, A/B tests, SEO tags |
| 6 | The Media Buyer | `media-buyer.js` | Unit economics, campaign structure, targeting, budgets, tracking, kill/scale rules |
| 7 | Speed to Lead | `speed-to-lead.js` | Lead score, instant SMS/email, call script, 7-day follow-up cadence, CRM note |
| 8 | The Analyst | `analyst.js` | Funnel metrics, best/worst performers, bottleneck, recommendations, forecast |
| 9 | The Account Manager | `account-manager.js` | Client report email, replies, call agenda, account health score, risks |
| 10 | The Renewal Rep | `renewal-rep.js` | Renewal risk, value recap, renewal options, outreach sequence, save play |

## Setup

```bash
npm install
export ANTHROPIC_API_KEY=sk-ant-...
```

Optional settings: `AGENT_MODEL` (default `claude-opus-5-5`) and `AGENT_EFFORT` (`low` / `medium` / `high` / `xhigh` / `max`, default `high`).

## Running an agent

```bash
# See the brief fields an agent expects
node agents/media-buyer.js --help

# Run with a JSON brief (output streams to the terminal)
node agents/onboarder.js --input agents/examples/onboarder-brief.json

# Save the output to a file
node agents/onboarder.js -i agents/examples/onboarder-brief.json -o agents/output/onboarding.md

# Or give it a plain-text brief
node agents/speed-to-lead.js "New lead: Jane, 555-0100, wants a quote for a roof replacement after hail. Offer: free in-home inspection. Booking link: https://example.com/book"

# npm shortcuts
npm run agent:copywriter -- -i brief.json
```

## Using an agent from code

```js
const copywriter = require("./agents/copywriter");
const result = await copywriter.run({ offer: "...", channels: "Meta, Google" });

// or all of them
const agents = require("./agents");
const report = await agents.analyst.run({ data: csvText, goals: "CPL under $40" });
```

`run(input, { model, effort, maxTokens, onText })` returns the agent's Markdown output.

## Chaining them

The agents are separate, but each one ends its output with a **Handoff** section, and the brief fields are named so one agent's output can go into the next one. The usual order is:

Onboarder → Offer Builder → Copywriter → Creative Director → Page Writer → Media Buyer → (live) Speed to Lead → Analyst → Account Manager → Renewal Rep

For example, pass the Onboarder's output as `clientProfile` to the Offer Builder, and the Offer Builder's output as `offer` to the Copywriter.

## Adding or changing an agent

Every agent is a `createAgent({...})` call in its own file: `system` holds the role instructions, `fields` lists the brief inputs (`required: true` makes one mandatory), and `task` is the instruction sent with the brief. Shared rules and the Claude call live in `lib/agent.js`.
