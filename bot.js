// ============================================================================
// Marin 24/7 Server Bot — runs on a cloud host (Render/Railway/VPS) so it keeps
// trading crypto even with your laptop closed. PAPER trading by default.
// No dependencies — uses Node 18+ built-in fetch + http.
// ============================================================================
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// ---------- config (override with environment variables) ----------
const CFG = {
  // ---- LIVE TRADING (real money) — OFF unless you set all three env vars ----
  live: process.env.LIVE_TRADING === "true",
  krakenKey: process.env.KRAKEN_KEY || "",
  krakenSecret: process.env.KRAKEN_SECRET || "",
  maxLiveUsd: +(process.env.MAX_LIVE_USD || 50),     // hard cap per live order
  // ----
  tradeSize: +(process.env.TRADE_SIZE || 1000),
  sl: +(process.env.STOP_PCT || 2),
  tp: +(process.env.TAKE_PCT || 4),
  trail: +(process.env.TRAIL_PCT || 1.5),
  consensusMin: +(process.env.CONSENSUS_MIN || 3),
  scanSec: Math.max(15, +(process.env.SCAN_SEC || 30)),
  fast: 9, slow: 21, rsiP: 14, rsiBuy: 30, rsiSell: 70, bbP: 20, bbStd: 2, brk: 20,
  watchlist: (process.env.WATCHLIST ||
    "BTCUSDT,ETHUSDT,SOLUSDT,XRPUSDT,DOGEUSDT,ADAUSDT,LINKUSDT,LTCUSDT,AVAXUSDT")
    .split(",").map(s => s.trim().toUpperCase()).filter(Boolean)
};
// Live trading is only ACTIVE when explicitly enabled AND keys are present.
const LIVE = CFG.live && !!CFG.krakenKey && !!CFG.krakenSecret;
CFG.mode = LIVE ? "LIVE 🔴 (real money)" : "paper";
const PORT = process.env.PORT || 3000;
const STATE_FILE = path.join(__dirname, "state.json");

// ---------- persistent state ----------
let P = { cash: 10000, start: 10000, position: null, trades: [], wins: 0, losses: 0 };
let WATCH = [];
let SERIES = { symbol: null, points: [] };
let LOG = [];
try {
  if (fs.existsSync(STATE_FILE)) {
    const s = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    P = s.P || P; WATCH = s.WATCH || []; SERIES = s.SERIES || SERIES; LOG = s.LOG || [];
  }
} catch (e) { console.log("state load failed", e.message); }
function save() {
  try { fs.writeFileSync(STATE_FILE, JSON.stringify({ P, WATCH, SERIES, LOG })); } catch (e) {}
}
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  LOG.unshift(line); LOG = LOG.slice(0, 100);
}

