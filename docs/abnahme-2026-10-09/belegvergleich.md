# Belege und Exporte

Die zehn Referenzdateien sind aus festen synthetischen Testdaten erzeugt.
Es sind keine Belege eines realen Betriebs. Bereitstellung für die fachliche
Prüfung: `BELEG_BEISPIELE_ZIEL=<Zielordner> TZ=Europe/Vienna npx vitest run tests/unit/belegReferenz.test.ts`.

Beim Vergleich am 09.10.2026 stimmen alle neun eigenständigen PDFs/CSV-Dateien
bytegenau mit der bisherigen Referenz überein. Das Archiv-ZIP hat nach der
beauftragten Erweiterung 48.543 statt 48.491 Bytes. Der Gegenvergleich mit
Commit `bddfaa2` wurde tatsächlich erzeugt und jede ZIP-Datei entpackt verglichen:

- Gleiche sechs Dateinamen.
- Drei Rechnungs-PDFs, Stornorechnungs-PDF und Ausgangsbuch-CSV bytegleich.
- Ausschließlich `Hinweise.txt` geändert: statt des alten pauschalen Ausschlusses
  werden Angebote, unterschriebene/stornierte Scheine und gespeicherte
  Originalmahnungen mit ihrer Anzahl genannt (in dieser Referenz jeweils null).

Nur die ZIP-Prüfsumme und Bytezahl in `docs/ui-umbau/referenz.json` wurden
gezielt angepasst. Die übrigen neun Referenzen bleiben unverändert.
Originalmahnungen, zusätzliche Angebote/Scheine und Archivvollständigkeit
werden zusätzlich in den Archiv-, Datenbank- und Browserprüfungen geprüft.
Die technische Gleichheit ersetzt keine Freigabe der BMD-Dateien durch die Kanzlei.
