-- PLAENE UND DOKUMENTE AN DER BAUSTELLE.
--
-- GEMELDET: „Baustellen sollte man Dokumente oder Bilder hinzufuegen koennen,
-- fuer Bauplaene oder aehnliches, damit der Monteur Zugriff darauf hat — bei
-- seinen zugeteilten Baustellen."
--
-- WER WAS DARF, in einem Satz: das Buero laedt hoch und loescht, der Monteur
-- sieht die Plaene der Baustellen, auf die er gehoert — und sonst niemand.
-- Ein Grundriss zeigt, wie eine fremde Wohnung aussieht; er ist deshalb so
-- eng gefasst wie die Scheinfotos und nicht wie die Baustellenliste.
--
-- NEBENBEI GESCHLOSSEN: die Scheinfotos im SPEICHER. Die Tabelle
-- `work_sheet_photos` ist seit dem Supportzugang fuer den Support zu — die
-- Regeln des Eimers `scheinfotos` hingen aber weiter an `app.darf`, und das
-- schliesst den Support ein. Wer die Kennung eines Scheins kannte (Scheine
-- sieht der Support), konnte den Ordner auflisten und jedes Bild laden.
-- `tests/supabase/supportzugang.test.ts` haelt das jetzt fest.

-- ---------------------------------------------------------------------------
-- 1. Die Scheinfotos: der Speicher folgt der Tabelle
-- ---------------------------------------------------------------------------

/*
  `app.betriebsmitglied` ist Wort fuer Wort der alte Rumpf von `app.darf`,
  nur ohne den Supportzweig. Fuer jedes Mitglied des Betriebs aendert sich
  also nichts.
*/
drop policy if exists scheinfotos_lesen on storage.objects;
create policy scheinfotos_lesen on storage.objects for select to authenticated
  using (bucket_id = 'scheinfotos' and app.betriebsmitglied(app.foto_betrieb(name)));

drop policy if exists scheinfotos_anlegen on storage.objects;
create policy scheinfotos_anlegen on storage.objects for insert to authenticated
  with check (bucket_id = 'scheinfotos' and app.betriebsmitglied(app.foto_betrieb(name)));

drop policy if exists scheinfotos_ersetzen on storage.objects;
create policy scheinfotos_ersetzen on storage.objects for update to authenticated
  using (bucket_id = 'scheinfotos' and app.betriebsmitglied(app.foto_betrieb(name)))
  with check (bucket_id = 'scheinfotos' and app.betriebsmitglied(app.foto_betrieb(name)));

drop policy if exists scheinfotos_loeschen on storage.objects;
create policy scheinfotos_loeschen on storage.objects for delete to authenticated
  using (bucket_id = 'scheinfotos' and app.betriebsmitglied(app.foto_betrieb(name)));

-- ---------------------------------------------------------------------------
-- 2. Wer die Plaene einer Baustelle sehen darf
-- ---------------------------------------------------------------------------

/*
  DAS BUERO SIEHT ALLE, DER MONTEUR SEINE.

  „Seine" heisst: er steht im Team der Baustelle oder in ihrer Leitung — oder
  er ist fuer einen Tag dort eingeteilt. Das letzte ist kein Zusatz, sondern
  der Alltag: die Tagesplanung schickt Leute auf Baustellen, ohne sie ins
  Team zu schreiben, und wer dort steht, braucht den Plan.

  OHNE SECURITY DEFINER, mit Absicht: Baustellen und Einsaetze liest jedes
  Mitglied des Betriebs ohnehin. Die Funktion sieht damit nie mehr als der,
  der fragt.
*/
create or replace function app.baustelle_einsehbar(p_projekt uuid) returns boolean
  language sql stable
  set search_path = ''
as $$
  select app.rolle() is distinct from 'Mitarbeiter'
      or exists (
           select 1 from public.projects p
            where p.id = p_projekt
              and (auth.uid() = any (p.assigned_employees)
                   or auth.uid() = any (p.project_managers)))
      or exists (
           select 1 from public.assignments a
            where a.project_id = p_projekt and a.user_id = auth.uid())
