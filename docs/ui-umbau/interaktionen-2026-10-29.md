# Suchfokus, Filterposition und mobile Blätter · 29. Oktober 2026

Die Korrektur setzt auf dem ausgelieferten Premium-Stand `d5dffd56` auf.

## Ursachen und Verhalten

- **Suchfelder:** Die Listenleiste zeichnet bereits einen gemeinsamen Fokusrahmen um Lupe und Eingabe. Zusätzlich setzte die globale Feldregel einen Schatten um das innere Input. Nur innerhalb dieser gemeinsamen Suchrahmen entfällt der innere Ring; der äußere Tastaturfokus bleibt sichtbar. Eigenständige Formularfelder behalten ihre Rückmeldung.
- **Filter und Ansichten:** `Seitenposition` setzte bislang bei jedem neuen Verlaufsschlüssel auf null zurück, auch wenn nur Abfrageparameter wechselten. Bei gleicher Seite bleibt die Position jetzt erhalten. Tatsächliche Seitenwechsel starten weiterhin oben, Browser-Zurück stellt die gespeicherte Position des jeweiligen Verlaufseintrags wieder her, und explizite Sprungziele werden nicht überschrieben.
- **Wegwischen:** Der zuvor zurückgesetzte Versatz stellte den Schleier vor dem verzögerten Abbau wieder auf volle Deckkraft. Der Versatz bleibt jetzt erhalten, das Blatt bewegt sich bei bestätigtem Schließen weiter nach unten, und der Schleier blendet von seiner aktuellen Deckkraft auf null aus. Fokusfalle und Hintergrundsperre gelten bis zum tatsächlichen Abbau; reduzierte Bewegung schließt weiterhin unmittelbar.
- **Gesten:** Erst eine erkennbare Abwärtsbewegung am Griff oder am anfangs ungescrollten Inhalt wird zur Schließgeste. Seitliche Bewegungen und native Scroll-/Zoomabbrüche schließen nicht. Die native Pointer-Capture am Griff wird nicht versehentlich auf das Fenster übertragen. Nach einem normalen Inhaltsscroll muss eine neue Geste oben beginnen; ein auslaufender Scroll schließt nicht zusätzlich das Blatt.
- **Erhaltene Bedienung:** Der Modalinhalt selbst wandert nicht seitwärts. Eigene breite Tabellen dürfen weiterhin horizontal scrollen. Felder, Links, Knöpfe, Auswahlbereiche und Canvas-Inhalte werden nicht als Ziehfläche übernommen. Zwei-Finger-Zoom bleibt nativ. Lehnt ein Aufrufer das Schließen ab, etwa während des Speicherns, kehrt das Blatt in seine bedienbare Ausgangslage zurück. Änderungen des Eltern-Callbacks unterbrechen keine laufende Geste.

## Prüfung

Komponententests decken Filter mit PUSH/REPLACE, Zurück-Navigation, Sprungziele, Abbruch, Pointer-Cancel, Schließveto, neue Eltern-Callbacks, erhaltene Felder und Tabellen sowie den Erhalt der Hintergrundsperre bis zum Abbau ab.

`tests/links/interaktionen.spec.ts` prüft den Suchfokus in Rechnungen, Angeboten und Kunden bei 390/1440 px, hell und dunkel. Rechnungsfilter, Aktenreiter und Wochen-/Monatswechsel behalten die Seitenposition. Die Abdunkelung wird während des Schließens über berechnete CSS-Werte und Stiländerungen auf ein ausschließliches Abnehmen geprüft; RAF allein würde in einem inaktiven WebKit-Fenster zu wenige Messpunkte liefern.

Zusätzliche Chromium-Prüfungen speisen echte Touch-Ereignisse über CDP ein: seitlicher Wisch, weiterhin horizontal bedienbare Tabelle, vertikaler Inhaltsscroll, Schließen über den Inhalt und Schließen am Griff. Diese CDP-Prüfungen werden in WebKit gezielt ausgelassen; dort laufen die übrigen Browserfälle und die regulären fachlichen Abläufe. Test-Retries bleiben bei null. Browser-Emulation ist kein physischer iPhone-/Android-Gerätetest.

Die vollständigen CI- und Auslieferungsergebnisse stehen beim zugehörigen Pull Request. Datenbankschema, API-Signaturen und fachliche Berechnungen sind kein Bestandteil dieser Korrektur.
