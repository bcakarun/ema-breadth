-- ============================================================
-- market_breadth — dopuna postojeće tablice
-- Tablica već postoji i prazna je. Sve je ADITIVNO, ništa se ne briše.
-- Pokreni u Supabase → SQL Editor (projekt: ema-breadth).
-- ============================================================

-- --- 1) Kolone koje nedostaju ---------------------------------

-- Bez ovih ne znaš pod kojim je pravilima red nastao. Ako za pola godine
-- promijeniš prag ili EMA, bez ovoga imaš tihi diskontinuitet u seriji
-- koji NIKAD nećeš primijetiti. S ovime je vidljiv jednim upitom.
alter table market_breadth add column if not exists top_n      int;
alter table market_breadth add column if not exists ema_len    int;
alter table market_breadth add column if not exists tfs        text[];

-- Koliko je coina bilo u univerzumu nakon izbacivanja stableova/bez-para.
-- Nazivnik mora biti vidljiv, inače ne znaš je li pad breadtha stvaran
-- ili ti je samo par coina ispalo s burze.
alter table market_breadth add column if not exists n_universe int;

-- true = red je naknadno popunjen (rupa), s DANAŠNJIM univerzumom i
-- povijesnim cijenama. Cijene i EMA su point-in-time točne, sastav nije.
-- Bez ovog flaga ne razlikuješ iskrenu točku od zakrpe.
alter table market_breadth add column if not exists backfilled boolean not null default false;

-- Trajanje izvršavanja — da vidiš trend prije nego ti nešto počne pucati.
alter table market_breadth add column if not exists duration_ms int;

-- 1h je izbačen (EMA200 na 1h ≈ 8 dana povijesti = šum, ne režim).
-- Kolone ostaju prazne — koštaju ništa, a izbjegavaš migraciju ako se predomisliš.
comment on column market_breadth.pct_above_1h is 'NEKORIŠTENO — 1h izbačen 14.7.2026, EMA200 na 1h je šum';


-- --- 2) RLS: anon smije SAMO čitati ---------------------------
alter table market_breadth enable row level security;

drop policy if exists "anon reads breadth" on market_breadth;
create policy "anon reads breadth" on market_breadth
  for select to anon using (true);
-- Namjerno NEMA insert/update policy za anon. Upis ide isključivo
-- service role ključem iz Edge Functiona, koji zaobilazi RLS.


-- --- 3) Koji datumi nedostaju ---------------------------------
-- Ovo je tvoj tjedni upit. Pokreni ga svaki ponedjeljak.
create or replace view market_breadth_gaps as
select d::date as missing_date
from generate_series(
       coalesce((select min(date) from market_breadth), current_date),
       current_date - 1,
       '1 day'
     ) d
where not exists (select 1 from market_breadth mb where mb.date = d::date);

-- upotreba:  select * from market_breadth_gaps;


-- --- 4) Zdravlje zapisa jednim pogledom -----------------------
create or replace view market_breadth_health as
select
  count(*)                                        as redova,
  min(date)                                       as od,
  max(date)                                       as do,
  (max(date) - min(date) + 1) - count(*)          as rupa,
  count(*) filter (where backfilled)              as backfillanih,
  count(distinct top_n)                           as razlicitih_pragova,   -- MORA biti 1
  count(distinct ema_len)                         as razlicitih_ema,       -- MORA biti 1
  round(avg(n_full), 1)                           as prosj_n_full,
  max(duration_ms)                                as najduze_ms
from market_breadth;

-- Ako "razlicitih_pragova" ili "razlicitih_ema" ikad postane > 1,
-- serija ti više nije usporediva sama sa sobom. To je tihi kvar
-- koji bez ovog pogleda ne bi vidio mjesecima.