// ---------- indicators ----------
const sma = (a, n) => a.length < n ? null : a.slice(-n).reduce((x, y) => x + y, 0) / n;
function ema(a, n) { if (a.length < n) return null; const k = 2 / (n + 1); let e = a.slice(0, n).reduce((x, y) => x + y, 0) / n; for (let i = n; i < a.length; i++) e = a[i] * k + e * (1 - k); return e; }
function emaSeries(a, n) { const o = Array(a.length).fill(null); if (a.length < n) return o; const k = 2 / (n + 1); let e = a.slice(0, n).reduce((x, y) => x + y, 0) / n; o[n - 1] = e; for (let i = n; i < a.length; i++) { e = a[i] * k + e * (1 - k); o[i] = e; } return o; }
function rsi(a, n) { if (a.length < n + 1) return null; let g = 0, l = 0; for (let i = 1; i <= n; i++) { const d = a[i] - a[i - 1]; d >= 0 ? g += d : l -= d; } g /= n; l /= n; for (let i = n + 1; i < a.length; i++) { const d = a[i] - a[i - 1]; g = (g * (n - 1) + (d > 0 ? d : 0)) / n; l = (l * (n - 1) + (d < 0 ? -d : 0)) / n; } if (l === 0) return 100; return 100 - 100 / (1 + g / l); }
function std(a, n) { if (a.length < n) return null; const s = a.slice(-n), m = s.reduce((x, y) => x + y, 0) / n; return Math.sqrt(s.reduce((x, y) => x + (y - m) ** 2, 0) / n); }
const STRATS = ["ema", "ma", "macd", "rsi", "bollinger", "breakout"];
function stance(name, h, price) {
  switch (name) {
    case "ema": case "ma": { const f = name === "ema" ? ema(h, CFG.fast) : sma(h, CFG.fast), sl = name === "ema" ? ema(h, CFG.slow) : sma(h, CFG.slow); if (f == null || sl == null) return "hold"; return f > sl ? "buy" : "sell"; }
    case "macd": { const e12 = emaSeries(h, 12), e26 = emaSeries(h, 26), line = []; for (let i = 0; i < h.length; i++) if (e12[i] != null && e26[i] != null) line.push(e12[i] - e26[i]); if (line.length < 9) return "hold"; const sg = emaSeries(line, 9); return line[line.length - 1] > sg[sg.length - 1] ? "buy" : "sell"; }
    case "rsi": { const r = rsi(h, CFG.rsiP); if (r == null) return "hold"; if (r <= CFG.rsiBuy) return "buy"; if (r >= CFG.rsiSell) return "sell"; return "hold"; }
    case "bollinger": { const m = sma(h, CFG.bbP); if (m == null) return "hold"; const sd = std(h, CFG.bbP); if (price <= m - CFG.bbStd * sd) return "buy"; if (price >= m + CFG.bbStd * sd) return "sell"; return "hold"; }
    case "breakout": { const N = CFG.brk; if (h.length < N + 1) return "hold"; const pr = h.slice(-(N + 1), -1); if (price >= Math.max(...pr)) return "buy"; if (price <= Math.min(...pr)) return "sell"; return "hold"; }
  }
  return "hold";
}
function consensus(h, price) { let b = 0, s = 0; for (const n of STRATS) { const v = stance(n, h, price); if (v === "buy") b++; else if (v === "sell") s++; } return { buy: b, sell: s, verdict: b > s ? "buy" : s > b ? "sell" : "hold" }; }
const needHist = () => Math.max(CFG.slow, 35, CFG.rsiP + 1, CFG.bbP, CFG.brk + 1) + 5;

// ---------- data (US-friendly: Binance.US -> Coinbase -> Kraken) ----------
const cbProduct = s => s.replace(/USDT$/, "").replace(/USD$/, "") + "-USD";
const kPair = s => { let b = s.replace(/USDT$/, "").replace(/USD$/, ""); if (b === "BTC") b = "XBT"; return b + "USD"; };
async function fetchCloses(sym) {
  try { const r = await fetch(`https://api.binance.us/api/v3/klines?symbol=${sym}&interval=1m&limit=80`); if (r.ok) { const d = await r.json(); if (Array.isArray(d) && d.length) return d.map(k => parseFloat(k[4])); } } catch (e) {}
  try { const r = await fetch(`https://api.exchange.coinbase.com/products/${cbProduct(sym)}/candles?granularity=60`); if (r.ok) { const d = await r.json(); if (Array.isArray(d) && d.length) return d.map(c => parseFloat(c[4])).reverse().slice(-80); } } catch (e) {}
  try { const r = await fetch(`https://api.kraken.com/0/public/OHLC?pair=${kPair(sym)}&interval=1`); if (r.ok) { const d = await r.json(); if (d && d.result) { const k = Object.keys(d.result).find(x => x !== "last"); const a = d.result[k]; if (Array.isArray(a) && a.length) return a.map(c => parseFloat(c[4])).slice(-80); } } } catch (e) {}
  return null;
}

