# Funktionsübersicht

Stand: 02.09.2026.

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
| **Angebote** | Positionen kalkulieren, Arbeitszeit getrennt ausweisen, beim Annehmen Baustelle mit Stundenbudget anlegen | Buchhaltung, Leitung | `quotes`, `projects`, `counters` | Ansicht (3), Emulator (Zähler: steigend, Neubeginn nur zum Jahreswechsel) | — |
| **Baustellen** | Anlegen, Kunde zuordnen, Team und Projektleitung, Stundenbudget | Leitung | `projects` | — | **Ansicht ungetestet** |
| **Anforderungen** | Eingehende Materialanforderungen bearbeiten, Status setzen | Verwaltung, Leitung | `materialOrders` | Rechnung (Meldungen) | Ansicht ungetestet |
| **Lager** | Bestand, Mindestmenge, Katalogpflege | Verwaltung, Leitung | `materials` | Emulator (3: wer pflegen darf) | Ansicht ungetestet; Bestandsabzug per Transaktion ungetestet |
| **Einsatzplanung** | Kalender, Mitarbeiter je Tag und Baustelle, Urlaubswarnung | Leitung | `assignments`, `vacations` | Emulator (4: wer planen darf) | **Ansicht ungetestet** — inklusive des Löschens vorhandener Einsätze |
| **Benutzerverwaltung** | Anlegen, Rollen, Wochenstunden, Arbeitstage, Eintritt | Leitung (Admins nur durch Admins) | `users` | Emulator (Rollenhierarchie) | Ansicht ungetestet |
| **Einstellungen** | Verrechnungs- und Kostensätze, Urlaubs-Genehmigende, Monatsbilanzen aufbauen | Leitung; Genehmigende nur GF/Admin | `companies` | Emulator (8) | Ansicht ungetestet |
| **Module** | Bereiche für den Betrieb ein- und ausschalten; zeigt vorher, was mit abgeschaltet wird | **nur GF/Admin** | `companies.modules` | Rechnung (14), Emulator (7) | Ansicht ungetestet |

## Büro und Auswertung

| Bereich | Was es tut | Wer darf | Daten | Geprüft wodurch | Bekannte Lücke |
|---|---|---|---|---|---|
| **Rechnungen** | Aus Baustelle zusammenstellen, Nummernkreis, Status, PDF, Buchhaltungs-Export mit Lückenprüfung | Buchhaltung, Leitung | `invoices`, `counters`, `timeEntries` | Rechnung (49), Emulator (Zähler, Löschen nur beim Storno) | **Ansicht ungetestet** — der Weg von Zeiten zu Positionen ist nur in Teilen geprüft |
| **Mitarbeiterübersicht** | Zeitkonten, Salden, Monats- und Mitarbeiterexport, Stundennachweis | Buchhaltung, GF, Admin (**nicht** Projektleitung) | `timeEntries`, `monthlyStats` | Rechnung (20), Ansicht (4) | Zusammenspiel Bilanz ↔ Rohdaten ungetestet |
| **Nachkalkulation** | Erlös gegen Personalkosten je Baustelle, Deckungsbeitrag | GF, Admin | `projects`, `timeEntries`, `invoices`, `quotes` | Rechnung (9) | Ansicht ungetestet |

## Grundlagen

