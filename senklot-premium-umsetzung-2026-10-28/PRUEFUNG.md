# Ansichtenprüfung

69 Seiten-/Rollen-/Reiter-Kontexte in fünf Breiten: 320, 390, 834, 1194 und 1440 px. Bei 1194 px beträgt die Höhe 834 px, sonst 1000 px. Zwölf zusätzliche dunkle Aufnahmen ergeben 357 Seitenbilder. 75 mobile axe-Prüfungen und die erfassten JavaScript-Fehler/Überläufe sind ohne Befund. Details: [Seitenbericht](seiten-pruefung.json).

Zwölf weitere Aufnahmen zeigen die zwei Erstnutzungsansichten und vier Speicherzustände der echten Firmendaten-Komponente in 390/1440 px. Alle zwölf axe-Prüfungen ohne Befund. Die Antworten werden in der lokalen Vorschau gezielt verzögert oder abgelehnt, ohne Produktdateien zu ändern. [Zustandsbericht](zustaende-pruefung.json).

Im ersten breiten Lauf trat bei Kundenakte/Belege/320 px eine Zeitüberschreitung auf. Drei gezielte Kontrollen reproduzierten sie nicht; ein vollständiger weiterer Lauf ohne parallele Änderungen der Darstellung war mit 357 Fällen ohne Befund. Der ursprüngliche Bericht bleibt [erhalten](seiten-pruefung-erster-lauf.json). Die Ursache ist nicht nachgewiesen; es wird kein zusätzlicher App-Fehler aus dieser einzelnen Zeitüberschreitung abgeleitet.

Die Bildprüfung ist keine vollständige Funktions- oder Hardwareabnahme. Die dauerhaft ergänzten Komponenten-/Browserprüfungen und die regulären fachlichen Abläufe laufen in [PR #385](https://github.com/juliandeutsch22/Prototype-App-Installateure/pull/385). Lokales Chromium ist geprüft. Die lokalen WebKit-Systembibliotheken fehlen; die reguläre CI installiert sie und prüft WebKit. Physische iPhone-/Android-Geräte sind hier nicht geprüft. Der aktuelle CI- und Auslieferungsstand ist im PR zu prüfen.

Verhalten, unveränderte Funktionen und verbleibende Grenzen: [Umsetzung](UMSETZUNG.md). Insbesondere wird kein sicherer automatischer Rechnungsabgleich nach unterbrochener Serverantwort behauptet und der vorhandene BrowserRouter nicht neu aufgebaut.
