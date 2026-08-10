// ============================================================
// breadth-snapshot — dnevni point-in-time snapshot breadtha
//
// DEFAULT JE DRY RUN. Bez ?write=true ništa ne ulazi u bazu.
// Kriv prvi red = zagađena povijest od početka, pa upis mora biti
// svjesna odluka, a ne zadana vrijednost.
//
//   dry run:   GET /breadth-snapshot
//   upis:      GET /breadth-snapshot?write=true
//   backfill:  GET /breadth-snapshot?write=true&date=2026-07-10
//
// Deno, bez ijedne vanjske ovisnosti (može se zalijepiti ravno u dashboard).
// ============================================================

const BINANCE = "https://api.binance.com";
const BYBIT   = "https://api.bybit.com";
const DAY     = 864e5;

const TFS: Tf[] = ["4h", "1d"];
type Tf = "4h" | "1d";
const BYBIT_TF: Record<Tf, string> = { "4h": "240", "1d": "D" };

// Offset unutar dana na kojem se svijeća tog TF-a ZATVARA:
//   1d bar openTime = D 00:00 → zatvara D 23:59
//   4h bar openTime = D 20:00 → zatvara D 23:59
// Tražimo bar TOČNO na toj poziciji. To je razlog zašto ovdje nema
// nikakvog "baci zadnju svijeću" trika — svijeća u tijeku ima drugi
// openTime i jednostavno se ne poklopi. Nema heuristike, nema greške.
const CLOSING_OFFSET: Record<Tf, number> = { "4h": 20 * 36e5, "1d": 0 };

// Stableovi, wrapped tokeni i tokenizirani trezori/fondovi.
// Ništa od ovoga ne smije ući u breadth: stablecoin po konstrukciji ne trendira,
// visi na ~0% od svoje EME i brojao bi se iznad/ispod nasumično — čisti šum u nazivniku.
// Zadnjih 15 (od USDF nadalje) nađeno 15.7.2026. u dry runu: prolazili su filter i
// ispadali tek zato što slučajno nemaju spot par. Dan kad ga dobiju, tiho bi ušli.
const STABLES = new Set([
  "USDT","USDC","BUSD","DAI","TUSD","USDP","FDUSD","PYUSD","USDD","USDE","USDS","USD1",
  "GUSD","FRAX","LUSD","EURC","EURT","RLUSD","USDG","USYC","BUIDL","USDY","SUSDE","SUSDS",
  "WBTC","WETH","STETH","WSTETH","WEETH","CBBTC","WBETH","RETH","METH","EZETH","RSETH",
  "SOLVBTC","LBTC","BSC-USD",
  // stableovi
  "USDF","USDGO","USD0","USX","YLDS","A7A5","GHO",
  // euro stableovi
  "EUTBL","EURSAFO",
  // tokenizirani trezori / fondovi / RWA
  "USTB","OUSG","JTRSY","JAAA","BCAP","FIGR_HELOC",
  // roba — nije kripto. Zlato se MIČE (prati zlato), pa ga volatilnost ne može
  // uhvatiti; jedina obrana je ime. Znači: OVA GRANA TRUNE. Novi tokenizirani
  // zlato/srebro/nafta, ili tokenizirana dionica, ušetali bi neprimijećeno.
  // Jedina stvarna obrana je tjedni pogled u market_breadth_entrants.
  //
  // KAU (Kinesis Gold) i KAG (Kinesis Silver) dodani 8.8.2026. u tjednoj provjeri:
  // KAU je tada bio #119 po market capu i NIJE ušao samo zato što nema USDT spot
  // par ni na Binanceu ni na Bybitu. Dan kad ga dobije, ušao bi tiho — vol filter
  // ga ne može uhvatiti jer prati cijenu zlata, a ona se miče. Ovo je preventiva:
  // na dan dodavanja mijenja točno ništa u brojci.
  "XAUT","PAXG","KAU","KAG",
]);

const dayOf = (ts: number) => Math.floor(ts / DAY) * DAY;

async function fetchJSON(url: string, retries = 3): Promise<any> {
  for (let i = 0; i <= retries; i++) {
    const r = await fetch(url);
    if (r.status === 429 || r.status === 418) {
      await new Promise((s) => setTimeout(s, 2000 * (i + 1)));
      continue;
    }
    if (!r.ok) throw new Error(`HTTP ${r.status} ${url.split("?")[0]}`);
    return r.json();
  }
  throw new Error("rate limited: " + url.split("?")[0]);
}