| Bereich | Was es tut | Geprüft wodurch | Bekannte Lücke |
|---|---|---|---|
| **Mandantentrennung** | Jede Abfrage auf `companyId`, serverseitig erzwungen | Emulator (59 Regeltests) | — |
| **Deaktivierte Konten** | Gesperrtes Auth-Konto, widerrufene Token und `active` als Claim in `signedIn()` — also unter jeder Regel | Emulator (5) | Ein bereits ausgestelltes Token bleibt bis zum Widerruf gültig; der Widerruf läuft in der Function, nicht im Browser |
| **Wachstumsbremse** | Test verbietet jede Abfrage ohne Grenze in `lib/db` | Rechnung (40) | Prüft die Form der Abfrage, nicht ihre Laufzeit |
| **Module** | Umfangsentscheidung des Betriebs: was ausgeschaltet ist, verschwindet aus Navigation, Startseite, Querverweisen **und** aus der Adresszeile | Rechnung (14), Emulator (7) | **Keine Sicherheitsgrenze.** Wer die Rolle hat, dürfte die Daten ohnehin — ein Modul nimmt nur den Weg weg, nicht das Recht. Die Regeln bleiben die einzige Grenze. |
| **Navigation** | Wer wohin darf, steht **nur** in `navigation.ts`; `RequireNav` liest Rolle und Modul aus demselben Eintrag, aus dem der Reiter gebaut wird | Statisch (29), Ansicht (5) | — |
| **Monatsbilanzen** | Verdichtete Zeitkonten, Trigger + Nachtlauf + Neuaufbau | Rechnung (8) | Trigger und Nachtlauf laufen ungetestet in Produktion |
| **Offline-Betrieb** | Lokaler Zwischenspeicher, Hinweis beim Speichern ohne Verbindung | Rechnung (7) | Kein Test mit tatsächlich unterbrochener Verbindung |
| **Startgeschwindigkeit** | Ansichten einzeln nachladbar, Service Worker hält die App-Hülle vor, Frist auf jedem Start-Zugriff | Rechnung (27: Frist, Service Worker und Fehlergrenze gegen den echten Quelltext) | **Auf keinem echten iPhone gemessen** — die Ursachen sind aus dem Code belegt, die Wirkung ist es nicht |
| **Fassungswechsel** | Der Worker behält die alten Bausteine, bis die neue Fassung übernommen wird; ein fehlgeschlagenes Nachladen lädt einmal von selbst neu | Rechnung (11 Sandbox + 9 Fehlergrenze) | Nicht auf einem echten Gerät über einen echten Deploy gefahren |
| **Meldungen (Push)** | Wer wird wann benachrichtigt | Rechnung (25) | Zustellung selbst ungetestet |

## Abgeschaltet oder ohne Weg dorthin

| Was | Zustand |
|---|---|
| **KI-Spracherfassung** (`/voice`, `voiceExtract`) | Vollständig gebaut, **aus** — jetzt als Modul, das ohne `VITE_ENABLE_VOICE` gar nicht erst einschaltbar ist. Grund: ohne Schlüssel führt der Knopf nur in eine Fehlermeldung, und Sprachaufnahmen von Mitarbeitern gehen an US-Anbieter — das braucht vorher Auftragsverarbeitungsverträge. Ein Schalter, den man umlegen kann, ohne dass etwas passiert, wäre schlimmer als keiner: deshalb steht er im Modulpanel sichtbar, aber gesperrt, mit dem Grund daneben. |
| **Wiedervorlagen** (`followUps`) | Sammlung, Regeln und Abfragen existieren, geschrieben wird nur aus der KI-Erfassung. Also faktisch **tot**, solange die aus ist. |
| **`exportCompanyData`** | Cloud Function ist deployed und führt seit dem 02.09.2026 **alle** Sammlungen (vorher neun von sechzehn — es fehlten unter anderem Kunden, Scheine und die Nummernkreise). Sie wird von der App weiterhin **nirgends aufgerufen**: ohne Aufrufer bleibt sie ein Versprechen. Ein statischer Abgleich gegen `firestore.rules` meldet künftig jede vergessene Sammlung. |

---

## Die ehrliche Bilanz zur Prüftiefe

591 automatische Tests klingen nach viel. Aufgeschlüsselt:

| Art | Anzahl | Aussagekraft |
|---|---|---|
| Regeltests gegen den Emulator | 131 | Hoch — echtes Verhalten (inkl. Abfrage-Smoketest und Durchstich) |
| **Statischer Abgleich** (Indizes, Navigation ↔ Routen, Exportumfang) | **91** | **Hoch — fängt Widersprüche zwischen Listen, die dasselbe behaupten** |
| Reine Rechnung | 263 | Hoch für die Formeln, **null** für die App |
| Ansichten, Datenbank ersetzt | 95 | Findet Bedienfehler, **keine** Datenfehler |
| **Service Worker in einer Sandbox** | **11** | **Hoch — der echte Quelltext, nicht ein Nachbau** |