// ---------- Kraken REAL-money orders (only used when LIVE) ----------
async function krakenPrivate(endpoint, params) {
  const apiPath = "/0/private/" + endpoint;
  const nonce = (Date.now() * 1000).toString();
  const postdata = "nonce=" + nonce + "&" + new URLSearchParams(params).toString();
  const sha256 = crypto.createHash("sha256").update(nonce + postdata).digest();
  const hmac = crypto.createHmac("sha512", Buffer.from(CFG.krakenSecret, "base64"));
  hmac.update(apiPath); hmac.update(sha256);
  const sign = hmac.digest("base64");
  const res = await fetch("https://api.kraken.com" + apiPath, {
    method: "POST",
    headers: { "API-Key": CFG.krakenKey, "API-Sign": sign, "Content-Type": "application/x-www-form-urlencoded" },
    body: postdata
  });
  return res.json();
}
// Place a real market order. Returns {ok, volume} or {error}.
async function krakenOrder(sym, side, volume) {
  try {
    const r = await krakenPrivate("AddOrder", { pair: kPair(sym), type: side, ordertype: "market", volume: volume.toFixed(8) });
    if (r.error && r.error.length) { log("LIVE order ERROR: " + r.error.join("; ")); return { error: r.error.join("; ") }; }
    log(`LIVE ${side.toUpperCase()} ${sym} vol ${volume.toFixed(8)} — ${(r.result && r.result.txid) ? r.result.txid.join(",") : "ok"}`);
    return { ok: true };
  } catch (e) { log("LIVE order EXCEPTION: " + e.message); return { error: e.message }; }
}

// ---------- trading (paper bookkeeping always; real orders when LIVE) ----------
function equity(price) { let pv = 0; if (P.position) pv = P.position.qty * (price || P.position.entry); return P.cash + pv; }
async function openTrade(sym, price) {
  const sizeUsd = LIVE ? Math.min(CFG.tradeSize, CFG.maxLiveUsd) : Math.min(CFG.tradeSize, P.cash);
  if (sizeUsd <= 0) return;
  const qty = sizeUsd / price;
  if (LIVE) {
    const r = await krakenOrder(sym, "buy", qty);
    if (r.error) { log("BUY aborted (live order failed) — not opening position."); return; }
  }
  P.position = { symbol: sym, qty, entry: price, peak: price, entryTs: Date.now() };
  P.cash -= sizeUsd; save();
  log(`${LIVE ? "LIVE " : ""}BUY ${sym} @ ${price.toFixed(4)} (size $${sizeUsd.toFixed(0)})`);
}
async function closeTrade(price, reason) {
  const pos = P.position;
  if (LIVE) {
    const r = await krakenOrder(pos.symbol, "sell", pos.qty);
    if (r.error) { log("SELL order failed — will retry next scan."); return; }
  }
  const pnl = (price - pos.entry) * pos.qty;
  P.cash += pos.qty * price; pnl >= 0 ? P.wins++ : P.losses++;
  P.trades.push({ symbol: pos.symbol, entry: pos.entry, exit: price, pnl, reason, entryTs: pos.entryTs, ts: Date.now() });
  if (P.trades.length > 300) P.trades = P.trades.slice(-300);
  P.position = null; save();
  log(`${LIVE ? "LIVE " : ""}SELL ${pos.symbol} @ ${price.toFixed(4)} | P&L ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)} (${reason})`);
}

