# 005 · Zwei-Faktor-Anmeldung

[Zur Gesamtübersicht](../README.md) · [Vollständiges Konzept](../Konzept.md)

**Bereich:** Zugang · **Bestandsort:** `Anmeldeprüfung`

![Desktop – Zwei-Faktor-Anmeldung](../bilder/005-zwei-faktor-desktop.jpg)

<details><summary>Handy · 390 px</summary>

![Handy · 390 px](../bilder/005-zwei-faktor-handy.jpg)

</details>

<details><summary>Tablet · 834 px</summary>

![Tablet · 834 px](../bilder/005-zwei-faktor-tablet.jpg)

</details>

## Entscheidung

Ein Feld und ein eindeutiger Schritt; die Wiederherstellung bleibt als Textaktion erreichbar.

**Gezeigte Rolle:** Geschäftsführung. Sichtbarkeit und Aktionen bleiben an bestehende Rollen, Zusatzrechte, Module und Datensatzstatus gebunden.

**Hauptaktion:** Bestätigen.

**Weitere Aktionen:** Wiederherstellungscode verwenden, Abmelden.

**Handy/Tablet:** Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.

## Muss erhalten bleiben


## Felder

- Code aus der App

## Quelle

- [src/features/auth/ZweiFaktorSeite.tsx](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/d4b8542821d86c7057761af16de1331d1de87e09/src/features/auth/ZweiFaktorSeite.tsx)

Gestaltungsvorschau mit fiktiven Beispieldaten. Keine Änderung oder Auslieferung der App.
