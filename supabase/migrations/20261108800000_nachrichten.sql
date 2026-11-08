/*
  NACHRICHTEN — BAUSTELLEN-THREADS, DIREKTNACHRICHTEN UND RUNDEN
  (M10/B09, E64, 08.11.2026)

  WAS FEHLTE. Absprachen zur Baustelle liefen über private Messenger: ohne
  Bezug zur Akte, auf privaten Telefonen, mit Kundenfotos in fremden Clouds.
  Die App kannte Push nur für Anforderungen, Abwesenheiten und Angebote.

  WAS SICH ÄNDERT — ein Nachrichtenmodell, drei Arten von Gesprächen:
  - `baustelle`: der Thread einer Baustelle. Lesen und schreiben darf, wer
    die Baustelle sieht (das Büro alle, der Monteur seine — wie die Pläne,
    `app.baustelle_einsehbar`). Es ist Geschäftskommunikation: sie geht in
    Auszug und Sicherung wie die Akte.
  - `direkt`: zwei Personen. `runde`: mehrere, selbst gebildet. Beide sind
    PRIVAT (D1–D6 der Spezifikation): lesen und schreiben nur die
    Teilnehmer. Weder Geschäftsführung noch Administration noch Support noch
    Plattform sehen Inhalte — auch nicht über Datenauskunft, Auszug,
    Sicherung, Push-Vorschau oder Live-Abo.

  WIE DIE VERTRAULICHKEIT GEBAUT IST — auf die einfachste Art, die sich
  nicht aufweichen lässt: Kanäle, Nachrichten, Anhänge und Meldungen liest
  KEIN Konto direkt. Es gibt keine Leseregel. Gelesen wird ausschließlich
  über die Funktionen unten, und jede prüft die Teilnahme selbst. Die
  einzige lesbare Tabelle ist die eigene Teilnahme (`nachrichten_teilnehmer`,
  nur die eigene Zeile) — sie trägt das Live-Ereignis „es gibt Neues“, ohne
  Inhalt.

  MODULE (E52, V3): `nachrichten` (Standard an, B09 „Ändern“ = empfohlener
  Umfang) mit der Unterfähigkeit `nachrichten.direktnachrichten`, ab Werk
  AUS (D1). Jeder Schreibweg prüft beides auf dem Server. Aus heißt: nichts
  Neues; was da ist, bleibt für die Teilnehmer lesbar und exportierbar,
  Löschen und Melden gehen immer.

  WAS BEWUSST NICHT GEBAUT IST — und warum:
  - Lesebestätigung, Online-Status, „schreibt gerade“ (D4): keine neuen
    Überwachungsfunktionen (ArbVG §§ 96, 96a).
  - Ende-zu-Ende-Verschlüsselung: vertraulich gegenüber Betrieb, Kollegen,
    Support und Plattform; technisch liegen die Texte beim Betreiber der
    Datenbank. Schlüssel über mehrere Geräte, Vormerkung ohne Netz,
    Push-Vorschau, Meldeweg und Löschfristen schlössen sie aus
    (Grenze mit Grund: Sicherheit/Technik). Die App behauptet sie nirgends.
  - Private Gespräche im Auszug und in der Sicherung des Betriebs: die
    Führung lädt beides herunter. Folge: ein Rücklauf aus der Sicherung
    bringt keine privaten Nachrichten zurück (Grenze mit Grund:
    Datenschutz). Die Sicherung der Datenbank durch den Betreiber bleibt
    davon unberührt.

  Bestehende Migrationen bleiben unberührt; was sich an vorhandenen
  Funktionen ändert, steht hier als neue Fassung mit dem alten Rumpf und der
  Ergänzung (jeweils gesagt, welche).
*/

-- ---------------------------------------------------------------------------
-- 1. Das Register auf dem Server (E51 V3, E56, E59, E62)
-- ---------------------------------------------------------------------------

/*
  DIESELBE LISTE WIE `MODULE` UND `KERN` in `src/lib/module.ts` — Rumpf wie
  in `20261108600000_zeitkorrekturen.sql`, dazu das Modul `nachrichten` und
  seine Unterfähigkeit `nachrichten.direktnachrichten` (ab Werk aus, D1).
  `tests/supabase/modulRegisterServer.test.ts` vergleicht beide Listen.
*/
create or replace function app.modul_register()
  returns table (kennung text, standard boolean, abhaengig_von text[])
  language sql
  immutable
  security definer
  set search_path = ''
as $$
  values
    ('baustellen', true, '{}'::text[]),
    ('baustellen.auftragseingang', true, '{}'::text[]),
    ('kunden', true, '{}'::text[]),
    ('kunden.liegenschaften', false, '{}'::text[]),
    ('zeiterfassung', true, '{}'::text[]),
    ('zeiterfassung.freie_zeitfelder', true, '{}'::text[]),
    ('zeiterfassung.timer', false, '{}'::text[]),
    ('zeiterfassung.timer_erinnerung', true, '{zeiterfassung.timer}'::text[]),
    ('zeiterfassung.korrekturantraege', false, '{}'::text[]),
    ('einsatzplanung', true, '{}'::text[]),
    ('material', true, '{}'::text[]),
    ('material.katalogversionen', true, '{}'::text[]),
    ('material.lieferantenvergleich', true, '{}'::text[]),
    ('material.katalogpreisverlauf', true, '{}'::text[]),
    ('material.lagerorte_fahrzeuglager', true, '{}'::text[]),
    ('material.materialbereitschaft', true, '{}'::text[]),
    ('material.bestellvorschlaege', true, '{}'::text[]),
    ('urlaub', true, '{}'::text[]),
    ('scheine', true, '{}'::text[]),
    ('angebote', true, '{}'::text[]),
    ('angebote.online_annahme', true, '{}'::text[]),
    ('rechnungen', true, '{}'::text[]),
    ('nachkalkulation', true, '{rechnungen}'::text[]),
    ('wartung', true, '{}'::text[]),
    ('zeitkonten', true, '{}'::text[]),
    ('nachrichten', true, '{}'::text[]),
    ('nachrichten.direktnachrichten', false, '{}'::text[])
$$;

revoke all on function app.modul_register() from public, anon, authenticated;

/*
  EINE STELLE FÜR DEN SATZ. Ein privates Gespräch braucht zusätzlich die
  Unterfähigkeit; ein Baustellen-Thread nur das Modul.
*/
create or replace function app.nachrichten_modul_pflicht(p_betrieb text, p_privat boolean) returns void
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
begin
  if not app.modul_aktiv(p_betrieb, 'nachrichten') then
    raise exception 'Nachrichten sind in diesem Betrieb ausgeschaltet (Einstellungen → Module)'
      using errcode = '55000';
  end if;
  if p_privat and not app.modul_aktiv(p_betrieb, 'nachrichten.direktnachrichten') then
    raise exception 'Direktnachrichten sind in diesem Betrieb ausgeschaltet (Einstellungen → Module)'
      using errcode = '55000';
  end if;
end;
$$;

