# Die Linie — wie jeder Screen aussieht

Verbindlich für alle Ansichten. Abgeleitet aus dem Entwurf „Monteur-Start und
Handwerksschein“ (Mockup-Seiten 1–8). Die Tokens der App bleiben (Farben,
Schrift Poppins); übernommen wird der Aufbau, die Gewichtung und die Ruhe.
Wo der Entwurf gestrichelte Rahmen, halbtransparente Flächen oder farbige
Kacheln hinter Symbolen zeigt, steht in der App dieselbe Form deckend und
durchgezogen.

## 1. Seite

- **Grund** `--bg`, darauf weiße Karten. Kein Rahmen um die Seite.
- **Seitenkopf** (`PageHeader`): optional eine kleine Zeile darüber
  (Datum · KW, oder „← Zurück zu …“), dann der Titel groß und kräftig
  (Telefon 1,5 rem, ab 640 px 2 rem, 700), darunter eine gedämpfte
  Metazeile („Kunde · Nummer · Datum · Abrechnung“). Kein Strich unter dem
  Titel. Die Hauptaktion der Seite steht rechts im Kopf.
- **Abstände**: zwischen Seitenkopf und erster Karte 1,5 rem, zwischen
  Karten 1,25 rem (Telefon 1 rem).
- **Am Schreibtisch** zweispaltig, wo es zwei Arten Inhalt gibt: links das
  Hauptding (3 fr), rechts Stand und Nächstes (2 fr) — ab 1280 px.

## 2. Karte

- Weiße Fläche, kein Kopfstreifen, keine sichtbare Kante; der Schatten hebt
  sie vom Grund ab. Innenabstand 1,25 rem (Telefon 1 rem).
- **Titel innen**, 1,125 rem, halbfett, Tinte. Rechts in derselben Zeile
  wahlweise ein Wert („17:00 von 38:30 Std“), eine gedämpfte Angabe
  („aus der Zeiterfassung übernommen“, „2 von 8 · freiwillig“) oder ein
  Textlink.
- Nummerierte Abschnitte eines Formulars am Schreibtisch: „1 · Zeiten vor Ort“.
- Keine Karte in der Karte. Was in einer Karte gruppiert werden muss, trennt
  eine Haarlinie, kein zweiter Rahmen.

## 3. Zeilen und Listen

- Zeilen durch Haarlinien getrennt, die letzte ohne.
- **Titel** halbfett, **Unterzeile** gedämpft mit „·“ als Trenner
  („Do, 24.09. · PR-2026-0002 · 06:00 Std“).
- **Wert** rechts, fett, rechtsbündig.
- **Führt die Zeile woanders hin**, ist die ganze Zeile die Tastfläche und
  trägt rechts einen Pfeil (›). Kein unterstrichener Link im Titel.
- Seltene Aktionen (Löschen, Verwerfen, Stornieren, Ablehnen) liegen im
  Zeilenmenü (⋯), häufige als Textknopf.

## 4. Tabelle (ab 1280 px)

- Kopf klein und gedämpft, Zeilen mit Haarlinie, Zahlen rechtsbündig und
  fett, Einheit in eigener Spalte oder im Kopf.
- Unter der Tabelle rechts die Summe: „Gesamt **17:00 Std**“.

## 5. Knöpfe und Chips

- **Hauptknopf** dunkel (`--brand`), groß, eine je Karte oder Seite. Er darf
  eine zweite Zeile tragen („07:00–16:00 · 30 min Pause · 08:30 Std“).
- **Zweitknopf** weiß mit Haarlinie, gleiche Höhe.
- **Chips** für Adresse und Kontakt: weiß, Haarlinie, Symbol + Text,
  nebeneinander, brechen um. Sie sind die Links (Route, Anruf).
- **Wahl aus wenigen Werten** (Pause 0/30/45/60, Zuschläge): Knopfreihe,
  gewählter Wert dunkel gefüllt.
- Ein Plus-Knopf zum Hinzufügen ist ein Zweitknopf mit durchgezogener
  Kante — nicht gestrichelt.

## 6. Aktionsleiste unten (Telefon)

- Weiß, Haarlinie oben, klebt über der Tableiste.
- Darüber eine Summenzeile: links die Bezeichnung gedämpft, rechts der Wert
  fett („Material · **3 Positionen**“).
- „Zurück“ schmal als Zweitknopf, die Hauptaktion breit („Weiter: Fotos ›“).

## 7. Schrittfolge (Handwerksschein am Telefon)

- Kopf weiß: ‹ zurück, Titel, Metazeile „Kunde · Nummer · Datum“.
- Darunter vier Balken mit Beschriftung: erledigte Schritte in Akzent,
  aktueller Schritt dunkel und fett, offene grau.

## 8. Navigation

- **Seitenleiste**: oben das Senklot-Zeichen mit „Senklot“ und darunter der
  Betrieb; die Einträge ohne Gruppenüberschrift, wenn die Rolle nur eine
  Gruppe hat; unten Avatar, Name, Rolle, darunter klein „Problem melden“,
  „Abmelden“, Rechtliches.
- Der erste Eintrag heißt **Start**. Einstellungen stehen am Ende der Liste.
- **Tableiste** (Telefon): Symbol und Kurzname, der aktive Eintrag auf
  einer hellen Fläche.

## 9. Monteur-Start

- Telefon: dunkles Kopfband mit „Freitag, 25.09.2026 · KW 39“ und „Guten
  Morgen, Max“; die Heute-Karte ragt in das Band.
- Heute: „Heute ab 07:00“ (wo eine Zeit bekannt ist) und die Abrechnungsart
  rechts; Kunde groß; „Nummer · Aufgabe“; Adresse und Kontakt als Chips;
  Hauptknopf „Wie zuletzt buchen“; darunter „Andere Zeit“ und „Schein
  schreiben“ nebeneinander.
- Diese Woche: Titel links, „17:00 von 38:30 Std“ rechts; Balken Mo–Fr mit
  gebuchten Stunden, heute mit durchgezogener Kante; darunter „Saldo
  September“ und der Wert.
- Offen für dich: Zeilen mit Pfeil.
- Schreibtisch: links Heute und Offen, rechts Woche und Nächste Einsätze;
  „Zeit buchen“ als Hauptaktion im Seitenkopf.

## 10. Was nie vorkommt

Gestrichelte oder gepunktete Linien · halbtransparente Flächen (Ausnahme:
Abdunkler hinter Dialogen) · Verläufe · Emojis · farbige Kacheln hinter
Symbolen · Symbole ohne Bedeutung · Versalien in Überschriften · Text unter
4,5 : 1 · Tastflächen unter 44 px · Eingabeschrift unter 16 px · seitliches
Scrollen der Seite.
