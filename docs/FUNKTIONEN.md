# Funktionsübersicht

Stand: 01.09.2026.

**Wofür dieses Dokument da ist.** Die Roadmap ist inzwischen ein
Änderungsprotokoll: sie erzählt, was wann warum gebaut wurde, und sie ist
dafür auch richtig. Was sie nicht mehr beantwortet, ist die Frage, mit der man
vor der App sitzt — *was gibt es, wer darf was, und worauf kann ich mich
verlassen?* Diese Datei beantwortet genau das, und zwar auch da, wo die
Antwort unangenehm ist.

Eine Zeile je Bereich. Die Spalte **Geprüft wodurch** ist die wichtigste; sie
unterscheidet drei Stufen:

| Stufe | Was sie wert ist |
|---|---|
| **Emulator** | Läuft gegen einen echten Firestore. Prüft Regeln, Indizes, tatsächliches Verhalten. Belastbar. |
| **Rechnung** | Reine Funktionstests der Formeln. Sagen, dass die Mathematik stimmt — nicht, dass die App läuft. |
| **Ansicht** | Rendern und Klicken, **aber jeder Datenbankzugriff ist ersetzt**. Findet Bedienfehler, keine Datenfehler. |
| **—** | Nicht automatisch geprüft. |

---

## Außendienst

| Bereich | Was es tut | Wer darf | Daten | Geprüft wodurch | Bekannte Lücke |
|---|---|---|---|---|---|
| **Zeiterfassung** | Tag buchen: Status, Von–Bis, Pause, Baustelle, Zuschläge. Schlank für das Büro, voll für den Monteur. | alle (eigene); Buchhaltung/GF auch fremde | `timeEntries` | Rechnung (44), Emulator (Rechte) | **Ansicht ungetestet** — der meistbenutzte Bildschirm der App |
| **Mein Einsatzplan** | Monatskalender der eigenen Einsätze, Kontaktdaten, Sprung zu Zeit und Schein | Mitarbeiter | `assignments`, `projects`, `vacations` | — | Ansicht ungetestet |
| **Meine Baustellen** | Die Baustellen, denen der Monteur zugeordnet ist | Mitarbeiter | `projects` | — | Ansicht ungetestet |
| **Material anfordern** | Warenkorb, Eilzustellung, eigene Anforderungen | Mitarbeiter, Verwaltung, Leitung | `materials`, `materialOrders` | Rechnung (25, Meldungen) | Ansicht ungetestet; Lagerabzug nur im Code geprüft |
| **Urlaub** | Beantragen, entscheiden, Stand sehen. Genehmigung schreibt die Tage ins Zeitkonto. | alle (Antrag); Entscheider laut Einstellung | `vacations`, `timeEntries`, `companies` | Emulator (18), Rechnung (15), Ansicht (11) | Kein Durchstich: dass die Tage *wirklich* im Zeitkonto landen, prüft kein Test |
| **Handwerksscheine** | Vorausfüllen, unterschreiben, einfrieren, Storno mit Grund, PDF | Mitarbeiter, Büro, Leitung | `workSheets`, `timeEntries` (serverseitig) | Emulator (Regeln), Rechnung (4), Ansicht (11) | Listenansicht ungetestet; PDF ungetestet |

## Verwaltung

