/*
  DIE EINSÄTZE EINER BAUSTELLE SCHNELL FINDEN (E83, 12.11.2026).

  Die Baustellenakte fragt jetzt nach den nächsten und letzten Einsätzen
  genau einer Baustelle (`einsaetzeDerBaustelle`), und ihre Hauptaktion hängt
  daran, ob es überhaupt einen gibt. Die vorhandenen Indizes führen über
  Betrieb und Datum bzw. Person und Datum; ohne diesen läse Postgres für jede
  Akte alle Einsätze des Betriebs. Mit Datum als drittem Glied liefert er
  beide Richtungen (ab heute aufsteigend, davor absteigend) samt Grenze
  direkt aus dem Index.

  Nur ein Index: keine Daten werden geändert.
*/
create index if not exists assignments_baustelle_datum
  on public.assignments (company_id, project_number, date);
