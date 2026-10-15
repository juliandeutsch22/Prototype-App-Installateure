# 093 · Buchhaltungs-Export

Rechnungen · Vorschaurolle: Geschäftsführung · `rechnung-export`

**Entscheidung: beibehalten.** Zeitraum und Kontenprüfung vor den Dateien halten; Gesamtexport nicht auf zufällig geladene Listentreffer begrenzen.

Aufgabe: Buchhaltungs-Export.

[Screenshot Desktop](../bilder/093-rechnung-export-desktop.jpg) · [Tablet](../bilder/093-rechnung-export-tablet.jpg) · [Handy](../bilder/093-rechnung-export-mobil.jpg) · [Galerie](../galerie.html#rechnung-export) · [Prototyp](../index.html#rechnung-export)

## Bei der Umsetzung erhalten

- Bestehende Formate unverändert
- Konten-/Debitoren-/Steuercodeprüfung
- Datumsbereich und Stornos

## Formularfelder im Entwurf

- Von
- Bis

## Aktionen im Entwurf

- Zeitraum zusammenstellen

## Quellbezug

Basis: `d4b8542821d86c7057761af16de1331d1de87e09`.

- [src/features/invoices/InvoicesView.tsx](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/d4b8542821d86c7057761af16de1331d1de87e09/src/features/invoices/InvoicesView.tsx)

## Noch abnehmen

Offen: reale Persistenz, Berechtigungen und vollständige bedingte Zustände vor Umsetzung prüfen. Screens und lokale Demonstrationen belegen keine vollständige Funktionsgleichheit.
