/*
  „IM FIRMENBUCH EINGETRAGEN“ BEI GmbH, AG, KG … FEST (Testbericht Runde 7,
  Abschnitt 6.1, Auftrag 7.9)

  WAS DER BERICHT FAND. Bei „Perl Installationen GmbH“ ließ sich der Haken
  abwählen. Abgewählt schaltet er genau die Mahnung ab, die eine Rechnung
  ohne Firmenbuchnummer und -gericht verhindern soll (§ 14 UGB). Für
  Rechtsformen, die es nur mit Eintragung gibt, ist das nie richtig.

  WAS JETZT GILT.
  - Trägt der Name GmbH (auch GmbH & Co KG, Ges.m.b.H.), FlexCo/FlexKapG,
    AG, SE, KG, OG oder eine eingetragene Genossenschaft (eGen), kann
    `im_firmenbuch` nicht „nein“ sein. Ein ausdrückliches „nein“ weist die
    Datenbank ab; wird nur umbenannt (etwa „i. G.“ gestrichen), setzt sie
    den alten Wert zurück auf leer — leer heißt: der Name entscheidet.
  - AUSNAHME „in Gründung“ / „i. G.“ im Namen: noch nicht eingetragen, der
    Haken bleibt frei.
  - Einzelunternehmen (mit oder ohne „e.U.“) bleiben frei wählbar.
  - Erkannt wird mit derselben Regel wie in der App (`src/lib/firmenbuch.ts`);
    `tests/supabase/firmenbuchHaken.test.ts` hält beide Fassungen gleich.

  BESTEHENDE DATEN. Wo der Haken bei diesen Rechtsformen abgewählt
  gespeichert ist, wird genau dieses eine Feld zurückgesetzt (Auftrag 7.9)
  und der Zeitpunkt in `firmenbuch_korrigiert_am` festgehalten. Daran meldet
  die Startseite es der Geschäftsführung, bis sie es in den Firmendaten zur
  Kenntnis nimmt — einmal, nicht bei jedem Speichern.

  Der Dienstschlüssel (Rücklauf einer Sicherung) bleibt außen vor: er spielt
  zurück, was war.
*/

-- ---------------------------------------------------------------------------
-- 1. Die Rechtsform im Namen
-- ---------------------------------------------------------------------------

/*
  Die Rechtsform, die es nur mit Eintragung gibt — oder leer. Dieselben
  Muster wie `firmenbuchPflichtform` in `src/lib/firmenbuch.ts`; groß und
  klein zählen nicht, wie dort.
*/
create or replace function app.firmenbuch_pflichtform(p_name text) returns text
  language sql
  immutable
  security definer
  set search_path = ''
as $$
  select case
    when n ~* '(?:^|[\s,])GmbH\s*(?:&|und)\s*Co\.?\s*KG(?=$|[\s,.&])' then 'GmbH & Co KG'
    when n ~* '(?:^|[\s,])(?:GmbH|Ges\.?\s?m\.?\s?b\.?\s?H\.?)(?=$|[\s,.&])' then 'GmbH'
    when n ~* '(?:^|[\s,])FlexCo(?=$|[\s,.&])' then 'FlexCo'
    when n ~* '(?:^|[\s,])FlexKapG(?=$|[\s,.&])' then 'FlexKapG'
    when n ~* '(?:^|[\s,])AG(?=$|[\s,.&])' then 'AG'
    when n ~* '(?:^|[\s,])SE(?=$|[\s,.&])' then 'SE'
    when n ~* '(?:^|[\s,])KG(?=$|[\s,.&])' then 'KG'
    when n ~* '(?:^|[\s,])OG(?=$|[\s,.&])' then 'OG'
    when n ~* '(?:^|[\s,])(?:eGen|eingetragene\s+Genossenschaft)(?=$|[\s,.&])' then 'Genossenschaft'
  end
  from (select coalesce(p_name, '') as n) x
$$;

/* Gesperrt ist der Haken bei einer solchen Rechtsform — außer sie ist erst in Gründung. */
create or replace function app.firmenbuch_gesperrt(p_name text) returns text
  language sql
  immutable
  security definer
  set search_path = ''
as $$
  select case
    when coalesce(p_name, '') ~* '(?:^|[\s,(])(?:in\s+Gründung|i\.\s?G\.?)(?=$|[\s,.)])' then null
    else app.firmenbuch_pflichtform(p_name)
  end
$$;

revoke all on function app.firmenbuch_pflichtform(text) from public, anon, authenticated;
revoke all on function app.firmenbuch_gesperrt(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Bestehende Daten: zurücksetzen und für die Meldung festhalten
-- ---------------------------------------------------------------------------

alter table public.companies
  add column if not exists firmenbuch_korrigiert_am timestamptz;

comment on column public.companies.firmenbuch_korrigiert_am is
  'Wann „Im Firmenbuch eingetragen“ bei einer eintragungspflichtigen Rechtsform zurückgesetzt wurde (Runde 7, 6.1). Die Startseite meldet es der Geschäftsführung, bis sie es zur Kenntnis nimmt (dann leer).';

update public.companies
   set im_firmenbuch = null,
       firmenbuch_korrigiert_am = now()
 where im_firmenbuch is false
   and app.firmenbuch_gesperrt(name) is not null;

-- ---------------------------------------------------------------------------
-- 3. Die Regel an der Tabelle
-- ---------------------------------------------------------------------------

create or replace function app.firmenbuch_haken_fest() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  form text;
begin
  if app.ist_dienst() or new.im_firmenbuch is distinct from false then
    return new;
  end if;
  form := app.firmenbuch_gesperrt(new.name);
  if form is null then
    return new;
  end if;
  -- Nicht in diesem Zug abgewählt (umbenannt): der Name sagt jetzt „eingetragen“.
  if tg_op = 'UPDATE' and old.im_firmenbuch is not distinct from false then
    new.im_firmenbuch := null;
    return new;
  end if;
  raise exception 'Eine % ist immer im Firmenbuch eingetragen — der Haken „Im Firmenbuch eingetragen“ lässt sich nicht abwählen.', form
    using errcode = '23514';
end;
$$;

revoke all on function app.firmenbuch_haken_fest() from public, anon, authenticated;

drop trigger if exists companies_firmenbuch_haken on public.companies;
create trigger companies_firmenbuch_haken
  before insert or update of name, im_firmenbuch on public.companies
  for each row execute function app.firmenbuch_haken_fest();
