-- Die Rolle `anon` bekommt an den Betriebsdaten nichts mehr.
--
-- WAS SIE IST: jede Anfrage, die mit dem oeffentlichen Schluessel kommt und
-- kein Anmeldetoken traegt. Der Schluessel steht im ausgelieferten
-- JavaScript, also kennt ihn jeder, der die Seite aufruft.
--
-- WAS SIE BISHER DURFTE: alles. Supabase vergibt im Schema `public` an `anon`
-- und `authenticated` per Vorgabe SELECT, INSERT, UPDATE und DELETE auf jede
-- neue Tabelle. Zwischen einem Fremden ohne Konto und den Loehnen dieses
-- Betriebs stand damit genau eine Sache: der Zeilenschutz.
--
-- WARUM DAS TROTZDEM KEIN LOCH WAR: jede Richtlinie verlangt `app.darf(...)`
-- oder `app.angemeldet()`, und ohne Token ist `auth.uid()` null. Eine
-- anonyme Anfrage trifft auf keine einzige Richtlinie und bekommt eine leere
-- Menge.
--
-- WARUM ES TROTZDEM WEGGEHOERT: weil „kein Loch" hier von der Fehlerfreiheit
-- von siebzig Richtlinien abhaengt. Faellt eine davon einmal zu weit aus —
-- ein vergessenes `app.darf`, ein `using (true)` beim Nachbessern —, ist der
-- Unterschied gewaltig: mit `anon`-Rechten liest es das halbe Internet, ohne
-- sie bestenfalls ein angemeldeter Mitarbeiter eines anderen Betriebs. Die
-- Reichweite eines kuenftigen Fehlers wird hier kleiner gemacht, nicht der
-- heutige Fehler behoben.
--
-- WAS `anon` WEITER KANN, und koennen muss: sich anmelden. Das laeuft ueber
-- GoTrue und das Schema `auth`, nicht ueber PostgREST — davon nimmt diese
-- Migration nichts weg. Vor der Anmeldung liest die App keine einzige Zeile.

/*
  DREI SCHRITTE, UND DER DRITTE IST DER WICHTIGSTE.

  Die ersten beiden raeumen ab, was heute steht. Der dritte aendert die
  VORGABE: ohne ihn bekaeme die naechste Tabelle, die jemand anlegt, die alten
  Rechte wieder — und niemandem fiele es auf, weil nichts kaputtgeht.

  `alter default privileges` wirkt nur fuer die Rolle, unter der es gesetzt
  wurde. Migrationen laufen als `postgres` — damit sind alle Tabellen erfasst,
  die aus diesem Verzeichnis entstehen.

  WAS DAMIT NICHT ERFASST IST, und das gehoert gesagt: eine Tabelle, die
  jemand von Hand in der Dashboard-Maske anlegt. Die entsteht als
  `supabase_admin`, und dessen Vorgabe darf `postgres` nicht aendern
  (`permission denied to change default privileges` — versucht, nicht
  vermutet). Diese Luecke schliesst kein SQL, sondern
  `tests/supabase/schema.test.ts`: es prueft JEDE Tabelle in `public` und
  wird rot, sobald `anon` irgendwo wieder ein Recht hat. Tabellen gehoeren
  ohnehin in eine Migration und nicht in eine Maske.
*/
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;

/*
  DIE FUNKTIONEN BLEIBEN ERREICHBAR — und das ist Absicht.

  `app.*` und die oeffentlichen Datenbankfunktionen pruefen die Anmeldung
  selbst und in ihrer ersten Zeile. Ein Aufruf ohne Token endet dort mit
  „Keine Anmeldung", nicht mit einer Rechteverletzung. Die Meldung, die jemand
  bekommt, der sich vertan hat, soll sagen was los ist.

  Das Ausfuehrungsrecht auf eine Funktion ist ohnehin keines auf ihre Daten:
  `security definer` laeuft mit erhoehten Rechten, deshalb steht die Pruefung
  drin und nicht davor.
*/