$$;

grant execute on function app.baustelle_einsehbar(uuid) to authenticated, anon, service_role;

-- ---------------------------------------------------------------------------
-- 3. Die Tabelle
-- ---------------------------------------------------------------------------

create table project_documents (
  id                   uuid primary key default gen_random_uuid(),
  company_id           text not null references companies (id),
  /*
    AN DER KENNUNG, NICHT AN DER NUMMER. Die Baustellennummer laesst sich in
    der Akte aendern; ein Plan, der an ihr hinge, fiele dabei ab.

    OHNE `on delete cascade`: eine Baustelle mit Plaenen laesst sich nicht
    loeschen, solange die Plaene dranhaengen. Die Zeilen mitzuloeschen liesse
    die Dateien im Speicher zurueck — ohne Zeile, die auf sie zeigt, und
    damit ohne jemanden, der sie je wieder findet.
  */
  project_id           uuid not null references projects (id),
  pfad                 text not null unique,
  dateiname            text not null check (length(btrim(dateiname)) between 1 and 200),
  mime                 text not null,
  bytes                bigint not null check (bytes > 0),
  hochgeladen_von      uuid default auth.uid() references users (id),
  hochgeladen_von_name text,
  created_at           timestamptz not null default now(),
  /*
    DER PFAD NENNT BETRIEB UND BAUSTELLE DER ZEILE. Die Leseregel des
    Speichers kennt nur den Pfad; stuende darin eine andere Baustelle als in
    der Zeile, sahe der Monteur in der App einen Plan, den er im Speicher
    nicht oeffnen darf — oder umgekehrt.
  */
  constraint project_documents_pfad_passt
    check (pfad like 'baustellen/' || company_id || '/' || project_id::text || '/%')
);

create index project_documents_baustelle on project_documents (company_id, project_id);

alter table project_documents enable row level security;

create policy project_documents_lesen on project_documents
  for select using (app.betriebsmitglied(company_id) and app.baustelle_einsehbar(project_id));

-- Hochladen und Loeschen darf, wer auch die Baustelle aendern darf.
create policy project_documents_anlegen on project_documents
  for insert with check (
    app.betriebsmitglied(company_id) and app.ist_fuehrung()
    and exists (select 1 from public.projects p
                 where p.id = project_id and p.company_id = project_documents.company_id));

create policy project_documents_loeschen on project_documents
  for delete using (app.betriebsmitglied(company_id) and app.ist_fuehrung());

-- Keine Aenderungsregel: ein Plan wird ersetzt, indem man den neuen hochlaedt
-- und den alten loescht. Der Riegel steht trotzdem da — falls je eine kommt.
create trigger project_documents_betrieb_fest before update on project_documents
  for each row execute function app.betrieb_unveraenderlich();

/*
  DER SUPPORT BLEIBT DRAUSSEN, auch mit „Mitarbeiten". Ein Grundriss aus einer
  Kundenwohnung gehoert zu dem, was er nicht einmal lesen darf; ihn trotzdem
  schreiben zu lassen hiesse, blind aendern zu koennen, was man nicht sieht.
*/
create trigger project_documents_support_niemals
  before insert or update or delete on project_documents
  for each row execute function app.support_niemals();

-- ---------------------------------------------------------------------------
-- 4. Der Eimer
-- ---------------------------------------------------------------------------

