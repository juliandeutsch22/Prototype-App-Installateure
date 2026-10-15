# 206 · Export prüfen und herunterladen

Rechnungen · Vorschaurolle: Geschäftsführung · `rechnung-export-ergebnis`

**Entscheidung: beibehalten.** Zusammenstellung und Validierung vor getrennten Dateiformaten zeigen; fehlender Kontenrahmen sperrt die betroffene Ausgabe.

Aufgabe: Export prüfen und herunterladen.

[Screenshot Desktop](../bilder/206-rechnung-export-ergebnis-desktop.jpg) · [Tablet](../bilder/206-rechnung-export-ergebnis-tablet.jpg) · [Handy](../bilder/206-rechnung-export-ergebnis-mobil.jpg) · [Galerie](../galerie.html#rechnung-export-ergebnis) · [Prototyp](../index.html#rechnung-export-ergebnis)

## Bei der Umsetzung erhalten

- Bestehende Formate unverändert
- Konten-/Debitoren-/Steuercodeprüfung
- Datumsbereich und Stornos

## Aktionen im Entwurf

- Rechnungsausgangsbuch CSV herunterladen
- BMD-Buchungsstapel herunterladen
- Zahlungsstapel herunterladen

## Quellbezug

Basis: `d4b8542821d86c7057761af16de1331d1de87e09`.

- [src/features/invoices/InvoicesView.tsx](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/d4b8542821d86c7057761af16de1331d1de87e09/src/features/invoices/InvoicesView.tsx)

## Noch abnehmen

Offen: reale Persistenz, Berechtigungen und vollständige bedingte Zustände vor Umsetzung prüfen. Screens und lokale Demonstrationen belegen keine vollständige Funktionsgleichheit.
