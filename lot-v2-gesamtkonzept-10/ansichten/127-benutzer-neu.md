# 127 · Benutzer anlegen

Benutzer · Vorschaurolle: Geschäftsführung · `benutzer-neu`

**Entscheidung: neu geordnet.** Zugang, Rolle/Einstufung und Zeitkonto gruppieren; Geschäftsführung erhält keine Administratoroption und Startpasswort bleibt ein eigener Übergabeweg.

Aufgabe: Benutzer anlegen.

[Screenshot Desktop](../bilder/127-benutzer-neu-desktop.jpg) · [Tablet](../bilder/127-benutzer-neu-tablet.jpg) · [Handy](../bilder/127-benutzer-neu-mobil.jpg) · [Galerie](../galerie.html#benutzer-neu) · [Prototyp](../index.html#benutzer-neu)

## Bei der Umsetzung erhalten

- Benutzername benötigt Startpasswort statt Mail
- Neueinstellung vs bestehender Mitarbeiter
- Aliquoter Erstjahresurlaub
- Lehrbeginn/-zeit/Budgetzählung
- Kein neues Adminrecht für GF

## Formularfelder im Entwurf

- Name
- Anmeldung mit
- Benutzername
- E-Mail
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

## Aktionen im Entwurf

- Benutzer anlegen

## Quellbezug

Basis: `d4b8542821d86c7057761af16de1331d1de87e09`.

- [src/features/users/UserMgmtView.tsx](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/d4b8542821d86c7057761af16de1331d1de87e09/src/features/users/UserMgmtView.tsx)
- [src/features/users/EinstufungFelder.tsx](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/d4b8542821d86c7057761af16de1331d1de87e09/src/features/users/EinstufungFelder.tsx)
- [src/features/users/TagessollFelder.tsx](https://github.com/juliandeutsch22/Prototype-App-Installateure/blob/d4b8542821d86c7057761af16de1331d1de87e09/src/features/users/TagessollFelder.tsx)

## Noch abnehmen

Offen: reale Persistenz, Berechtigungen und vollständige bedingte Zustände vor Umsetzung prüfen. Screens und lokale Demonstrationen belegen keine vollständige Funktionsgleichheit.
