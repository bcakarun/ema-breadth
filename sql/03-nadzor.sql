-- ============================================================
-- 03-nadzor.sql — tjedna provjera
-- Pokreni JEDNOM u SQL Editoru. Poslije samo čitaš poglede.
--
-- Zašto ovo postoji: cron ti svaki dan javlja "ok". Uvijek će javljati "ok".
-- market_breadth_gaps hvata rupe, ali NE hvata brojku koja je tu, uredna i kriva.
-- Ovi pogledi hvataju to drugo.
-- ============================================================


-- --- Tko je NOVI u univerzumu u zadnjih 7 dana ---------------
-- Ovo je jedina obrana od stvari koje volatilnost ne može uhvatiti:
-- tokenizirano zlato, tokenizirane dionice, ETF-ovi u kripto omotu.
-- Sve to SE MIČE (prati zlato/dionicu), pa prođe vol filter, a lista imena
-- ih ne zna jer još ne postoje. Jedini senzor si ti, jednom tjedno.
--
-- Ako ovdje vidiš nešto što nije kripto — javi da ide na listu.
create or replace view market_breadth_entrants as
with latest as (
  select date, raw from market_breadth order by date desc limit 1
),
baseline as (
  select raw from market_breadth
  where date <= (select date from latest) - 7
  order by date desc limit 1
)
select
  (select date from latest)            as na_dan,
  c->>'base'                           as coin,
  (c->>'rank')::int                    as rang,
  (c->>'pinned')::boolean              as prikovan
from latest, jsonb_array_elements(latest.raw) c
where exists (select 1 from baseline)          -- prije 8. dana nema s čim usporediti
  and not exists (
    select 1 from baseline, jsonb_array_elements(baseline.raw) b
    where b->>'base' = c->>'base'
  )
order by rang;


-- --- Povijest promjena sastava ------------------------------
-- Tko je ušao, tko izašao, po danima. Vraća samo dane kad se nešto
-- promijenilo. Ovo je zapis kretanja tržišta sam po sebi: coin koji
-- uđe u Top 120 i coin koji ispadne su vijest, ne šum.
create or replace view market_breadth_changelog as
select * from (
  with per_day as (
    select date, array_agg(c->>'base') as coins
    from market_breadth, jsonb_array_elements(raw) c
    group by date
  ),
  paired as (
    select date, coins, lag(coins) over (order by date) as prev
    from per_day
  )
  select
    date,
    coalesce((select array_agg(x order by x)
              from (select unnest(coins) except select unnest(prev)) t(x)), '{}') as usli,
    coalesce((select array_agg(x order by x)
              from (select unnest(prev) except select unnest(coins)) t(x)), '{}') as izasli
  from paired
  where prev is not null
) t
where cardinality(usli) > 0 or cardinality(izasli) > 0
order by date desc;

-- upotreba:  select * from market_breadth_changelog limit 20;
-- Prvih par dana ne vraća ništa — treba mu bar dva dana za usporedbu.


-- --- Kreće li se nazivnik razumno ----------------------------
-- Nagli skok ili pad n_universe znači da se nešto promijenilo na burzi
-- ili u API-ju — ne na tržištu. Blagi drift je normalan.
create or replace view market_breadth_univerzum as
select
  date,
  n_universe,
  n_universe - lag(n_universe) over (order by date) as promjena,
  n_full,
  round(tier_score::numeric, 1) as tier
from market_breadth
order by date desc
limit 30;


-- ============================================================
-- TJEDNA PROVJERA — pokreni sva četiri, traje 30 sekundi
-- ============================================================

-- 1) Fali li koji dan?           očekuj: 0 redova
--    select * from market_breadth_gaps;

-- 2) Je li mjera ostala ista?    očekuj: razlicitih_pragova = 1, razlicitih_ema = 1
--    select * from market_breadth_health;

-- 3) Je li zapis svjež?          očekuj: max(date) = jučer
--    select max(date) as zadnji, current_date - 1 as trebao_bi_biti from market_breadth;
--
--    NE gledaj cron.job_run_details kao dokaz da radi. net.http_get samo
--    stavi zahtjev u red i vrati se, pa cron upiše 'succeeded' i kad je
--    Edge Function vratila 500 ili uopće nije odgovorila. Jedini pošten
--    dokaz je red u tablici. Detalji u 04-samopopravak.sql.

-- 4) Tko je novi u univerzumu?   očekuj: 0-3 coina, svi kripto
--    select * from market_breadth_entrants;


-- ============================================================
-- POPRAVAK RUPE
-- Edge Function → Test → Query Parameters:
--     write = true
--     date  = 2026-07-20        (datum iz market_breadth_gaps)
-- Jedan datum po pozivu. Ponovi za svaki.
--
-- Rupa od par dana: bez brige. Univerzum se u tjedan dana jedva pomakne,
-- a cijene i EMA su point-in-time točne. Red dobije backfilled = true.
--
-- Rupa duža od ~2 tjedna: NEMOJ. Popunio bi je današnjim sastavom
-- Top 120, a to je survivorship bias — točno ono zbog čega ovaj
-- projekt uopće postoji. Bolje prazno nego lažno.
-- ============================================================
