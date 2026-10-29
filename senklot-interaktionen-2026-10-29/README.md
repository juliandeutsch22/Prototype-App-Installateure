# Suchfokus, Filterposition und mobile Blätter

Die drei gemeldeten Probleme sind mit [PR #386](https://github.com/juliandeutsch22/Prototype-App-Installateure/pull/386) umgesetzt und über die bestehende [Auslieferungskette](https://github.com/juliandeutsch22/Prototype-App-Installateure/actions/runs/40841887033) veröffentlicht.

- Suchleisten zeigen einen gemeinsamen äußeren Fokusrahmen; der zusätzliche innere Feldschatten entfällt.
- Filter, Aktenreiter und Ansichtsumschalter behalten ihre Seitenposition, einschließlich Planung „Woche/Monat/Tag“ und pfadbasierter Unterreiter. Neue Seiten und Akten starten weiterhin oben; Browser-Zurück und Sprungziele behalten ihr Verhalten.
- Beim Wegwischen nimmt die Abdunkelung bis zum Abbau ab. Richtungsbindung und Abbruchbehandlung verhindern unbeabsichtigtes seitliches Verschieben oder Schließen. Vertikaler Inhaltsscroll, eigene breite Tabellen, Felder, Canvas und Pinch-Zoom behalten ihre Bedienung. Ein abgelehntes Schließen setzt das Blatt bedienbar zurück.

| Nachweis | Stand |
|---|---|
| Geprüfter Quellcode | `1ae766f598045c35815df36aa48dab40a889b3e2` |
| Merge auf main | `d133f64ddcf99f6378797e3a4fe9d73a0ae5a43c` |
| Live-Version | `d133f64 · 29.10.2026, 09:44` |
| App | [Senklot](https://installateur-demo.firebaseapp.com/) |
| CI vor dem Merge | 5.892 Unit-/Komponenten-, 123 fachliche Browser-, 60 Rollen-/Interaktions- und 15 Inhaltsregel-Prüfungen bestanden |
| Lokale Browserprüfung | 53 Chromium-/WebKit-Fälle bestanden; drei geräteabhängige Auslassungen |

Die Live-Kontrolle erreichte die anonyme Anmeldung bei 390/1440 px mit HTTP 200, passender Versionskennung, ohne JavaScript-/Konsolenfehler, fehlgeschlagene Ressourcen oder Seitenüberlauf. TLS-Prüfung blieb eingeschaltet. Fachliche Abläufe wurden mit den Testkonten der CI geprüft; für die Live-Kontrolle wurden keine Geschäftsdaten geschrieben.

[Ursachen und Prüfungen](UMSETZUNG.md) · [Maschinenlesbarer Auslieferungsnachweis](release.json) · [Live-Messdaten](live-pruefung.json).

Die echten Touchereignisse werden in Chromium über CDP geprüft. WebKit führt die übrigen Interaktionsfälle und die regulären fachlichen Abläufe aus; die CDP-Fälle und ein Maus-Hover-Fall werden in unpassenden Geräteprofilen gezielt ausgelassen. Test-Retries bleiben null. Eine physische iPhone-/Android-Abnahme ist hier nicht erfolgt.