// ---------- scan loop ----------
let scanning = false;
async function scan() {
  if (scanning) return; scanning = true;
  try {
    const heldSym = P.position ? P.position.symbol : null;
    const statuses = []; let best = null, ok = 0, heldCloses = null, heldPrice = null;
    for (const sym of CFG.watchlist) {
      const closes = await fetchCloses(sym); if (!closes || !closes.length) continue; ok++;
      const price = closes[closes.length - 1];
      let verdict = "hold", buy = 0, sell = 0;
      if (closes.length >= needHist()) { const c = consensus(closes, price); verdict = c.verdict; buy = c.buy; sell = c.sell; }
      statuses.push({ symbol: sym, price, verdict, buy, sell, held: sym === heldSym });
      if (sym === heldSym) { heldCloses = closes; heldPrice = price; }
      if (!heldSym && (!best || buy > best.buy)) best = { sym, buy, price };
    }
    WATCH = statuses; save();
    if (ok === 0) { log("No market data (all sources failed)"); scanning = false; return; }

    if (heldSym) {
      const price = heldPrice != null ? heldPrice : null;
      if (price) {
        SERIES.symbol = heldSym; SERIES.points.push({ ts: Date.now(), price }); if (SERIES.points.length > 300) SERIES.points = SERIES.points.slice(-300);
        const e = P.position.entry;
        P.position.peak = Math.max(P.position.peak || e, price);
        if (CFG.trail > 0 && price <= P.position.peak * (1 - CFG.trail / 100) && price > e * (1 - CFG.sl / 100)) await closeTrade(price, "trailing-stop");
        else if (price <= e * (1 - CFG.sl / 100)) await closeTrade(price, "stop-loss");
        else if (price >= e * (1 + CFG.tp / 100)) await closeTrade(price, "take-profit");
        else if (heldCloses && heldCloses.length >= needHist()) { const c = consensus(heldCloses, price); if (c.verdict === "sell" && c.sell >= CFG.consensusMin) await closeTrade(price, "signal"); }
        save();
      }
      scanning = false; return;
    }
    if (best && best.buy >= CFG.consensusMin) {
      SERIES = { symbol: best.sym, points: [{ ts: Date.now(), price: best.price }] };
      log(`Picked ${best.sym} (${best.buy}/6 bullish)`);
      await openTrade(best.sym, best.price);
    }
  } catch (e) { log("scan error: " + e.message); }
  scanning = false;
}

