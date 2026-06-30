// ============================================================================
// Marin 24/7 Server Bot (full) — crypto paper/live trading with a phone
// dashboard: editable settings, avatar + voice, daily loss auto-shutoff,
// per-coin learning, manual buttons. No dependencies (Node 18+).
// PAPER by default. No profit guarantee.
// ============================================================================
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// ---------- secrets / live config (env only, for security) ----------
const ENV = {
  live: process.env.LIVE_TRADING === "true",
  krakenKey: process.env.KRAKEN_KEY || "",
  krakenSecret: process.env.KRAKEN_SECRET || "",
  maxLiveUsdCap: +(process.env.MAX_LIVE_USD || 50)
};
const LIVE = ENV.live && !!ENV.krakenKey && !!ENV.krakenSecret;
const PORT = process.env.PORT || 3000;
const STATE_FILE = path.join(__dirname, "state.json");

// ---------- editable settings (changed from the dashboard, persisted) ----------
const DEFAULTS = {
  autoTrade: true,            // master: place trades or just watch
  strategy: "ema",            // used when requireConsensus is false
  requireConsensus: true,     // true = all-6 consensus; false = single strategy
  consensusMin: 3,            // how many of 6 must agree
  fast: 9, slow: 21, rsiP: 14, rsiBuy: 30, rsiSell: 70, bbP: 20, bbStd: 2, brk: 20,
  tradeSize: 1000, sl: 2, tp: 4, trail: 1.5,
  scanSec: 30, dailyLossLimitPct: 5,
  maxLiveUsd: 25,
  watchlist: ["BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT", "DOGEUSDT", "ADAUSDT", "LINKUSDT", "LTCUSDT", "AVAXUSDT"]
};
let S = Object.assign({}, DEFAULTS);

// ---------- runtime state ----------
let P = { cash: 10000, start: 10000, position: null, trades: [], wins: 0, losses: 0 };
let LEARN = {};                                  // { symbol: {wins, losses, pnl} }
let WATCH = [], SERIES = { symbol: null, points: [] }, LOG = [];
let SAYS = { text: "Hi! I'm running on the server now — trading 24/7. 🌸", mood: "happy", ts: Date.now() };
let DAY = { date: "", startEquity: 10000 }, haltedToday = false;

try {
  if (fs.existsSync(STATE_FILE)) {
    const s = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    if (s.S) S = Object.assign({}, DEFAULTS, s.S);
    P = s.P || P; LEARN = s.LEARN || {}; WATCH = s.WATCH || [];
    SERIES = s.SERIES || SERIES; LOG = s.LOG || []; DAY = s.DAY || DAY; haltedToday = !!s.haltedToday;
  }
} catch (e) { console.log("state load failed:", e.message); }
function save() { try { fs.writeFileSync(STATE_FILE, JSON.stringify({ S, P, LEARN, WATCH, SERIES, LOG, DAY, haltedToday })); } catch (e) {} }
function log(m) { const l = `[${new Date().toISOString()}] ${m}`; console.log(l); LOG.unshift(l); LOG = LOG.slice(0, 120); }
function say(text, mood) { SAYS = { text, mood: mood || "happy", ts: Date.now() }; }