| Bereich | Was es tut | Wer darf | Daten | Geprüft wodurch | Bekannte Lücke |
|---|---|---|---|---|---|
| **Kunden** | Stammdaten, Dublettenschutz, Akte mit Baustellen und Angeboten, Übernahme der Altbestände | Buchhaltung, Verwaltung, Leitung | `customers`, `projects`, `quotes` | Emulator (Regeln), Ansicht (8) | Umbenennen zieht Baustellen nach — ungetestet |
| **Angebote** | Positionen kalkulieren, Arbeitszeit getrennt ausweisen, beim Annehmen Baustelle mit Stundenbudget anlegen | Buchhaltung, Leitung | `quotes`, `projects`, `counters` | Ansicht (3), Emulator (Zähler) | Nummernkreis je Jahr nur im Emulator-Test der Zähler |
| **Baustellen** | Anlegen, Kunde zuordnen, Team und Projektleitung, Stundenbudget | Leitung | `projects` | — | **Ansicht ungetestet** |
| **Anforderungen** | Eingehende Materialanforderungen bearbeiten, Status setzen | Verwaltung, Leitung | `materialOrders` | Rechnung (Meldungen) | Ansicht ungetestet |
| **Lager** | Bestand, Mindestmenge, Katalogpflege | Verwaltung, Leitung | `materials` | — | Ansicht ungetestet; Bestandsabzug per Transaktion ungetestet |
| **Einsatzplanung** | Kalender, Mitarbeiter je Tag und Baustelle, Urlaubswarnung | Leitung | `assignments`, `vacations` | — | **Ansicht ungetestet** — inklusive des Löschens vorhandener Einsätze |
| **Benutzerverwaltung** | Anlegen, Rollen, Wochenstunden, Arbeitstage, Eintritt | Leitung (Admins nur durch Admins) | `users` | Emulator (Rollenhierarchie) | Ansicht ungetestet |
| **Einstellungen** | Verrechnungs- und Kostensätze, Urlaubs-Genehmigende, Monatsbilanzen aufbauen | Leitung; Genehmigende nur GF/Admin | `companies` | Emulator (8) | Ansicht ungetestet |

## Büro und Auswertung

| Bereich | Was es tut | Wer darf | Daten | Geprüft wodurch | Bekannte Lücke |
|---|---|---|---|---|---|
| **Rechnungen** | Aus Baustelle zusammenstellen, Nummernkreis, Status, PDF, Buchhaltungs-Export mit Lückenprüfung | Buchhaltung, Leitung | `invoices`, `counters`, `timeEntries` | Rechnung (49), Emulator (Zähler) | **Ansicht ungetestet** — der Weg von Zeiten zu Positionen ist nur in Teilen geprüft |
| **Mitarbeiterübersicht** | Zeitkonten, Salden, Monats- und Mitarbeiterexport, Stundennachweis | Buchhaltung, GF, Admin (**nicht** Projektleitung) | `timeEntries`, `monthlyStats` | Rechnung (20), Ansicht (4) | Zusammenspiel Bilanz ↔ Rohdaten ungetestet |
| **Nachkalkulation** | Erlös gegen Personalkosten je Baustelle, Deckungsbeitrag | GF, Admin | `projects`, `timeEntries`, `invoices`, `quotes` | Rechnung (9) | Ansicht ungetestet |

## Grundlagen

| Bereich | Was es tut | Geprüft wodurch | Bekannte Lücke |
|---|---|---|---|
| **Mandantentrennung** | Jede Abfrage auf `companyId`, serverseitig erzwungen | Emulator (59 Regeltests) | — |
| **Wachstumsbremse** | Test verbietet jede Abfrage ohne Grenze in `lib/db` | Rechnung (40) | Prüft die Form der Abfrage, nicht ihre Laufzeit |
| **Monatsbilanzen** | Verdichtete Zeitkonten, Trigger + Nachtlauf + Neuaufbau | Rechnung (8) | Trigger und Nachtlauf laufen ungetestet in Produktion |
| **Offline-Betrieb** | Lokaler Zwischenspeicher, Hinweis beim Speichern ohne Verbindung | Rechnung (7) | Kein Test mit tatsächlich unterbrochener Verbindung |
| **Meldungen (Push)** | Wer wird wann benachrichtigt | Rechnung (25) | Zustellung selbst ungetestet |

## Abgeschaltet oder ohne Weg dorthin

