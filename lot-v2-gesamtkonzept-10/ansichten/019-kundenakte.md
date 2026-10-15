# 019 · Hausverwaltung Sonnenhof

Kunden · Vorschaurolle: Geschäftsführung · `kundenakte`

**Entscheidung: präzisiert.** Kontaktwege direkt nutzbar machen und Baustellen vor seltenen Stammdatenaktionen zeigen; Belege bleiben berechtigungsabhängig.

Aufgabe: Hausverwaltung Sonnenhof.

[Screenshot Desktop](../bilder/019-kundenakte-desktop.jpg) · [Tablet](../bilder/019-kundenakte-tablet.jpg) · [Handy](../bilder/019-kundenakte-mobil.jpg) · [Galerie](../galerie.html#kundenakte) · [Prototyp](../index.html#kundenakte)

## Bei der Umsetzung erhalten

- Rechnungen und Angebote nur nach Recht/Modul
- UID-/VIES-Prüfstatus
- Löschen und Deaktivieren getrennt
- Datenauskunft

## Aktionen im Entwurf

- Bearbeiten
- Datenauskunft

## Quellbezug

Basis: `d4b8542821d86c7057761af16de1331d1de87e09`.

- [src/features/customers/KundenakteView.tsx](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/d4b8542821d86c7057761af16de1331d1de87e09/src/features/customers/KundenakteView.tsx)
- [src/features/customers/UidVies.tsx](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/d4b8542821d86c7057761af16de1331d1de87e09/src/features/customers/UidVies.tsx)
- [src/features/recht/Datenauskunft.tsx](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/d4b8542821d86c7057761af16de1331d1de87e09/src/features/recht/Datenauskunft.tsx)

## Noch abnehmen

Offen: reale Persistenz, Berechtigungen und vollständige bedingte Zustände vor Umsetzung prüfen. Screens und lokale Demonstrationen belegen keine vollständige Funktionsgleichheit.
