// ============================================================================
// Shared runner for the 10 agency agents. Each agent file only defines its
// role (system prompt + the brief fields it expects); this module handles the
// Claude call and the command-line interface.
//
// Auth: set ANTHROPIC_API_KEY (or log in with `ant auth login`).
// Optional env: AGENT_MODEL (default claude-opus-5-5), AGENT_EFFORT (default high).
// ============================================================================
"use strict";
const fs = require("fs");
const path = require("path");
const Anthropic = require("@anthropic-ai/sdk");

const MODEL = process.env.AGENT_MODEL || "claude-opus-5-5";
const EFFORT = process.env.AGENT_EFFORT || "high";

let client = null;
function getClient() {
  if (!client) client = new Anthropic();
  return client;
}

const SHARED_RULES = `
You are one specialist on an AI marketing/growth team that runs a client's
acquisition and retention end to end. Other specialists handle the other jobs,
so stay inside your own role and hand off cleanly.

Working rules:
- Work only from the brief you are given. If a fact you need is missing, make a
  reasonable assumption, label it "Assumption:", and keep going. Never invent
  testimonials, statistics, results, or client names and present them as real.
- Be concrete and ready to use: real copy, real numbers, real steps, not advice
  about what someone should write later.
- Use Markdown headings and short sections. End with a "Handoff" section listing
  what the next specialist needs from your output.
`.trim();

/** Turn whatever the user passed (object or string) into the user message text. */
function formatBrief(agent, input) {
  if (typeof input === "string") return input.trim();
  const lines = [];
  for (const f of agent.fields) {
    const v = input[f.key];
    if (v === undefined || v === null || v === "") continue;
    lines.push(`## ${f.label}\n${typeof v === "string" ? v : JSON.stringify(v, null, 2)}`);
  }
  // Pass through any extra keys the caller supplied.
  const known = new Set(agent.fields.map(f => f.key));
  for (const [k, v] of Object.entries(input)) {
    if (known.has(k) || v === undefined || v === null || v === "") continue;
    lines.push(`## ${k}\n${typeof v === "string" ? v : JSON.stringify(v, null, 2)}`);
  }
  return lines.join("\n\n");
}

function missingRequired(agent, input) {
  if (typeof input === "string") return input.trim() ? [] : ["brief"];
  return agent.fields.filter(f => f.required && !input[f.key]).map(f => f.key);
}

/**
 * Define an agent. Returns an object with run(input) and cli().
 * @param {{id:string,name:string,description:string,system:string,
 *          fields:{key:string,label:string,required?:boolean,hint?:string}[],
 *          task:string}} def
 */
function createAgent(def) {
  const agent = Object.assign({}, def);

  agent.run = async function run(input, opts = {}) {
    const missing = missingRequired(agent, input);
    if (missing.length) throw new Error(`${agent.name}: missing required field(s): ${missing.join(", ")}`);

    const brief = formatBrief(agent, input);
    const stream = getClient().beta.messages.stream({
      model: opts.model || MODEL,
      max_tokens: opts.maxTokens || 64000,
      thinking: { type: "adaptive" },
      output_config: { effort: opts.effort || EFFORT },
      // On a safety-classifier decline, the API retries on a fallback model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: [
        { type: "text", text: `${SHARED_RULES}\n\n# Your role: ${agent.name}\n\n${agent.system}`, cache_control: { type: "ephemeral" } }
      ],
      messages: [{ role: "user", content: `${agent.task}\n\n# Client brief\n\n${brief}` }]
    });
    if (opts.onText) stream.on("text", opts.onText);
    const msg = await stream.finalMessage();

    if (msg.stop_reason === "refusal") {
      const why = msg.stop_details ? ` (${msg.stop_details.category || "unspecified"})` : "";
      throw new Error(`${agent.name}: request was declined${why}.`);
    }
    const text = msg.content.filter(b => b.type === "text").map(b => b.text).join("");
    if (msg.stop_reason === "max_tokens") return text + "\n\n_[Output truncated at max_tokens.]_";
    return text;
  };

  agent.cli = async function cli(argv = process.argv.slice(2)) {
    const args = parseArgs(argv);
    if (args.help) return printHelp(agent);

    let input;
    if (args.input) input = JSON.parse(fs.readFileSync(path.resolve(args.input), "utf8"));
    else if (args.text) input = args.text;
    else if (!process.stdin.isTTY) {
      const raw = fs.readFileSync(0, "utf8");
      try { input = JSON.parse(raw); } catch { input = raw; }
    } else return printHelp(agent);

    try {
      const out = await agent.run(input, {
        onText: args.out ? undefined : t => process.stdout.write(t)
      });
      if (args.out) {
        fs.mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true });
        fs.writeFileSync(path.resolve(args.out), out);
        console.log(`${agent.name}: wrote ${args.out}`);
      } else process.stdout.write("\n");
    } catch (e) {
      if (e instanceof Anthropic.AuthenticationError) console.error("Auth failed: set ANTHROPIC_API_KEY.");
      else if (e instanceof Anthropic.RateLimitError) console.error("Rate limited, try again shortly.");
      else if (e instanceof Anthropic.APIError) console.error(`API error ${e.status}: ${e.message}`);
      else console.error(e.message);
      process.exitCode = 1;
    }
  };

  return agent;
}

function parseArgs(argv) {
  const a = { text: "" };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === "-h" || k === "--help") a.help = true;
    else if (k === "-i" || k === "--input") a.input = argv[++i];
    else if (k === "-o" || k === "--out") a.out = argv[++i];
    else a.text += (a.text ? " " : "") + k;
  }
  return a;
}

function printHelp(agent) {
  console.log(`${agent.name} — ${agent.description}

Usage:
  node agents/${agent.id}.js --input brief.json [--out result.md]
  node agents/${agent.id}.js "free-text brief"
  cat brief.json | node agents/${agent.id}.js

Brief fields (JSON keys):`);
  for (const f of agent.fields) console.log(`  ${f.key.padEnd(18)} ${f.required ? "(required) " : ""}${f.hint || f.label}`);
}

module.exports = { createAgent, MODEL };
