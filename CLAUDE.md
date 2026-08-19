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

## Objava (live)
Aplikacija je na GitHub Pages (`bcakarun/ema-breadth`, grana `main`). Push na `main`
objavi novu verziju — promjena koja nije pushana ne postoji na mobitelu ni na kompu.
Deploy edge funkcije ide odvojeno (Supabase), git push je ne mijenja.

## Graf povijesti — kako se koristi
- **Okomica pod prstom/mišem**: crta + kružići na svakoj krivulji + pločica s datumom na
  osi. Bez toga se iz oblačića ne vidi na kojem danu stojiš.
- **Zum vremenske osi**: kotačić miša ili dva prsta; pomak = povlačenje mišem ili dva
  prsta; dvoklik i gumb `⤢ sve` vraćaju cijeli raspon. Stanje zuma (`view`) je prozor
  indeksa unutar `visibleHist()` i **namjerno se ne pamti** — raspon (1M/3M/…) je odluka,
  zum je pogled od trenutka.
- **Visina grafa**: gumb `↕` kruži 250/340/440/560 px i **pamti se** (`settings.chartH`);
  na računalu se okvir može i povući za donji desni kut (CSS `resize`, samo `pointer:fine`).
- **Boje i debljine krivulja** (`SERIES_DEF`, polja `color`/`w`/`dash`): Tier score crven i
  najdeblji (zaključak), % iznad 4h zelen i % iznad 1D bijel srednje debljine (mjerenja),
  BTC žut, najtanji i iscrtkan (referenca, ne poruka). Legenda i oblačić crtaju kvadratić
  iz istih polja — nova serija ne treba diranje legende.
- Jedan prst na mobitelu uvijek čita vrijednosti — pomak je zato na dva prsta, inače bi
  nestao jedini način da se brojke vide.

## Pravila
- Sučelje i vodiči na hrvatskom.
- Tema je crna: sve plohe (`--bg`, `--panel`, `--panel2`) su ista crna, razlikuju ih
  bijeli okviri (`--border`). Unutarnje crte (redovi tablice, pregrade) idu na `--line`,
  ne na `--border` — pune bijele crte pretvore stranicu u karirani papir.
- Samo besplatni servisi (Binance public API, Supabase free tier).
- Sve promjene sučelja provjeriti i na uskom ekranu (~375 px), ne samo na desktopu.
