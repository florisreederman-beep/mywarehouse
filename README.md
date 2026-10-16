# MyWarehouse

Voorraadapp voor vintage resellers: artikelen invoeren met locatie, QR-labels printen (A4-stickervel of labelrol), labels live scannen met de camera, verkopen bijhouden met winst en verlies, en exporteren naar CSV.

## Hoe het werkt

- Gewone website zonder server: alle bestanden staan in deze map, er is geen bouwstap.
- Gegevens staan op het apparaat zelf (in de browser). Gebruik **Voorraad → Back-up downloaden** regelmatig.
- Werkt ook zonder internet nadat de app één keer geopend is.
- Het QR-label bevat het adres van de app plus de code (bijv. `…/#MW-0001`), dus scannen met de gewone camera-app opent het artikel ook.

## Online zetten (GitHub Pages, gratis)

1. Zet deze bestanden in een GitHub-repository.
2. Ga naar **Settings → Pages**, kies bij *Source* "Deploy from a branch", branch `main`, map `/ (root)`.
3. Na een minuut staat de app op `https://<gebruikersnaam>.github.io/<repository>/`.

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
- `sw.js` offline werken
- `manifest.webmanifest`, `icons/` installeren als app
- `vendor/` qrcode-generator (MIT), jsQR (Apache-2.0), jsPDF (MIT)

## Later

- Inloggen en synchroniseren tussen apparaten (bijv. Supabase).
- Verpakken voor de App Store en Google Play met Capacitor.
