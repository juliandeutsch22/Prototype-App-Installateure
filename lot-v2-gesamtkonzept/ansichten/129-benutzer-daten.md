# 129 · Benutzerdaten bearbeiten

[Zur Gesamtübersicht](../README.md) · [Vollständiges Konzept](../Konzept.md)

**Bereich:** Benutzer · **Bestandsort:** `/user-mgmt/:uid · Stammdaten`

![Desktop – Benutzerdaten bearbeiten](../bilder/129-benutzer-daten-desktop.jpg)

<details><summary>Handy · 390 px</summary>

![Handy · 390 px](../bilder/129-benutzer-daten-handy.jpg)

[Ganze Seite ansehen](../bilder/129-benutzer-daten-handy-gesamt.jpg)

</details>

<details><summary>Tablet · 834 px</summary>

![Tablet · 834 px](../bilder/129-benutzer-daten-tablet.jpg)

[Ganze Seite ansehen](../bilder/129-benutzer-daten-tablet-gesamt.jpg)

</details>

[Desktop in voller Seitenlänge](../bilder/129-benutzer-daten-desktop-gesamt.jpg)

## Entscheidung

Nur arbeitsrelevante Angaben; Details über die Zeile öffnen.

**Gezeigte Rolle:** Geschäftsführung. Sichtbarkeit und Aktionen bleiben an bestehende Rollen, Zusatzrechte, Module und Datensatzstatus gebunden.

**Hauptaktion:** Änderungen speichern.

**Handy/Tablet:** Zeilen statt zusätzlicher Karten; Hauptaktion bleibt gut erreichbar.

## Muss erhalten bleiben

- Zusatzrechte nur für passende Rollen
- Zeitkonto der GF personenspezifisch
- Tagessoll/Wochentage
- Ungespeicherte Änderungen

## Felder

- Name
- Anmeldung mit
- Benutzername
- Rolle
- Status
- Einstufung
- Geburtsdatum
- Wochenstunden
- Urlaubstage pro Jahr
- Eintrittsdatum
- Saldo-Startdatum
- Start-Saldo (Stunden)
- Resturlaub beim Umstieg (Tage)
- Führt ein Zeitkonto

## Quelle

- [src/features/users/BenutzerakteView.tsx](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/d4b8542821d86c7057761af16de1331d1de87e09/src/features/users/BenutzerakteView.tsx)
- [src/features/users/EinstufungFelder.tsx](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/d4b8542821d86c7057761af16de1331d1de87e09/src/features/users/EinstufungFelder.tsx)
- [src/features/users/TagessollFelder.tsx](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/d4b8542821d86c7057761af16de1331d1de87e09/src/features/users/TagessollFelder.tsx)

Gestaltungsvorschau mit fiktiven Beispieldaten. Keine Änderung oder Auslieferung der App.