/*
  25 MEGABYTE UND NUR, WAS EIN TELEFON ANZEIGEN KANN. Ein eingescannter Plan
  als PDF liegt meist bei ein bis zehn Megabyte; die Grenze faengt den Fehler
  ab, nicht den Normalfall. CAD-Dateien (DWG) oeffnet auf der Baustelle kein
  Telefon — sie gehoeren als PDF exportiert hierher.
*/
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('baustellendokumente', 'baustellendokumente', false, 25 * 1024 * 1024,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

/*
  PFAD: `baustellen/{betrieb}/{baustelle}/{kennung}.{endung}`. Der Betrieb
  steht an zweiter, die Baustelle an dritter Stelle — dieselbe Bauart wie
  `scheine/{betrieb}/{schein}/…`. Eine Baustelle, die keine uuid ist, ergibt
  NULL statt eines Abbruchs: eine Leseregel, die bei einem fremden Namen
  wirft, nimmt die ganze Auflistung mit.
*/
create or replace function app.dokument_betrieb(objektname text) returns text
  language sql immutable
  set search_path = ''
as $$
  select case
    when (storage.foldername(objektname))[1] = 'baustellen'
      then (storage.foldername(objektname))[2]
  end
$$;

create or replace function app.dokument_baustelle(objektname text) returns uuid
  language sql immutable
  set search_path = ''
as $$
  select case
    when (storage.foldername(objektname))[1] = 'baustellen'
     and (storage.foldername(objektname))[3]
         ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then ((storage.foldername(objektname))[3])::uuid
  end
$$;

grant execute on function app.dokument_betrieb(text) to authenticated, anon, service_role;
grant execute on function app.dokument_baustelle(text) to authenticated, anon, service_role;

drop policy if exists baustellendokumente_lesen on storage.objects;
create policy baustellendokumente_lesen on storage.objects for select to authenticated
  using (bucket_id = 'baustellendokumente'
         and app.betriebsmitglied(app.dokument_betrieb(name))
         and app.baustelle_einsehbar(app.dokument_baustelle(name)));

drop policy if exists baustellendokumente_anlegen on storage.objects;
create policy baustellendokumente_anlegen on storage.objects for insert to authenticated
  with check (bucket_id = 'baustellendokumente'
              and app.betriebsmitglied(app.dokument_betrieb(name))
              and app.ist_fuehrung()
              and exists (select 1 from public.projects p
                           where p.id = app.dokument_baustelle(name)
                             and p.company_id = app.dokument_betrieb(name)));

/*
  KEIN UEBERSCHREIBEN. Jeder Plan bekommt beim Hochladen eine neue Kennung;
  derselbe Pfad traegt damit nie zwei Inhalte. Darauf verlaesst sich die
  Sicherung, die nach Pfad ueberspringt (`app.offene_dateien`).
*/
drop policy if exists baustellendokumente_loeschen on storage.objects;
create policy baustellendokumente_loeschen on storage.objects for delete to authenticated
  using (bucket_id = 'baustellendokumente'
         and app.betriebsmitglied(app.dokument_betrieb(name))
         and app.ist_fuehrung());

-- ---------------------------------------------------------------------------
-- 5. Die Plaene gehen mit in die Sicherung ausser Haus
-- ---------------------------------------------------------------------------

/*
  JEDER EIMER STEHT IN DIESER LISTE — sonst fiele er still aus der Sicherung.
  `tests/supabase/ausleitungDateien.test.ts` gleicht sie mit
  `storage.buckets` ab.
*/
create or replace function app.datei_eimer()
  returns table (eimer text, gesichert boolean)
  language sql immutable
  set search_path = ''
as $$
  select * from (values
    ('scheinfotos'::text,         true),
    ('baustellendokumente'::text, true),
    ('ausleitung'::text,          false)
  ) as t(eimer, gesichert)
$$;

create or replace function app.datei_betrieb(p_eimer text, p_name text)
  returns text
  language sql stable
  set search_path = ''
as $$
  select case p_eimer
    when 'scheinfotos'         then app.foto_betrieb(p_name)
    when 'baustellendokumente' then app.dokument_betrieb(p_name)
    when 'ausleitung'          then case
      when (storage.foldername(p_name))[1] = 'ausleitung'
        then (storage.foldername(p_name))[2]
    end
  end
$$;
