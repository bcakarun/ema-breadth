# EMA Breadth — zdravlje tržišta

## Što je ovo
Aplikacija koja mjeri **postotak coina iznad EMA200** (na 4h i 1d timeframe-u) kao pokazatelj
zdravlja kripto tržišta, sa **tier skorom 0–100**. Povijest breadtha računa se besplatno
iz EMA niza (bez plaćenih povijesnih podataka).

## Tehnologija
- `index.html` — glavna aplikacija, sav kod u jednoj datoteci, bez build alata.
- Podaci: Binance public API (klines) direktno iz browsera.
- **Supabase** dio za automatske snapshotove:
  - `supabase/functions/breadth-snapshot/index.ts` — edge funkcija za snimanje snapshota
  - `sql/01-schema.sql`, `02-cron.sql`, `03-nadzor.sql` — shema, cron raspored, nadzor

## Struktura
- `docs/vodic-kako-se-cita.html` — vodič za vlasnika kako čitati pokazatelj
- `docs/tjedna-provjera.html` — upute za tjednu provjeru
- Kopije docs vodiča postoje i u `moje-aplikacije/docs/` — kod izmjena sinkronizirati.

## Pravila
- Sučelje i vodiči na hrvatskom.
- Samo besplatni servisi (Binance public API, Supabase free tier).