// ---------- indicators ----------
const sma = (a, n) => a.length < n ? null : a.slice(-n).reduce((x, y) => x + y, 0) / n;
function ema(a, n) { if (a.length < n) return null; const k = 2 / (n + 1); let e = a.slice(0, n).reduce((x, y) => x + y, 0) / n; for (let i = n; i < a.length; i++) e = a[i] * k + e * (1 - k); return e; }
function emaSeries(a, n) { const o = Array(a.length).fill(null); if (a.length < n) return o; const k = 2 / (n + 1); let e = a.slice(0, n).reduce((x, y) => x + y, 0) / n; o[n - 1] = e; for (let i = n; i < a.length; i++) { e = a[i] * k + e * (1 - k); o[i] = e; } return o; }
function rsi(a, n) { if (a.length < n + 1) return null; let g = 0, l = 0; for (let i = 1; i <= n; i++) { const d = a[i] - a[i - 1]; d >= 0 ? g += d : l -= d; } g /= n; l /= n; for (let i = n + 1; i < a.length; i++) { const d = a[i] - a[i - 1]; g = (g * (n - 1) + (d > 0 ? d : 0)) / n; l = (l * (n - 1) + (d < 0 ? -d : 0)) / n; } if (l === 0) return 100; return 100 - 100 / (1 + g / l); }
function std(a, n) { if (a.length < n) return null; const s = a.slice(-n), m = s.reduce((x, y) => x + y, 0) / n; return Math.sqrt(s.reduce((x, y) => x + (y - m) ** 2, 0) / n); }
const STRATS = ["ema", "ma", "macd", "rsi", "bollinger", "breakout"];
function stance(name, h, price) {
  switch (name) {
    case "ema": case "ma": { const f = name === "ema" ? ema(h, S.fast) : sma(h, S.fast), sl = name === "ema" ? ema(h, S.slow) : sma(h, S.slow); if (f == null || sl == null) return "hold"; return f > sl ? "buy" : "sell"; }
    case "macd": { const e12 = emaSeries(h, 12), e26 = emaSeries(h, 26), line = []; for (let i = 0; i < h.length; i++) if (e12[i] != null && e26[i] != null) line.push(e12[i] - e26[i]); if (line.length < 9) return "hold"; const sg = emaSeries(line, 9); return line[line.length - 1] > sg[sg.length - 1] ? "buy" : "sell"; }
    case "rsi": { const r = rsi(h, S.rsiP); if (r == null) return "hold"; if (r <= S.rsiBuy) return "buy"; if (r >= S.rsiSell) return "sell"; return "hold"; }
    case "bollinger": { const m = sma(h, S.bbP); if (m == null) return "hold"; const sd = std(h, S.bbP); if (price <= m - S.bbStd * sd) return "buy"; if (price >= m + S.bbStd * sd) return "sell"; return "hold"; }
    case "breakout": { const N = S.brk; if (h.length < N + 1) return "hold"; const pr = h.slice(-(N + 1), -1); if (price >= Math.max(...pr)) return "buy"; if (price <= Math.min(...pr)) return "sell"; return "hold"; }
  }
  return "hold";
}
function consensus(h, price) { let b = 0, s = 0; for (const n of STRATS) { const v = stance(n, h, price); if (v === "buy") b++; else if (v === "sell") s++; } return { buy: b, sell: s, verdict: b > s ? "buy" : s > b ? "sell" : "hold" }; }
const needHist = () => Math.max(S.slow, 35, S.rsiP + 1, S.bbP, S.brk + 1) + 5;
// Entry/exit decision honoring requireConsensus + strategy.
function decide(h, price) {
  if (S.requireConsensus) { const c = consensus(h, price); return { buy: c.buy, sell: c.sell, verdict: c.verdict }; }
  const v = stance(S.strategy, h, price);
  return { buy: v === "buy" ? 6 : 0, sell: v === "sell" ? 6 : 0, verdict: v };
}

// ---------- data: Binance.US -> Coinbase -> Kraken ----------
const cbProduct = s => s.replace(/USDT$/, "").replace(/USD$/, "") + "-USD";
const kPair = s => { let b = s.replace(/USDT$/, "").replace(/USD$/, ""); if (b === "BTC") b = "XBT"; return b + "USD"; };
async function fetchCloses(sym) {
  try { const r = await fetch(`https://api.binance.us/api/v3/klines?symbol=${sym}&interval=1m&limit=80`); if (r.ok) { const d = await r.json(); if (Array.isArray(d) && d.length) return d.map(k => parseFloat(k[4])); } } catch (e) {}
  try { const r = await fetch(`https://api.exchange.coinbase.com/products/${cbProduct(sym)}/candles?granularity=60`); if (r.ok) { const d = await r.json(); if (Array.isArray(d) && d.length) return d.map(c => parseFloat(c[4])).reverse().slice(-80); } } catch (e) {}
  try { const r = await fetch(`https://api.kraken.com/0/public/OHLC?pair=${kPair(sym)}&interval=1`); if (r.ok) { const d = await r.json(); if (d && d.result) { const k = Object.keys(d.result).find(x => x !== "last"); const a = d.result[k]; if (Array.isArray(a) && a.length) return a.map(c => parseFloat(c[4])).slice(-80); } } } catch (e) {}
  return null;
}