// Dnevna volatilnost: st.dev. promjena zadnjih ~200 barova, u %.
// Ovo je druga obrana od stableova — po PONAŠANJU, ne po imenu.
// Lista imena (STABLES) ne može uhvatiti stablecoin koji još ne postoji;
// volatilnost može: prikovan coin se ne miče bez obzira kako se zove.
// Izmjereno 15.7.2026 na Top 120: prikovani max 0.044%, pravi coini min 1.286%
// (TRX) — razmak 29x, prag 0.5% sjedi u sredini s ~10x rezerve na obje strane.
function stdevPct(closes: number[]): number | null {
  if (closes.length < 30) return null;
  const start = Math.max(1, closes.length - 200);
  const rets: number[] = [];
  for (let i = start; i < closes.length; i++) rets.push(closes[i] / closes[i - 1] - 1);
  const m = rets.reduce((s, x) => s + x, 0) / rets.length;
  return Math.sqrt(rets.reduce((s, x) => s + (x - m) ** 2, 0) / rets.length) * 100;
}
const PIN_VOL_1D = 0.5;   // prag za 1d svijeće
const PIN_VOL_4H = 0.2;   // 4h svijeće se manje miču — srazmjerno niži prag

// EMA sa SMA seedom — identična implementacija kao u frontendu.
function ema(closes: number[], len: number): number | null {
  if (closes.length < len) return null;
  let e = 0;
  for (let i = 0; i < len; i++) e += closes[i];
  e /= len;
  const k = 2 / (len + 1);
  for (let i = len; i < closes.length; i++) e = closes[i] * k + e * (1 - k);
  return e;
}

type Coin = { src: "binance" | "bybit"; symbol: string; base: string; name: string; rank: number };
type Bar  = { above: boolean; dist: number; close: number; emaVal: number; vol: number | null };

async function loadPairs() {
  const [bin, byb] = await Promise.allSettled([
    fetchJSON(`${BINANCE}/api/v3/exchangeInfo`).then((d) => {
      const m = new Map<string, string>();
      for (const s of d.symbols) {
        if (s.status !== "TRADING" || s.quoteAsset !== "USDT") continue;
        if (/(UP|DOWN|BULL|BEAR)$/.test(s.baseAsset) && s.baseAsset.length > 4) continue;
        m.set(s.baseAsset.toUpperCase(), s.symbol);
      }
      return m;
    }),
    fetchJSON(`${BYBIT}/v5/market/instruments-info?category=spot&limit=1000`).then((d) => {
      const m = new Map<string, string>();
      for (const s of d.result.list) {
        if (s.status !== "Trading" || s.quoteCoin !== "USDT") continue;
        m.set(s.baseCoin.toUpperCase(), s.symbol);
      }
      return m;
    }),
  ]);

  const markets = new Map<string, { src: "binance" | "bybit"; symbol: string }>();
  const srcs = ["binance", "bybit"] as const;
  [bin, byb].forEach((r, i) => {
    if (r.status !== "fulfilled") return;
    for (const [b, s] of r.value) if (!markets.has(b)) markets.set(b, { src: srcs[i], symbol: s });
  });
  if (!markets.size) throw new Error("Ni Binance ni Bybit ne odgovaraju — snapshot se prekida.");
  return markets;
}

// Dohvat SVIH barova do kraja ciljanog dana, pa izbor TOČNO onog bara
// koji taj dan zatvara. Isti kod radi i za danas i za backfill rupe —
// jedina razlika je endTime. Jedan put kroz kod = jedno mjesto za grešku.
async function loadBar(c: Coin, tf: Tf, emaLen: number, targetDay: number): Promise<Bar | null> {
  const endTime = targetDay + DAY - 1;
  const limit = Math.min(1000, emaLen * 2 + 60);
  let bars: { ts: number; close: number }[];

  if (c.src === "binance") {
    const d = await fetchJSON(
      `${BINANCE}/api/v3/klines?symbol=${c.symbol}&interval=${tf}&limit=${limit}&endTime=${endTime}`,
    );
    bars = d.map((k: any) => ({ ts: k[0], close: parseFloat(k[4]) }));
  } else {
    const d = await fetchJSON(
      `${BYBIT}/v5/market/kline?category=spot&symbol=${c.symbol}&interval=${BYBIT_TF[tf]}&limit=${limit}&end=${endTime}`,
    );
    bars = d.result.list.map((k: any) => ({ ts: +k[0], close: parseFloat(k[4]) })).reverse();
  }

  const want = targetDay + CLOSING_OFFSET[tf];
  const idx = bars.findIndex((b) => b.ts === want);
  if (idx < 0) return null;                       // taj dan nema zatvorenu svijeću → coin ne ulazi u nazivnik
  const closes = bars.slice(0, idx + 1).map((b) => b.close);
  const e = ema(closes, emaLen);
  if (e == null) return null;                     // premalo povijesti → ne ulazi u nazivnik
  const close = closes[closes.length - 1];
  return { above: close >= e, dist: (close / e - 1) * 100, close, emaVal: e, vol: stdevPct(closes) };
}

