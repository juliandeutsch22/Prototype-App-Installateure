# Ansichtenprüfung

69 Seiten-/Rollen-/Reiter-Kontexte in fünf Breiten: 320, 390, 834, 1194 und 1440 px. Bei 1194 px beträgt die Höhe 834 px, sonst 1000 px. Zwölf zusätzliche dunkle Aufnahmen ergeben 357 Seitenbilder. 75 mobile axe-Prüfungen und die erfassten JavaScript-Fehler/Überläufe sind ohne Befund. Details: [Seitenbericht](seiten-pruefung.json).

Zwölf weitere Aufnahmen zeigen die zwei Erstnutzungsansichten und vier Speicherzustände der echten Firmendaten-Komponente in 390/1440 px. Alle zwölf axe-Prüfungen ohne Befund. Die Antworten werden in der lokalen Vorschau gezielt verzögert oder abgelehnt, ohne Produktdateien zu ändern. [Zustandsbericht](zustaende-pruefung.json).

Im ersten breiten Lauf trat bei Kundenakte/Belege/320 px eine Zeitüberschreitung auf. Drei gezielte Kontrollen reproduzierten sie nicht; ein vollständiger weiterer Lauf ohne parallele Änderungen der Darstellung war mit 357 Fällen ohne Befund. Der ursprüngliche Bericht bleibt [erhalten](seiten-pruefung-erster-lauf.json). Die Ursache ist nicht nachgewiesen; es wird kein zusätzlicher App-Fehler aus dieser einzelnen Zeitüberschreitung abgeleitet.

Die Bildprüfung ist keine vollständige Funktions- oder Hardwareabnahme. Die dauerhaft ergänzten Komponenten-/Browserprüfungen und die regulären fachlichen Abläufe laufen in [PR #385](https://github.com/juliandeutsch22/Prototype-App-Installateure/pull/385). Lokal sind 29 Chromium-/WebKit-Prüfungen grün (15 Chromium und 14 WebKit). Ein reiner Maus-Hover-Test wird in der WebKit-Touch-Konfiguration planmäßig ausgelassen. Die CI installiert die Browser-Systemabhängigkeiten regulär; lokal wurden fehlende Bibliotheken isoliert unter `/tmp` bereitgestellt, ohne die Systeminstallation zu ändern. Physische iPhone-/Android-Geräte sind hier nicht geprüft. Der aktuelle CI- und Auslieferungsstand ist im PR zu prüfen.

Verhalten, unveränderte Funktionen und verbleibende Grenzen: [Umsetzung](UMSETZUNG.md). Insbesondere wird kein sicherer automatischer Rechnungsabgleich nach unterbrochener Serverantwort behauptet und der vorhandene BrowserRouter nicht neu aufgebaut.

Die Abschaltung von Pseudoelement-Transitions bei reduziertem Bewegungswunsch ändert die statische Gestaltung nicht. Nach der anschließenden Korrektur des Platzbedarfs langer Ladebeschriftungen wurden alle zwölf Zustandsbilder und die fünf Speicherbreitenmessungen erneuert. Der Spinner wird ohne Rotation anhand seiner CSS-Breite und -Höhe auf 16 × 16 px geprüft. Zwölf gezielte WebKit-Diagnosefälle nach der Korrektur bestanden ohne laufende Animation. Der dauerhafte Browserlauf verwendet weiterhin null automatische Wiederholungen und fordert unmittelbar null laufende Animationen.

Vier Fokusprüfungen in heller/dunkler Darstellung bei 390/1440 px bestätigen sichtbare Fokusrahmen in Navigation und Inhalt. [Messdaten](fokus-pruefung.json).

Der Browser-CI-Auftrag auf dem Freigabestand wurde einmal vor dem ersten Test durch einen belegten Docker-Hostport 54324 abgebrochen ([Infrastrukturfehler, Versuch 1](https://github.com/juliandeutsch22/Prototype-App-Installateure/actions/runs/40760871428/attempts/1)). Nach Auswertung des Startprotokolls wurde ausschließlich dieser Auftrag einmal auf einem frischen Runner neu gestartet. Es wurden weder App-Code noch Test-Retry-Einstellungen dafür geändert; der Ausgang des vollständigen zweiten Versuchs wird im Release-Nachweis ausgewiesen.

Freigabe-CI auf Commit `7e5dfcb57e4a7405e260152627e941400b60e7f6`: 5.878 Unit-/Komponenten-, 2.124 Datenbank-, 123 fachliche Browser-, 36 Rollen-/Premium- und 15 Inhaltsregel-Prüfungen bestanden. Die zwei Tablet-Prüfungen in nicht passenden Geräteprofilen und die Maus-Hover-Prüfung im Touch-Profil werden planmäßig ausgelassen. Der vollständige zweite Browserauftrag ist grün.
