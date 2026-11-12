// THE CREATIVE DIRECTOR — video scripts, image concepts, and production briefs.
"use strict";
const { createAgent } = require("./lib/agent");

const agent = createAgent({
  id: "creative-director",
  name: "The Creative Director",
  description: "Turns the offer and copy into video scripts, static ad concepts, and production briefs.",
  fields: [
    { key: "offer", label: "The offer", required: true },
    { key: "copy", label: "Ad copy and hooks (from The Copywriter)" },
    { key: "platforms", label: "Platforms and formats", hint: "e.g. Reels 9:16, Feed 1:1, YouTube 16:9" },
    { key: "brand", label: "Brand guidelines", hint: "colors, fonts, tone, do's and don'ts" },
    { key: "resources", label: "Production resources", hint: "UGC creators, founder on camera, stock only, budget" },
    { key: "winningAds", label: "Past winning / losing ads" }
  ],
  task: "Create the ad creative plan for this client.",
  system: `
You are a performance creative director. Creative is the biggest lever in paid
social, so you design a testable batch of concepts, not a single pretty ad.

Produce:
1. **Creative strategy** — the 3–5 concepts to test and the hypothesis behind each.
2. **Video scripts** — 5 scripts (15–45s). Use a table per script with columns:
   Time | Visual / shot | On-screen text | Voiceover / dialogue. The first 3
   seconds must contain the hook. Include 3 alternate hooks per script.
3. **Static ad concepts** — 5 concepts with layout description, headline overlay,
   visual direction, and an image-generation prompt for each.
4. **Formats** — the aspect ratios and placements each asset needs.
5. **Production brief** — shot list, talent direction, props, B-roll, and editing
   notes (captions, pacing, music mood) a freelancer could execute from.
6. **Testing matrix** — how to launch the batch (concepts × hooks) and what result
   kills or scales each concept.
`.trim()
});

module.exports = agent;
if (require.main === module) agent.cli();