revoke all on function app.nachrichten_modul_pflicht(text, boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Die Tabellen
-- ---------------------------------------------------------------------------

/*
  DER KANAL — ein Gespräch. Eine Baustelle hat höchstens einen Thread, ein
  Paar höchstens ein Direktgespräch (`paar`: die beiden Kennungen sortiert).
  Eine Runde hat einen Namen, wenn jemand ihr einen gibt.

  `privat` RECHNET DIE DATENBANK aus der Art. An dieser Spalte (und ihrer
  Kopie in den Tabellen darunter) lassen Auszug und Sicherung die Zeilen
  aus — eine Regel, die mit jeder künftigen Tabelle mitgeht, die sie trägt.

  An der Baustelle MIT `on delete cascade`: der Thread gehört zur Akte. Die
  Dateien seiner Anhänge räumt der Nachtlauf als verwaiste ab.
*/
create table if not exists public.nachrichten_kanaele (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.companies(id),
  art text not null check (art in ('baustelle', 'direkt', 'runde')),
  project_id uuid references public.projects(id) on delete cascade,
  paar text,
  name text check (name is null or length(btrim(name)) between 1 and 80),
  angelegt_von uuid references public.users(id) on delete set null,
  angelegt_am timestamptz not null default now(),
  letzte_nachricht_am timestamptz,
  privat boolean generated always as (art <> 'baustelle') stored,
  constraint nachrichten_kanaele_bezug check (
    ((art = 'baustelle') = (project_id is not null))
    and ((art = 'direkt') = (paar is not null))
    and (art = 'runde' or name is null))
);

comment on table public.nachrichten_kanaele is
  'Gespräche (M10/B09): Baustellen-Thread, Direktgespräch, Runde. Kein Konto liest direkt — nur über die Funktionen nachrichten_*.';

create unique index if not exists nachrichten_kanaele_baustelle
  on public.nachrichten_kanaele (company_id, project_id) where art = 'baustelle';
create unique index if not exists nachrichten_kanaele_paar
  on public.nachrichten_kanaele (company_id, paar) where art = 'direkt';
create index if not exists nachrichten_kanaele_zuletzt
  on public.nachrichten_kanaele (company_id, letzte_nachricht_am desc nulls last, id);

/*
  DIE TEILNAHME — je Person und Kanal eine Zeile, mit dem, was nur diese
  Person angeht: die eigene Zahl ungelesener Nachrichten, bis wann sie
  gelesen hat, stumm. Andere sehen davon nichts (D4: keine
  Lesebestätigung).

  BEI DER BAUSTELLE heißt Teilnahme „folgen“: wer schreibt, erwähnt wird
  oder im Team steht, folgt und bekommt Zahl und Push. Lesen darf der
  Thread jeder, der die Baustelle sieht, auch ohne zu folgen.

  `sichtbar_ab`: wer einer Runde später beitritt, liest ab dem Beitritt —
  was vorher gesagt wurde, war nicht an ihn gerichtet.
*/
create table if not exists public.nachrichten_teilnehmer (
  kanal_id uuid not null references public.nachrichten_kanaele(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  company_id text not null references public.companies(id),
  beigetreten_am timestamptz not null default now(),
  sichtbar_ab timestamptz not null default '-infinity',
  verlassen_am timestamptz,
  gelesen_bis timestamptz,
  ungelesen integer not null default 0 check (ungelesen >= 0),
  stumm boolean not null default false,
  zuletzt timestamptz,
  privat boolean not null default false,
  primary key (kanal_id, user_id)
);

comment on table public.nachrichten_teilnehmer is
  'Teilnahme an einem Gespräch (M10/B09) — lesbar nur die eigene Zeile; trägt das Live-Ereignis ohne Inhalt.';

create index if not exists nachrichten_teilnehmer_person
  on public.nachrichten_teilnehmer (user_id, verlassen_am);
create index if not exists nachrichten_teilnehmer_betrieb
  on public.nachrichten_teilnehmer (company_id, user_id);

/*
  DIE NACHRICHT. Die Kennung kommt vom Gerät: so darf dieselbe Nachricht
  aus dem Ausgangsfach zweimal ankommen, ohne zweimal zu landen
  (`sende_hash` vergleicht, was beim ersten Mal gesendet wurde).

  LÖSCHEN LÖSCHT: `text` wird null, die Anhänge gehen (Zeile sofort, Datei
  über `app.nachrichten_dateien_weg`). Es bleibt „Nachricht gelöscht“ mit
  Zeitpunkt, damit ein Gespräch lesbar bleibt. Bearbeiten überschreibt;
  alte Fassungen werden nicht aufbewahrt (privat, kein Beleg).

  20 000 ZEICHEN: eine Nachricht ist kein Dokument — längere Texte gehören
  als Datei angehängt. Die Grenze schützt Verlauf, Push und Auszug vor einem
  versehentlich eingefügten Megabyte (Grenze mit Grund: Technik).
*/
create table if not exists public.nachrichten (
  id uuid primary key,
  kanal_id uuid not null references public.nachrichten_kanaele(id) on delete cascade,
  company_id text not null references public.companies(id),
  von_uid uuid references public.users(id) on delete set null,
  von_name text not null,
  text text check (text is null or length(text) <= 20000),
  erwaehnt uuid[] not null default '{}',
  gesendet_am timestamptz not null default now(),
  geraet_zeit timestamptz,
  bearbeitet_am timestamptz,
  geloescht_am timestamptz,
  uebernommen_nach uuid references public.nachrichten(id) on delete set null,
  sende_hash text not null,
  push_am timestamptz,
  privat boolean not null default false
);

comment on table public.nachrichten is
  'Nachrichten (M10/B09). Kein Konto liest direkt; gelöscht heißt Text null, Anhänge weg.';

create index if not exists nachrichten_verlauf on public.nachrichten (kanal_id, gesendet_am desc, id desc);
create index if not exists nachrichten_von on public.nachrichten (company_id, von_uid);

/*
  DER ANHANG — die Datei liegt im Speicher, nach Art getrennt:
  `nachrichten` (Baustellen-Threads, geht in die Sicherung außer Haus wie
  die Pläne) und `nachrichten-privat` (nie). Pfad
  `nachrichten/<betrieb>/<kanal>/<nachricht>/<anhang>`.
*/
create table if not exists public.nachricht_anhaenge (
  id uuid primary key,
  nachricht_id uuid not null references public.nachrichten(id) on delete cascade,
  kanal_id uuid not null references public.nachrichten_kanaele(id) on delete cascade,
  company_id text not null references public.companies(id),
  eimer text not null check (eimer in ('nachrichten', 'nachrichten-privat')),
  pfad text not null,
  name text not null check (length(btrim(name)) between 1 and 200),
  bytes bigint not null check (bytes > 0),
  inhaltsart text not null,
  reihenfolge integer not null default 0,
  privat boolean not null default false,
  unique (eimer, pfad)
);

comment on table public.nachricht_anhaenge is 'Anhänge einer Nachricht (M10/B09); die Datei liegt im Speicher.';

create index if not exists nachricht_anhaenge_nachricht on public.nachricht_anhaenge (nachricht_id, reihenfolge);

/*
  DIE MELDUNG (D5) — eine Person gibt GENAU EINE Nachricht an die
  Geschäftsführung weiter, die sie bekommen hat. Gespeichert wird eine
  Kopie: Text, Absender, Zeitpunkt, die Anhänge (Ablageort und Name; die
  Dateien bleiben erhalten, solange die Meldung besteht). Den Kanal sieht
  die Geschäftsführung nicht.

  KEIN FREMDSCHLÜSSEL auf die Nachricht: der Absender darf seine Nachricht
  löschen, die Meldung bleibt. Und eine Meldung aus einem privaten Gespräch
  käme im Rücklauf sonst nicht zurück, weil ihre Nachricht fehlt.
*/
create table if not exists public.nachricht_meldungen (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.companies(id),
  nachricht_id uuid not null,
  kanal_art text not null check (kanal_art in ('baustelle', 'direkt', 'runde')),
  gemeldet_von uuid references public.users(id) on delete set null,
  gemeldet_von_name text not null,
  gemeldet_am timestamptz not null default now(),
  grund text check (grund is null or length(grund) <= 2000),
  von_uid uuid references public.users(id) on delete set null,
  von_name text not null,
  gesendet_am timestamptz not null,
  text_kopie text,
  anhaenge jsonb not null default '[]'::jsonb,
  status text not null default 'offen' check (status in ('offen', 'erledigt')),
  erledigt_von uuid references public.users(id) on delete set null,
  erledigt_von_name text,
  erledigt_am timestamptz,
  vermerk text check (vermerk is null or length(vermerk) <= 2000),
  unique (nachricht_id, gemeldet_von)
);

comment on table public.nachricht_meldungen is
  'An die Geschäftsführung gemeldete Nachrichten (D5) — eine Kopie, kein Zugang zum Gespräch.';

create index if not exists nachricht_meldungen_liste on public.nachricht_meldungen (company_id, status, gemeldet_am desc);

/*
  DATEIEN, DIE WEG MÜSSEN. Die Datenbank kann eine Datei im Speicher nicht
  selbst entfernen (nur über die Speicher-Schnittstelle — sonst bliebe sie
  dort liegen, ohne Zeile, die auf sie zeigt). Gelöschte Anhänge kommen
  hierher; die Edge Function `nachrichten-aufraeumen` entfernt sie, gleich
  nach dem Löschen angestoßen und jede Nacht noch einmal. Lesen kann sie
  ab dem Löschen niemand mehr: die Speicherregel verlangt die Zeile.
*/
create table if not exists app.nachrichten_dateien_weg (
  eimer text not null,
  pfad text not null,
  seit timestamptz not null default now(),
  primary key (eimer, pfad)
);
revoke all on app.nachrichten_dateien_weg from public, anon, authenticated;

/*
  AUFBEWAHRUNG (D3): ab Werk keine automatische Löschung. Je Betrieb
  wählbar 6, 12 oder 24 Monate nach der letzten Nachricht eines PRIVATEN
  Gesprächs. Baustellen-Threads bleiben mit der Akte.
*/
alter table public.companies
  add column if not exists nachrichten_aufbewahrung_monate integer
    check (nachrichten_aufbewahrung_monate is null or nachrichten_aufbewahrung_monate in (6, 12, 24));

comment on column public.companies.nachrichten_aufbewahrung_monate is
  'Private Gespräche nach so vielen Monaten ohne Nachricht löschen (6, 12, 24; leer = nie). M10/B09, D3.';

/*
  PUSH JE PERSON: Nachrichten ja oder nein (Vorgabe an, wie jede Art), und
  ob der Text im Sperrbildschirm steht (Vorgabe AUS — der Sperrbildschirm
  ist öffentlich, und jemand anderes hat geschrieben).
*/
alter table public.user_prefs
  add column if not exists notify_nachrichten boolean not null default true;
alter table public.user_prefs
  add column if not exists nachricht_vorschau boolean not null default false;

comment on column public.user_prefs.notify_nachrichten is 'Push bei neuen Nachrichten (M10/B09).';
comment on column public.user_prefs.nachricht_vorschau is
  'Push mit den ersten 80 Zeichen der Nachricht statt nur „Neue Nachricht“ (M10/B09, Vorgabe aus).';

-- ---------------------------------------------------------------------------
-- 3. Zeilenschutz: niemand liest direkt — außer der eigenen Teilnahme
-- ---------------------------------------------------------------------------

/*
  KEINE LESEREGEL, KEINE SCHREIBREGEL auf Kanälen, Nachrichten, Anhängen
  und Meldungen: mit eingeschaltetem Zeilenschutz und ohne Regel sieht und
  ändert ein Konto dort nichts. Geschrieben und gelesen wird über die
  Funktionen mit den Rechten ihres Eigentümers — jede prüft den Aufrufer.

  Die Riegel trotzdem auf jeder Tabelle: `support_niemals`, weil ein
  Supportzugang hier nicht einmal blind schreiben darf, und
  `betrieb_unveraenderlich` (die Funktionen schreiben den Betrieb nie um).
*/
do $migration$
declare t text;
begin
  foreach t in array array['nachrichten_kanaele', 'nachrichten_teilnehmer', 'nachrichten',
                           'nachricht_anhaenge', 'nachricht_meldungen'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);

    execute format('drop trigger if exists %I on public.%I', t || '_kein_support', t);
    execute format('create trigger %I before insert or update or delete on public.%I
                      for each row execute function app.support_niemals()', t || '_kein_support', t);
    execute format('drop trigger if exists %I on public.%I', t || '_betrieb_fest', t);
    execute format('create trigger %I before update on public.%I
                      for each row execute function app.betrieb_unveraenderlich()', t || '_betrieb_fest', t);
  end loop;
end;
$migration$;

/*
  DIE EIGENE TEILNAHME — die einzige Zeile, die ein Konto direkt liest. Sie
  sagt „in diesem Gespräch gibt es N Neue“ und nichts über den Inhalt. Für
  das Live-Abo gilt die Regel je Empfänger: niemand bekommt das Ereignis
  eines anderen.
*/
grant select on public.nachrichten_teilnehmer to authenticated;
drop policy if exists nachrichten_teilnehmer_lesen on public.nachrichten_teilnehmer;
create policy nachrichten_teilnehmer_lesen on public.nachrichten_teilnehmer for select using (
  (company_id = (select app.lesebetrieb()))
  and (user_id = (select auth.uid()))
  and not (select app.ist_plattform()));

/*
  BETRIEB UND ART KOMMEN VOM KANAL. Teilnahme, Nachricht und Anhang tragen
  dieselbe Kennung des Betriebs wie ihr Kanal und seine Art als `privat` —
  die Datenbank setzt es selbst, ein abweichender Betrieb wird abgewiesen.
*/
create or replace function app.nachrichten_vom_kanal() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare k public.nachrichten_kanaele;
begin
  select * into k from public.nachrichten_kanaele where id = new.kanal_id;
  if k.id is null then
    raise exception 'Dieses Gespräch gibt es nicht' using errcode = '23503';
  end if;
  if new.company_id is distinct from k.company_id then
    raise exception 'Gespräch und Eintrag gehören zu verschiedenen Betrieben' using errcode = '23514';
  end if;
  new.privat := k.privat;
  return new;
end;
$$;

revoke all on function app.nachrichten_vom_kanal() from public, anon, authenticated;

drop trigger if exists nachrichten_teilnehmer_kanal on public.nachrichten_teilnehmer;
create trigger nachrichten_teilnehmer_kanal before insert or update of kanal_id, company_id on public.nachrichten_teilnehmer
  for each row execute function app.nachrichten_vom_kanal();
drop trigger if exists nachrichten_kanal on public.nachrichten;
create trigger nachrichten_kanal before insert or update of kanal_id, company_id on public.nachrichten
  for each row execute function app.nachrichten_vom_kanal();
drop trigger if exists nachricht_anhaenge_kanal on public.nachricht_anhaenge;
create trigger nachricht_anhaenge_kanal before insert or update of kanal_id, company_id on public.nachricht_anhaenge
  for each row execute function app.nachrichten_vom_kanal();

/*
  DIE TEILNEHMER EINES PRIVATEN GESPRÄCHS gehören zum Betrieb und sind
  Personen, keine Plattformkonten — der Trigger hält das fest, auch für
  künftige Funktionen.
*/
create or replace function app.nachrichten_teilnehmer_pruefen() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if not exists (select 1 from public.users u where u.id = new.user_id and u.company_id = new.company_id) then
    raise exception 'Diese Person gehört nicht zu diesem Betrieb' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function app.nachrichten_teilnehmer_pruefen() from public, anon, authenticated;

drop trigger if exists nachrichten_teilnehmer_person on public.nachrichten_teilnehmer;
create trigger nachrichten_teilnehmer_person before insert or update of user_id, company_id on public.nachrichten_teilnehmer
  for each row execute function app.nachrichten_teilnehmer_pruefen();

-- Live: das Ereignis „es gibt Neues“ — nur die eigene Zeile, nur die Zahl.
alter table public.nachrichten_teilnehmer replica identity full;
do $pub$
begin
  if not exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'nachrichten_teilnehmer') then
    alter publication supabase_realtime add table public.nachrichten_teilnehmer;
  end if;
end;
$pub$;

-- ---------------------------------------------------------------------------
-- 4. Wer ein Gespräch lesen darf
-- ---------------------------------------------------------------------------

/*
  SIEHT DIESE PERSON DIE BAUSTELLE? Wie `app.baustelle_einsehbar`, aber für
  eine genannte Person statt für den Aufrufer — der Push und die
  Teilnehmerliste fragen für andere. Gelesen wird die Rolle aus der
  Belegschaft, nicht aus einem Token.
*/
create or replace function app.nachrichten_baustelle_lesbar(p_projekt uuid, p_user uuid) returns boolean
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select exists (
    select 1
      from public.projects p
      join public.users u on u.id = p_user and u.company_id = p.company_id and u.active
     where p.id = p_projekt
       and (u.role is distinct from 'Mitarbeiter'
            or p_user = any (p.assigned_employees)
            or p_user = any (p.project_managers)
            or exists (select 1 from public.assignments a
                        where a.project_id = p_projekt and a.user_id = p_user)))
$$;

revoke all on function app.nachrichten_baustelle_lesbar(uuid, uuid) from public, anon, authenticated;

/*
  DARF DER AUFRUFER DIESES GESPRÄCH LESEN — die eine Prüfung, an der jede
  Lesefunktion und die Speicherregel hängen. Privat: nur als Teilnehmer, der
  nicht gegangen ist. Baustelle: wer sie sieht. Nie die Plattform, nie ein
  gesperrtes Konto, nie ein anderer Betrieb. Eine Ausnahme für die Führung
  gibt es nicht.
*/
create or replace function app.nachrichten_kanal_lesbar(p_kanal uuid) returns boolean
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select coalesce((
    select case when k.privat
                then exists (select 1 from public.nachrichten_teilnehmer t
                              where t.kanal_id = k.id and t.user_id = auth.uid() and t.verlassen_am is null)
                else app.nachrichten_baustelle_lesbar(k.project_id, auth.uid()) end
      from public.nachrichten_kanaele k
     where k.id = p_kanal
       and k.company_id = app.betrieb()
       and app.angemeldet()
       and not app.ist_plattform()), false)
$$;

revoke all on function app.nachrichten_kanal_lesbar(uuid) from public, anon, authenticated;

/* Ab wann der Aufrufer in einem Kanal liest — bei der Baustelle alles, in der Runde ab dem Beitritt. */
create or replace function app.nachrichten_sichtbar_ab(p_kanal uuid) returns timestamptz
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select coalesce((select t.sichtbar_ab from public.nachrichten_teilnehmer t
                     join public.nachrichten_kanaele k on k.id = t.kanal_id and k.privat
                    where t.kanal_id = p_kanal and t.user_id = auth.uid()), '-infinity'::timestamptz)
$$;

revoke all on function app.nachrichten_sichtbar_ab(uuid) from public, anon, authenticated;

/*
  DARF DER AUFRUFER NACHRICHTEN NUTZEN — angemeldet, aktiv, im Betrieb,
  keine Plattform. Gibt die Person zurück; jede Funktion unten beginnt damit.
*/
create or replace function app.darf_nachrichten() returns public.users
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare u public.users;
begin
  if not app.angemeldet() or app.ist_plattform() or app.betrieb() is null then
    raise exception 'Nachrichten gibt es nur für Konten eines Betriebs' using errcode = '42501';
  end if;
  select * into u from public.users where id = auth.uid() and company_id = app.betrieb() and active;
  if u.id is null then
    raise exception 'Nachrichten gibt es nur für aktive Konten eines Betriebs' using errcode = '42501';
  end if;
  return u;
end;
$$;

revoke all on function app.darf_nachrichten() from public, anon, authenticated;

/*
  DARF DER AUFRUFER HIER SCHREIBEN — und wenn nicht, warum (für die
  Oberfläche als Satz, für die Funktionen als Abweisung). `null` heißt: ja.
*/
create or replace function app.nachrichten_schreibsperre(p_kanal uuid) returns text
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare
  k public.nachrichten_kanaele;
  partner public.users;
begin
  select * into k from public.nachrichten_kanaele where id = p_kanal;
  if k.id is null or not app.nachrichten_kanal_lesbar(p_kanal) then
    return 'Dieses Gespräch gibt es nicht oder es ist nicht deines.';
  end if;
  if not app.modul_aktiv(k.company_id, 'nachrichten') then
    return 'Nachrichten sind in diesem Betrieb ausgeschaltet. Bisherige Gespräche bleiben lesbar.';
  end if;
  if k.privat and not app.modul_aktiv(k.company_id, 'nachrichten.direktnachrichten') then
    return 'Direktnachrichten sind in diesem Betrieb ausgeschaltet. Bisherige Gespräche bleiben lesbar.';
  end if;
  if k.art = 'direkt' then
    select u.* into partner from public.nachrichten_teilnehmer t join public.users u on u.id = t.user_id
     where t.kanal_id = k.id and t.user_id <> auth.uid();
    if partner.id is null or not partner.active then
      return format('Das Konto von %s ist deaktiviert — das Gespräch ist geschlossen.', coalesce(partner.name, 'der anderen Person'));
    end if;
  end if;
  return null;
end;
$$;

revoke all on function app.nachrichten_schreibsperre(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Der Speicher
-- ---------------------------------------------------------------------------

/*
  ZWEI EIMER, weil die Sicherung außer Haus je Eimer entscheidet
  (`app.datei_eimer`): Anhänge der Baustellen-Threads gehen mit wie die
  Pläne, private nie. Grenzen wie bei den Baustellendokumenten.
*/
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('nachrichten', 'nachrichten', false, 26214400,
   array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic',
         'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
         'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']),
  ('nachrichten-privat', 'nachrichten-privat', false, 26214400,
   array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic',
         'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
         'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict (id) do update
   set public = excluded.public,
       file_size_limit = excluded.file_size_limit,
       allowed_mime_types = excluded.allowed_mime_types;

/*
  LESEN: wer das Gespräch lesen darf, solange der Anhang besteht — oder,
  bei einer gemeldeten Nachricht, die Geschäftsführung die Datei aus der
  Meldung. Ohne Zeile liest niemand: ein gelöschter Anhang ist ab sofort
  unerreichbar, auch bevor die Datei weg ist.
*/
create or replace function app.nachrichten_datei_lesbar(p_eimer text, p_pfad text) returns boolean
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select app.angemeldet() and not app.ist_plattform() and (
    exists (select 1 from public.nachricht_anhaenge a
             where a.eimer = p_eimer and a.pfad = p_pfad
               and a.company_id = app.betrieb()
               and app.nachrichten_kanal_lesbar(a.kanal_id))
    or (app.hat_rolle(array['Geschäftsführung', 'Administrator'])
        and exists (select 1 from public.nachricht_meldungen m
                     where m.company_id = app.betrieb()
                       and m.anhaenge @> jsonb_build_array(jsonb_build_object('eimer', p_eimer, 'pfad', p_pfad)))))
$$;

revoke all on function app.nachrichten_datei_lesbar(text, text) from public, anon, authenticated;
grant execute on function app.nachrichten_datei_lesbar(text, text) to authenticated;

/*
  HOCHLADEN vor dem Senden — in den richtigen Eimer, unter einen Kanal, in
  dem der Aufrufer schreiben darf, nie über einen schon gesendeten Anhang.
  Der Pfad ist `nachrichten/<betrieb>/<kanal>/<nachricht>/<anhang>`.
*/
create or replace function app.nachrichten_datei_schreibbar(p_eimer text, p_pfad text) returns boolean
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare
  teile text[] := storage.foldername(p_pfad);
  k public.nachrichten_kanaele;
begin
  if array_length(teile, 1) is distinct from 4 or teile[1] <> 'nachrichten' or teile[2] is distinct from app.betrieb() then
    return false;
  end if;
  begin
    select * into k from public.nachrichten_kanaele where id = teile[3]::uuid;
    perform teile[4]::uuid;
    perform (storage.filename(p_pfad))::uuid;
  exception when invalid_text_representation then
    return false;
  end;
  if k.id is null or (k.privat and p_eimer <> 'nachrichten-privat') or (not k.privat and p_eimer <> 'nachrichten') then
    return false;
  end if;
  if exists (select 1 from public.nachricht_anhaenge a where a.eimer = p_eimer and a.pfad = p_pfad) then
    return false;
  end if;
  return app.nachrichten_schreibsperre(k.id) is null;
end;
$$;

revoke all on function app.nachrichten_datei_schreibbar(text, text) from public, anon, authenticated;
grant execute on function app.nachrichten_datei_schreibbar(text, text) to authenticated;

/*
  Dazu die eigene, noch nicht gesendete Datei: das zweite Hochladen aus dem
  Ausgangsfach (`upsert`) liest die Zeile, die es überschreibt.
*/
drop policy if exists nachrichten_dateien_lesen on storage.objects;
create policy nachrichten_dateien_lesen on storage.objects for select to authenticated
  using (bucket_id in ('nachrichten', 'nachrichten-privat')
         and (app.nachrichten_datei_lesbar(bucket_id, name)
              or (owner_id = (select auth.uid())::text and app.nachrichten_datei_schreibbar(bucket_id, name))));

drop policy if exists nachrichten_dateien_anlegen on storage.objects;
create policy nachrichten_dateien_anlegen on storage.objects for insert to authenticated
  with check (bucket_id in ('nachrichten', 'nachrichten-privat')
              and app.nachrichten_datei_schreibbar(bucket_id, name));

-- Ein zweites Hochladen aus dem Ausgangsfach schreibt dieselbe Datei an dieselbe Stelle — nur die eigene, nur vor dem Senden.
drop policy if exists nachrichten_dateien_ersetzen on storage.objects;
create policy nachrichten_dateien_ersetzen on storage.objects for update to authenticated
  using (bucket_id in ('nachrichten', 'nachrichten-privat')
         and owner_id = (select auth.uid())::text
         and app.nachrichten_datei_schreibbar(bucket_id, name))
  with check (bucket_id in ('nachrichten', 'nachrichten-privat')
              and app.nachrichten_datei_schreibbar(bucket_id, name));

/*
  Kein Löschen über Konten: entfernt wird über die Edge Function, wenn die
  Zeile weg ist — so bleibt nie eine Zeile ohne Datei zurück.

  DIE SICHERUNG (`app.datei_eimer`, Rumpf wie in
  `20261004200000_freistellungen.sql`, dazu die beiden Eimer) und der
  Betrieb einer Datei (`app.datei_betrieb`, ebenso).
*/
create or replace function app.datei_eimer()
  returns table (eimer text, gesichert boolean)
  language sql immutable
  set search_path = ''
as $$
  select * from (values
    ('scheinfotos'::text,            true),
    ('baustellendokumente'::text,    true),
    ('ausleitung'::text,             false),
    ('freistellungsnachweise'::text, false),
    ('nachrichten'::text,            true),
    ('nachrichten-privat'::text,     false)
  ) as t(eimer, gesichert)
$$;

create or replace function app.datei_betrieb(p_eimer text, p_name text)
  returns text
  language sql stable
  set search_path = ''
as $$
  select case p_eimer
    when 'scheinfotos'            then app.foto_betrieb(p_name)
    when 'baustellendokumente'    then app.dokument_betrieb(p_name)
    when 'ausleitung'             then case
      when (storage.foldername(p_name))[1] = 'ausleitung'
        then (storage.foldername(p_name))[2]
    end
    when 'freistellungsnachweise' then (storage.foldername(p_name))[1]
    when 'nachrichten'            then case
      when (storage.foldername(p_name))[1] = 'nachrichten'
        then (storage.foldername(p_name))[2]
    end
    when 'nachrichten-privat'     then case
      when (storage.foldername(p_name))[1] = 'nachrichten'
        then (storage.foldername(p_name))[2]
    end
  end
$$;

-- ---------------------------------------------------------------------------
-- 6. Gespräche anlegen
-- ---------------------------------------------------------------------------

/*
  DAS DIREKTGESPRÄCH MIT EINER PERSON — das vorhandene, sonst ein neues.
  Von beiden Seiten geöffnet ist es dasselbe (D6: jedes aktive Konto des
  Betriebs mit jedem).
*/
create or replace function public.nachrichten_kanal_direkt(p_mit uuid) returns uuid
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  ich public.users := app.darf_nachrichten();
  partner public.users;
  schluessel text;
  kennung uuid;
begin
  perform app.nachrichten_modul_pflicht(ich.company_id, true);
  select * into partner from public.users where id = p_mit and company_id = ich.company_id;
  if partner.id is null then
    raise exception 'Diese Person gibt es in diesem Betrieb nicht' using errcode = 'P0002';
  end if;
  if partner.id = ich.id then
    raise exception 'Ein Gespräch braucht eine zweite Person' using errcode = '22023';
  end if;
  if not partner.active then
    raise exception 'Das Konto von % ist deaktiviert', partner.name using errcode = '55000';
  end if;
  schluessel := least(ich.id::text, partner.id::text) || ':' || greatest(ich.id::text, partner.id::text);

  insert into public.nachrichten_kanaele (company_id, art, paar, angelegt_von)
  values (ich.company_id, 'direkt', schluessel, ich.id)
  on conflict (company_id, paar) where art = 'direkt' do nothing
  returning id into kennung;
  if kennung is null then
    select id into kennung from public.nachrichten_kanaele
     where company_id = ich.company_id and art = 'direkt' and paar = schluessel;
  end if;

  insert into public.nachrichten_teilnehmer (kanal_id, user_id, company_id)
  values (kennung, ich.id, ich.company_id), (kennung, partner.id, ich.company_id)
  on conflict (kanal_id, user_id) do nothing;
  return kennung;
end;
$$;

revoke all on function public.nachrichten_kanal_direkt(uuid) from public, anon;
grant execute on function public.nachrichten_kanal_direkt(uuid) to authenticated;

/* Personen eines Betriebs prüfen: aktiv, dabei, keine doppelt. Gibt die Kennungen ohne den Aufrufer zurück. */
create or replace function app.nachrichten_personen_pruefen(p_betrieb text, p_ich uuid, p_personen uuid[]) returns uuid[]
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare
  gewuenscht uuid[] := array(select distinct x from unnest(coalesce(p_personen, '{}'::uuid[])) x where x <> p_ich);
  gefunden uuid[];
begin
  select coalesce(array_agg(u.id), '{}'::uuid[]) into gefunden
    from public.users u where u.id = any(gewuenscht) and u.company_id = p_betrieb and u.active;
  if cardinality(gefunden) <> cardinality(gewuenscht) then
    raise exception 'Nicht jede genannte Person ist ein aktives Konto dieses Betriebs' using errcode = '22023';
  end if;
  return gefunden;
end;
$$;

revoke all on function app.nachrichten_personen_pruefen(text, uuid, uuid[]) from public, anon, authenticated;

/* EINE RUNDE — mit mindestens einer weiteren Person; der Name ist freiwillig. */
create or replace function public.nachrichten_kanal_runde(p_name text, p_teilnehmer uuid[]) returns uuid
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  ich public.users := app.darf_nachrichten();
  andere uuid[];
  kennung uuid;
begin
  perform app.nachrichten_modul_pflicht(ich.company_id, true);
  andere := app.nachrichten_personen_pruefen(ich.company_id, ich.id, p_teilnehmer);
  if cardinality(andere) = 0 then
    raise exception 'Eine Runde braucht mindestens eine weitere Person' using errcode = '22023';
  end if;
  insert into public.nachrichten_kanaele (company_id, art, name, angelegt_von)
  values (ich.company_id, 'runde', nullif(btrim(coalesce(p_name, '')), ''), ich.id)
  returning id into kennung;
  insert into public.nachrichten_teilnehmer (kanal_id, user_id, company_id)
  select kennung, x, ich.company_id from unnest(array[ich.id] || andere) x;
  return kennung;
end;
$$;

revoke all on function public.nachrichten_kanal_runde(text, uuid[]) from public, anon;
grant execute on function public.nachrichten_kanal_runde(text, uuid[]) to authenticated;

/* DER THREAD EINER BAUSTELLE — für jeden, der sie sieht; angelegt beim ersten Öffnen. */
create or replace function public.nachrichten_kanal_baustelle(p_projekt uuid) returns uuid
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  ich public.users := app.darf_nachrichten();
  kennung uuid;
begin
  if not app.nachrichten_baustelle_lesbar(p_projekt, ich.id)
     or not exists (select 1 from public.projects p where p.id = p_projekt and p.company_id = ich.company_id) then
    raise exception 'Diese Baustelle gibt es nicht oder sie ist nicht deine' using errcode = '42501';
  end if;
  select id into kennung from public.nachrichten_kanaele
   where company_id = ich.company_id and art = 'baustelle' and project_id = p_projekt;
  if kennung is not null then
    return kennung;
  end if;
  perform app.nachrichten_modul_pflicht(ich.company_id, false);
  insert into public.nachrichten_kanaele (company_id, art, project_id, angelegt_von)
  values (ich.company_id, 'baustelle', p_projekt, ich.id)
  on conflict (company_id, project_id) where art = 'baustelle' do nothing
  returning id into kennung;
  if kennung is null then
    select id into kennung from public.nachrichten_kanaele
     where company_id = ich.company_id and art = 'baustelle' and project_id = p_projekt;
  end if;
  return kennung;
end;
$$;

revoke all on function public.nachrichten_kanal_baustelle(uuid) from public, anon;
grant execute on function public.nachrichten_kanal_baustelle(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Senden, bearbeiten, löschen
-- ---------------------------------------------------------------------------

/*
  SENDEN — idempotent (E49-Muster): dieselbe Kennung mit demselben Inhalt
  ist „angekommen“, mit anderem ein Konflikt. Deshalb steht dieser Aufruf
  auf der Liste des Ausgangsfachs (`AUFRUFE_OHNE_EMPFANG`).

  ANHÄNGE sind vorher hochgeladen; hier wird geprüft, dass jede Datei unter
  dem Pfad dieser Nachricht liegt, im Eimer ihrer Art, vom Aufrufer — Größe
  und Typ nimmt die Funktion aus dem Speicher, nicht aus der Anfrage.

  ERWÄHNEN gibt es in Runde und Baustelle; erwähnt werden kann nur, wer das
  Gespräch lesen darf. Wer erwähnt wird, folgt dem Baustellen-Thread.

  `p_aus`: die eigene private Nachricht, die hiermit in einen
  Baustellen-Thread übernommen wird (Spezifikation 4.5). Die private bleibt
  privat und merkt sich nur den Verweis.
*/
create or replace function public.nachricht_senden(
  p_id uuid,
  p_kanal uuid,
  p_text text,
  p_anhaenge jsonb default '[]'::jsonb,
  p_erwaehnt uuid[] default '{}'::uuid[],
  p_geraet_zeit timestamptz default null,
  p_aus uuid default null
) returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  ich public.users := app.darf_nachrichten();
  k public.nachrichten_kanaele;
  vorhanden public.nachrichten;
  aus public.nachrichten;
  sperre text;
  inhalt text := nullif(btrim(coalesce(p_text, ''), E' \t\r\n'), '');
  dateien jsonb := coalesce(p_anhaenge, '[]'::jsonb);
  eimer text;
  hash text;
  erwaehnt uuid[] := '{}'::uuid[];
  a jsonb;
  objekt record;
  nr integer := 0;
  jetzt timestamptz := clock_timestamp();
begin
  if p_id is null or p_kanal is null then
    raise exception 'Kennung und Gespräch fehlen' using errcode = '22023';
  end if;
  if jsonb_typeof(dateien) <> 'array' then
    raise exception 'Anhänge als Liste erwartet' using errcode = '22023';
  end if;
  select * into k from public.nachrichten_kanaele where id = p_kanal and company_id = ich.company_id;
  if k.id is null then
    raise exception 'Dieses Gespräch gibt es nicht' using errcode = '42501';
  end if;
  eimer := case when k.privat then 'nachrichten-privat' else 'nachrichten' end;

  hash := md5(concat_ws('|', k.id::text, coalesce(inhalt, ''),
                        (select coalesce(string_agg(x ->> 'id', ',' order by x ->> 'id'), '')
                           from jsonb_array_elements(dateien) x)));

  -- Schon angekommen? Dann ist dies die Zweitzustellung aus dem Ausgangsfach.
  select * into vorhanden from public.nachrichten where id = p_id;
  if vorhanden.id is not null then
    if vorhanden.von_uid is not distinct from ich.id and vorhanden.kanal_id = k.id and vorhanden.sende_hash = hash then
      return jsonb_build_object('id', vorhanden.id, 'gesendet_am', vorhanden.gesendet_am, 'neu', false);
    end if;
    raise exception 'Unter dieser Kennung steht schon eine andere Nachricht' using errcode = '23505';
  end if;

  sperre := app.nachrichten_schreibsperre(k.id);
  if sperre is not null then
    raise exception '%', sperre using errcode = case when app.nachrichten_kanal_lesbar(k.id) then '55000' else '42501' end;
  end if;
  if inhalt is null and jsonb_array_length(dateien) = 0 then
    raise exception 'Eine Nachricht braucht einen Text oder einen Anhang' using errcode = '22023';
  end if;
  if length(inhalt) > 20000 then
    raise exception 'Eine Nachricht hat höchstens 20 000 Zeichen — längere Texte bitte als Datei anhängen' using errcode = '22001';
  end if;

  -- Übernahme in die Baustelle: nur die eigene, private, nicht gelöschte Nachricht.
  if p_aus is not null then
    select * into aus from public.nachrichten where id = p_aus and company_id = ich.company_id;
    if aus.id is null or aus.von_uid is distinct from ich.id or not aus.privat or aus.geloescht_am is not null
       or not app.nachrichten_kanal_lesbar(aus.kanal_id) then
      raise exception 'Übernehmen lässt sich nur eine eigene Nachricht aus einem privaten Gespräch' using errcode = '42501';
    end if;
    if k.art <> 'baustelle' then
      raise exception 'Übernommen wird in den Thread einer Baustelle' using errcode = '22023';
    end if;
  end if;

  if k.art <> 'direkt' then
    select coalesce(array_agg(distinct x), '{}'::uuid[]) into erwaehnt
      from unnest(coalesce(p_erwaehnt, '{}'::uuid[])) x
     where x <> ich.id
       and case when k.privat
                then exists (select 1 from public.nachrichten_teilnehmer t join public.users u on u.id = t.user_id and u.active
                              where t.kanal_id = k.id and t.user_id = x and t.verlassen_am is null)
                else app.nachrichten_baustelle_lesbar(k.project_id, x) end;
  end if;

  insert into public.nachrichten (id, kanal_id, company_id, von_uid, von_name, text, erwaehnt,
                                  gesendet_am, geraet_zeit, sende_hash)
  values (p_id, k.id, ich.company_id, ich.id, ich.name, inhalt, erwaehnt, jetzt, p_geraet_zeit, hash);

  for a in select * from jsonb_array_elements(dateien) loop
    begin
      perform (a ->> 'id')::uuid;
    exception when invalid_text_representation then
      raise exception 'Ein Anhang hat keine gültige Kennung' using errcode = '22023';
    end;
    select o.name, o.owner_id, coalesce((o.metadata ->> 'size')::bigint, 0) as bytes,
           coalesce(o.metadata ->> 'mimetype', 'application/octet-stream') as art
      into objekt
      from storage.objects o
     where o.bucket_id = eimer
       and o.name = format('nachrichten/%s/%s/%s/%s', ich.company_id, k.id, p_id, a ->> 'id');
    if objekt.name is null or objekt.owner_id is distinct from ich.id::text then
      raise exception 'Ein Anhang ist nicht (vollständig) hochgeladen' using errcode = '23503';
    end if;
    insert into public.nachricht_anhaenge (id, nachricht_id, kanal_id, company_id, eimer, pfad, name, bytes, inhaltsart, reihenfolge)
    values ((a ->> 'id')::uuid, p_id, k.id, ich.company_id, eimer, objekt.name,
            left(coalesce(nullif(btrim(a ->> 'name'), ''), 'Anhang'), 200), greatest(objekt.bytes, 1), objekt.art, nr);
    nr := nr + 1;
  end loop;

  update public.nachrichten_kanaele set letzte_nachricht_am = jetzt where id = k.id;

  -- Wer folgt: der Schreiber, die Erwähnten, beim Thread einer Baustelle auch Team und Leitung.
  insert into public.nachrichten_teilnehmer (kanal_id, user_id, company_id, beigetreten_am)
  select k.id, x, ich.company_id, jetzt
    from unnest(array[ich.id] || erwaehnt) x
  on conflict (kanal_id, user_id) do nothing;
  if k.art = 'baustelle' then
    update public.nachrichten_teilnehmer set verlassen_am = null
     where kanal_id = k.id and (user_id = ich.id or user_id = any(erwaehnt));
    insert into public.nachrichten_teilnehmer (kanal_id, user_id, company_id, beigetreten_am)
    select k.id, x, ich.company_id, jetzt
      from public.projects p, unnest(p.assigned_employees || p.project_managers) x
     where p.id = k.project_id
       and exists (select 1 from public.users u where u.id = x and u.company_id = ich.company_id and u.active)
    on conflict (kanal_id, user_id) do nothing;
    -- Wer die Baustelle nicht mehr sieht, zählt hier nichts mehr.
    update public.nachrichten_teilnehmer t set ungelesen = 0
     where t.kanal_id = k.id and t.ungelesen > 0
       and not app.nachrichten_baustelle_lesbar(k.project_id, t.user_id);
  end if;

  update public.nachrichten_teilnehmer t
     set ungelesen = case when t.user_id = ich.id then 0 else t.ungelesen + 1 end,
         gelesen_bis = case when t.user_id = ich.id then jetzt else t.gelesen_bis end,
         zuletzt = jetzt
   where t.kanal_id = k.id and t.verlassen_am is null
     and (t.user_id = ich.id or k.privat or app.nachrichten_baustelle_lesbar(k.project_id, t.user_id));

  if aus.id is not null then
    update public.nachrichten set uebernommen_nach = p_id where id = aus.id;
  end if;

  perform app.push_anstossen(jsonb_build_object(
    'quelle', 'nachricht', 'art', 'neu',
    'zeile', jsonb_build_object('id', p_id, 'company_id', ich.company_id)));

  return jsonb_build_object('id', p_id, 'gesendet_am', jetzt, 'neu', true);
end;
$$;

revoke all on function public.nachricht_senden(uuid, uuid, text, jsonb, uuid[], timestamptz, uuid) from public, anon;
grant execute on function public.nachricht_senden(uuid, uuid, text, jsonb, uuid[], timestamptz, uuid) to authenticated;

/* BEARBEITEN — nur die eigene, nicht gelöschte; angezeigt als „bearbeitet“. */
create or replace function public.nachricht_bearbeiten(p_id uuid, p_text text) returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  ich public.users := app.darf_nachrichten();
  n public.nachrichten;
  sperre text;
  inhalt text := nullif(btrim(coalesce(p_text, ''), E' \t\r\n'), '');
begin
  select * into n from public.nachrichten where id = p_id and company_id = ich.company_id;
  if n.id is null or n.von_uid is distinct from ich.id or not app.nachrichten_kanal_lesbar(n.kanal_id) then
    raise exception 'Bearbeiten lässt sich nur eine eigene Nachricht' using errcode = '42501';
  end if;
  if n.geloescht_am is not null then
    raise exception 'Diese Nachricht ist gelöscht' using errcode = '55000';
  end if;
  sperre := app.nachrichten_schreibsperre(n.kanal_id);
  if sperre is not null then
    raise exception '%', sperre using errcode = '55000';
  end if;
  if inhalt is null and not exists (select 1 from public.nachricht_anhaenge a where a.nachricht_id = n.id) then
    raise exception 'Eine Nachricht braucht einen Text oder einen Anhang — zum Entfernen „Löschen“' using errcode = '22023';
  end if;
  if length(inhalt) > 20000 then
    raise exception 'Eine Nachricht hat höchstens 20 000 Zeichen' using errcode = '22001';
  end if;
  if inhalt is not distinct from n.text then
    return;
  end if;
  update public.nachrichten set text = inhalt, bearbeitet_am = now() where id = n.id;
end;
$$;

revoke all on function public.nachricht_bearbeiten(uuid, text) from public, anon;
grant execute on function public.nachricht_bearbeiten(uuid, text) to authenticated;

/*
  Anhänge einer Nachricht entfernen: Zeile sofort, Datei vormerken — außer
  sie ist Teil einer Meldung; dann bleibt die Datei, bis die Meldung geht.
*/
create or replace function app.nachrichten_anhaenge_entfernen(p_nachrichten uuid[]) returns integer
  language plpgsql
  security definer
  set search_path = ''
as $$
declare anzahl integer;
begin
  insert into app.nachrichten_dateien_weg (eimer, pfad)
  select a.eimer, a.pfad from public.nachricht_anhaenge a where a.nachricht_id = any(p_nachrichten)
  on conflict (eimer, pfad) do nothing;
  delete from public.nachricht_anhaenge a where a.nachricht_id = any(p_nachrichten);
  get diagnostics anzahl = row_count;
  return anzahl;
end;
$$;

revoke all on function app.nachrichten_anhaenge_entfernen(uuid[]) from public, anon, authenticated;

/*
  DIE EDGE FUNCTION ANSTOSSEN, die die vorgemerkten Dateien entfernt.
  Ihre Adresse folgt der von `push-melden` (derselbe Tresor, dieselbe
  Kopfzeile) — kein weiterer Eintrag, den jemand in der Produktion von Hand
  anlegen müsste. Scheitert der Anstoß, holt es der Nachtlauf nach.
*/
create or replace function app.nachrichten_aufraeumen_anstossen() returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  adresse text;
  schluessel text;
begin
  select decrypted_secret into adresse from vault.decrypted_secrets where name = 'push_url';
  select decrypted_secret into schluessel from vault.decrypted_secrets where name = 'push_schluessel';
  if adresse is null or schluessel is null or adresse !~ '/push-melden/?$' then
    raise warning 'Aufräumen der Nachrichtendateien nicht eingerichtet: push_url oder push_schluessel fehlt im Tresor.';
    return;
  end if;
  perform net.http_post(
    url := regexp_replace(adresse, '/push-melden/?$', '/nachrichten-aufraeumen'),
    headers := app.anstoss_kopfzeilen(schluessel),
    body := jsonb_build_object('quelle', 'nachrichten'),
    timeout_milliseconds := 60000);
exception when others then
  raise warning 'Aufräumen der Nachrichtendateien konnte nicht angestossen werden: %', sqlerrm;
end;
$$;

revoke all on function app.nachrichten_aufraeumen_anstossen() from public, anon, authenticated;

/*
  LÖSCHEN — nur die eigene. Text und Erwähnungen gehen, die Anhänge auch;
  es bleibt „Nachricht gelöscht“ mit Zeitpunkt. Geht immer, auch bei
  ausgeschaltetem Modul: Löschen ist Datenschutz, keine Funktion.
*/
create or replace function public.nachricht_loeschen(p_id uuid) returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  ich public.users := app.darf_nachrichten();
  n public.nachrichten;
begin
  select * into n from public.nachrichten where id = p_id and company_id = ich.company_id;
  if n.id is null or n.von_uid is distinct from ich.id or not app.nachrichten_kanal_lesbar(n.kanal_id) then
    raise exception 'Löschen lässt sich nur eine eigene Nachricht' using errcode = '42501';
  end if;
  if n.geloescht_am is not null then
    return;
  end if;
  update public.nachrichten set text = null, erwaehnt = '{}', bearbeitet_am = null, geloescht_am = now() where id = n.id;
  -- Wer sie noch nicht gelesen hatte, zählt sie nicht mehr.
  update public.nachrichten_teilnehmer t set ungelesen = t.ungelesen - 1
   where t.kanal_id = n.kanal_id and t.user_id <> ich.id and t.ungelesen > 0
     and (t.gelesen_bis is null or t.gelesen_bis < n.gesendet_am);
  if app.nachrichten_anhaenge_entfernen(array[n.id]) > 0 then
    perform app.nachrichten_aufraeumen_anstossen();
  end if;
end;
$$;

revoke all on function public.nachricht_loeschen(uuid) from public, anon;
grant execute on function public.nachricht_loeschen(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Die eigene Teilnahme
-- ---------------------------------------------------------------------------

/* GELESEN — die eigene Zahl auf null. Niemand sonst erfährt davon (D4). */
create or replace function public.nachrichten_gelesen(p_kanal uuid) returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare ich public.users := app.darf_nachrichten();
begin
  if not app.nachrichten_kanal_lesbar(p_kanal) then
    raise exception 'Dieses Gespräch gibt es nicht oder es ist nicht deines' using errcode = '42501';
  end if;
  update public.nachrichten_teilnehmer
     set ungelesen = 0, gelesen_bis = clock_timestamp()
   where kanal_id = p_kanal and user_id = ich.id and (ungelesen > 0 or gelesen_bis is null or gelesen_bis < zuletzt);
end;
$$;

revoke all on function public.nachrichten_gelesen(uuid) from public, anon;
grant execute on function public.nachrichten_gelesen(uuid) to authenticated;

/* STUMM — keine Push-Meldung mehr aus diesem Gespräch, außer man wird erwähnt. Die Zahl bleibt. */
create or replace function public.nachrichten_stumm(p_kanal uuid, p_stumm boolean) returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare ich public.users := app.darf_nachrichten();
begin
  if not app.nachrichten_kanal_lesbar(p_kanal) then
    raise exception 'Dieses Gespräch gibt es nicht oder es ist nicht deines' using errcode = '42501';
  end if;
  insert into public.nachrichten_teilnehmer (kanal_id, user_id, company_id, stumm)
  values (p_kanal, ich.id, ich.company_id, coalesce(p_stumm, false))
  on conflict (kanal_id, user_id) do update set stumm = excluded.stumm;
end;
$$;

revoke all on function public.nachrichten_stumm(uuid, boolean) from public, anon;
grant execute on function public.nachrichten_stumm(uuid, boolean) to authenticated;

/* FOLGEN — nur beim Thread einer Baustelle: Zahl und Push ja oder nein. Lesen bleibt. */
create or replace function public.nachrichten_folgen(p_kanal uuid, p_folgen boolean) returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  ich public.users := app.darf_nachrichten();
  k public.nachrichten_kanaele;
begin
  select * into k from public.nachrichten_kanaele where id = p_kanal and company_id = ich.company_id;
  if k.id is null or k.art <> 'baustelle' or not app.nachrichten_kanal_lesbar(k.id) then
    raise exception 'Folgen gibt es beim Thread einer Baustelle' using errcode = '42501';
  end if;
  if coalesce(p_folgen, false) then
    insert into public.nachrichten_teilnehmer (kanal_id, user_id, company_id, gelesen_bis, zuletzt)
    values (k.id, ich.id, ich.company_id, clock_timestamp(), k.letzte_nachricht_am)
    on conflict (kanal_id, user_id) do update set verlassen_am = null;
  else
    update public.nachrichten_teilnehmer set verlassen_am = clock_timestamp(), ungelesen = 0
     where kanal_id = k.id and user_id = ich.id;
  end if;
end;
$$;

revoke all on function public.nachrichten_folgen(uuid, boolean) from public, anon;
grant execute on function public.nachrichten_folgen(uuid, boolean) to authenticated;

/*
  EINE RUNDE VERLASSEN — danach liest man sie nicht mehr. Die eigenen
  Nachrichten bleiben für die anderen stehen (wer sie entfernen will,
  löscht sie vorher). Wer als Letzter geht, nimmt die Runde mit.
*/
create or replace function public.nachrichten_verlassen(p_kanal uuid) returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  ich public.users := app.darf_nachrichten();
  k public.nachrichten_kanaele;
  nachrichten_ids uuid[];
begin
  select * into k from public.nachrichten_kanaele where id = p_kanal and company_id = ich.company_id;
  if k.id is null or k.art <> 'runde' or not app.nachrichten_kanal_lesbar(k.id) then
    raise exception 'Verlassen lässt sich eine Runde, in der man ist' using errcode = '42501';
  end if;
  update public.nachrichten_teilnehmer set verlassen_am = clock_timestamp(), ungelesen = 0
   where kanal_id = k.id and user_id = ich.id;
  if not exists (select 1 from public.nachrichten_teilnehmer t where t.kanal_id = k.id and t.verlassen_am is null) then
    select coalesce(array_agg(n.id), '{}'::uuid[]) into nachrichten_ids from public.nachrichten n where n.kanal_id = k.id;
    perform app.nachrichten_anhaenge_entfernen(nachrichten_ids);
    delete from public.nachrichten_kanaele where id = k.id;
    perform app.nachrichten_aufraeumen_anstossen();
  end if;
end;
$$;

revoke all on function public.nachrichten_verlassen(uuid) from public, anon;
grant execute on function public.nachrichten_verlassen(uuid) to authenticated;

/* PERSONEN IN EINE RUNDE HOLEN — wer drin ist, darf das (D6, keine Rangordnung). Sie lesen ab jetzt. */
create or replace function public.nachrichten_hinzufuegen(p_kanal uuid, p_personen uuid[]) returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  ich public.users := app.darf_nachrichten();
  k public.nachrichten_kanaele;
  neue uuid[];
  sperre text;
  jetzt timestamptz := clock_timestamp();
begin
  select * into k from public.nachrichten_kanaele where id = p_kanal and company_id = ich.company_id;
  if k.id is null or k.art <> 'runde' or not app.nachrichten_kanal_lesbar(k.id) then
    raise exception 'Personen kommen in eine Runde, in der man selbst ist' using errcode = '42501';
  end if;
  sperre := app.nachrichten_schreibsperre(k.id);
  if sperre is not null then
    raise exception '%', sperre using errcode = '55000';
  end if;
  neue := app.nachrichten_personen_pruefen(ich.company_id, ich.id, p_personen);
  insert into public.nachrichten_teilnehmer (kanal_id, user_id, company_id, beigetreten_am, sichtbar_ab, zuletzt)
  select k.id, x, ich.company_id, jetzt, jetzt, k.letzte_nachricht_am from unnest(neue) x
  on conflict (kanal_id, user_id) do update
     set verlassen_am = null, beigetreten_am = jetzt, sichtbar_ab = jetzt, ungelesen = 0, gelesen_bis = null
   where public.nachrichten_teilnehmer.verlassen_am is not null;
end;
$$;

revoke all on function public.nachrichten_hinzufuegen(uuid, uuid[]) from public, anon;
grant execute on function public.nachrichten_hinzufuegen(uuid, uuid[]) to authenticated;

/* EINE RUNDE BENENNEN — leer heißt: ohne Namen (dann stehen die Teilnehmer da). */
create or replace function public.nachrichten_umbenennen(p_kanal uuid, p_name text) returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  ich public.users := app.darf_nachrichten();
  k public.nachrichten_kanaele;
  sperre text;
begin
  select * into k from public.nachrichten_kanaele where id = p_kanal and company_id = ich.company_id;
  if k.id is null or k.art <> 'runde' or not app.nachrichten_kanal_lesbar(k.id) then
    raise exception 'Benennen lässt sich eine Runde, in der man ist' using errcode = '42501';
  end if;
  sperre := app.nachrichten_schreibsperre(k.id);
  if sperre is not null then
    raise exception '%', sperre using errcode = '55000';
  end if;
  update public.nachrichten_kanaele set name = nullif(btrim(coalesce(p_name, '')), '') where id = k.id;
end;
$$;

revoke all on function public.nachrichten_umbenennen(uuid, text) from public, anon;
grant execute on function public.nachrichten_umbenennen(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 9. Lesen
-- ---------------------------------------------------------------------------

/* Wie ein Kanal für den Aufrufer heißt: der andere, die Runde, die Baustelle. */
create or replace function app.nachrichten_titel(p_kanal uuid, p_ich uuid) returns text
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select case k.art
    when 'direkt' then coalesce((select u.name from public.nachrichten_teilnehmer t join public.users u on u.id = t.user_id
                                  where t.kanal_id = k.id and t.user_id <> p_ich limit 1), 'Gespräch')
    when 'runde' then coalesce(k.name, (
      select case when count(*) = 0 then 'Runde'
                  when count(*) <= 3 then string_agg(x.name, ', ' order by x.name)
                  else (array_agg(x.name order by x.name))[1] || ', ' || (array_agg(x.name order by x.name))[2]
                       || ' und ' || (count(*) - 2) || ' weitere' end
        from (select u.name from public.nachrichten_teilnehmer t join public.users u on u.id = t.user_id
               where t.kanal_id = k.id and t.user_id <> p_ich and t.verlassen_am is null) x))
    else coalesce((select concat_ws(' · ', p.project_number, nullif(btrim(coalesce(p.bezeichnung, '')), ''), p.customer_name)
                     from public.projects p where p.id = k.project_id), 'Baustelle')
  end
    from public.nachrichten_kanaele k where k.id = p_kanal
$$;

revoke all on function app.nachrichten_titel(uuid, uuid) from public, anon, authenticated;

/*
  DER POSTEINGANG — die Gespräche, in denen der Aufrufer ist (bzw. denen er
  folgt), jüngstes zuerst, seitenweise. Je Zeile die letzte Nachricht, die
  er lesen darf, gekürzt, und die eigene ungelesene Zahl.

  `p_art`: leer alle, `privat` Direkt und Runden, `baustelle` die Threads.
  `p_suche` findet im Titel und im Text — nur in den eigenen Gesprächen;
  eine betriebsweite Inhaltssuche gibt es nicht.
*/
create or replace function public.nachrichten_postfach(
  p_art text default null,
  p_suche text default null,
  p_vor timestamptz default null,
  p_vor_id uuid default null,
  p_anzahl integer default 30
) returns table (
  kanal uuid, art text, titel text, project_id uuid, zuletzt timestamptz,
  letzte_text text, letzte_von text, letzte_eigene boolean, ungelesen integer, stumm boolean, geschlossen boolean
)
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
#variable_conflict use_column
declare
  ich public.users := app.darf_nachrichten();
  muster text := case when nullif(btrim(coalesce(p_suche, '')), '') is null then null
                      else '%' || replace(replace(replace(btrim(p_suche), '\', '\\'), '%', '\%'), '_', '\_') || '%' end;
begin
  if p_art is not null and p_art not in ('privat', 'baustelle') then
    raise exception 'Unbekannte Auswahl: %', p_art using errcode = '22023';
  end if;
  return query
  with meine as (
    select k.*, t.ungelesen as t_ungelesen, t.stumm as t_stumm, t.sichtbar_ab as t_ab,
           coalesce(k.letzte_nachricht_am, k.angelegt_am) as sortiert
      from public.nachrichten_teilnehmer t
      join public.nachrichten_kanaele k on k.id = t.kanal_id
     where t.user_id = ich.id and t.company_id = ich.company_id and t.verlassen_am is null
       and (k.letzte_nachricht_am is not null or k.angelegt_von = ich.id)
       and (p_art is null or (p_art = 'privat') = k.privat)
       and (k.privat or app.nachrichten_baustelle_lesbar(k.project_id, ich.id))
  ), gefiltert as (
    select m.*, app.nachrichten_titel(m.id, ich.id) as m_titel
      from meine m
     where p_vor is null or (m.sortiert, m.id) < (p_vor, p_vor_id)
  )
  select g.id, g.art, g.m_titel, g.project_id, g.sortiert,
         l.zeile, l.von, l.eigen, g.t_ungelesen, g.t_stumm,
         (g.art = 'direkt' and exists (select 1 from public.nachrichten_teilnehmer t2 join public.users u on u.id = t2.user_id
                                        where t2.kanal_id = g.id and t2.user_id <> ich.id and not u.active))
    from gefiltert g
    left join lateral (
      select case when n.geloescht_am is not null then 'Nachricht gelöscht'
                  when n.text is null then 'Anhang'
                  else left(split_part(n.text, E'\n', 1), 120) end as zeile,
             case when n.von_uid = ich.id then 'Du' else n.von_name end as von,
             n.von_uid is not distinct from ich.id as eigen
        from public.nachrichten n
       where n.kanal_id = g.id and n.gesendet_am >= g.t_ab
       order by n.gesendet_am desc, n.id desc limit 1) l on true
   where muster is null
      or g.m_titel ilike muster
      or exists (select 1 from public.nachrichten n
                  where n.kanal_id = g.id and n.gesendet_am >= g.t_ab and n.text ilike muster)
   order by g.sortiert desc, g.id desc
   limit greatest(1, least(coalesce(p_anzahl, 30), 100));
end;
$$;

revoke all on function public.nachrichten_postfach(text, text, timestamptz, uuid, integer) from public, anon;
grant execute on function public.nachrichten_postfach(text, text, timestamptz, uuid, integer) to authenticated;

/*
  DER KOPF EINES GESPRÄCHS — Art, Titel, Teilnehmer (nur bei privaten:
  Name und ob aktiv; beim Thread nicht, er gehört allen, die die Baustelle
  sehen), die eigene Teilnahme und ob geschrieben werden darf.
*/
create or replace function public.nachrichten_kanal(p_kanal uuid) returns jsonb
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare
  ich public.users := app.darf_nachrichten();
  k public.nachrichten_kanaele;
  t public.nachrichten_teilnehmer;
begin
  select * into k from public.nachrichten_kanaele where id = p_kanal and company_id = ich.company_id;
  if k.id is null or not app.nachrichten_kanal_lesbar(k.id) then
    raise exception 'Dieses Gespräch gibt es nicht oder es ist nicht deines' using errcode = '42501';
  end if;
  select * into t from public.nachrichten_teilnehmer where kanal_id = k.id and user_id = ich.id;
  return jsonb_build_object(
    'kanal', k.id,
    'art', k.art,
    'titel', app.nachrichten_titel(k.id, ich.id),
    'name', k.name,
    'project_id', k.project_id,
    'teilnehmer', case when k.privat then (
      select coalesce(jsonb_agg(jsonb_build_object('uid', u.id, 'name', u.name, 'aktiv', u.active, 'ich', u.id = ich.id)
                                order by u.id <> ich.id, u.name), '[]'::jsonb)
        from public.nachrichten_teilnehmer x join public.users u on u.id = x.user_id
       where x.kanal_id = k.id and x.verlassen_am is null) else null end,
    'folgt', t.user_id is not null and t.verlassen_am is null,
    'stumm', coalesce(t.stumm, false),
    'ungelesen', coalesce(t.ungelesen, 0),
    'sperre', app.nachrichten_schreibsperre(k.id));
end;
$$;

revoke all on function public.nachrichten_kanal(uuid) from public, anon;
grant execute on function public.nachrichten_kanal(uuid) to authenticated;

/*
  DER VERLAUF — seitenweise rückwärts. Je Nachricht Absender, Zeit, Text
  (bei gelöschten nichts), die Namen der Erwähnten, die Anhänge mit ihrem
  Ablageort (geladen wird über eine kurzlebige signierte Adresse, die die
  Speicherregel nur Lesenden gibt) und ob der Aufrufer sie schon gemeldet
  bzw. übernommen hat.
*/
create or replace function public.nachrichten_verlauf(
  p_kanal uuid,
  p_vor timestamptz default null,
  p_vor_id uuid default null,
  p_anzahl integer default 50
) returns table (
  id uuid, von_uid uuid, von_name text, eigene boolean, text text, gesendet_am timestamptz,
  bearbeitet_am timestamptz, geloescht_am timestamptz, erwaehnt jsonb, anhaenge jsonb,
  uebernommen boolean, gemeldet boolean
)
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
#variable_conflict use_column
declare
  ich public.users := app.darf_nachrichten();
  ab timestamptz;
begin
  if not app.nachrichten_kanal_lesbar(p_kanal) then
    raise exception 'Dieses Gespräch gibt es nicht oder es ist nicht deines' using errcode = '42501';
  end if;
  ab := app.nachrichten_sichtbar_ab(p_kanal);
  return query
  select n.id, n.von_uid, n.von_name, n.von_uid is not distinct from ich.id, n.text, n.gesendet_am,
         n.bearbeitet_am, n.geloescht_am,
         (select coalesce(jsonb_agg(jsonb_build_object('uid', u.id, 'name', u.name) order by u.name), '[]'::jsonb)
            from public.users u where u.id = any(n.erwaehnt)),
         (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'eimer', a.eimer, 'pfad', a.pfad, 'name', a.name,
                                                       'bytes', a.bytes, 'inhaltsart', a.inhaltsart)
                                    order by a.reihenfolge, a.id), '[]'::jsonb)
            from public.nachricht_anhaenge a where a.nachricht_id = n.id),
         n.von_uid is not distinct from ich.id and n.uebernommen_nach is not null,
         exists (select 1 from public.nachricht_meldungen m where m.nachricht_id = n.id and m.gemeldet_von = ich.id)
    from public.nachrichten n
   where n.kanal_id = p_kanal and n.gesendet_am >= ab
     and (p_vor is null or (n.gesendet_am, n.id) < (p_vor, p_vor_id))
   order by n.gesendet_am desc, n.id desc
   limit greatest(1, least(coalesce(p_anzahl, 50), 200));
end;
$$;

revoke all on function public.nachrichten_verlauf(uuid, timestamptz, uuid, integer) from public, anon;
grant execute on function public.nachrichten_verlauf(uuid, timestamptz, uuid, integer) to authenticated;

/*
  DER STAND EINES BAUSTELLEN-THREADS für die Akte — ohne ihn anzulegen:
  ob es ihn gibt, wie viele Nachrichten, wann die letzte, die eigene Zahl.
*/
create or replace function public.nachrichten_baustelle_stand(p_projekt uuid) returns jsonb
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare
  ich public.users := app.darf_nachrichten();
  k public.nachrichten_kanaele;
  t public.nachrichten_teilnehmer;
begin
  if not app.nachrichten_baustelle_lesbar(p_projekt, ich.id) then
    raise exception 'Diese Baustelle gibt es nicht oder sie ist nicht deine' using errcode = '42501';
  end if;
  select * into k from public.nachrichten_kanaele
   where company_id = ich.company_id and art = 'baustelle' and project_id = p_projekt;
  if k.id is null then
    return jsonb_build_object('kanal', null, 'anzahl', 0, 'zuletzt', null, 'ungelesen', 0, 'folgt', false);
  end if;
  select * into t from public.nachrichten_teilnehmer where kanal_id = k.id and user_id = ich.id;
  return jsonb_build_object(
    'kanal', k.id,
    'anzahl', (select count(*) from public.nachrichten n where n.kanal_id = k.id and n.geloescht_am is null),
    'zuletzt', k.letzte_nachricht_am,
    'ungelesen', coalesce(t.ungelesen, 0),
    'folgt', t.user_id is not null and t.verlassen_am is null);
end;
$$;

revoke all on function public.nachrichten_baustelle_stand(uuid) from public, anon;
grant execute on function public.nachrichten_baustelle_stand(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 10. Melden (D5)
-- ---------------------------------------------------------------------------

/*
  MELDEN — eine bekommene Nachricht an die Geschäftsführung weitergeben.
  Kopiert werden Text, Absender, Zeit und die Anhänge (deren Dateien
  bleiben, solange die Meldung besteht). Einmal je Nachricht und Person.
  Geht immer, auch bei ausgeschaltetem Modul.
*/
create or replace function public.nachricht_melden(p_nachricht uuid, p_grund text) returns uuid
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  ich public.users := app.darf_nachrichten();
  n public.nachrichten;
  k public.nachrichten_kanaele;
  kennung uuid;
begin
  select * into n from public.nachrichten where id = p_nachricht and company_id = ich.company_id;
  if n.id is null or not app.nachrichten_kanal_lesbar(n.kanal_id) or n.gesendet_am < app.nachrichten_sichtbar_ab(n.kanal_id) then
    raise exception 'Diese Nachricht gibt es nicht oder sie ist nicht an dich' using errcode = '42501';
  end if;
  if n.von_uid is not distinct from ich.id then
    raise exception 'Die eigene Nachricht meldet man nicht — man löscht sie' using errcode = '22023';
  end if;
  if n.geloescht_am is not null then
    raise exception 'Diese Nachricht ist gelöscht' using errcode = '55000';
  end if;
  if length(btrim(coalesce(p_grund, ''))) > 2000 then
    raise exception 'Der Grund hat höchstens 2 000 Zeichen' using errcode = '22001';
  end if;
  select * into k from public.nachrichten_kanaele where id = n.kanal_id;
  insert into public.nachricht_meldungen (company_id, nachricht_id, kanal_art, gemeldet_von, gemeldet_von_name, grund,
                                          von_uid, von_name, gesendet_am, text_kopie, anhaenge)
  values (ich.company_id, n.id, k.art, ich.id, ich.name, nullif(btrim(coalesce(p_grund, '')), ''),
          n.von_uid, n.von_name, n.gesendet_am, n.text,
          (select coalesce(jsonb_agg(jsonb_build_object('eimer', a.eimer, 'pfad', a.pfad, 'name', a.name,
                                                        'bytes', a.bytes, 'inhaltsart', a.inhaltsart)
                                     order by a.reihenfolge, a.id), '[]'::jsonb)
             from public.nachricht_anhaenge a where a.nachricht_id = n.id))
  on conflict (nachricht_id, gemeldet_von) do nothing
  returning id into kennung;
  if kennung is null then
    raise exception 'Diese Nachricht hast du schon gemeldet' using errcode = '23505';
  end if;
  return kennung;
end;
$$;

revoke all on function public.nachricht_melden(uuid, text) from public, anon;
grant execute on function public.nachricht_melden(uuid, text) to authenticated;

/* Wer Meldungen bekommt: Geschäftsführung und Administration des Betriebs — nie der Support. */
create or replace function app.darf_meldungen_sehen() returns text
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
begin
  if not app.angemeldet() or app.ist_plattform() or app.betrieb() is null
     or not app.hat_rolle(array['Geschäftsführung', 'Administrator']) then
    raise exception 'Gemeldete Nachrichten sieht die Geschäftsführung' using errcode = '42501';
  end if;
  return app.betrieb();
end;
$$;

revoke all on function app.darf_meldungen_sehen() from public, anon, authenticated;

create or replace function public.nachricht_meldungen(p_status text default null) returns setof public.nachricht_meldungen
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare betrieb text := app.darf_meldungen_sehen();
begin
  return query
  select * from public.nachricht_meldungen m
   where m.company_id = betrieb and (p_status is null or m.status = p_status)
   order by (m.status = 'offen') desc, m.gemeldet_am desc;
end;
$$;

revoke all on function public.nachricht_meldungen(text) from public, anon;
grant execute on function public.nachricht_meldungen(text) to authenticated;

create or replace function public.nachricht_meldung_erledigen(p_meldung uuid, p_vermerk text) returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  betrieb text := app.darf_meldungen_sehen();
  anzahl integer;
begin
  if length(btrim(coalesce(p_vermerk, ''))) > 2000 then
    raise exception 'Der Vermerk hat höchstens 2 000 Zeichen' using errcode = '22001';
  end if;
  update public.nachricht_meldungen
     set status = 'erledigt', erledigt_von = auth.uid(), erledigt_am = now(),
         erledigt_von_name = (select u.name from public.users u where u.id = auth.uid()),
         vermerk = nullif(btrim(coalesce(p_vermerk, '')), '')
   where id = p_meldung and company_id = betrieb and status = 'offen';
  get diagnostics anzahl = row_count;
  if anzahl = 0 then
    raise exception 'Diese Meldung gibt es nicht oder sie ist schon erledigt' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.nachricht_meldung_erledigen(uuid, text) from public, anon;
grant execute on function public.nachricht_meldung_erledigen(uuid, text) to authenticated;

/*
  EINE ERLEDIGTE MELDUNG LÖSCHEN — mit ihr gehen die Dateien, die nur sie
  noch hielt (nicht die, an denen die Nachricht noch hängt).
*/
create or replace function public.nachricht_meldung_loeschen(p_meldung uuid) returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  betrieb text := app.darf_meldungen_sehen();
  m public.nachricht_meldungen;
begin
  delete from public.nachricht_meldungen where id = p_meldung and company_id = betrieb and status = 'erledigt'
  returning * into m;
  if m.id is null then
    raise exception 'Gelöscht wird eine erledigte Meldung' using errcode = '55000';
  end if;
  if jsonb_array_length(m.anhaenge) > 0 then
    insert into app.nachrichten_dateien_weg (eimer, pfad)
    select x ->> 'eimer', x ->> 'pfad' from jsonb_array_elements(m.anhaenge) x
    on conflict (eimer, pfad) do nothing;
    perform app.nachrichten_aufraeumen_anstossen();
  end if;
end;
$$;

revoke all on function public.nachricht_meldung_loeschen(uuid) from public, anon;
grant execute on function public.nachricht_meldung_loeschen(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 11. Selbstexport und Aufbewahrung
-- ---------------------------------------------------------------------------

/*
  MEINE NACHRICHTEN — alle Gespräche, die die Person lesen darf, mit allem,
  was sie darin lesen darf. Nur für sich selbst; das ist der Weg zum
  INHALT (Art. 15, 20 DSGVO), den die Datenauskunft der Führung bewusst
  nicht enthält. Anhänge stehen mit Name, Größe und Ablageort darin; die
  Dateien lädt man in der App.
*/
create or replace function public.nachrichten_selbstexport() returns jsonb
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare ich public.users := app.darf_nachrichten();
begin
  return jsonb_build_object(
    'person', ich.name,
    'betrieb', (select c.name from public.companies c where c.id = ich.company_id),
    'erstellt_am', now(),
    'gespraeche', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'art', k.art,
               'titel', app.nachrichten_titel(k.id, ich.id),
               'nachrichten', (
                 select coalesce(jsonb_agg(jsonb_build_object(
                          'von', case when n.von_uid = ich.id then 'Du' else n.von_name end,
                          'gesendet_am', n.gesendet_am, 'bearbeitet_am', n.bearbeitet_am,
                          'geloescht_am', n.geloescht_am, 'text', n.text,
                          'anhaenge', (select coalesce(jsonb_agg(jsonb_build_object('name', a.name, 'bytes', a.bytes,
                                                                                     'eimer', a.eimer, 'pfad', a.pfad)
                                                                  order by a.reihenfolge), '[]'::jsonb)
                                         from public.nachricht_anhaenge a where a.nachricht_id = n.id))
                          order by n.gesendet_am, n.id), '[]'::jsonb)
                   from public.nachrichten n
                  where n.kanal_id = k.id and n.gesendet_am >= t.sichtbar_ab))
             order by coalesce(k.letzte_nachricht_am, k.angelegt_am)), '[]'::jsonb)
        from public.nachrichten_teilnehmer t
        join public.nachrichten_kanaele k on k.id = t.kanal_id
       where t.user_id = ich.id and t.verlassen_am is null
         and (k.privat or app.nachrichten_baustelle_lesbar(k.project_id, ich.id))));
end;
$$;

revoke all on function public.nachrichten_selbstexport() from public, anon;
grant execute on function public.nachrichten_selbstexport() to authenticated;

/* DIE AUFBEWAHRUNG WÄHLT DIE GESCHÄFTSFÜHRUNG (D3): 6, 12, 24 Monate oder nie (`null`). */
create or replace function public.nachrichten_aufbewahrung_setzen(p_monate integer) returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare betrieb text := app.betrieb();
begin
  if betrieb is null or not app.betriebsmitglied(betrieb) or app.ist_plattform()
     or not app.hat_rolle(array['Geschäftsführung', 'Administrator']) then
    raise exception 'Die Aufbewahrung der Nachrichten legt die Geschäftsführung fest' using errcode = '42501';
  end if;
  if p_monate is not null and p_monate not in (6, 12, 24) then
    raise exception 'Erlaubt sind 6, 12 oder 24 Monate oder keine Löschung' using errcode = '22023';
  end if;
  update public.companies set nachrichten_aufbewahrung_monate = p_monate where id = betrieb;
end;
$$;

revoke all on function public.nachrichten_aufbewahrung_setzen(integer) from public, anon;
grant execute on function public.nachrichten_aufbewahrung_setzen(integer) to authenticated;

/*
  DER RIEGEL AN DEN FIRMENEINSTELLUNGEN — Rumpf wie in
  `20260911150000_betrieb.sql` (in der Fassung von heute), dazu die
  Aufbewahrung: sie setzt nur die Geschäftsführung bzw. Administration,
  nicht wer sonst den Firmenstammsatz pflegt.
*/
create or replace function app.firmeneinstellungen_geschuetzt()
 returns trigger
 language plpgsql
 set search_path to ''
as $$
begin
  if app.ist_dienst() then return new; end if;
  if new.modules is distinct from old.modules
     and not app.hat_rolle(array['Administrator']) then
    raise exception 'Module schaltet nur die Administration' using errcode = '42501';
  end if;
  if new.vacation_approvers is distinct from old.vacation_approvers
     and not app.hat_rolle(array['Geschäftsführung', 'Administrator']) then
    raise exception 'Die Genehmigenden legt nur die Geschäftsführung fest'
      using errcode = '42501';
  end if;
  if new.nachrichten_aufbewahrung_monate is distinct from old.nachrichten_aufbewahrung_monate
     and not app.hat_rolle(array['Geschäftsführung', 'Administrator']) then
    raise exception 'Die Aufbewahrung der Nachrichten legt die Geschäftsführung fest'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

/*
  DER NACHTLAUF: private Gespräche über der gewählten Frist löschen, dann
  die vorgemerkten und verwaisten Dateien entfernen lassen.
*/
create or replace function app.nachrichten_nachtlauf() returns integer
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  alt uuid[];
  nachrichten_ids uuid[];
begin
  select coalesce(array_agg(k.id), '{}'::uuid[]) into alt
    from public.nachrichten_kanaele k
    join public.companies c on c.id = k.company_id
   where k.privat and c.nachrichten_aufbewahrung_monate is not null
     and coalesce(k.letzte_nachricht_am, k.angelegt_am) < now() - make_interval(months => c.nachrichten_aufbewahrung_monate);
  if cardinality(alt) > 0 then
    select coalesce(array_agg(n.id), '{}'::uuid[]) into nachrichten_ids from public.nachrichten n where n.kanal_id = any(alt);
    perform app.nachrichten_anhaenge_entfernen(nachrichten_ids);
    delete from public.nachrichten_kanaele where id = any(alt);
  end if;
  perform app.nachrichten_aufraeumen_anstossen();
  return cardinality(alt);
end;
$$;

revoke all on function app.nachrichten_nachtlauf() from public, anon, authenticated;

do $cron$
begin
  if exists (select 1 from cron.job where jobname = 'nachrichten-nachtlauf') then
    perform cron.unschedule('nachrichten-nachtlauf');
  end if;
  perform cron.schedule('nachrichten-nachtlauf', '40 3 * * *', 'select app.nachrichten_nachtlauf()');
end;
$cron$;

/*
  WAS DIE EDGE FUNCTION ENTFERNT: vorgemerkte Dateien, dazu Dateien in den
  beiden Eimern ohne Anhang und ohne Meldung, die älter als sieben Tage sind
  (hochgeladen, aber nie gesendet; aus einem gelöschten Baustellen-Thread).
  Sieben Tage, weil eine Nachricht im Ausgangsfach eines Telefons ohne Netz
  so lange auf ihr Senden warten kann — ihre Datei liegt dann schon oben.
  Nie eine Datei, an der noch ein Anhang oder eine Meldung hängt.
*/
create or replace function public.nachrichten_dateien_offen(p_anzahl integer default 200)
  returns table (eimer text, pfad text)
  language sql
  stable
  security definer
  set search_path = ''
as $$
  with kandidaten as (
    select w.eimer, w.pfad from app.nachrichten_dateien_weg w
    union
    select o.bucket_id::text, o.name::text from storage.objects o
     where o.bucket_id in ('nachrichten', 'nachrichten-privat')
       and o.created_at < now() - interval '7 days'
  )
  select k.eimer, k.pfad from kandidaten k
   where not exists (select 1 from public.nachricht_anhaenge a where a.eimer = k.eimer and a.pfad = k.pfad)
     and not exists (select 1 from public.nachricht_meldungen m
                      where m.anhaenge @> jsonb_build_array(jsonb_build_object('eimer', k.eimer, 'pfad', k.pfad)))
   order by 1, 2
   limit greatest(1, least(coalesce(p_anzahl, 200), 1000))
$$;

revoke all on function public.nachrichten_dateien_offen(integer) from public, anon, authenticated;
grant execute on function public.nachrichten_dateien_offen(integer) to service_role;

/* Was entfernt ist, kommt aus der Vormerkung — und eine Vormerkung, die noch gebraucht wird, ebenso. */
create or replace function public.nachrichten_dateien_erledigt(p_dateien jsonb) returns integer
  language plpgsql
  security definer
  set search_path = ''
as $$
declare anzahl integer;
begin
  delete from app.nachrichten_dateien_weg w
   using jsonb_array_elements(coalesce(p_dateien, '[]'::jsonb)) x
   where w.eimer = x ->> 'eimer' and w.pfad = x ->> 'pfad';
  get diagnostics anzahl = row_count;
  delete from app.nachrichten_dateien_weg w
   where exists (select 1 from public.nachricht_anhaenge a where a.eimer = w.eimer and a.pfad = w.pfad)
      or exists (select 1 from public.nachricht_meldungen m
                  where m.anhaenge @> jsonb_build_array(jsonb_build_object('eimer', w.eimer, 'pfad', w.pfad)));
  return anzahl;
end;
$$;

revoke all on function public.nachrichten_dateien_erledigt(jsonb) from public, anon, authenticated;
grant execute on function public.nachrichten_dateien_erledigt(jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- 12. Push
-- ---------------------------------------------------------------------------

/*
  WAS `push-melden` FÜR EINE NEUE NACHRICHT BRAUCHT — genau einmal je
  Nachricht (`push_am`). Der Anstoß selbst trägt keinen Text, nur die
  Kennung: die Anfrage liegt eine Weile in den Tabellen von `pg_net`.

  EMPFÄNGER: wer folgt bzw. teilnimmt, außer dem Absender; aktive Konten;
  nicht stumm — außer erwähnt; beim Thread nur, wer die Baustelle noch
  sieht. Je Empfänger, ob er die Vorschau will (Vorgabe aus). Den Text
  (80 Zeichen) gibt die Funktion nur heraus, wenn wenigstens einer ihn
  will. Ob jemand Nachrichten überhaupt gemeldet haben will, entscheidet
  `shared/notifyLogic.ts` mit seinen Vorgaben.
*/
create or replace function public.push_nachricht(p_nachricht uuid) returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  n public.nachrichten;
  k public.nachrichten_kanaele;
  empfaenger jsonb;
  vorschau boolean;
begin
  update public.nachrichten set push_am = now()
   where id = p_nachricht and push_am is null and geloescht_am is null
  returning * into n;
  if n.id is null then
    return null;
  end if;
  select * into k from public.nachrichten_kanaele where id = n.kanal_id;
  if not app.modul_aktiv(k.company_id, 'nachrichten')
     or (k.privat and not app.modul_aktiv(k.company_id, 'nachrichten.direktnachrichten'))
     or app.betrieb_ruht(k.company_id) then
    return null;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('uid', t.user_id, 'vorschau', coalesce(p.nachricht_vorschau, false),
                                               'erwaehnt', t.user_id = any(n.erwaehnt))), '[]'::jsonb)
    into empfaenger
    from public.nachrichten_teilnehmer t
    join public.users u on u.id = t.user_id and u.active
    left join public.user_prefs p on p.user_id = t.user_id
   where t.kanal_id = k.id and t.verlassen_am is null
     and t.user_id is distinct from n.von_uid
     and (not t.stumm or t.user_id = any(n.erwaehnt))
     and (k.privat or app.nachrichten_baustelle_lesbar(k.project_id, t.user_id));
  vorschau := exists (select 1 from jsonb_array_elements(empfaenger) e where (e ->> 'vorschau')::boolean);
  return jsonb_build_object(
    'nachricht', n.id,
    'kanal', k.id,
    'art', k.art,
    'runde', case when k.art = 'runde' then coalesce(k.name, 'Runde') end,
    'baustelle', case when k.art = 'baustelle' then (select p.project_number from public.projects p where p.id = k.project_id) end,
    'von', n.von_name,
    'anhang', exists (select 1 from public.nachricht_anhaenge a where a.nachricht_id = n.id),
    'text', case when vorschau then left(coalesce(n.text, ''), 80) end,
    'empfaenger', empfaenger);
end;
$$;

revoke all on function public.push_nachricht(uuid) from public, anon, authenticated;
grant execute on function public.push_nachricht(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 13. Die Zahl im Menü
-- ---------------------------------------------------------------------------

/*
  OFFENE POSTEN — Rumpf wie in `20261005400000_ruecklass.sql`, dazu die
  eigene Zahl ungelesener Nachrichten. Gelesen wird sie unter dem
  Zeilenschutz des Aufrufers: nur die eigenen Teilnahmen. Eine andere
  Ergebnisspalte verlangt, die Funktion neu anzulegen.
*/
drop function if exists public.offene_posten(date);
create function public.offene_posten(p_heute date default current_date)
  returns table (urlaub bigint, anforderungen bigint, mahnungen bigint, nachrichten bigint)
  language sql stable
  set search_path = ''
as $$
  select
    case when app.darf_urlaub_entscheiden(app.betrieb())
      then (select count(*) from public.vacations v
             where v.company_id = app.betrieb()
               and v.status = 'Beantragt'
               and (v.user_id is distinct from auth.uid()
                    or not app.entscheidet_jemand_anderer(v.company_id, v.user_id)))
      else 0::bigint end,

    case when app.hat_rolle(array['Verwaltung']) or app.ist_fuehrung()
      then (select count(*) from public.material_orders m
             where m.company_id = app.betrieb()
               and m.status = 'Offen')
      else 0::bigint end,

    case when app.ist_buch_oder_spitze()
      then (select count(*) from public.invoices i
             where i.company_id = app.betrieb()
               -- Wortgleich zum Teilindex `invoices_offen`; steht hier etwas
               -- anderes, greift er nicht mehr.
               and i.payment_status in ('Offen', 'Überfällig', 'Teilbezahlt')
               and i.total_brutto - i.bezahlt_betrag > 0
               and app.mahnung_faellig(i.payment_status, app.mahnbar_ab(i, p_heute), i.mahnstufe,
                                       i.gemahnt_am, i.mahnfrist, p_heute))
      else 0::bigint end,

    (select coalesce(sum(t.ungelesen), 0)::bigint from public.nachrichten_teilnehmer t
      where t.user_id = auth.uid() and t.company_id = app.betrieb() and t.verlassen_am is null)
$$;

revoke all on function public.offene_posten(date) from public, anon;
grant execute on function public.offene_posten(date) to authenticated, service_role;

/* OFFENE MELDUNGEN für die Startseite der Geschäftsführung — nur die Zahl. */
create or replace function public.nachricht_meldungen_offen() returns integer
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
begin
  if not app.angemeldet() or app.ist_plattform() or app.betrieb() is null
     or not app.hat_rolle(array['Geschäftsführung', 'Administrator']) then
    return 0;
  end if;
  return (select count(*) from public.nachricht_meldungen m where m.company_id = app.betrieb() and m.status = 'offen');
end;
$$;

revoke all on function public.nachricht_meldungen_offen() from public, anon;
grant execute on function public.nachricht_meldungen_offen() to authenticated;

-- ---------------------------------------------------------------------------
-- 14. Auszug und Sicherung: private Zeilen bleiben draußen
-- ---------------------------------------------------------------------------

/*
  DIE SICHERUNG — Rumpf wie in `20261013110000_auszug_snapshot.sql`, dazu:
  trägt eine Tabelle die Spalte `privat`, bleiben ihre privaten Zeilen
  draußen. Die Führung lädt Auszug und Sicherung herunter; private
  Gespräche gehören den Teilnehmern.
*/
create or replace function app.auszug_snapshot_zeilen(p_betrieb text) returns setof jsonb
language plpgsql stable security definer set search_path = '' as $$
declare firma jsonb; t text; privat boolean;
begin
  select to_jsonb(c) into firma from public.companies c where id = p_betrieb;
  if firma is null then raise exception 'Der Firmenstammsatz fehlt. Die Sicherung wurde abgebrochen.'; end if;
  return next jsonb_build_object('sammlung', 'companies', 'daten', firma);
  foreach t in array app.auszug_tabellen() loop
    privat := exists (select 1 from information_schema.columns col
                       where col.table_schema = 'public' and col.table_name = t and col.column_name = 'privat');
    return query execute format(
      'select jsonb_build_object(''sammlung'', $2, ''daten'', to_jsonb(z) - $3) from public.%I z where company_id = $1%s', t,
      case when privat then ' and not z.privat' else '' end)
      using p_betrieb, t, case when t = 'user_prefs' then array['push_tokens'] else array[]::text[] end;
  end loop;
end; $$;
revoke all on function app.auszug_snapshot_zeilen(text) from public, anon, authenticated;

/*
  DER AUSZUG ZUM HERUNTERLADEN — Rumpf wie in
  `20260913140000_betrieb_auszug.sql`, dazu dieselbe Regel.
*/
create or replace function public.betrieb_auszug(
  p_max_bytes integer default null
) returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  betrieb text := app.betrieb();
  grenze bigint := least(coalesce(p_max_bytes, 8 * 1024 * 1024), 8 * 1024 * 1024);
  bytes bigint := 0;
  tabelle text;
  zeilen jsonb;
  daten jsonb := '{}'::jsonb;
  anzahl jsonb := '{}'::jsonb;
  privat boolean;
begin
  if betrieb is null or not app.angemeldet() then
    raise exception 'Keine Anmeldung' using errcode = '42501';
  end if;
  -- Der Auszug ist der ganze Betrieb in einer Datei: Loehne, Kunden, Preise.
  -- Ihn holt, wer den Betrieb vertritt, nicht wer darin arbeitet.
  if not app.hat_rolle(array['Geschäftsführung', 'Administrator']) then
    raise exception 'Nur Geschäftsführung oder Administration' using errcode = '42501';
  end if;

  select to_jsonb(c) into zeilen from public.companies c where c.id = betrieb;
  if zeilen is not null then
    daten := jsonb_set(daten, array['companies'], jsonb_build_array(zeilen));
    anzahl := jsonb_set(anzahl, array['companies'], to_jsonb(1));
  end if;

  foreach tabelle in array app.auszug_tabellen() loop
    privat := exists (select 1 from information_schema.columns col
                       where col.table_schema = 'public' and col.table_name = tabelle and col.column_name = 'privat');
    execute format(
      'select coalesce(jsonb_agg((to_jsonb(t) - $2) order by t), ''[]''::jsonb)
         from public.%I t where t.company_id = $1%s', tabelle,
      case when privat then ' and not t.privat' else '' end)
      into zeilen using betrieb, app.auszug_ausgenommen(tabelle);

    bytes := bytes + length(zeilen::text);
    if bytes > grenze then
      raise exception 'Der Datenbestand ist zu groß für einen Download in einem Stück. Der vollständige Stand liegt in der nächtlichen Ausleitung.'
        using errcode = '53400';
    end if;

    daten := jsonb_set(daten, array[tabelle], zeilen);
    anzahl := jsonb_set(anzahl, array[tabelle], to_jsonb(jsonb_array_length(zeilen)));
  end loop;

  return jsonb_build_object(
    'companyId', betrieb,
    'exportedAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'anzahl', anzahl,
    'data', daten);
end;
$$;

revoke all on function public.betrieb_auszug(integer) from public, anon;
grant execute on function public.betrieb_auszug(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 15. Datenauskunft und Löschung einer Person
-- ---------------------------------------------------------------------------

/*
  DATENAUSKUNFT EINER PERSON — gezielt eingefügt wie M01b, M02a, M02c;
  wiederholbar, und ohne eindeutige Einfügestelle bricht die Migration ab.

  Sie ruft die FÜHRUNG für eine Person auf. Deshalb steht zu den
  Nachrichten nur, wie viele und aus welchem Zeitraum — kein Text, kein
  Gesprächspartner. Den Inhalt bekommt die Person selbst über „Meine
  Nachrichten exportieren“ (Mein Konto); die Auskunft nennt diesen Weg.
  Meldungen, an denen sie beteiligt ist, stehen vollständig darin: sie
  liegen ohnehin bei der Führung.
*/
do $migration$
declare quelle text; marke text;
begin
  quelle := pg_get_functiondef('public.person_auskunft(text,uuid,integer)'::regprocedure);
  if position('nachrichten_meldungen' in quelle) = 0 then
    marke := $m$      'begruendungen_arbeitszeit', ($m$;
    if (length(quelle) - length(replace(quelle, marke, ''))) / length(marke) <> 1 then
      raise exception 'Personenauskunft: Einfügestelle Mitarbeiter fehlt oder ist nicht eindeutig';
    end if;
    quelle := replace(quelle, marke, $eintrag$      -- M10/B09: Nachrichten nur als Anzahl und Zeitraum; den Inhalt exportiert die Person selbst.
      'nachrichten', jsonb_build_object(
        'gesendet', (select count(*) from public.nachrichten n
                      where n.company_id = betrieb and n.von_uid = p_id),
        'erste', (select min(n.gesendet_am) from public.nachrichten n
                   where n.company_id = betrieb and n.von_uid = p_id),
        'letzte', (select max(n.gesendet_am) from public.nachrichten n
                    where n.company_id = betrieb and n.von_uid = p_id),
        'gespraeche', (select count(*) from public.nachrichten_teilnehmer t
                        where t.company_id = betrieb and t.user_id = p_id),
        'hinweis', 'Inhalte privater Gespräche stehen hier bewusst nicht. Die Person erhält sie selbst unter Mein Konto → Meine Nachrichten exportieren.'),
      'nachrichten_meldungen', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'rolle', case when m.gemeldet_von = p_id then 'gemeldet' else 'absender' end,
                 'gemeldet_am', m.gemeldet_am, 'gesendet_am', m.gesendet_am, 'text', m.text_kopie,
                 'grund', m.grund, 'status', m.status, 'vermerk', m.vermerk) order by m.gemeldet_am), '[]'::jsonb)
          from public.nachricht_meldungen m
         where m.company_id = betrieb and (m.gemeldet_von = p_id or m.von_uid = p_id)),
$eintrag$ || marke);
    execute quelle;
  end if;
end;
$migration$;

/*
  LÖSCHUNG EINER PERSON (Art. 17, D2): ihre Nachrichten verlieren Text,
  Erwähnungen und Anhänge; es bleibt „Nachricht eines gelöschten Kontos“
  mit Zeitpunkt, damit die Gespräche der anderen lesbar bleiben. Ihre
  Teilnahmen gehen; ein privates Gespräch, in dem dann niemand mehr ist,
  geht ganz. Private Nachrichten sind keine Belege (keine Aufbewahrung nach
  § 132 BAO). Meldungen bleiben bei der Führung, solange sie sie braucht
  (Art. 17 Abs. 3 lit. e DSGVO) — sie löscht sie, wenn sie erledigt sind.

  Gezielt eingefügt wie oben; wiederholbar.
*/
do $migration$
declare quelle text; marke text;
begin
  quelle := pg_get_functiondef('public.person_loeschen(text,uuid,boolean)'::regprocedure);
  if position('nachrichten_teilnehmer' in quelle) = 0 then
    marke := $m$      'geburtsdatum', (select count(*) from public.geburtsdaten g$m$;
    if (length(quelle) - length(replace(quelle, marke, ''))) / length(marke) <> 1 then
      raise exception 'Löschung: Einfügestelle „sofort“ fehlt oder ist nicht eindeutig';
    end if;
    quelle := replace(quelle, marke, $eintrag$      -- M10/B09: ihre Nachrichten (Text und Anhänge) und Teilnahmen.
      'nachrichten', (select count(*) from public.nachrichten n
                       where n.company_id = betrieb and n.von_uid = p_id and n.text is not null),
      'nachrichten_teilnehmer', (select count(*) from public.nachrichten_teilnehmer t
                                  where t.company_id = betrieb and t.user_id = p_id),
$eintrag$ || marke);

    marke := $m$          from public.arbeitszeit_begruendungen b where b.company_id = betrieb and b.user_id = p_id
      ) teile;$m$;
    if (length(quelle) - length(replace(quelle, marke, ''))) / length(marke) <> 1 then
      raise exception 'Löschung: Einfügestelle „aufbewahren“ fehlt oder ist nicht eindeutig';
    end if;
    quelle := replace(quelle, marke, $eintrag$          from public.arbeitszeit_begruendungen b where b.company_id = betrieb and b.user_id = p_id
        union all
        -- M10/B09: Meldungen bleiben bei der Führung, bis sie sie als erledigt löscht.
        select jsonb_build_object('was', 'Gemeldete Nachrichten', 'anzahl', count(*), 'bis', null,
                                  'grund', 'Art. 17 Abs. 3 lit. e DSGVO — bis die Geschäftsführung die Meldung als erledigt löscht')
          from public.nachricht_meldungen m
         where m.company_id = betrieb and (m.gemeldet_von = p_id or m.von_uid = p_id)
      ) teile;$eintrag$);

    marke := $m$      delete from public.geburtsdaten g where g.company_id = betrieb and g.user_id = p_id;$m$;
    if (length(quelle) - length(replace(quelle, marke, ''))) / length(marke) <> 1 then
      raise exception 'Löschung: Einfügestelle Nachrichten fehlt oder ist nicht eindeutig';
    end if;
    quelle := replace(quelle, marke, marke || $eintrag$
      -- M10/B09: Text, Erwähnungen und Anhänge ihrer Nachrichten gehen; die Zeile bleibt als Platzhalter.
      perform app.nachrichten_anhaenge_entfernen(array(
        select n.id from public.nachrichten n where n.company_id = betrieb and n.von_uid = p_id));
      update public.nachrichten n
         set text = null, erwaehnt = '{}', bearbeitet_am = null, von_uid = null, von_name = 'Gelöschtes Konto',
             geloescht_am = coalesce(n.geloescht_am, now())
       where n.company_id = betrieb and n.von_uid = p_id;
      update public.nachrichten n set erwaehnt = array_remove(n.erwaehnt, p_id)
       where n.company_id = betrieb and p_id = any(n.erwaehnt);
      delete from public.nachrichten_teilnehmer t where t.company_id = betrieb and t.user_id = p_id;
      perform app.nachrichten_anhaenge_entfernen(array(
        select n.id from public.nachrichten n join public.nachrichten_kanaele k on k.id = n.kanal_id
         where k.company_id = betrieb and k.privat
           and not exists (select 1 from public.nachrichten_teilnehmer t where t.kanal_id = k.id and t.verlassen_am is null)));
      delete from public.nachrichten_kanaele k
       where k.company_id = betrieb and k.privat
         and not exists (select 1 from public.nachrichten_teilnehmer t where t.kanal_id = k.id and t.verlassen_am is null);
      perform app.nachrichten_aufraeumen_anstossen();$eintrag$);
    execute quelle;
  end if;
end;
$migration$;
