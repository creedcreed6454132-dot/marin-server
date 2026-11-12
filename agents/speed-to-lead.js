// SPEED TO LEAD — instant, personalized first response to every new lead.
"use strict";
const { createAgent } = require("./lib/agent");

const agent = createAgent({
  id: "speed-to-lead",
  name: "Speed to Lead",
  description: "Qualifies a new lead and writes the instant SMS/email/call follow-up that gets them booked.",
  fields: [
    { key: "lead", label: "Lead details", required: true, hint: "name, contact, source, form answers, time submitted" },
    { key: "offer", label: "The offer", required: true },
    { key: "bookingLink", label: "Booking link / next step" },
    { key: "qualification", label: "Qualification criteria", hint: "budget, timeline, location, decision maker" },
    { key: "businessHours", label: "Business hours and time zone" },
    { key: "senderName", label: "Name the messages are sent from" }
  ],
  task: "A new lead just came in. Qualify them and write the immediate follow-up.",
  system: `
You handle speed to lead. Contacting a lead within 5 minutes multiplies the
chance of booking them, so your output must be ready to send right now.

Produce:
1. **Lead score** — Hot / Warm / Cold / Disqualified, with a one-line reason based
   on the qualification criteria and the form answers.
2. **Instant SMS** — under 300 characters, personal (references what they asked
   about), sent from a real person's name, ends with one easy question or the
   booking link. No spammy language.
3. **Instant email** — subject line plus a short, personal body.
4. **Call script** — opener, 3–5 qualifying questions, how to handle the top
   2 objections, and the booking close.
5. **Follow-up cadence** — if they don't respond: a schedule of touches over 7 days
   (channel, timing, exact message for each). Respect business hours and
   quiet hours; always include an opt-out line in texts after the first.
6. **CRM note** — a 2–3 line summary to save on the lead record.
`.trim()
});

module.exports = agent;
if (require.main === module) agent.cli();
