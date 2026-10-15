# 132 · Anmeldeart umstellen

Benutzer · Vorschaurolle: Geschäftsführung · `konto-umstellen`

**Entscheidung: beibehalten.** Identitätswechsel bleibt ein ausdrücklich benannter geschützter Ablauf; kein freies Umstellen im Stammdatenformular.

Aufgabe: Anmeldeart umstellen.

[Screenshot Desktop](../bilder/132-konto-umstellen-desktop.jpg) · [Tablet](../bilder/132-konto-umstellen-tablet.jpg) · [Handy](../bilder/132-konto-umstellen-mobil.jpg) · [Galerie](../galerie.html#konto-umstellen) · [Prototyp](../index.html#konto-umstellen)

## Bei der Umsetzung erhalten

- Identität bleibt bestehen
- Passwortübergabe und Wirkung ausdrücklich zeigen
- Kein stiller Identitätswechsel

## Formularfelder im Entwurf

- Neue Anmeldeart
- E-Mail
- Benutzername
- Grund

## Aktionen im Entwurf

- Anmeldung umstellen

## Quellbezug

Basis: `d4b8542821d86c7057761af16de1331d1de87e09`.

- [src/features/users/KontoUmstellen.tsx](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/d4b8542821d86c7057761af16de1331d1de87e09/src/features/users/KontoUmstellen.tsx)

## Noch abnehmen

Offen: reale Persistenz, Berechtigungen und vollständige bedingte Zustände vor Umsetzung prüfen. Screens und lokale Demonstrationen belegen keine vollständige Funktionsgleichheit.