// ---------- Kraken signed orders (LIVE only) ----------
async function krakenPrivate(endpoint, params) {
  const apiPath = "/0/private/" + endpoint;
  const nonce = (Date.now() * 1000).toString();
  const postdata = "nonce=" + nonce + "&" + new URLSearchParams(params).toString();
  const sha = crypto.createHash("sha256").update(nonce + postdata).digest();
  const hmac = crypto.createHmac("sha512", Buffer.from(ENV.krakenSecret, "base64"));
  hmac.update(apiPath); hmac.update(sha);
  const sign = hmac.digest("base64");
  const res = await fetch("https://api.kraken.com" + apiPath, { method: "POST", headers: { "API-Key": ENV.krakenKey, "API-Sign": sign, "Content-Type": "application/x-www-form-urlencoded" }, body: postdata });
  return res.json();
}
async function krakenOrder(sym, side, volume) {
  try {
    const r = await krakenPrivate("AddOrder", { pair: kPair(sym), type: side, ordertype: "market", volume: volume.toFixed(8) });
    if (r.error && r.error.length) { log("LIVE order ERROR: " + r.error.join("; ")); return { error: r.error.join("; ") }; }
    log(`LIVE ${side.toUpperCase()} ${sym} vol ${volume.toFixed(8)}`); return { ok: true };
  } catch (e) { log("LIVE order EXCEPTION: " + e.message); return { error: e.message }; }
}

// ---------- trading ----------
function equity(price) { let pv = 0; if (P.position) pv = P.position.qty * (price || P.position.entry); return P.cash + pv; }
async function openTrade(sym, price) {
  const sizeUsd = LIVE ? Math.min(S.tradeSize, S.maxLiveUsd, ENV.maxLiveUsdCap) : Math.min(S.tradeSize, P.cash);
  if (sizeUsd <= 0) return;
  const qty = sizeUsd / price;
  if (LIVE) { const r = await krakenOrder(sym, "buy", qty); if (r.error) { log("BUY aborted — live order failed."); return; } }
  P.position = { symbol: sym, qty, entry: price, peak: price, entryTs: Date.now() };
  P.cash -= sizeUsd; save();
  say(`Opening a ${LIVE ? "LIVE " : ""}BUY on ${sym} at ${price.toFixed(4)}! Stop-loss is on. 💖`, "excited");
  log(`${LIVE ? "LIVE " : ""}BUY ${sym} @ ${price.toFixed(4)} ($${sizeUsd.toFixed(0)})`);
}
async function closeTrade(price, reason) {
  const pos = P.position;
  if (LIVE) { const r = await krakenOrder(pos.symbol, "sell", pos.qty); if (r.error) { log("SELL failed — retry next scan."); return; } }
  const pnl = (price - pos.entry) * pos.qty;
  P.cash += pos.qty * price; pnl >= 0 ? P.wins++ : P.losses++;
  P.trades.push({ symbol: pos.symbol, entry: pos.entry, exit: price, pnl, reason, entryTs: pos.entryTs, ts: Date.now() });
  if (P.trades.length > 300) P.trades = P.trades.slice(-300);
  const L = LEARN[pos.symbol] || { wins: 0, losses: 0, pnl: 0 };
  pnl >= 0 ? L.wins++ : L.losses++; L.pnl += pnl; LEARN[pos.symbol] = L;
  P.position = null; save();
  say(`Closed ${pos.symbol} for ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)} (${reason}). ${pnl >= 0 ? "A win! 🎉" : "Small loss — discipline over everything. 💪"}`, pnl >= 0 ? "excited" : "worried");
  log(`${LIVE ? "LIVE " : ""}SELL ${pos.symbol} @ ${price.toFixed(4)} | P&L ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)} (${reason})`);
}

// ---------- daily loss auto-shutoff ----------
function checkDaily(eq) {
  const today = new Date().toISOString().slice(0, 10);
  if (DAY.date !== today) { DAY = { date: today, startEquity: eq }; haltedToday = false; save(); return; }
  if (!S.dailyLossLimitPct || S.dailyLossLimitPct <= 0 || haltedToday) return;
  const lossPct = (DAY.startEquity - eq) / DAY.startEquity * 100;
  if (lossPct >= S.dailyLossLimitPct) {
    haltedToday = true; save();
    say(`Daily loss limit hit (down ${lossPct.toFixed(1)}% today). I've stopped trading until tomorrow. 🛑`, "worried");
    log(`HALTED — daily loss ${lossPct.toFixed(1)}% >= ${S.dailyLossLimitPct}%`);
  }
}

