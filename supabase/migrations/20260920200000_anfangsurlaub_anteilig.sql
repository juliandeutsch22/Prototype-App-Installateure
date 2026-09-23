-- ANFANGSURLAUB DARF BRUCHTEILE HABEN. Er hatte sie schon, nur die Spalte
-- nicht.
--
-- GEFUNDEN IM PROBELAUF EINES ECHTEN BETRIEBS, nicht in einer Prüfung. Petra
-- legt ihren ersten Monteur an, wählt „Tritt neu ein" — die richtige Antwort
-- für einen Neueintritt —, und die App schlägt für den 20.09. den aliquoten
-- Anspruch vor: 25 × 4 von 12 Monaten = 8,33 Tage. Genau diese Zahl steht in
-- der Vorschlagszeile, und genau diese Zahl weist die Datenbank ab:
--
--   invalid input syntax for type integer: "8.33"
--
-- WARUM DAS EIN BLOCKER WAR UND KEIN SCHÖNHEITSFEHLER. Das Anmeldekonto wird
-- VOR der Zeile in der Belegschaft angelegt, und aufräumen kann der Browser
-- es nicht (das bräuchte Dienstrechte, die er nicht hat und nicht haben
-- soll). Zurück blieb also ein Konto ohne Belegschaftszeile — und dieselbe
-- Adresse liess sich danach nie wieder verwenden. Ein Betrieb, der seine
-- Leute anlegt, verbrannte auf diese Weise jede Adresse der Reihe nach.
--
-- 25 × m / 12 ist nur für m = 12 ganzzahlig. Getroffen hat es damit jeden
-- Neueintritt ausserhalb des ersten Urlaubsmonats — elf von zwölf Monaten.
--
-- WARUM DIE SPALTE WEICHT UND NICHT DER VORSCHLAG. Die Zahl ist richtig: sie
-- steht so in der Ansicht, sie ist so gerechnet, und sie in der Datenbank zu
-- runden hiesse, dem Mitarbeiter einen Drittel Tag zu schenken oder zu
-- nehmen, ohne dass es jemand entschieden hätte. Die Nachbarspalten führen
-- es vor: `weekly_target_hours` und `initial_overtime` sind längst `numeric`.
-- Der Anfangsurlaub war der Ausreisser.
--
-- ABWÄRTSKOMPATIBEL: `integer` → `numeric(5,2)` weitet nur. Was drinsteht,
-- bleibt lesbar und rechnet sich gleich; eine App im alten Stand schreibt
-- weiterhin ganze Zahlen, und die passen. Die Gegenrichtung — die Spalte
-- wieder zu verengen — ginge nicht, und genau deshalb steht hier `numeric`
-- und nicht `real`: Urlaubstage sind eine Verrechnungsgrösse, und für die
-- ist ein Gleitkommatyp die falsche Zusage.
--
-- `yearly_vacation_days` BLEIBT ganzzahlig. Der Jahresanspruch laut Vertrag
-- ist 25 oder 30, sein Feld lässt nichts anderes zu, und eine Spalte zu
-- weiten, für die es keinen Fall gibt, ist keine Vorsorge, sondern eine
-- Einladung an die nächste Unklarheit.
alter table users
  alter column initial_vacation_days type numeric(5,2);

comment on column users.initial_vacation_days is
  'Resturlaub am app_start_date, in Tagen mit zwei Nachkommastellen. NULL = nicht angegeben, dann gilt der volle Jahresanspruch. Anteilige Werte sind der Normalfall: der Vorschlag für einen Neueintritt rechnet Jahresanspruch × Monate / 12.';
