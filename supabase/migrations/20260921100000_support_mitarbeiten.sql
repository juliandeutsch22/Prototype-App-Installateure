-- ZWEI STUFEN STATT EINER: ANSEHEN UND MITARBEITEN.
--
-- WARUM ES NICHT BEI EINER BLEIBT. Der erste Blick auf die fertige Ansicht
-- hat die Lücke gezeigt: vier Listen ohne Details beantworten die Frage
-- nicht, mit der ein Betrieb anruft. „Die Rechnung RE-2026-0042 stimmt nicht"
-- heisst: jemand muss die Positionen sehen, die Zahlungen, die Baustelle
-- dahinter. Und manchmal heisst es: „können Sie das bitte richtigstellen".
--
-- DER BETRIEB ENTSCHEIDET, WELCHE STUFE ER GIBT — beim Gewähren, nicht
-- hinterher:
--
--   ansehen      Lesen, sonst nichts. Bis zu sieben Tage. Der Normalfall.
--   mitarbeiten  Wie ein Administrator im Betrieb — aber höchstens 24 Stunden,
--                eigens gekennzeichnet und in jedem Protokoll unterscheidbar.
--
-- WAS AUCH „MITARBEITEN" NICHT KANN, und das ist der Kern der Zusage:
-- Zeitbuchungen, Urlaube und Scheinfotos bleiben verschlossen. Dort stehen
-- Kranken- und Urlaubstage (Art. 9 DSGVO) und Aufnahmen aus Kundenwohnungen;
-- keine Rechnungskorrektur der Welt braucht sie. Die Grenze steht in den
-- Leseregeln (`app.betriebsmitglied` statt `app.darf`) und ist von dieser
-- Migration unberührt.
--
-- DER NOTZUGANG BLEIBT „ANSEHEN". Er läuft ohne Zustimmung; Schreibrechte
-- ohne Zustimmung wären genau der Generalschlüssel, den dieser ganze Bau
-- vermeiden soll. Dass damit der Fall „der letzte Administrator ist weg und
-- es muss ein neuer angelegt werden" offen bleibt, steht in
-- `docs/DEPLOYMENT.md` — benannt, nicht stillschweigend.


-- ---------------------------------------------------------------------------
-- 1. Die Stufe an der Freigabe
-- ---------------------------------------------------------------------------

-- `default 'ansehen'` ist die abwärtskompatible Wahl: jede bestehende Zeile
-- und jede App im alten Stand, die die Spalte nicht kennt, bekommt genau das
-- Verhalten von gestern.
alter table support_freigaben
  add column if not exists stufe text not null default 'ansehen';

alter table support_freigaben
  drop constraint if exists support_freigaben_stufe;
alter table support_freigaben
  add constraint support_freigaben_stufe
  check (stufe in ('ansehen', 'mitarbeiten'));

comment on column support_freigaben.stufe is
  'ansehen = nur lesen (bis 7 Tage). mitarbeiten = wie ein Administrator im Betrieb (bis 24 Stunden). Steht beim Gewähren fest und lässt sich nicht nachträglich ändern.';

-- 24 STUNDEN FÜR „MITARBEITEN", und zwar dieselbe Grenze wie beim Notzugang.
-- Eine Woche Schreibrecht ist kein Supportfall mehr, sondern ein zweiter
-- Administrator, den niemand auf der Gehaltsliste hat.
-- Der Rumpf bleibt Wort für Wort der alte — bis auf die eine Zeile, die die
-- Stufe berücksichtigt. Der Vorbeiweg für den Dienstschlüssel (der Rücklauf
-- einer Sicherung spielt abgelaufene Freigaben wieder ein) und beide
-- Meldungen stehen unverändert da: eine Prüfung, die heute an einer anderen
-- Stelle fällt als gestern, verlangt beim nächsten Leser eine Erklärung.
create or replace function app.support_frist_pruefen() returns trigger
  language plpgsql
  set search_path = ''
as $$
declare
  eng boolean := new.notzugang or new.stufe = 'mitarbeiten';
  grenze interval := case when eng then interval '24 hours' else interval '7 days' end;
