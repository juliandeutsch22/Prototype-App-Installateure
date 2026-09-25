-- DER EIGENE ZEITAUSGLEICH BEKOMMT SEINEN EIGENEN WÄCHTER.
--
-- Nachgemessen am 25.09.2026, nachdem die Datenbankprüfung in der CI an
-- „Zeitausgleich für sich selbst bucht das Büro nicht direkt" scheiterte,
-- obwohl die Regel aus `20260926112000_vier_augen_ohne_umweg.sql` für sich
-- genommen greift (einzeln gegen PostgreSQL 17, GoTrue und PostgREST: grün).
--
-- DIE URSACHE: `tests/supabase/urlaubNurUeberAntrag.test.ts` spielt für die
-- Prüfung der Altbestand-Übernahme die GANZE Migration
-- `20260924190000_urlaub_nur_ueber_antrag.sql` ein zweites Mal ein. Die
-- enthält `create or replace function app.urlaub_nur_ueber_antrag()` — und
-- setzte damit die Fassung von heute auf die vom 24.09. zurück, ohne den
-- Absatz zum eigenen Zeitausgleich. Jede Prüfung, die danach im selben
-- Stapel lief, sah die alte Regel. Im Betrieb geschieht das nicht (eine
-- Migration läuft einmal), aber es zeigt eine echte Schwäche: eine Regel, die
-- in einer fremden, älteren Funktion mitwohnt, geht verloren, sobald jemand
-- diese Funktion neu schreibt.
--
-- Deshalb steht die Regel jetzt für sich, in einer eigenen Funktion an einem
-- eigenen Auslöser. `app.urlaub_nur_ueber_antrag` bekommt ihre Fassung vom
-- 24.09. zurück, Wort für Wort — ein erneutes Einspielen jener Migration
-- ändert damit nichts mehr.

/*
  Zeitausgleich für die EIGENE Person bucht direkt nur, wer allein
  entscheidet (Prüflauf 25.09.2026, P3-09). Gilt, wenn ein Zeitausgleich
  entsteht oder verschoben wird — nicht für einen, der schon steht und an
  dem sich nichts Zählbares ändert.

  NUR DIE APP. Genehmigen, Urlaub eintragen, Betriebsurlaub laufen mit den
  Rechten ihres Eigentümers; dort wacht `app.urlaub_vier_augen` am Antrag.

  Der Auslöser heisst so, dass er NACH `time_entries_urlaub_nur_ueber_antrag`
  läuft: ein Monteur bekommt weiter zuerst „Zeitausgleich beantragt man auf
  der Seite Urlaub".
*/
create or replace function app.zeitausgleich_vier_augen() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  if new.status = 'Zeitausgleich'
     and new.user_id = auth.uid()
     and (tg_op = 'INSERT'
          or old.status is distinct from 'Zeitausgleich'
          or new.date is distinct from old.date
          or new.start_time is distinct from old.start_time
          or new.end_time is distinct from old.end_time)
     and app.entscheidet_jemand_anderer(new.company_id, new.user_id) then
    raise exception 'Zeitausgleich für dich selbst beantragst du auf der Seite Urlaub — darüber entscheidet jemand anderer (Vier-Augen-Prinzip).'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists time_entries_zeitausgleich_vier_augen on public.time_entries;
create trigger time_entries_zeitausgleich_vier_augen
  before insert or update on public.time_entries
  for each row execute function app.zeitausgleich_vier_augen();

/*
  Die Fassung aus `20260924190000_urlaub_nur_ueber_antrag.sql`, unverändert.
  Der Absatz zum eigenen Zeitausgleich steht jetzt oben für sich.
*/
create or replace function app.urlaub_nur_ueber_antrag() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if current_user <> 'authenticated' then
    return coalesce(new, old);
  end if;

  if tg_op in ('UPDATE', 'DELETE') and old.vacation_id is not null then
    raise exception 'Dieser Tag gehört zu einem genehmigten Antrag — er ändert sich nur über den Antrag (Seite Urlaub, „zurücknehmen")'
      using errcode = '42501';
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    if new.vacation_id is not null or new.status = 'Urlaub' then
      raise exception 'Urlaub wird beantragt und genehmigt, nicht direkt gebucht'
        using errcode = '42501';
    end if;
    if new.status = 'Zeitausgleich' and not app.ist_buch_oder_spitze() then
      raise exception 'Zeitausgleich beantragt man auf der Seite Urlaub'
        using errcode = '42501';
    end if;
  end if;

  -- Einen Zeitausgleich, den das Büro gebucht hat, nimmt auch nur das Büro
  -- wieder heraus: gelöscht stünde die freie Zeit plötzlich als Guthaben da.
  if tg_op in ('UPDATE', 'DELETE') and old.status = 'Zeitausgleich'
     and not app.ist_buch_oder_spitze() then
    raise exception 'Einen gebuchten Zeitausgleich ändert das Büro'
      using errcode = '42501';
  end if;

  return coalesce(new, old);
end;
$$;
