/*
  DOKUMENTE „NUR FÜRS BÜRO“ UND WORD, EXCEL, E-MAIL AN DER BAUSTELLE
  (11.10.2026, Plan 17 D)

  Bisher sah jeder Monteur einer Baustelle alles, was dort abgelegt war —
  deshalb nahm die Ablage nur Pläne und Bilder, und ein Dateiname, der nach
  Büro klang, wurde nachgefragt (Launch-Check R1, Testbericht H8). Das
  Angebot des Lieferanten, der Schriftverkehr mit der Hausverwaltung oder
  die Aufmaßliste in Excel hatten damit keinen Platz an der Baustelle.

  JETZT JE DOKUMENT: `nur_buero`. Ein solches Dokument sieht der Monteur
  weder in der Liste noch im Speicher — auch nicht mit der Adresse der
  Datei. „Büro“ heisst hier wie überall in der Ablage: jede Rolle ausser
  `Mitarbeiter` (`app.baustelle_einsehbar`).

  DER SPEICHER FRAGT DIE ZEILE. Seine Leseregel kennt nur den Pfad; ob das
  Dokument nur fürs Büro ist, steht in `project_documents`. Die Frage
  stellt `app.dokument_nur_buero` am Zeilenschutz vorbei — sonst sähe der
  Monteur die Zeile nicht und hielte das Dokument deshalb für frei.

  UMSCHALTEN NUR ÜBER `dokument_nur_buero_setzen`: wer hochladen darf, darf
  auch umschalten. Eine Änderungsregel für die ganze Zeile gäbe es dazu
  nicht — Pfad und Baustelle bleiben, wie sie sind.

  NEUE TYPEN: Word (.doc, .docx), Excel (.xls, .xlsx) und E-Mails (.eml,
  .msg). Größe wie bisher höchstens 25 MB.

  Bestehende Dokumente bleiben, wie sie sind: für die Monteure sichtbar.
*/

-- ---------------------------------------------------------------------------
-- 1. Die Spalte
-- ---------------------------------------------------------------------------

alter table public.project_documents
  add column if not exists nur_buero boolean not null default false;

comment on column public.project_documents.nur_buero is
  'Nur für das Büro: Monteure (Rolle Mitarbeiter) sehen weder Zeile noch Datei (17 D, 11.10.2026).';

-- ---------------------------------------------------------------------------
-- 2. Lesen: die Zeile
-- ---------------------------------------------------------------------------

alter policy project_documents_lesen on public.project_documents
  using (
    (company_id = (select app.lesebetrieb()))
    and app.baustelle_einsehbar(project_id)
    and (not nur_buero or (select app.rolle()) is distinct from 'Mitarbeiter')
  );

-- ---------------------------------------------------------------------------
-- 3. Lesen: die Datei
-- ---------------------------------------------------------------------------

/*
  Ist das Dokument unter diesem Pfad nur fürs Büro? Ohne Zeile: nein —
  dann gilt, was vorher galt (die Datei wird hochgeladen, bevor ihre Zeile
  entsteht; in diesem Augenblick kennt den Pfad nur, wer ihn gerade
  erzeugt hat).
*/
create or replace function app.dokument_nur_buero(p_pfad text) returns boolean
  language sql stable
  security definer
  set search_path = ''
as $$
  select coalesce((select d.nur_buero from public.project_documents d where d.pfad = p_pfad), false)
$$;

revoke all on function app.dokument_nur_buero(text) from public, anon;
grant execute on function app.dokument_nur_buero(text) to authenticated;

drop policy if exists baustellendokumente_lesen on storage.objects;
create policy baustellendokumente_lesen on storage.objects for select to authenticated
  using (bucket_id = 'baustellendokumente'
         and app.betriebsmitglied(app.dokument_betrieb(name))
         and app.baustelle_einsehbar(app.dokument_baustelle(name))
         and ((select app.rolle()) is distinct from 'Mitarbeiter' or not app.dokument_nur_buero(name)));

-- ---------------------------------------------------------------------------
-- 4. Umschalten
-- ---------------------------------------------------------------------------

create or replace function public.dokument_nur_buero_setzen(p_id uuid, p_nur_buero boolean)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  betrieb text;
begin
  if p_nur_buero is null then
    raise exception 'Nur fürs Büro: ja oder nein' using errcode = '22023';
  end if;
  select d.company_id into betrieb from public.project_documents d where d.id = p_id;
  if betrieb is null or betrieb is distinct from app.lesebetrieb() or not app.ist_fuehrung() then
    raise exception 'Dieses Dokument gibt es hier nicht, oder es darf von hier aus nicht geändert werden'
      using errcode = '42501';
  end if;
  -- Der Support bleibt draussen: `project_documents_support_niemals` greift
  -- auch hier, weil die Zeile geändert wird.
  update public.project_documents set nur_buero = p_nur_buero where id = p_id;
end;
$$;

revoke all on function public.dokument_nur_buero_setzen(uuid, boolean) from public, anon;
grant execute on function public.dokument_nur_buero_setzen(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Die neuen Typen
-- ---------------------------------------------------------------------------

update storage.buckets
   set allowed_mime_types = array[
     'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic',
     'application/msword',
     'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
     'application/vnd.ms-excel',
     'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
     'message/rfc822',
     'application/vnd.ms-outlook'
   ]
 where id = 'baustellendokumente';