begin
  if app.ist_dienst() then return new; end if;

  if new.notzugang and new.stufe <> 'ansehen' then
    raise exception 'Ein Notzugang darf nur ansehen — schreiben ohne Zustimmung gibt es nicht'
      using errcode = '22023';
  end if;

  if new.gilt_bis <= now() then
    raise exception 'Eine Freigabe, die schon abgelaufen ist, ist keine' using errcode = '22023';
  end if;
  if new.gilt_bis > now() + grenze then
    raise exception 'Eine Freigabe gilt höchstens % — länger wäre kein Supportzugang mehr, sondern ein Dauerzugang',
      case when eng then '24 Stunden' else '7 Tage' end
      using errcode = '22023';
  end if;
  return new;
end;
$$;

-- DIE STUFE IST SO UNVERÄNDERLICH WIE GRUND UND FRIST. Sonst wäre eine
-- gewährte Lesefreigabe nachträglich in eine Schreibfreigabe zu heben, und
-- die Zustimmung des Betriebs bezöge sich auf etwas anderes als das, was
-- danach gilt.
create or replace function app.support_freigabe_fest() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if new.grund is distinct from old.grund
     or new.stufe is distinct from old.stufe
     or new.gilt_bis is distinct from old.gilt_bis
     or new.notzugang is distinct from old.notzugang
     or new.gewaehrt_von is distinct from old.gewaehrt_von
     or new.created_at is distinct from old.created_at then
    raise exception 'An einer Freigabe lässt sich nur der Widerruf ändern' using errcode = '42501';
  end if;
  if old.widerrufen_am is not null and new.widerrufen_am is null then
    raise exception 'Ein Widerruf lässt sich nicht zurücknehmen — das ist eine neue Freigabe'
      using errcode = '42501';
  end if;
  return new;
end;
$$;


-- ---------------------------------------------------------------------------
-- 2. Was eine Stufe „mitarbeiten" aufmacht
-- ---------------------------------------------------------------------------

-- ZWEI FUNKTIONEN, WEIL ZWEI FRAGEN.
--
-- `app.support_arbeitet()` beantwortet „darf dieses Konto überhaupt
-- schreiben" — ohne Betrieb, weil die Rollenfunktionen der App keinen
-- Betrieb kennen. `app.support_schreibt(betrieb)` beantwortet „in DIESEM
-- Betrieb". Erst beide zusammen ergeben ein Recht.
--
-- DASS DAS SICHER IST, HÄNGT AN EINER EIGENSCHAFT, DIE DIESER BESTAND SCHON
-- GARANTIERT: `tests/supabase/regeln.test.ts` prüft, dass JEDE Richtlinie auf
-- einer Betriebstabelle den Betrieb selbst prüft — über `app.darf`,
-- `app.betriebsmitglied` oder `app.support_liest`. Eine Rolle ohne Betrieb
-- öffnet deshalb nichts: die Betriebsklammer steht daneben und ist an die
-- Freigabe gebunden. Ohne diesen Wächter wäre das hier eine offene Tür.
create or replace function app.support_arbeitet() returns boolean
  language sql stable
  security definer
  set search_path = ''
as $$
  select app.ist_plattform() and exists (
    select 1 from public.support_freigaben f
     where f.stufe = 'mitarbeiten'
       and f.widerrufen_am is null
       and f.gilt_bis > now())
$$;
grant execute on function app.support_arbeitet() to authenticated, anon, service_role;

create or replace function app.support_schreibt(betrieb text) returns boolean
  language sql stable
  security definer
  set search_path = ''
as $$
  select app.ist_plattform() and exists (
    select 1 from public.support_freigaben f
     where f.company_id = betrieb
       and f.stufe = 'mitarbeiten'
       and f.widerrufen_am is null
       and f.gilt_bis > now())
$$;
grant execute on function app.support_schreibt(text) to authenticated, anon, service_role;

-- DIE ROLLENFUNKTIONEN BEKOMMEN EINEN ZWEITEN WEG.
--
-- Sie lesen bisher ausschliesslich den Anspruch im Token, und ein
-- Plattformkonto trägt keinen. Ohne diesen Zusatz wäre „mitarbeiten" eine
-- Zusage, die an der ersten Schreibregel scheitert — der Riegel liesse durch,
-- und die Richtlinie wiese trotzdem ab.
--
-- ANGEHÄNGT, NICHT UMGESCHRIEBEN: der ursprüngliche Ausdruck steht unverändert
-- vorne. Wer die Rolle im Token hat, kommt genau wie bisher durch; niemand
-- verliert etwas.
create or replace function app.ist_fuehrung() returns boolean
  language sql stable
  set search_path = ''
