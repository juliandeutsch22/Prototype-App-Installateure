# Lot v2 · ausgeliefert am 16.10.2026

[App öffnen](https://installateur-demo.firebaseapp.com/) · [PR #311](https://github.com/juliandeutsch22/Prototype-App-Installateure/pull/311) · [Erfolgreiche Auslieferung](https://github.com/juliandeutsch22/Prototype-App-Installateure/actions/runs/38854626122)

Merge-Commit: `29bc8102c6675f367c242b54de361adf931ef1d6`. Sein Quellbaum entspricht exakt der geprüften PR-Fassung. Die Produktionsdatenbank war aktuell und blieb unverändert; die bestehenden Serverfunktionen wurden erfolgreich ausgeliefert.

5.093 Modulprüfungen, 1.895 Datenbankprüfungen und der Produktivbuild bestanden. Im PR zusätzlich 82 Browserprüfungen (Chromium, mobiles WebKit, Tablet) und sieben Linkprüfungen bestanden; zwei gerätebedingte Skips.

Die Live-Versionsdatei und das ausgelieferte JavaScript tragen `29bc810`. CSS enthält die neuen Zahlen- und Kalenderstile. Alle im Einstieg referenzierten JavaScript-/CSS-Dateien antworten mit HTTP 200. Die HTTPS-Prüfung verwendet das vorhandene Cloud-CA-Vertrauen mit aktivierter TLS-Prüfung. Der zusätzliche direkte Live-Browsertest blieb wegen des im Chromium fehlenden Proxy-CA-Vertrauens blockiert. Die automatische Freigabeprüfung lehnte eine dauerhafte Erweiterung des Chromium-Vertrauensspeichers ab, weil sie die künftige TLS-Vertrauensbasis ändern würde; der Speicher blieb unverändert. Browserabläufe sind in der PR-CI geprüft. Es wurde keine Buchung in einem Produktivbetrieb ausgeführt.

- [HTTP-/Versionsnachweis](http.json)
- [Grenze des direkten Live-Browsertests](browser-pruefung.json)
- [Aktualisiertes Handbuch herunterladen](Handbuch-Senklot.html?raw=true) – speichern und im Browser öffnen; die Gestaltung lädt Schriften von Google Fonts.
- [Screens der echten Umsetzung mit fiktiven Vorschau-Daten](../lot-v2-umsetzung-01/README.md)

Offen bleiben die Praxisabnahme auf echten Geräten des Betriebs und die Pilotwochen. Es gibt keinen bekannten technischen Auslieferungsblocker im geprüften Änderungsumfang. 
