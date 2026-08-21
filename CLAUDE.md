# EMA Breadth — zdravlje tržišta

## Što je ovo
Aplikacija koja mjeri **postotak coina iznad EMA200** (na 4h i 1d timeframe-u) kao pokazatelj
zdravlja kripto tržišta. Glavni broj je **% iznad EMA200 na 1D** (spori okvir = režim),
a 4h se čita uz njega — nikad se ne zbrajaju. Povijest breadtha računa se besplatno
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
- **Boje i debljine krivulja** (`SERIES_DEF`, polja `color`/`w`/`dash`/`axis`): % iznad 4h
  bijel i % iznad 1D zelen srednje debljine (mjerenja), Raspon crven (`axis:'s'`), BTC žut,
  najtanji i iscrtkan (referenca, ne poruka). Legenda i oblačić crtaju kvadratić iz istih
  polja — nova serija ne treba diranje legende.
- **Raspon (4h − 1D)** ima vlastitu traku ispod glavnog polja (`axis:'s'`), jer ide u minus:
  na skali 0–100 bio bi odrezan, a razvlačenje glavne osi na −100..100 prepolovilo bi
  razlučivost obje postotne krivulje. Kad je serija skrivena, traka nestaje i glavno polje
  vraća punu visinu.
- **Živa točka**: današnji dan nije zatvoren pa ga u zapisu nema. Kači se na kraj
  **samo za graf** (`curHist()`), iscrtkanom spojnicom i šupljom točkom — `histDB` ostaje
  čist, jer se iz njega računaju promjene, trajanje režima i upozorenja, a ondje neupisana
  točka nema što tražiti. Ne kači se ako se `topN`/`emaLen` razlikuju od zadnjeg zapisa:
  tad bi spojnica vezala dva različita univerzuma.
- **Raspon 1M/3M/… mjeri se od sada**, ne od zadnjeg zapisa. Zato 1M pokaže 29 zapisanih
  dana + živu točku: trideseti dan je današnji, koji još nije zatvoren.
- **Pozadina po režimu**: okomite trake u boji režima tog dana, alfa 0.11 (`TONE_BG`).
  Jače od toga i pozadina proguta krivulje na crnoj temi. Pali se/gasi u legendi
  (ključ `regime` u `settings.hidden`).
- Jedan prst na mobitelu uvijek čita vrijednosti — pomak je zato na dva prsta, inače bi
  nestao jedini način da se brojke vide.

## Zašto nema tier scorea
Prosjek dvaju okvira je uklonjen 20.08.2026. Bio je pogrešan iz dva razloga:
1. **Briše informaciju.** 81/19 i 50/50 daju isti prosjek, a to su dva različita tržišta.
   Informacija je u razlici — zato sad postoji `raspon` i oznaka režima.
2. **Nasljeduje oblik brzog okvira.** 1D se miješa sporo, pa je gotovo sva dnevna varijanca
   dolazila iz 4h; crvena krivulja bila je 4h krivulja u drugom mjerilu.

Kod dionica isti par (% iznad 50-dnevnog i 200-dnevnog prosjeka) također se nikad ne spaja
u jedan broj. Ako se ikad javi napast da se vrati jedan skupni skor — ovo je razlog protiv.

Postotna promjena glavnog broja se **ne prikazuje**, samo razlika u bodovima: na omeđenoj
skali 0–100 blizu poda je eksplozivna i laže (23→51 ispadne „+119 %”).

Kolona `tier_score` u bazi i dalje se puni iz edge funkcije — namjerno se ne dira, da se
zapis ne prekida. Klijent je više ne čita.

## Pravila
- Sučelje i vodiči na hrvatskom.
- Tema je crna: sve plohe (`--bg`, `--panel`, `--panel2`) su ista crna, razlikuju ih
  bijeli okviri (`--border`). Unutarnje crte (redovi tablice, pregrade) idu na `--line`,
  ne na `--border` — pune bijele crte pretvore stranicu u karirani papir.
- Samo besplatni servisi (Binance public API, Supabase free tier).
- Sve promjene sučelja provjeriti i na uskom ekranu (~375 px), ne samo na desktopu.
