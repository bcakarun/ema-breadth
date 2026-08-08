-- ============================================================
-- pg_cron — dnevni snapshot
-- POKRENI TEK KAD ?write=true RUČNO PROĐE ČISTO.
--
-- Prije pokretanja zamijeni:
--   ycjxqzjlpwxpyyejsffi  → Settings → General → Reference ID
--   <ANON_KEY>     → Settings → API → anon / public
--
-- NAMJERNO anon, NE service_role.
-- Anon ključ služi samo da Edge Function uopće prihvati poziv (verify_jwt).
-- Upis u bazu radi service_role ključ koji funkcija čita iz svoje env
-- varijable — on nikad ne napušta Supabase i nigdje ga ne tipkaš.
-- Anon ključ je ionako javan (stoji ti u frontendu) i pod RLS-om ne može pisati.
-- ============================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- --- glavni run: 00:10 UTC -----------------------------------
-- Jučerašnja svijeća je zatvorena prije 10 minuta.
select cron.schedule(
  'breadth-daily',
  '10 0 * * *',
  $$
  select net.http_get(
    url     := 'https://ycjxqzjlpwxpyyejsffi.supabase.co/functions/v1/breadth-snapshot?write=true',
    headers := '{"Authorization": "Bearer <ANON_KEY>"}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);

-- --- drugi pokušaj: 01:10 UTC --------------------------------
-- Upsert je idempotentan: ako je prvi uspio, drugi upiše identičan red
-- i ne napravi ništa. Ako je prvi pao (burza je štucnula, mreža je pala),
-- drugi ga spasi. Dva pokušaja koštaju 240 API poziva i ništa drugo,
-- a rupa u zapisu te košta dan koji se ne može vratiti.
select cron.schedule(
  'breadth-daily-retry',
  '10 1 * * *',
  $$
  select net.http_get(
    url     := 'https://ycjxqzjlpwxpyyejsffi.supabase.co/functions/v1/breadth-snapshot?write=true',
    headers := '{"Authorization": "Bearer <ANON_KEY>"}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);


-- ============================================================
-- KORISNI UPITI
-- ============================================================

-- Što je zakazano
--   select jobid, jobname, schedule, active from cron.job;

-- Je li zadnjih par runova prošlo (OVO GLEDAJ PRVI TJEDAN SVAKI DAN)
--   select jobid, runid, status, return_message, start_time
--   from cron.job_run_details order by start_time desc limit 10;

-- Rupe
--   select * from market_breadth_gaps;

-- Zdravlje zapisa — razlicitih_pragova i razlicitih_ema MORAJU biti 1
--   select * from market_breadth_health;

-- Popuni rupu ručno (Edge Function radi backfill istim kodom):
--   https://ycjxqzjlpwxpyyejsffi.supabase.co/functions/v1/breadth-snapshot?write=true&date=2026-07-10

-- Ugasi
--   select cron.unschedule('breadth-daily');
--   select cron.unschedule('breadth-daily-retry');


-- ============================================================
-- NAPOMENA O PAUZIRANJU PROJEKTA (provjereno 14.7.2026.)
-- Supabase free tier pauzira projekt nakon ~7 dana bez "user database
-- activity". Tvoj dnevni upis se broji kao takva aktivnost, pa je cron
-- sam sebi keep-alive. Ne treba poseban ping job.
-- Rizik se time obrće: projekt se ne može pauzirati i time ubiti cron —
-- pauza može nastati samo ako je cron VEĆ stao. Zato je jedina prava
-- obrana tjedni pogled u market_breadth_gaps.
-- ============================================================
