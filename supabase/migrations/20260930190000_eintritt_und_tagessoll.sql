-- TESTBERICHT 30.09.2026, PAKET 2b — EINTRITT, SALDO-START, TAGESSOLL.
--
--   M6  Das echte Eintrittsdatum steht getrennt vom Saldo-Startdatum.
--   M7  Vor dem Eintritt lässt sich nicht buchen.
--   M5  Optional ein Tagessoll je Wochentag an der Person.

-- ---------------------------------------------------------------------------
-- M6 — Eintritt und Saldo-Start sind zwei Daten
-- ---------------------------------------------------------------------------

/*
  WAS BISHER GALT: es gab nur `app_start_date`. Das Anlegeformular nannte es
  bei einem Neueintritt „Eintrittsdatum“, bei einem Umstieg „Saldo-Start-
  datum“, und die Akte zeigte immer „Saldo-Startdatum“ — wer 2015 eingetreten
  ist und am 01.10.2026 auf Senklot umsteigt, hatte danach kein Eintritts-
  datum mehr.

  JETZT: `eintritt` ist der Tag, an dem die Person im Betrieb angefangen hat;
  `app_start_date` bleibt der Tag, ab dem das Zeitkonto in Senklot rechnet.
  Bei einem Neueintritt sind beide gleich. Wo noch kein Eintritt steht, wird
  der Saldo-Start übernommen — das ist das Beste, was der Bestand weiss.
*/
alter table public.users add column if not exists eintritt date;

update public.users set eintritt = app_start_date
 where eintritt is null and app_start_date is not null;

-- Der Saldo-Start liegt nie vor dem Eintritt: vor dem ersten Arbeitstag gibt
-- es kein Soll, das ein Zeitkonto rechnen könnte. Nach dem Übernehmen oben
-- erfüllt jede bestehende Zeile die Regel.
alter table public.users drop constraint if exists users_eintritt_vor_saldostart;
alter table public.users add constraint users_eintritt_vor_saldostart
  check (eintritt is null or app_start_date is null or eintritt <= app_start_date);

-- ---------------------------------------------------------------------------
-- M7 — vor dem Eintritt keine Buchung
-- ---------------------------------------------------------------------------

/*
  WAS BISHER GALT: Test Projektleitung konnte am 30.09. buchen, obwohl der
  Eintritt am 01.10. ist. Die Stunden zählten weder im Saldo noch sonstwo —
  sie verschwanden still.

  ENTSCHIEDEN AM 30.09.2026: vor dem Eintritt sperrt die Datenbank; zwischen
  Eintritt und Saldo-Start warnt die Maske (dort deckt der Anfangssaldo die
  Zeit ab, eine Buchung zählt nicht mehr ins Zeitkonto).

  Geprüft beim Anlegen und wenn sich Tag oder Person ändern — eine alte
  Buchung vor dem Eintritt bleibt änderbar, solange ihr Tag bleibt. Der
  Dienstschlüssel (Rücklauf) ist ausgenommen.
*/
create or replace function app.nicht_vor_eintritt() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  ab date;
begin
  if app.ist_dienst() then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.date is not distinct from old.date
     and new.user_id is not distinct from old.user_id then
    return new;
  end if;
  select u.eintritt into ab from public.users u where u.id = new.user_id;
  if ab is not null and new.date < ab then
    raise exception 'Vor dem Eintritt am % lässt sich nicht buchen', to_char(ab, 'DD.MM.YYYY')
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function app.nicht_vor_eintritt() from public, anon, authenticated;

drop trigger if exists time_entries_nicht_vor_eintritt on public.time_entries;
create trigger time_entries_nicht_vor_eintritt
  before insert or update on public.time_entries
  for each row execute function app.nicht_vor_eintritt();

-- ---------------------------------------------------------------------------
-- M5 — Tagessoll je Wochentag
-- ---------------------------------------------------------------------------

/*
  WAS BISHER GALT: das Tagessoll ist Wochenstunden geteilt durch Arbeitstage;
  ein kurzer Freitag liess sich nicht abbilden.

  JETZT, OPTIONAL: `tagessoll` hält Stunden je Wochentag, Schlüssel wie in
  `work_days` ("0" = Sonntag … "6" = Samstag). Ohne Angabe bleibt die
  gleichmässige Verteilung — für alle, die es nicht setzen, ändert sich
  nichts. Gerechnet wird in der App (`tagessollStunden`); gespeichert und
  geprüft wird hier.
*/
alter table public.users add column if not exists tagessoll jsonb;

-- Eine Prüfung mit Unterabfrage verbietet Postgres im CHECK; als Funktion geht es.
create or replace function app.tagessoll_gueltig(t jsonb) returns boolean
  language sql
  immutable
  set search_path = ''
as $$
  select t is null
      or (jsonb_typeof(t) = 'object'
          and not exists (
            select 1 from jsonb_each(t) e
             where e.key !~ '^[0-6]$'
                or jsonb_typeof(e.value) <> 'number'
                or (e.value #>> '{}')::numeric < 0
                or (e.value #>> '{}')::numeric > 24))
$$;

alter table public.users drop constraint if exists users_tagessoll_form;
alter table public.users add constraint users_tagessoll_form check (app.tagessoll_gueltig(tagessoll));