// ---------- scan loop ----------
let scanning = false;
async function scan() {
  if (scanning) return; scanning = true;
  try {
    const heldSym = P.position ? P.position.symbol : null;
    const statuses = []; let best = null, ok = 0, heldCloses = null, heldPrice = null;
    for (const sym of S.watchlist) {
      const closes = await fetchCloses(sym); if (!closes || !closes.length) continue; ok++;
      const price = closes[closes.length - 1];
      let d = { buy: 0, sell: 0, verdict: "hold" };
      if (closes.length >= needHist()) d = decide(closes, price);
      statuses.push({ symbol: sym, price, verdict: d.verdict, buy: d.buy, sell: d.sell, held: sym === heldSym });
      if (sym === heldSym) { heldCloses = closes; heldPrice = price; }
      if (!heldSym && (!best || d.buy > best.buy)) best = { sym, buy: d.buy, price };
    }
    WATCH = statuses; save();
    if (ok === 0) { log("No market data (all sources failed)"); scanning = false; return; }

    const eqNow = equity(heldPrice);
    checkDaily(eqNow);

    // manage an open position (exits run even if Auto-Trade is paused, for safety)
    if (heldSym && heldPrice) {
      SERIES.symbol = heldSym; SERIES.points.push({ ts: Date.now(), price: heldPrice }); if (SERIES.points.length > 300) SERIES.points = SERIES.points.slice(-300);
      const e = P.position.entry;
      P.position.peak = Math.max(P.position.peak || e, heldPrice);
      if (S.trail > 0 && heldPrice <= P.position.peak * (1 - S.trail / 100) && heldPrice > e * (1 - S.sl / 100)) await closeTrade(heldPrice, "trailing-stop");
      else if (heldPrice <= e * (1 - S.sl / 100)) await closeTrade(heldPrice, "stop-loss");
      else if (heldPrice >= e * (1 + S.tp / 100)) await closeTrade(heldPrice, "take-profit");
      else if (heldCloses && heldCloses.length >= needHist()) { const d = decide(heldCloses, heldPrice); if (d.verdict === "sell" && d.sell >= S.consensusMin) await closeTrade(heldPrice, "signal"); }
      save(); scanning = false; return;
    }

    // open a new position
    if (!heldSym && S.autoTrade && !haltedToday && best && best.buy >= S.consensusMin) {
      SERIES = { symbol: best.sym, points: [{ ts: Date.now(), price: best.price }] };
      log(`Picked ${best.sym} (${best.buy}/6)`);
      await openTrade(best.sym, best.price);
    }
  } catch (e) { log("scan error: " + e.message); }
  scanning = false;
}

// ---------- web API ----------
function state() {
  const price = P.position && SERIES.symbol === P.position.symbol && SERIES.points.length ? SERIES.points[SERIES.points.length - 1].price : null;
  const eq = equity(price); const tr = P.wins + P.losses;
  const learnRows = Object.keys(LEARN).map(k => ({ symbol: k, ...LEARN[k] })).sort((a, b) => b.pnl - a.pnl);
  return {
    mode: LIVE ? "LIVE 🔴 real money" : "paper", halted: haltedToday,
    equity: eq, pnl: eq - P.start, wins: P.wins, losses: P.losses, winrate: tr ? Math.round(P.wins / tr * 100) : 0,
    position: P.position, says: SAYS, watch: WATCH, learn: learnRows,
    trades: P.trades.slice(-30).reverse(), log: LOG.slice(0, 25), settings: S
  };
}
function applySettings(patch) {
  const nums = ["consensusMin", "fast", "slow", "rsiP", "rsiBuy", "rsiSell", "bbP", "bbStd", "tradeSize", "sl", "tp", "trail", "scanSec", "dailyLossLimitPct", "maxLiveUsd", "brk"];
  for (const k of nums) if (k in patch && isFinite(+patch[k])) S[k] = +patch[k];
  if ("strategy" in patch && STRATS.includes(patch.strategy)) S.strategy = patch.strategy;
  if ("requireConsensus" in patch) S.requireConsensus = !!patch.requireConsensus;
  if ("autoTrade" in patch) S.autoTrade = !!patch.autoTrade;
  if ("watchlist" in patch && typeof patch.watchlist === "string") S.watchlist = patch.watchlist.toUpperCase().split(/[\s,]+/).map(x => x.trim()).filter(Boolean);
  S.scanSec = Math.max(15, S.scanSec || 30);
  save(); restartTimer();
  say("Settings updated! 🌸", "happy");
}
function readBody(req) { return new Promise(r => { let b = ""; req.on("data", c => b += c); req.on("end", () => { try { r(JSON.parse(b || "{}")); } catch (e) { r({}); } }); }); }