// ---------- web dashboard ----------
function state() {
  const price = P.position && SERIES.symbol === P.position.symbol && SERIES.points.length ? SERIES.points[SERIES.points.length - 1].price : null;
  const eq = equity(price); const tr = P.wins + P.losses;
  return {
    mode: CFG.mode, equity: eq, pnl: eq - P.start, wins: P.wins, losses: P.losses,
    winrate: tr ? Math.round(P.wins / tr * 100) : 0,
    position: P.position, watch: WATCH, trades: P.trades.slice(-30).reverse(), log: LOG.slice(0, 20),
    cfg: { tradeSize: CFG.tradeSize, sl: CFG.sl, tp: CFG.tp, trail: CFG.trail, consensusMin: CFG.consensusMin, scanSec: CFG.scanSec, watchlist: CFG.watchlist }
  };
}
const DASH = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Marin Server Bot</title><style>
body{margin:0;font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#0f1115;color:#e6e6e6;font-size:15px}
.wrap{max-width:640px;margin:0 auto;padding:14px}
h1{font-size:18px}.card{background:#161a20;border:1px solid #232833;border-radius:12px;padding:14px;margin-bottom:12px}
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;text-align:center}.big{font-size:18px;font-weight:800;display:block}
small{color:#8a93a2;font-size:11px}.up{color:#4caf50}.down{color:#ef5350}
table{width:100%;border-collapse:collapse;font-size:13px}td{padding:5px 4px;border-bottom:1px solid #1a1e26}
.nm{font-weight:700}.b{color:#7be08a}.s{color:#ff8a87}.h{color:#9aa4b2}
.btn{background:#1e88e5;color:#fff;border:0;border-radius:8px;padding:10px 14px;font-weight:700;cursor:pointer;margin-right:8px}
pre{white-space:pre-wrap;font-size:11px;color:#8a93a2;max-height:160px;overflow:auto}
</style></head><body><div class="wrap">
<h1>🌸 Marin — 24/7 Server Bot <span id="mode"></span></h1>
<div class="card"><div class="stats">
<div><span class="big" id="eq">$0</span><small>Equity</small></div>
<div><span class="big" id="pnl">$0</span><small>P&L</small></div>
<div><span class="big" id="wl">0/0</span><small>W/L</small></div>
<div><span class="big" id="wr">0%</span><small>Win rate</small></div>
</div><div id="pos" style="margin-top:10px;text-align:center"></div>
<div style="margin-top:10px"><button class="btn" onclick="act('buy')">🟢 Buy now</button><button class="btn" style="background:#c62828" onclick="act('sell')">🔴 Sell now</button></div>
</div>
<div class="card"><h3>📋 Live watchlist</h3><table id="watch"></table></div>
<div class="card"><h3>🧾 Trade history</h3><table id="trades"></table></div>
<div class="card"><h3>Log</h3><pre id="log"></pre></div>
<p style="color:#6b7280;font-size:11px">Paper trading. No profit guarantee. Refreshes every 5s.</p>
</div><script>
async function load(){const s=await(await fetch('/state')).json();
document.getElementById('mode').textContent='('+s.mode+')';
document.getElementById('eq').textContent='$'+s.equity.toFixed(0);
const p=document.getElementById('pnl');p.textContent=(s.pnl>=0?'+':'')+'$'+s.pnl.toFixed(0);p.className='big '+(s.pnl>=0?'up':'down');
document.getElementById('wl').textContent=s.wins+'/'+s.losses;
document.getElementById('wr').textContent=s.winrate+'%';
document.getElementById('pos').textContent=s.position?('Holding '+s.position.symbol+' @ '+s.position.entry.toFixed(4)):'No open position';
document.getElementById('watch').innerHTML=(s.watch||[]).map(r=>{const c=r.verdict==='buy'?'b':r.verdict==='sell'?'s':'h';const t=r.verdict==='buy'?'▲ BUY':r.verdict==='sell'?'▼ SELL':'— HOLD';return '<tr><td class="nm">'+r.symbol+(r.held?' ✅':'')+'</td><td>'+(r.price?r.price.toFixed(4):'—')+'</td><td class="'+c+'">'+t+' '+r.buy+'/6</td></tr>'}).join('')||'<tr><td>scanning…</td></tr>';
document.getElementById('trades').innerHTML=(s.trades||[]).map(t=>'<tr><td class="nm s">▼ '+t.symbol+'</td><td class="'+(t.pnl>=0?'up':'down')+'">'+(t.pnl>=0?'+':'')+t.pnl.toFixed(2)+'</td><td>'+t.reason+'</td></tr>').join('')||'<tr><td>no trades yet</td></tr>';
document.getElementById('log').textContent=(s.log||[]).join('\\n');}
async function act(w){await fetch('/api/'+w,{method:'POST'});load();}
load();setInterval(load,5000);
</script></body></html>`;

async function manualBuy() {
  if (P.position) return { error: "already holding" };
  const sym = (WATCH[0] && WATCH[0].symbol) || CFG.watchlist[0];
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

http.createServer(async (req, res) => {
  if (req.url === "/state") { res.writeHead(200, { "Content-Type": "application/json" }); return res.end(JSON.stringify(state())); }
  if (req.url === "/api/buy" && req.method === "POST") { const r = await manualBuy(); res.writeHead(200, { "Content-Type": "application/json" }); return res.end(JSON.stringify(r)); }
  if (req.url === "/api/sell" && req.method === "POST") { const r = await manualSell(); res.writeHead(200, { "Content-Type": "application/json" }); return res.end(JSON.stringify(r)); }
  if (req.url === "/health") { res.writeHead(200); return res.end("ok"); }
  res.writeHead(200, { "Content-Type": "text/html" }); res.end(DASH);
}).listen(PORT, () => log(`Marin server bot listening on :${PORT} — mode=${CFG.mode}, scan every ${CFG.scanSec}s`));

// kick off the loop
scan();
setInterval(scan, CFG.scanSec * 1000);