Deno.serve(async (req) => {
  const t0 = Date.now();
  const url    = new URL(req.url);
  const write  = url.searchParams.get("write") === "true";   // DRY RUN je default
  const topN   = Number(url.searchParams.get("top_n")   ?? 120);
  const emaLen = Number(url.searchParams.get("ema_len") ?? 200);
  const dateQ  = url.searchParams.get("date");

  // Bez ?date= → jučer. Cron ide u 00:10 UTC, pa je jučer zadnji
  // dan koji je STVARNO zatvorio svijeću. Današnja je još u tijeku.
  const targetDay = dateQ ? Date.parse(dateQ + "T00:00:00Z") : dayOf(Date.now()) - DAY;
  if (!Number.isFinite(targetDay)) {
    return json({ error: "date mora biti YYYY-MM-DD" }, 400);
  }
  if (targetDay >= dayOf(Date.now())) {
    return json({ error: "taj dan još nije zatvoren — snapshot bi bio lažan" }, 400);
  }

  try {
    const markets = await loadPairs();

    // Univerzum: Top N po market capu. Prag je FIKSAN.
    // N pluta pošteno — coin bez spot para ili stable jednostavno ne uđe.
    // NE popunjava se do okruglog broja posezanjem dublje u rang listu.
    const pages = topN > 100 ? [1, 2] : [1];
    let cg: any[] = [];
    for (const p of pages) {
      cg = cg.concat(await fetchJSON(
        `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=${p}&sparkline=false`,
      ));
    }

    const coins: Coin[] = [];
    let skStable = 0; const noPair: string[] = [];
    for (const c of cg) {
      if (c.market_cap_rank == null || c.market_cap_rank > topN) continue;
      const base = String(c.symbol).toUpperCase();
      if (STABLES.has(base)) { skStable++; continue; }
      const mk = markets.get(base);
      if (!mk) { noPair.push(base); continue; }
      coins.push({ ...mk, base, name: c.name, rank: c.market_cap_rank });
    }
    if (coins.length < 20) throw new Error(`Samo ${coins.length} coina u univerzumu — nešto ne valja, ne upisujem.`);

    // 240 poziva. Izmjereno: weight 2/poziv = 480 od 6000/min (8%).
    // 12 workera je konzervativno i s velikom rezervom.
    const tasks: { c: Coin; tf: Tf }[] = [];
    for (const c of coins) for (const tf of TFS) tasks.push({ c, tf });
    const got = new Map<string, Partial<Record<Tf, Bar>>>();
    let idx = 0, errs = 0;
    async function worker() {
      while (idx < tasks.length) {
        const t = tasks[idx++];
        try {
          const b = await loadBar(t.c, t.tf, emaLen, targetDay);
          if (!got.has(t.c.base)) got.set(t.c.base, {});
          if (b) got.get(t.c.base)![t.tf] = b;
        } catch { errs++; }
      }
    }
    const btcP = fetchJSON(
      `${BINANCE}/api/v3/klines?symbol=BTCUSDT&interval=1d&limit=2&endTime=${targetDay + DAY - 1}`,
    ).then((d: any) => { const b = d.find((k: any) => k[0] === targetDay); return b ? parseFloat(b[4]) : null; })
     .catch(() => null);

    const [, btcPrice] = await Promise.all([
      Promise.all(Array.from({ length: 12 }, worker)),
      btcP,
    ]);

    // Ako je previše poziva puklo, snapshot je nepotpun. Radije ništa nego smeće.
    if (errs > tasks.length * 0.15) {
      throw new Error(`${errs}/${tasks.length} poziva palo — snapshot je nepotpun, ne upisujem.`);
    }

    // Prikovani coini: ne mogu trendirati, pa ne smiju biti u mjeri koliko
    // coina trendira. Brojali bi se iznad/ispod EME praktički nasumično i
    // vukli breadth prema 50 bez obzira što tržište radi.
    const pinned = new Set<string>();
    for (const [base, m] of got) {
      const v1d = m["1d"]?.vol, v4h = m["4h"]?.vol;
      if (v1d != null ? v1d < PIN_VOL_1D : (v4h != null && v4h < PIN_VOL_4H)) pinned.add(base);
    }

    // --- agregacija (prikovani isključeni iz SVIH nazivnika) ---
    const pct: any = {}, n: any = {}, distAll: any = {}, distAbove: any = {};
    for (const tf of TFS) {
      let above = 0, cnt = 0, sumAll = 0, sumAbove = 0, nAbove = 0;
      for (const [base, m] of got) {
        if (pinned.has(base)) continue;
        const b = m[tf]; if (!b) continue;
        cnt++; sumAll += b.dist;
        if (b.above) { above++; nAbove++; sumAbove += b.dist; }
      }
      n[tf] = cnt;
      pct[tf] = cnt ? (above / cnt) * 100 : null;                 // populacija B: per-TF nazivnik
      distAll[tf] = cnt ? sumAll / cnt : null;
      distAbove[tf] = nAbove ? sumAbove / nAbove : null;
    }

    // populacija A: samo coini s validnom EMA na SVIM TF-ovima. Ne miješa se s B.
    let pts = 0, nFull = 0;
    for (const [base, m] of got) {
      if (pinned.has(base)) continue;
      if (!TFS.every((tf) => m[tf])) continue;
      nFull++;
      for (const tf of TFS) if (m[tf]!.above) pts++;
    }
    const tierScore = nFull >= 8 ? (pts / (nFull * TFS.length)) * 100 : null;

    // raw: SVIH 120 coina s rangom. Ovo je jedina kolona koja je stvarno
    // nezamjenjiva — sve ostalo je izvedeno mišljenje. Dok je ovo tu,
    // Top 50 / Top 100 / drugi tier score / druga težina preračunavaju se
    // iz spremljenog reda. Prag i formula prestaju biti neopozivi.
    const raw = coins.map((c) => {
      const m = got.get(c.base) ?? {};
      const per: any = {};
      for (const tf of TFS) {
        const b = m[tf];
        per[tf] = b ? { close: b.close, ema: +b.emaVal.toFixed(8), above: b.above, dist: +b.dist.toFixed(4),
                        vol: b.vol == null ? null : +b.vol.toFixed(4) } : null;
      }
      // prikovani OSTAJU u raw (s flagom) — raw je osiguranje, ne izračun.
      // Ako se prag ikad pokaže krivim, iz raw se sve preračuna bez rupe u povijesti.
      return { base: c.base, rank: c.rank, src: c.src, symbol: c.symbol, pinned: pinned.has(c.base), tf: per };
    });

    const dateStr = new Date(targetDay).toISOString().slice(0, 10);
    const row = {
      date: dateStr,
      pct_above_4h: pct["4h"], pct_above_1d: pct["1d"],
      n_4h: n["4h"], n_1d: n["1d"],
      tier_score: tierScore, n_full: nFull,
      avg_dist_all_4h: distAll["4h"],   avg_dist_all_1d: distAll["1d"],
      avg_dist_above_4h: distAbove["4h"], avg_dist_above_1d: distAbove["1d"],
      btc_price: btcPrice ?? null,
      top_n: topN, ema_len: emaLen, tfs: TFS,
      n_universe: coins.length - pinned.size,   // efektivni univerzum: bez prikovanih
      backfilled: !!dateQ,
      duration_ms: Date.now() - t0,
      raw,
    };

    if (!write) {
      return json({
        dry_run: true,
        poruka: "NIŠTA NIJE UPISANO. Provjeri brojke, pa dodaj ?write=true.",
        trajanje_s: +((Date.now() - t0) / 1000).toFixed(1),
        poziva: tasks.length, gresaka: errs,
        univerzum: coins.length - pinned.size, izbaceno_stable: skStable,
        izbaceno_prikovano: [...pinned].sort(), bez_para: noPair,
        red: { ...row, raw: `[${raw.length} coina — sakriveno u dry runu]` },
        uzorak: raw.slice(0, 10),
      });
    }

    const SB_URL = Deno.env.get("SUPABASE_URL")!;
    const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const res = await fetch(`${SB_URL}/rest/v1/market_breadth?on_conflict=date`, {
      method: "POST",
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(row),
    });
    if (!res.ok) throw new Error(`Upis pao: HTTP ${res.status} ${await res.text()}`);

    return json({
      ok: true, date: dateStr, tier_score: tierScore, n_full: nFull,
      backfilled: !!dateQ, trajanje_s: +((Date.now() - t0) / 1000).toFixed(1),
    });
  } catch (e) {
    // Vidljiv neuspjeh > tihi djelomični upis.
    return json({ ok: false, error: String(e?.message ?? e), trajanje_s: +((Date.now() - t0) / 1000).toFixed(1) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status, headers: { "Content-Type": "application/json" },
  });
}
