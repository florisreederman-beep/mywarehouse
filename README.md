# MyWarehouse

Voorraadapp voor vintage resellers: artikelen invoeren met locatie, QR-labels printen (A4-stickervel of labelrol), labels live scannen met de camera, verkopen bijhouden met winst en verlies, en exporteren naar CSV.

## Hoe het werkt

- Gewone website zonder server: alle bestanden staan in deze map, er is geen bouwstap.
- **Plattegrond**: op de pagina Voorraad teken je eerst je ruimte(s): slaapkamer, schuur, garage, zolder, opslagbox of magazijn. Je zet er meubels in (bed, deur, auto…) en opslagplekken (kledingrek, stelling met planken, kast, dozen). Bij elk artikel kies je daarna een plek, en bij het zoeken licht de plek op.
- Gegevens staan op het apparaat zelf (in de browser). Gebruik **Account → Back-up downloaden** regelmatig.
- **Accounts (optioneel)**: met Supabase ingevuld in `config.js` kan iedereen een account maken. De voorraad, plattegrond en profielgegevens gaan dan ook online mee, en werken op meer apparaten. Zonder `config.js`-gegevens blijft alles op het apparaat.
- Werkt ook zonder internet nadat de app één keer geopend is.
- Het QR-label bevat het adres van de app plus de code (bijv. `…/#MW-0001`), dus scannen met de gewone camera-app opent het artikel ook.

## Online zetten (GitHub Pages, gratis)

1. Zet deze bestanden in een GitHub-repository.
2. Ga naar **Settings → Pages**, kies bij *Source* "Deploy from a branch", branch `main`, map `/ (root)`.
3. Na een minuut staat de app op `https://<gebruikersnaam>.github.io/<repository>/`.

## Accounts aanzetten (Supabase, gratis)

1. Maak een account op supabase.com en een nieuw project (regio: Europa, bijv. Frankfurt).
2. Ga naar **SQL Editor**, plak de inhoud van `supabase/setup.sql` en klik **Run**.
3. Ga naar **Authentication → URL Configuration** en zet *Site URL* op het adres van de app (bijv. `https://florisreederman-beep.github.io/mywarehouse/`).
4. Ga naar **Project Settings → API** en kopieer de *Project URL* en de *anon / publishable key* naar `config.js`.

## Op je telefoon zetten

- **iPhone (Safari)**: open het adres, tik op het deel-icoon en kies **Zet op beginscherm**.
- **Android (Chrome)**: open het adres, menu (⋮) → **App installeren**.

## Lokaal testen

```
python3 -m http.server 8000
```

en open `http://localhost:8000`. De camera werkt alleen via `https://` of `localhost`.

## Bestanden

- `index.html` schermen en opmaak
- `app.js` alle logica (opslag, labels, scannen, verkopen, back-up)
- `plan.js` plattegrond: ruimtes, meubels, opslagplekken, plek kiezen bij een artikel
- `account.js`, `config.js`, `supabase/setup.sql` inloggen en online opslaan
- `sw.js` offline werken
- `manifest.webmanifest`, `icons/` installeren als app
- `vendor/` qrcode-generator (MIT), jsQR (Apache-2.0), jsPDF (MIT), supabase-js (MIT)

## Later

- Verpakken voor de App Store en Google Play met Capacitor.