http.createServer(async (req, res) => {
  const j = (o) => { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(o)); };
  if (req.url === "/state") return j(state());
  if (req.url === "/health") { res.writeHead(200); return res.end("ok"); }
  if (req.method === "POST" && req.url === "/api/buy") return j(await manualBuy());
  if (req.method === "POST" && req.url === "/api/sell") return j(await manualSell());
  if (req.method === "POST" && req.url === "/api/settings") { applySettings(await readBody(req)); return j({ ok: true }); }
  if (req.method === "POST" && req.url === "/api/resume") { haltedToday = false; save(); say("Back on — resumed trading. 💪", "excited"); return j({ ok: true }); }
  res.writeHead(200, { "Content-Type": "text/html" }); res.end(DASH);
}).listen(PORT, () => log(`Marin server bot on :${PORT} — mode=${LIVE ? "LIVE" : "paper"}, scan ${S.scanSec}s`));

async function manualBuy() {
  if (P.position) return { error: "already holding" };
  const sym = (WATCH[0] && WATCH[0].symbol) || S.watchlist[0];
  const closes = await fetchCloses(sym); if (!closes) return { error: "no price" };
  const price = closes[closes.length - 1];
  SERIES = { symbol: sym, points: [{ ts: Date.now(), price }] };
  await openTrade(sym, price); return { ok: true };
}
async function manualSell() {
  if (!P.position) return { error: "no position" };
  const closes = await fetchCloses(P.position.symbol);
  const price = closes ? closes[closes.length - 1] : P.position.entry;
  await closeTrade(price, "manual"); return { ok: true };
}

let timer = null;
function restartTimer() { if (timer) clearInterval(timer); timer = setInterval(scan, S.scanSec * 1000); }
scan(); restartTimer();