Die 131 gegen den Emulator teilen sich in 92 Regeltests, 33 Abfragen je Rolle
und 6 Durchstiche über Ansichtsgrenzen hinweg.

**Zu den 20 neuen Regeltests, weil die Zahl allein nichts sagt:** jeder von
ihnen schlägt gegen die vorherigen Regeln fehl. Das ist nachgemessen, nicht
angenommen — ein Test, der vorher und nachher grün ist, hält keine Grenze
fest, sondern beschreibt nur, was ohnehin galt.

**14 von 26 Ansichten haben keinen eigenen Test**, darunter Zeiterfassung,
Rechnungen, Baustellen und Einsatzplanung.

**Warum das nicht theoretisch ist.** Jeder Fehler, der bisher aus dem Betrieb
gemeldet wurde, lag in den Nähten, die ersetzte Datenbankzugriffe per
Konstruktion nicht sehen:

| Gemeldet | Ursache | Wird jetzt abgefangen? |
|---|---|---|
| Kundenakte ohne Baustellen | fehlender Firestore-Index | **Ja** — Index-Abgleich. Er hat beim ersten Lauf gleich einen zweiten fehlenden gefunden (`followUps`). |
| Projektleitung: fünf Reiter mit „Kein Zugriff" | drei Listen behaupteten dasselbe und waren auseinandergelaufen (`navigation.ts`, `RequireRole`, `permissions.ts`) | **Ja** — der Abgleich Navigation ↔ Routen. Und die Doppelung selbst ist weg: `RequireNav` liest aus derselben Liste. |
| Leeres Auswahlfeld beim Schein | verschluckter Fehler | **Teilweise** — der Smoketest findet eine Abfrage, die an den Regeln scheitert; eine schlicht leere Menge findet er nicht. |
| „Lädt ewig" (Schein) | Cloud Function ohne Frist | **Ja** — die Frist liegt jetzt in `lib/frist.ts` und ist geprüft |
| „iPhone lädt gar nicht" | Start hing an zwei Abfragen ohne Zeitgrenze; kein Vorhalten der App-Hülle | **Teilweise** — Frist und Service Worker sind geprüft, die Wirkung auf einem echten Gerät ist es nicht |
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
3. ~~Vier Durchstich-Tests für die Geldwege~~ — **erledigt.** Zeit →
   Auswertung, Urlaub → Genehmigung → Zeitkonto, Angebot → Baustelle →
   Rechnung → Nachkalkulation, Schein → einfrieren → Storno. Sie haben beim
   Schreiben zwei eigene Fehlannahmen aufgedeckt: dass ein Monteur seinen
   unterschriebenen Schein selbst stornieren dürfe (darf er nicht — nur die
   Leitung), und dass eine Juniwoche fünf Arbeitstage habe (der 4. Juni 2026
   ist Fronleichnam).
4. ~~Navigation verdichten~~ — **erledigt.** Von 18 Reitern auf 14 für die
   Leitung: Material (anfordern, Anforderungen, Lager) und Einstellungen
   (Meldungen, Sätze, Module) fassen je drei Ansichten unter einem Reiter.
   Dabei kam der Reiter-ins-Leere-Fehler heraus, siehe oben.
5. **Ansichtstests nachziehen** ← *als Nächstes*, in dieser Reihenfolge: Zeiterfassung
   (meistbenutzt), Rechnungen (Geld), Einsatzplanung (löscht Daten),
   Baustellen.

## Eine Ungereimtheit, die noch offen ist

Die **Nachkalkulation** ist bewusst Geschäftsführungssache, weil sie Margen
zeigt. Die **Angebote** stehen dagegen auch der Projektleitung offen — und
darin steht die Vorkalkulation mit den Kostensätzen, also die Marge des
einzelnen Auftrags. Entweder ist die eine Grenze zu eng oder die andere zu
weit; entschieden ist es nicht. Das ist eine Produktfrage, keine
Programmierfrage: sie hängt daran, ob die Projektleitung im Betrieb
mitkalkulieren soll.
