-- ============================================================
-- 04-samopopravak.sql — cron koji sam popuni rupu
--
-- Zašto ovo postoji: 02-cron.sql ima dva pokušaja (00:10 i 01:10 UTC).
-- Oba gađaju ISTI dan i oba padnu ako je taj sat bio loš — CoinGecko
-- vrati 429, Binance štuca, funkcija istekne. Poslije toga NITKO više
-- ne pokuša. Dan je izgubljen dok ga ručno ne primijetiš.
--
-- Ovaj job gleda market_breadth_gaps i popuni što fali, svaki dan.
-- Rupa od jednog dana se time zatvara sama, sljedeće jutro.
--
-- Prije pokretanja zamijeni <ANON_KEY> (Settings → API → anon / public).
-- ============================================================

select cron.schedule(
  'breadth-gap-heal',
  '10 3 * * *',
  $$
  select net.http_get(
    url := 'https://ycjxqzjlpwxpyyejsffi.supabase.co/functions/v1/breadth-snapshot?write=true&date='
           || to_char(d.missing_date, 'YYYY-MM-DD'),
    headers := '{"Authorization": "Bearer <ANON_KEY>"}'::jsonb,
    timeout_milliseconds := 120000
  )
  from (
    -- Zadnjih 14 dana i najviše 3 odjednom.
    --   14 dana: starije se NE popunjava — popunilo bi se današnjim
    --            sastavom Top 120, a to je survivorship bias.
    --   3 komada: svaki poziv je 240 zahtjeva na burzu. Tri paralelno je
    --            ~1440 weighta od 6000/min. Više nema smisla — ako je rupa
    --            velika, popunit će se kroz par dana, dan po dan.
    select missing_date
    from market_breadth_gaps
    where missing_date >= current_date - 14
    order by missing_date
    limit 3
  ) d;
  $$
);

-- Upsert je idempotentan, pa ovaj job ne može pokvariti postojeći red.
-- Kad rupa nema, market_breadth_gaps je prazan i job ne pošalje NIŠTA.


-- ============================================================
-- VAŽNO O NADZORU — cron.job_run_details te LAŽE
--
-- net.http_get samo STAVI zahtjev u red i odmah se vrati. Cron zato
-- upiše status = 'succeeded' čim je SQL prošao — bez obzira je li Edge
-- Function odgovorila 200, 500 ili uopće nije odgovorila.
--
-- Znači: 'succeeded' u cron.job_run_details NE ZNAČI da je dan snimljen.
-- Jedini pošten dokaz da je snapshot prošao je red u tablici:
--
--     select * from market_breadth_gaps;          -- mora biti prazno
--     select max(date) from market_breadth;       -- mora biti current_date - 1
--
-- Stvarni HTTP odgovor stoji u net._http_response, ali samo ~6 sati:
--
--     select id, status_code, left(content, 300) as odgovor, created
--     from net._http_response order by created desc limit 10;
--
-- Ako gledaš isti dan kad je job pao, ovdje piše ZAŠTO. Sutradan je
-- prekasno — zato je aplikacija ta koja viče kad zadnji dan nije jučer.
-- ============================================================

-- Ugasi
--   select cron.unschedule('breadth-gap-heal');
