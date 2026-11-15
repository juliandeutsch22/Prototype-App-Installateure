-- K8 (Paket 8, 16.11.2026): die Seiten der Ausleitung sind lückenlos gezählt.

/*
  WAS GESCHAH. `auszug_snapshot_start` (20261025100000) rechnete die Seite
  einer Zeile aus den Bytes VOR ihr: Seite = Bytes davor / 1 MB + 1. Eine
  Zeile, die allein größer ist als 1 MB (eine lange Notiz, ein großer
  Angebotstext), schob die nächste Zeile damit gleich mehrere Seiten weiter —
  nach einer 9-MB-Zeile auf Seite 10, die Seiten 2 bis 9 gab es nicht.
  `daten-ausleitung` holt aber jede Seite von 1 bis zur höchsten und bricht
  bei einer leeren ab („Der Datenstand wurde während der Übertragung
  verworfen“). Der Nachtlauf dieses Betriebs scheiterte so jede Nacht, mit
  einer Meldung, die auf etwas anderes zeigte.

  JETZT werden dieselben Seitengrenzen lückenlos durchnummeriert
  (`dense_rank`), wie in `betrieb_auszug_start` (K4). Die Function bleibt,
  wie sie ist: sie fragt `seiten` = höchste Seite und holt 1 … seiten — das
  ist jetzt genau die Zahl der Seiten. Signatur, Rückgabe und Rechte bleiben.
*/
create or replace function public.auszug_snapshot_start(p_betrieb text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare kennung uuid := gen_random_uuid();
begin
  insert into app.auszug_arbeitsstand(lauf, betrieb, nr, inhalt, bytes, seite)
    overriding system value
    select kennung, p_betrieb, r.o, r.z, r.b, dense_rank() over (order by r.roh)::integer
      from (select q.o, q.z, q.b, (sum(q.b) over (order by q.o) - q.b) / (1024 * 1024) as roh
              from (select t.z, t.o, octet_length(t.z::text) + 1 as b
                      from app.auszug_snapshot_zeilen(p_betrieb) with ordinality as t(z, o)) q) r
      order by r.o;
  return kennung;
end; $$;

revoke all on function public.auszug_snapshot_start(text) from public, anon, authenticated;
grant execute on function public.auszug_snapshot_start(text) to service_role;
