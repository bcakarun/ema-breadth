# EMA Breadth — zdravlje kripto tržišta

Mjeri **postotak coina iz Top 120 koji su iznad EMA200** na 4h i 1D timeframe-u i
sažima ga u **tier skor 0–100**. Ideja je jednostavna: kad velika većina tržišta trguje
iznad svoje EMA200, tržište je zdravo; kad većina padne ispod, zdravlje se raspada —
i to se vidi prije nego na samom BTC-u.

Povijest breadtha računa se besplatno iz EMA niza, bez plaćenih povijesnih podataka.

## Kako pokrenuti

Sve je u jednoj datoteci, bez build alata:

- **Online:** otvori GitHub Pages stranicu ovog repozitorija.
- **Lokalno:** otvori `index.html` u pregledniku.

Podaci se dohvaćaju izravno iz preglednika:

- **Binance / Bybit** — javni spot klines (cijene, izračun EMA)
- **CoinGecko** — sastav univerzuma (Top 120 po tržišnoj kapitalizaciji)

Ništa od toga ne traži ključ ni registraciju.

## Povijest (neobavezno)

Aplikacija radi i bez ičega dodatnog — tada crta **skicu** povijesti, izračunatu
unatrag iz EMA niza. Skica je pristrana: zna samo za coine koji su *danas* u Top 120.

Za **iskrenu povijest** treba Supabase projekt koji svaki dan snima stvarni sastav
tržišta. Upiše se URL projekta i anon ključ preko gumba „Supabase…”; oboje ostaje
u `localStorage` tvog preglednika i ne završava u ovom repozitoriju.

Postavljanje:

| Datoteka | Čemu služi |
| --- | --- |
| `sql/01-schema.sql` | tablica `market_breadth` + RLS (anon smije **samo čitati**) |
| `sql/02-cron.sql` | dnevni cron raspored koji zove edge funkciju |
| `sql/03-nadzor.sql` | upiti za tjednu provjeru ispravnosti |
| `sql/04-samopopravak.sql` | naknadno popunjavanje propuštenog dana |
| `supabase/functions/breadth-snapshot/index.ts` | edge funkcija koja snima dnevni snapshot |

U SQL datotekama `<ANON_KEY>` je placeholder — zamijeni ga svojim ključem tek u
Supabase SQL Editoru, ne u repozitoriju.

## Vodiči

- [`docs/vodic-kako-se-cita.html`](docs/vodic-kako-se-cita.html) — kako se pokazatelj čita
- [`docs/tjedna-provjera.html`](docs/tjedna-provjera.html) — tjedna provjera da sve još radi

## Napomena

Ovo je alat za vlastito praćenje tržišta, nije investicijski savjet.