// ---------- dashboard HTML ----------
const DASH = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Marin Bot</title><style>
body{margin:0;font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#0f1115;color:#e6e6e6;font-size:15px}
.wrap{max-width:640px;margin:0 auto;padding:14px}
header{display:flex;align-items:center;gap:10px}#face{width:52px;height:52px;border-radius:50%;border:2px solid #ff7eb6}
.card{background:#161a20;border:1px solid #232833;border-radius:12px;padding:14px;margin:12px 0}
#bubble{background:rgba(20,24,32,.96);border:1px solid #ff7eb6;border-radius:12px;padding:10px;margin-top:10px;font-size:14px}
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;text-align:center}.big{font-size:18px;font-weight:800;display:block}small{color:#8a93a2;font-size:11px}
.up{color:#4caf50}.down{color:#ef5350}.hold{color:#9aa4b2}
table{width:100%;border-collapse:collapse;font-size:13px}td{padding:5px 4px;border-bottom:1px solid #1a1e26}.nm{font-weight:700}
.btn{background:#1e88e5;color:#fff;border:0;border-radius:8px;padding:10px;font-weight:700;cursor:pointer}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}label{font-size:12px;color:#9aa4b2;display:block;margin-top:6px}
input,select,textarea{width:100%;background:#0c0f14;border:1px solid #2a3140;color:#e6e6e6;border-radius:6px;padding:8px;font-size:14px}
pre{white-space:pre-wrap;font-size:11px;color:#8a93a2;max-height:150px;overflow:auto}
.banner{background:#5a1d1d;color:#ffb4b4;padding:8px;border-radius:8px;text-align:center;font-weight:700;display:none}
</style></head><body><div class="wrap">
<header><img id="face"><div style="flex:1"><div style="font-weight:800">Marin <span id="mode" style="font-size:12px;color:#ffc9e3"></span></div><div id="mood" style="font-size:12px;color:#9aa4b2"></div></div>
<button class="btn" id="auto" onclick="toggleAuto()">Auto</button></header>
<div id="bubble">…</div>
<div class="banner" id="halt">🛑 Halted by daily loss limit — <a href="#" onclick="resume();return false" style="color:#fff">resume</a></div>

<div class="card"><div class="stats">
<div><span class="big" id="eq">$0</span><small>Equity</small></div>
<div><span class="big" id="pnl">$0</span><small>P&L</small></div>
<div><span class="big" id="wl">0/0</span><small>W/L</small></div>
<div><span class="big" id="wr">0%</span><small>Win rate</small></div></div>
<div id="pos" style="margin-top:10px;text-align:center"></div>
<div class="grid" style="margin-top:10px"><button class="btn" style="background:#2e7d32" onclick="act('buy')">🟢 Buy now</button><button class="btn" style="background:#c62828" onclick="act('sell')">🔴 Sell now</button></div></div>

<div class="card"><h3>📋 Live watchlist</h3><table id="watch"></table></div>
<div class="card"><h3>🧠 Per-coin results</h3><table id="learn"></table></div>
<div class="card"><h3>🧾 Trade history</h3><table id="trades"></table></div>

<div class="card"><h3>⚙️ Settings</h3>
<div class="grid">
<div><label>Trade $</label><input id="tradeSize" type="number"></div>
<div><label>Stop-loss %</label><input id="sl" type="number" step="0.1"></div>
<div><label>Take-profit %</label><input id="tp" type="number" step="0.1"></div>
<div><label>Trailing stop %</label><input id="trail" type="number" step="0.1"></div>
<div><label>Consensus min</label><input id="consensusMin" type="number"></div>
<div><label>Scan sec</label><input id="scanSec" type="number"></div>
<div><label>Daily loss %</label><input id="dailyLossLimitPct" type="number" step="0.1"></div>
<div><label>Max live $</label><input id="maxLiveUsd" type="number"></div>
<div><label>Fast MA</label><input id="fast" type="number"></div>
<div><label>Slow MA</label><input id="slow" type="number"></div>
<div><label>RSI period</label><input id="rsiP" type="number"></div>
<div><label>Breakout</label><input id="brk" type="number"></div>
</div>
<label>Strategy (when consensus off)</label><select id="strategy"><option>ema</option><option>ma</option><option>macd</option><option>rsi</option><option>bollinger</option><option>breakout</option></select>
<label><input type="checkbox" id="requireConsensus" style="width:auto"> Require consensus (all 6)</label>
<label>Watchlist</label><textarea id="watchlist" rows="2"></textarea>
<button class="btn" style="width:100%;margin-top:10px" onclick="saveS()">Save settings</button></div>

<div class="card"><h3>Log</h3><pre id="log"></pre></div>
<p style="color:#6b7280;font-size:11px;text-align:center">Paper unless LIVE env vars set. No profit guarantee.</p>
</div><script>
const F={neutral:'<circle cx="51" cy="62" r="4" fill="#2a1b3d"/><circle cx="69" cy="62" r="4" fill="#2a1b3d"/><path d="M53 74 Q60 79 67 74" stroke="#2a1b3d" stroke-width="3" fill="none" stroke-linecap="round"/>',happy:'<path d="M47 62 Q51 57 55 62" stroke="#2a1b3d" stroke-width="3" fill="none"/><path d="M65 62 Q69 57 73 62" stroke="#2a1b3d" stroke-width="3" fill="none"/><path d="M52 73 Q60 81 68 73" stroke="#2a1b3d" stroke-width="3" fill="none"/>',excited:'<text x="51" y="66" font-size="11" text-anchor="middle">⭐</text><text x="69" y="66" font-size="11" text-anchor="middle">⭐</text><path d="M51 72 Q60 84 69 72 Q60 80 51 72 Z" fill="#2a1b3d"/>',worried:'<path d="M47 60 L55 64" stroke="#2a1b3d" stroke-width="3"/><path d="M73 60 L65 64" stroke="#2a1b3d" stroke-width="3"/><path d="M53 78 Q60 73 67 78" stroke="#2a1b3d" stroke-width="3" fill="none"/>'};
function setFace(m){const i=F[m]||F.neutral;const svg='<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd1e8"/><stop offset="1" stop-color="#ff7eb6"/></linearGradient></defs><rect width="120" height="120" rx="60" fill="#2a1b3d"/><path d="M30 70 Q30 28 60 28 Q90 28 90 70 L92 96 Q60 84 28 96 Z" fill="#5b3b8c"/><circle cx="60" cy="64" r="26" fill="url(#g)"/>'+i+'</svg>';document.getElementById('face').src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);}
let lastSaid=0,voiceOn=false,cur={};
document.body.addEventListener('click',()=>{voiceOn=true},{once:true});
function speak(t){if(!voiceOn||!window.speechSynthesis)return;try{speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(t);u.rate=.95;u.pitch=1.15;const v=speechSynthesis.getVoices().find(x=>/female|aria|jenny|zira|samantha/i.test(x.name));if(v)u.voice=v;speechSynthesis.speak(u);}catch(e){}}
function fill(s){cur=s.settings;['tradeSize','sl','tp','trail','consensusMin','scanSec','dailyLossLimitPct','maxLiveUsd','fast','slow','rsiP','brk'].forEach(k=>{if(document.activeElement.id!==k)document.getElementById(k).value=s.settings[k];});document.getElementById('strategy').value=s.settings.strategy;document.getElementById('requireConsensus').checked=s.settings.requireConsensus;if(document.activeElement.id!=='watchlist')document.getElementById('watchlist').value=s.settings.watchlist.join(', ');document.getElementById('auto').textContent=s.settings.autoTrade?'⏸ Pause':'▶ Start';document.getElementById('auto').style.background=s.settings.autoTrade?'#c62828':'#2e7d32';}
async function load(){const s=await(await fetch('/state')).json();
document.getElementById('mode').textContent='('+s.mode+')';
document.getElementById('halt').style.display=s.halted?'block':'none';
document.getElementById('eq').textContent='$'+s.equity.toFixed(0);
const p=document.getElementById('pnl');p.textContent=(s.pnl>=0?'+':'')+'$'+s.pnl.toFixed(0);p.className='big '+(s.pnl>=0?'up':'down');
document.getElementById('wl').textContent=s.wins+'/'+s.losses;document.getElementById('wr').textContent=s.winrate+'%';
document.getElementById('pos').textContent=s.position?('Holding '+s.position.symbol+' @ '+s.position.entry.toFixed(4)):'No open position';
document.getElementById('mood').textContent=s.says.mood;
if(s.says.ts>lastSaid){lastSaid=s.says.ts;document.getElementById('bubble').textContent=s.says.text;setFace(s.says.mood);speak(s.says.text);}
document.getElementById('watch').innerHTML=(s.watch||[]).map(r=>{const c=r.verdict==='buy'?'up':r.verdict==='sell'?'down':'hold';const t=r.verdict==='buy'?'▲ BUY':r.verdict==='sell'?'▼ SELL':'— HOLD';return '<tr><td class="nm">'+r.symbol+(r.held?' ✅':'')+'</td><td>'+(r.price?r.price.toFixed(4):'—')+'</td><td class="'+c+'">'+t+' '+r.buy+'/6</td></tr>';}).join('')||'<tr><td>scanning…</td></tr>';
document.getElementById('learn').innerHTML=(s.learn||[]).map(r=>'<tr><td class="nm">'+r.symbol+'</td><td class="'+(r.pnl>=0?'up':'down')+'">'+(r.pnl>=0?'+':'')+r.pnl.toFixed(2)+'</td><td>'+r.wins+'W/'+r.losses+'L</td></tr>').join('')||'<tr><td>no trades yet</td></tr>';
document.getElementById('trades').innerHTML=(s.trades||[]).map(t=>'<tr><td class="nm down">▼ '+t.symbol+'</td><td class="'+(t.pnl>=0?'up':'down')+'">'+(t.pnl>=0?'+':'')+t.pnl.toFixed(2)+'</td><td>'+t.reason+'</td></tr>').join('')||'<tr><td>none</td></tr>';
document.getElementById('log').textContent=(s.log||[]).join('\\n');
if(!document.getElementById('tradeSize').value)fill(s);else fill(s);}
async function act(w){await fetch('/api/'+w,{method:'POST'});load();}
async function resume(){await fetch('/api/resume',{method:'POST'});load();}
async function toggleAuto(){await fetch('/api/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({autoTrade:!cur.autoTrade})});load();}
async function saveS(){const b={tradeSize:+v('tradeSize'),sl:+v('sl'),tp:+v('tp'),trail:+v('trail'),consensusMin:+v('consensusMin'),scanSec:+v('scanSec'),dailyLossLimitPct:+v('dailyLossLimitPct'),maxLiveUsd:+v('maxLiveUsd'),fast:+v('fast'),slow:+v('slow'),rsiP:+v('rsiP'),brk:+v('brk'),strategy:v('strategy'),requireConsensus:document.getElementById('requireConsensus').checked,watchlist:v('watchlist')};await fetch('/api/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)});alert('Saved!');load();}
function v(id){return document.getElementById(id).value;}
setFace('happy');load();setInterval(load,4000);
</script></body></html>`;
