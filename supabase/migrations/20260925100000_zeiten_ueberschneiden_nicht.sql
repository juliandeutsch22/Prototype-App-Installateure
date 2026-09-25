-- ZWEI ARBEITSZEITEN DERSELBEN PERSON ÜBERSCHNEIDEN SICH NICHT.
--
-- Aus dem Launch-Check (25.09.2026, K1): 24.09. 20:00–02:00 auf einer
-- Baustelle, dann 21:00–23:00 auf einer anderen — beides gespeichert, die
-- Woche zählte 16 statt 14 Stunden. Die Doppelung wandert von dort in Saldo,
-- Lohnexport, Nachkalkulation und Rechnung, und keiner dieser Wege fragt
-- noch einmal nach.
--
-- Geprüft wurde bisher nur in der Maske, und nur zweierlei: dieselbe
-- Baustelle am selben Tag, und Zeitausgleich gegen Arbeit. Zwei Baustellen
-- zur selben Stunde fielen durch, und über Mitternacht sah die Prüfung gar
-- nicht erst hin.
--
-- HIER UND NICHT NUR IN DER MASKE, weil es mehrere Schreiber gibt: die
-- Maske des Monteurs, die Mitarbeiterübersicht des Büros, das Ausgangsfach
-- beim Nachsenden, der Nachtrag vom Schein. Eine Regel, die jeder davon
-- selbst einhalten muss, hält einer davon nicht ein.

/*
  WAS ALS SPANNE ZÄHLT. Anwesenheit mit Beginn und Ende. Endet sie vor oder
  zu ihrem Beginn, ging sie über Mitternacht — genau so rechnet
  `calcWorkMin` (shared/arbeitszeit.ts) die Stunden, und die Prüfung muss
  dieselbe Spanne sehen, die später bezahlt wird. Beginn gleich Ende ist
  keine Spanne (null Stunden) und überschneidet nichts.

  Einträge mit direkt gesetzten Stunden und ohne Uhrzeit bleiben aussen vor:
  ohne Uhrzeit gibt es nichts zu vergleichen. Zeitausgleich, Urlaub und
  Krank ebenso — sie zählen keine Arbeitsstunden, doppelt zählen kann also
  nur Arbeit gegen Arbeit.
*/
create or replace function app.arbeitsspanne(p_tag date, p_beginn time, p_ende time)
  returns tsrange
  language sql
  immutable
  set search_path = ''
as $$
  select case
    when p_beginn is null or p_ende is null or p_beginn = p_ende then null
    when p_ende > p_beginn then tsrange(p_tag + p_beginn, p_tag + p_ende)
    else tsrange(p_tag + p_beginn, p_tag + 1 + p_ende)
  end
$$;

/*
  DER RÜCKLAUF DARF. Er spielt Bestand ein, wie er war — auch einen, der vor
  dieser Regel entstanden ist. Die Regel gilt dem, was ab jetzt gebucht wird.

  NUR BEI ÄNDERUNG DER ZEIT. Eine Rechnung setzt an alten Einträgen das
  Verrechnet-Kennzeichen; hätten zwei davon sich schon vor dieser Regel
  überschnitten, scheiterte sonst die Rechnung an einer Frage, die sie
  nicht gestellt hat.
*/
create or replace function app.zeiten_ueberschneiden_nicht() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  spanne tsrange;
  andere record;
begin
  if app.ist_dienst() then
    return new;
  end if;
  if new.status <> 'Anwesend' then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and new.user_id is not distinct from old.user_id
     and new.date is not distinct from old.date
     and new.start_time is not distinct from old.start_time
     and new.end_time is not distinct from old.end_time
     and new.status is not distinct from old.status then
    return new;
  end if;

  spanne := app.arbeitsspanne(new.date, new.start_time, new.end_time);
  if spanne is null then
    return new;
  end if;

  -- Ein Tag davor und danach: eine Nachtschicht vom Vortag reicht in diesen
  -- Tag hinein, und diese kann in den nächsten reichen.
  select t.date, t.start_time, t.end_time, t.project_number
    into andere
    from public.time_entries t
   where t.company_id = new.company_id
     and t.user_id = new.user_id
     and t.id <> new.id
     and t.status = 'Anwesend'
     and t.date between new.date - 1 and new.date + 1
     and app.arbeitsspanne(t.date, t.start_time, t.end_time) && spanne
   order by t.date, t.start_time
   limit 1;

  if found then
    raise exception 'Die Zeit überschneidet sich mit %–% am %. Zwei Zeiten zur selben Stunde zählen doppelt — bitte eine davon anpassen.',
      to_char(andere.start_time, 'HH24:MI'),
      to_char(andere.end_time, 'HH24:MI'),
      to_char(andere.date, 'DD.MM.YYYY')
        || coalesce(' (' || nullif(andere.project_number, '') || ')', '')
      using errcode = '23P01';
  end if;
  return new;
end;
$$;

drop trigger if exists time_entries_ueberschneiden_nicht on public.time_entries;
create trigger time_entries_ueberschneiden_nicht
  before insert or update on public.time_entries
  for each row execute function app.zeiten_ueberschneiden_nicht();
