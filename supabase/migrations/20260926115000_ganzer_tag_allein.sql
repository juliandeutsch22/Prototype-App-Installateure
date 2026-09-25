-- EIN GANZTÄGIGER EINTRAG STEHT ALLEIN AM TAG.
--
-- Aus dem Prüflauf vom 25.09.2026 (P1-17): „Anwesend" neben „Krank",
-- „Urlaub" oder ganztägigem Zeitausgleich derselben Person am selben Tag
-- verhinderte nur die Maske (`lib/tagesbuchungen.ts`, `buchungKonflikt`).
-- Über die Schnittstelle, aus dem Ausgangsfach nach einem Tag im Funkloch
-- oder aus der Mitarbeiterübersicht des Büros ging es durch — und der Tag
-- zählte dann doppelt: als Krank- oder Urlaubstag UND mit Arbeitsstunden,
-- im Saldo, in der Monatsbilanz, im Lohnexport.
--
-- WAS ERLAUBT BLEIBT, nachgesehen und nicht angenommen:
--   - Zeitausgleich STUNDENWEISE (mit Von und Bis) neben Arbeit — vormittags
--     gearbeitet, nachmittags frei. So genehmigt ihn `urlaub_entscheiden`,
--     und so lässt ihn die Maske zu.
--   - Die Wege, die ganztägige Tage anlegen — Genehmigen, Urlaub eintragen,
--     Betriebsurlaub, Krankmeldung —, überspringen schon heute jeden Tag, an
--     dem etwas steht. Sie stossen hier nie an.
--   - Der Rücklauf aus der Sicherung (Dienstschlüssel) spielt Bestand ein,
--     wie er war.
--   - Alte Einträge, die sich schon widersprechen: geprüft wird nur, wenn
--     sich Person, Tag, Status oder Zeiten ändern. Eine Rechnung, die an so
--     einem Eintrag das Verrechnet-Kennzeichen setzt, scheitert nicht daran —
--     dieselbe Vorsicht wie bei `app.zeiten_ueberschneiden_nicht`.

create or replace function app.ganzer_tag_allein() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  ganztags boolean;
  anderer text;
begin
  if app.ist_dienst() then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and new.user_id is not distinct from old.user_id
     and new.date is not distinct from old.date
     and new.status is not distinct from old.status
     and new.start_time is not distinct from old.start_time
     and new.end_time is not distinct from old.end_time then
    return new;
  end if;

  ganztags := new.status in ('Krank', 'Urlaub')
    or (new.status = 'Zeitausgleich' and (new.start_time is null or new.end_time is null));

  if ganztags then
    -- Ganztägig: daneben steht an diesem Tag gar nichts.
    select t.status into anderer
      from public.time_entries t
     where t.company_id = new.company_id
       and t.user_id = new.user_id
       and t.date = new.date
       and t.id <> new.id
     limit 1;
    if found then
      raise exception 'Für den % sind schon Einträge („%") gebucht. „%" gilt für den ganzen Tag — dafür müssen sie zuerst weg.',
        to_char(new.date, 'DD.MM.YYYY'), anderer, new.status
        using errcode = '23P01';
    end if;
  elsif new.status = 'Anwesend' then
    -- Arbeit: nicht an einem Tag, der schon ganz belegt ist.
    select t.status into anderer
      from public.time_entries t
     where t.company_id = new.company_id
       and t.user_id = new.user_id
       and t.date = new.date
       and t.id <> new.id
       and (t.status in ('Krank', 'Urlaub')
            or (t.status = 'Zeitausgleich' and (t.start_time is null or t.end_time is null)))
     limit 1;
    if found then
      raise exception 'Für den % ist schon „%" eingetragen. Das gilt für den ganzen Tag — daneben lässt sich keine Arbeitszeit buchen.',
        to_char(new.date, 'DD.MM.YYYY'), anderer
        using errcode = '23P01';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists time_entries_ganzer_tag_allein on public.time_entries;
create trigger time_entries_ganzer_tag_allein
  before insert or update on public.time_entries
  for each row execute function app.ganzer_tag_allein();