as $$
  select app.hat_rolle(array['Projektleiter', 'Geschäftsführung', 'Administrator'])
      or app.support_arbeitet()
$$;

create or replace function app.ist_spitze() returns boolean
  language sql stable
  set search_path = ''
as $$
  select app.hat_rolle(array['Geschäftsführung', 'Administrator'])
      or app.support_arbeitet()
$$;

create or replace function app.ist_buch_oder_spitze() returns boolean
  language sql stable
  set search_path = ''
as $$
  select app.hat_rolle(array['Buchhaltung', 'Geschäftsführung', 'Administrator'])
      or app.support_arbeitet()
$$;


-- ---------------------------------------------------------------------------
-- 3. Der Riegel lässt „mitarbeiten" durch — und sonst nichts
-- ---------------------------------------------------------------------------

-- DER RIEGEL BLEIBT DER RIEGEL. Er fragt jetzt nur eine Frage mehr: gibt es
-- für DIESEN Betrieb eine Freigabe der Stufe „mitarbeiten"? Ohne sie ist die
-- Meldung dieselbe wie vorher.
--
-- ER LIEST DEN BETRIEB AUS DER ZEILE, nicht aus dem Token — ein
-- Plattformkonto hat keinen. Bei einem Löschvorgang steht er in `old`, sonst
-- in `new`.
create or replace function app.support_schreibt_nicht() returns trigger
  language plpgsql
  set search_path = ''
as $$
declare
  betrieb text;
begin
  if not app.ist_plattform() then
    return coalesce(new, old);
  end if;

  betrieb := (to_jsonb(coalesce(new, old)) ->> 'company_id');

  if betrieb is not null and app.support_schreibt(betrieb) then
    return coalesce(new, old);
  end if;

  raise exception 'Dieser Supportzugang darf lesen und sonst nichts'
    using errcode = '42501';
end;
$$;

-- DREI TABELLEN BLEIBEN AUCH FÜR „MITARBEITEN" ZU.
--
-- Zeitbuchungen, Urlaube und Scheinfotos sind für einen Supportzugang
-- unlesbar — sie hier trotzdem schreibbar zu lassen, hiesse: blind ändern
-- können, was man nicht sehen darf. Das ist die schlechteste aller
-- Kombinationen. Ihr Riegel kennt die Stufe deshalb gar nicht.
create or replace function app.support_niemals() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if app.ist_plattform() then
    raise exception 'Zeitbuchungen, Urlaube und Scheinfotos bleibt auch der Support verschlossen'
      using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['time_entries', 'vacations', 'work_sheet_photos'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_kein_support_schreiben', t);
    execute format(
      'create trigger %I before insert or update or delete on public.%I
         for each row execute function app.support_niemals()',
      t || '_support_niemals', t);
  end loop;
end;
$$;


-- ---------------------------------------------------------------------------
-- 4. Die Plattformseite muss die Stufe kennen
-- ---------------------------------------------------------------------------

-- Ohne sie stünde der Support vor einem Betrieb und wüsste nicht, ob er
-- gerade nur nachsehen oder auch richtigstellen darf — und erführe es erst
-- an der ersten abgewiesenen Änderung.
--
-- `drop` vor `create`: die Rückgabespalten einer Funktion lassen sich in
-- Postgres nicht per `create or replace` erweitern.
drop function if exists public.support_freigaben_offen();

create function public.support_freigaben_offen()
  returns table (
    id uuid, company_id text, name text, grund text,
    notzugang boolean, stufe text, gilt_bis timestamptz)
  language sql
  security definer
  set search_path = ''
as $$
  select f.id, f.company_id, c.name, f.grund, f.notzugang, f.stufe, f.gilt_bis
    from public.support_freigaben f
    join public.companies c on c.id = f.company_id
   where app.ist_plattform()
     and f.widerrufen_am is null
     and f.gilt_bis > now()
   order by f.gilt_bis
$$;

grant execute on function public.support_freigaben_offen() to authenticated;