| Was | Zustand |
|---|---|
| **KI-Spracherfassung** (`/voice`, `voiceExtract`) | Vollständig gebaut, per `VITE_ENABLE_VOICE` **aus**. Grund: ohne Schlüssel führt der Knopf nur in eine Fehlermeldung, und Sprachaufnahmen von Mitarbeitern gehen an US-Anbieter — das braucht vorher Auftragsverarbeitungsverträge. |
| **Wiedervorlagen** (`followUps`) | Sammlung, Regeln und Abfragen existieren, geschrieben wird nur aus der KI-Erfassung. Also faktisch **tot**, solange die aus ist. |
| **`exportCompanyData`** | Cloud Function ist deployed, wird von der App **nirgends aufgerufen**. Gedacht als Datenausleitung; ohne Aufrufer nur ein Versprechen. |

---

## Die ehrliche Bilanz zur Prüftiefe

319 automatische Tests klingen nach viel. Aufgeschlüsselt:

| Art | Anzahl | Aussagekraft |
|---|---|---|
| Regeltests gegen den Emulator | 59 | Hoch — echtes Verhalten |
| **Abfrage-Smoketest gegen den Emulator** | **33** | **Hoch — die echten Abfragen, je Rolle** |
| **Index-Abgleich (statisch)** | **39** | **Hoch — fängt genau das, was der Emulator verschweigt** |
| Reine Rechnung | 209 | Hoch für die Formeln, **null** für die App |
| Ansichten, Datenbank ersetzt | 77 | Findet Bedienfehler, **keine** Datenfehler |
| **Ende zu Ende** | **0** | — |

**14 von 26 Ansichten haben keinen eigenen Test**, darunter Zeiterfassung,
Rechnungen, Baustellen und Einsatzplanung.

**Warum das nicht theoretisch ist.** Jeder Fehler, der bisher aus dem Betrieb
gemeldet wurde, lag in den Nähten, die ersetzte Datenbankzugriffe per
Konstruktion nicht sehen:

| Gemeldet | Ursache | Wird jetzt abgefangen? |
|---|---|---|
| Kundenakte ohne Baustellen | fehlender Firestore-Index | **Ja** — Index-Abgleich. Er hat beim ersten Lauf gleich einen zweiten fehlenden gefunden (`followUps`). |
| Leeres Auswahlfeld beim Schein | verschluckter Fehler | **Teilweise** — der Smoketest findet eine Abfrage, die an den Regeln scheitert; eine schlicht leere Menge findet er nicht. |
| „Lädt ewig" | Cloud Function ohne Frist | Nein |
| Unterschrift ohne Wirkung | `canvas.width` löscht die Fläche | Nein — dagegen hilft nur ein echter Browser |

**Zwei Fallen, die der Emulator selbst stellt** — beide inzwischen als Test
festgehalten:

1. **Fehlende Indizes verschweigt er.** Er legt zusammengesetzte Indizes bei
   Bedarf still selbst an. Lokal läuft alles, in Produktion scheitert die
   Abfrage. Deshalb der statische Abgleich.
2. **Ein fehlendes Dokument wird abgelehnt, nicht leer beantwortet.**
   `ownsExisting()` liest `resource.data.companyId`; bei einem Dokument, das
   es nicht gibt, ist `resource` null. `getUserByUid` gibt also nicht `null`
   zurück, wenn das Nutzerdokument fehlt — es wirft.

## Woran man in dieser Reihenfolge arbeiten sollte

1. ~~Abfrage-Smoketest~~ — **erledigt.** Läuft in CI mit den Regeltests.
2. ~~Index-Abgleich~~ — **erledigt.** Rein statisch, ohne Emulator.
3. **Vier Durchstich-Tests** für die Geldwege: Zeit → Auswertung, Urlaub →
   Genehmigung → Zeitkonto, Angebot → Baustelle → Rechnung →
   Nachkalkulation, Schein → einfrieren → Storno. ← *als Nächstes*
4. **Ansichtstests nachziehen**, in dieser Reihenfolge: Zeiterfassung
   (meistbenutzt), Rechnungen (Geld), Einsatzplanung (löscht Daten),
   Baustellen.
5. Erst danach Navigation und Oberfläche.
