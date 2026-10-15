# 130 · Zugang von Max Mustermann

Benutzer · Vorschaurolle: Geschäftsführung · `benutzer-zugang`

**Entscheidung: beibehalten.** Anmeldeart und Zustand vor Reset/Deaktivierung zeigen; eigenes Konto und letzter Administrator bleiben geschützt.

Aufgabe: Zugang von Max Mustermann.

[Screenshot Desktop](../bilder/130-benutzer-zugang-desktop.jpg) · [Tablet](../bilder/130-benutzer-zugang-tablet.jpg) · [Handy](../bilder/130-benutzer-zugang-mobil.jpg) · [Galerie](../galerie.html#benutzer-zugang) · [Prototyp](../index.html#benutzer-zugang)

## Bei der Umsetzung erhalten

- Bei E-Mail Passwort-Mail statt Startpasswort
- Eigener Zugang unter Mein Konto
- Letzter Administrator geschützt

## Aktionen im Entwurf

- Neues Startpasswort vergeben
- Anmeldeart umstellen
- Benutzer deaktivieren

## Quellbezug

Basis: `d4b8542821d86c7057761af16de1331d1de87e09`.

- [src/features/users/BenutzerakteView.tsx](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/d4b8542821d86c7057761af16de1331d1de87e09/src/features/users/BenutzerakteView.tsx)
- [src/features/users/KontoUmstellen.tsx](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/d4b8542821d86c7057761af16de1331d1de87e09/src/features/users/KontoUmstellen.tsx)

## Noch abnehmen

Offen: reale Persistenz, Berechtigungen und vollständige bedingte Zustände vor Umsetzung prüfen. Screens und lokale Demonstrationen belegen keine vollständige Funktionsgleichheit.
