/*
  DER PAPIERKORB FÜR ENTWÜRFE (M01d, U06, 06.11.2026)

  WAS FEHLTE. Ein Angebotsentwurf wurde mit „Löschen“ sofort hart gelöscht —
  ein Fehlgriff war nicht mehr zurückzuholen. Der Server erlaubte der Führung
  dabei JEDES Angebot zu löschen, auch ein versendetes oder angenommenes, an
  dem eine Baustelle und eine Fassungskette hängen; die Grenze „nur Entwürfe“
  stand allein in der Ansicht. Der Handwerksschein hat seit dem Umzug den
  Zustand „Verworfen“ samt Wiederaufnahme und seit E42 das endgültige Löschen;
  wann er verworfen wurde, hielt er nicht fest.

  WAS SICH ÄNDERT.
  - Angebote bekommen den Stand „Verworfen“: Verwerfen geht nur aus dem
    Entwurf, Wiederherstellen nur zurück in den Entwurf. Wer und wann, setzt
    die Datenbank (`verworfen_am`, `verworfen_von_uid`, `verworfen_von_name`).
  - Endgültig gelöscht wird ein Angebot nur noch als Entwurf oder verworfen,
    und nur vom eigenen Betrieb — auch über die Schnittstelle, auch für die
    Spitze. E42 bleibt: gelöscht ist gelöscht.
  - Der Schein hält fest, wann er verworfen wurde (`verworfen_am`).
  - Der Betrieb kann eine Frist setzen (`papierkorb_frist_tage`). Sie LÖSCHT
    NICHTS: Sie markiert, was länger liegt; die Spitze sieht es auf der
    Startseite und leert es mit einem Handgriff. Zwei Gründe, warum kein
    nächtlicher Lauf löscht:
      1. Die Fotos der Scheine liegen im Speicher, und dessen Dateien lassen
         sich nur über die Speicher-Schnittstelle löschen, nicht aus der
         Datenbank. Ein Lauf bräuchte dafür einen eigenen Dienstzugang
         (Betreiber-Secret) — für etwas, das ein Mensch mit einem Knopf tut.
      2. Er vernichtete Entwürfe ohne menschliche Entscheidung. Ob ein
         liegengebliebener Entwurf weg kann, entscheidet der Betrieb.

  WARUM EIN TRIGGER UND KEINE ZWEI SERVERFUNKTIONEN. Der Stand eines Angebots
  ändert sich heute auf drei Wegen: über `angebot_speichern` (Versenden,
  Ablehnen aus Liste und Angebotsseite), über `angebot_annehmen` und direkt
  über die Schnittstelle (die Regel `quotes_schreiben` erlaubt der Führung
  das Ändern). Eine Funktion „verwerfen“ hielte keinen dieser Wege auf, einen
  Entwurf ohne Wer und Wann auf „Verworfen“ zu setzen oder einen verworfenen
  zu versenden — dafür bräuchte es den Trigger ohnehin, und die Funktionen
  wären ein zweiter Weg daneben. So hält es auch der Bestand: die Zeiten der
  Stände setzt `angebot_status_zeit`, die Wechsel am Schein prüfen
  `schein_verwerfen` und `schein_zustandswechsel`. Rechte prüft die Regel
  `quotes_schreiben` wie bei jedem anderen Standwechsel (Führung).
*/

-- ---------------------------------------------------------------------------
-- Angebote: der Stand „Verworfen“
-- ---------------------------------------------------------------------------

alter table public.quotes drop constraint if exists quotes_status_check;
alter table public.quotes add constraint quotes_status_check
  check (status in ('Entwurf', 'Versendet', 'Angenommen', 'Abgelehnt', 'Ersetzt', 'Verworfen'));

/*
  KEIN FREMDSCHLÜSSEL AUF DIE PERSON (wie E50, M01b): wer verworfen hat,
  bleibt stehen, auch wenn das Konto später geht; der Name daneben ist der
  zum Zeitpunkt.
*/
alter table public.quotes add column if not exists verworfen_am timestamptz;
alter table public.quotes add column if not exists verworfen_von_uid uuid;
alter table public.quotes add column if not exists verworfen_von_name text;

comment on column public.quotes.verworfen_am is
  'Wann das Angebot in den Papierkorb kam (M01d); setzt nur die Datenbank, leer außerhalb des Papierkorbs.';
comment on column public.quotes.verworfen_von_uid is
  'Wer es in den Papierkorb gelegt hat (M01d); setzt nur die Datenbank.';
comment on column public.quotes.verworfen_von_name is
  'Der Name dazu zum Zeitpunkt (M01d); setzt nur die Datenbank.';

-- Der Papierkorb liest je Betrieb die verworfenen, die jüngsten zuerst.
create index if not exists quotes_papierkorb
  on public.quotes (company_id, verworfen_am desc) where status = 'Verworfen';

/*
  DIE WECHSEL IN DEN UND AUS DEM PAPIERKORB.

  - Hinein nur aus dem Entwurf: was beim Kunden lag, bleibt nachvollziehbar
    (abgelehnt, ersetzt) — es wird nicht verworfen.
  - Heraus nur zurück in den Entwurf: ein verworfenes Angebot wird weder
    versendet noch angenommen noch abgelehnt, ohne vorher wiederhergestellt
    zu sein. Den Inhalt schützt `angebot_speichern` schon („nur ein Entwurf
    lässt sich ändern“).
  - NICHT ZURÜCK, WENN INZWISCHEN EINE ANDERE FASSUNG ANGENOMMEN IST (G15).
    Beim Annehmen werden die übrigen OFFENEN Fassungen „ersetzt“; eine
    verworfene bleibt dabei im Papierkorb (wer sie dorthin gelegt hat, findet
    sie dort wieder und kann sie löschen). Käme sie danach als Entwurf
    zurück, stünde neben dem angenommenen Auftrag wieder eine offene Fassung
    — genau das, was G15 ausschließt.
  - Wer und wann setzt allein die Datenbank; ohne Wechsel stehen die drei
    Felder fest.

  Der Dienstschlüssel (Rücklauf einer Sicherung) bringt die Zeilen, wie sie
  waren. `security definer`, weil der Name des Supports in `platform_admins`
  steht, die kein Konto lesen darf (wie `journal_protokollieren`).
*/
create or replace function app.angebot_papierkorb() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  angenommen public.quotes;
begin
  if app.ist_dienst() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status = 'Verworfen' then
      raise exception 'Ein Angebot entsteht nicht im Papierkorb — verworfen wird ein Entwurf'
        using errcode = '55000';
    end if;
    new.verworfen_am := null;
    new.verworfen_von_uid := null;
    new.verworfen_von_name := null;
    return new;
  end if;

  if new.status = 'Verworfen' and old.status is distinct from 'Verworfen' then
    if old.status <> 'Entwurf' then
      raise exception 'In den Papierkorb kommt nur ein Entwurf — Angebot % ist „%“', old.quote_number, old.status
        using errcode = '55000';
    end if;
    new.verworfen_am := now();
    new.verworfen_von_uid := auth.uid();
    -- Wie im Journal: wer im Supporteinblick verwirft, steht nicht in der Belegschaft.
    new.verworfen_von_name := coalesce(
      (select u.name from public.users u where u.id = auth.uid()),
      (select 'Support (' || coalesce(nullif(btrim(p.name), ''), 'Senklot') || ')'
         from public.platform_admins p where p.id = auth.uid()));
    return new;
  end if;

  if old.status = 'Verworfen' and new.status is distinct from 'Verworfen' then
    if new.status <> 'Entwurf' then
      raise exception 'Angebot % liegt im Papierkorb — erst wiederherstellen, dann „%“', old.quote_number, new.status
        using errcode = '55000';
    end if;
    select q.* into angenommen
      from public.quotes q
     where q.id in (select app.angebot_fassungen(new.id))
       and q.id <> new.id
       and q.status = 'Angenommen'
     limit 1;
    if angenommen.id is not null then
      raise exception 'Von diesem Angebot ist inzwischen die Fassung % angenommen — % bleibt im Papierkorb',
        angenommen.quote_number, old.quote_number
        using errcode = '55000';
    end if;
    new.verworfen_am := null;
    new.verworfen_von_uid := null;
    new.verworfen_von_name := null;
    return new;
  end if;

  new.verworfen_am := old.verworfen_am;
  new.verworfen_von_uid := old.verworfen_von_uid;
  new.verworfen_von_name := old.verworfen_von_name;
  return new;
end;
$$;

revoke all on function app.angebot_papierkorb() from public, anon, authenticated;

/*
  `quotes_papierkorb` feuert nach `quotes_fassung_pruefen` und vor
  `quotes_status_zeit` (Trigger laufen in der Reihenfolge ihrer Namen) — und
  nach `quotes_aussteller`, das unten den Papierkorb kennt.
*/
drop trigger if exists quotes_papierkorb on public.quotes;
create trigger quotes_papierkorb
  before insert or update on public.quotes
  for each row execute function app.angebot_papierkorb();

/*
  DIE FIRMENDATEN BLEIBEN BEIM ENTWURF (`20261024300000_aussteller_staende.sql`).
  „Ein Entwurf hat keine“: er druckt mit den heutigen. Bisher hielt jeder
  Wechsel weg vom Entwurf den Stand fest, weil jeder davon ein Ausstellen
  war (versendet, angenommen, abgelehnt). Das Verwerfen ist keines — ohne
  diese Ausnahme trüge ein wiederhergestellter Entwurf die Firmendaten vom
  Tag des Verwerfens und druckte mit ihnen. Sonst unverändert.
*/
create or replace function app.aussteller_angebot() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if app.ist_dienst() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.aussteller_stand := case when new.status = 'Entwurf' then null
                                 else app.aussteller_stand(new.company_id) end;
    return new;
  end if;

  if new.status = 'Versendet' and old.status is distinct from 'Versendet' then
    new.aussteller_stand := app.aussteller_stand(new.company_id);
  elsif old.status = 'Entwurf' and new.status not in ('Entwurf', 'Verworfen') and old.aussteller_stand is null then
    new.aussteller_stand := app.aussteller_stand(new.company_id);
  elsif new.aussteller_stand is distinct from old.aussteller_stand then
    raise exception 'Die Firmendaten eines Angebots hält sein Versand fest'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function app.aussteller_angebot() from public, anon, authenticated;

/*
  ENDGÜLTIG LÖSCHEN NUR ENTWURF UND PAPIERKORB — UND NUR DER EIGENE BETRIEB.

  Eine EINSCHRÄNKENDE Regel neben `quotes_schreiben`: Postgres verknüpft sie
  mit „und“. `quotes_schreiben` (Führung, auch der Support mit Freigabe
  „mitarbeiten“) bleibt für Anlegen und Ändern, wie es war; das Löschen
  verlangt zusätzlich, dass das Angebot ein Entwurf oder verworfen ist und
  dem eigenen Betrieb gehört. Ein versendetes, angenommenes, abgelehntes oder
  ersetztes Angebot ist damit nicht mehr zu löschen: an ihm hängen die
  Baustelle (`angebot_annehmen`), die Fassungskette (`vorgaenger_id`) und
  was der Kunde in der Hand hat.

  DER SUPPORT LÖSCHT NICHT ENDGÜLTIG (wie E42 beim Schein,
  `work_sheets_loeschen`): verwerfen und wiederherstellen kann er mit
  Freigabe „mitarbeiten“, weil das umkehrbar ist; das Unumkehrbare
  entscheidet der Betrieb selbst.

  Eine Regel und kein Trigger: so bleibt, was ohne Anmeldung an der
  Datenbank selbst geschieht (Rücklauf und Löschen eines Betriebs mit dem
  Dienstschlüssel, Testbestandsskripte als `postgres`), unberührt — die
  Grenze gilt für Konten, wie jede Regel.

  FASSUNGSKETTEN. Eine neue Fassung entsteht in der App nur aus einem
  versendeten oder abgelehnten Angebot; ein löschbares hat also keine
  Nachfolger. Legt jemand über die Schnittstelle eine Fassung zu einem
  Entwurf an, gilt beim Löschen des Entwurfs wie bisher
  `on delete set null` (`20261027400200_r6_angebot_fassungen.sql`).
*/
drop policy if exists quotes_loeschen_nur_entwurf on public.quotes;
create policy quotes_loeschen_nur_entwurf on public.quotes
  as restrictive
  for delete
  using (
    company_id = (select app.lesebetrieb())
    and status in ('Entwurf', 'Verworfen')
  );

/*
  DAS JOURNAL (M01b): Verwerfen und Wiederherstellen stehen dort als Wechsel
  des Stands, mit wer und wann. Die drei Felder setzt die Datenbank zugleich
  mit diesem Wechsel — im Journal stünde dasselbe sonst zweimal, wie bei
  `versendet_am`. Der Trigger wird mit der längeren Ausnahmeliste neu
  angelegt; die Funktion bleibt dieselbe.
*/
drop trigger if exists quotes_journal on public.quotes;
create trigger quotes_journal
  after insert or update or delete on public.quotes
  for each row execute function app.journal_protokollieren(
    'angebot', '{id,company_id,created_at,updated_at,aussteller_stand,customer_id,project_id,vorgaenger_id,versendet_am,angenommen_am,abgelehnt_am,verworfen_am,verworfen_von_uid,verworfen_von_name}');

-- ---------------------------------------------------------------------------
-- Handwerksscheine: wann verworfen
-- ---------------------------------------------------------------------------

/*
  ALTDATEN: Bei Scheinen, die schon vor heute verworfen wurden, ist der
  Zeitpunkt unbekannt. Er wird nicht geraten (etwa aus `updated_at`, das
  auch eine Umnummerierung der Baustelle setzt) — die Spalte bleibt leer.
  Für die Frist des Papierkorbs zählt ein solcher Schein ab der Einführung
  (06.11.2026): früher kann ihn niemand als „seit X Tagen“ gesehen haben.
*/
alter table public.work_sheets add column if not exists verworfen_am timestamptz;

comment on column public.work_sheets.verworfen_am is
  'Wann der Entwurf verworfen wurde (M01d); setzt nur die Datenbank. Leer bei vor dem 06.11.2026 verworfenen (Zeitpunkt unbekannt).';

create index if not exists work_sheets_papierkorb
  on public.work_sheets (company_id, verworfen_am desc) where status = 'Verworfen';

/*
  EIGENER TRIGGER, NACH DEN BEIDEN WÄCHTERN. `work_sheets_verwerfen` und
  `work_sheets_zustand` prüfen, dass sich beim Verwerfen und Zurückholen nur
  der Zustand (und der Name) ändert — an der Zeile, wie sie die App schickt.
  Erst danach setzt dieser hier den Zeitpunkt: so bleiben beide Wächter
  unverändert, und mitgeschickt werden kann er nicht (schickt die App ihn
  beim Verwerfen, lehnt `schein_verwerfen` ab; sonst überschreibt ihn dieser
  Trigger). Der Name sortiert ihn hinter `work_sheets_zustand`.

  Ohne Wechsel bleibt er, wie er ist — auch beim Umnummerieren eines
  verworfenen Scheins (`baustelle_umnummern`).
*/
create or replace function app.schein_verworfen_am() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if app.ist_dienst() then
    return new;
  end if;
  if tg_op = 'INSERT' or new.status <> 'Verworfen' then
    new.verworfen_am := null;
  elsif old.status = 'Verworfen' then
    new.verworfen_am := old.verworfen_am;
  else
    new.verworfen_am := now();
  end if;
  return new;
end;
$$;

revoke all on function app.schein_verworfen_am() from public, anon, authenticated;

drop trigger if exists work_sheets_zustand_zeit on public.work_sheets;
create trigger work_sheets_zustand_zeit
  before insert or update on public.work_sheets
  for each row execute function app.schein_verworfen_am();

-- ---------------------------------------------------------------------------
-- Die Frist je Betrieb
-- ---------------------------------------------------------------------------

/*
  Leer heißt: kein Hinweis. Schreiben darf sie, wer die übrigen
  Betriebseinstellungen schreibt — die Spitze (`companies_aendern`); eine
  engere Grenze wie bei den Modulen braucht es nicht, sie löscht ja nichts.
*/
alter table public.companies add column if not exists papierkorb_frist_tage integer;
alter table public.companies drop constraint if exists companies_papierkorb_frist;
alter table public.companies add constraint companies_papierkorb_frist
  check (papierkorb_frist_tage is null or papierkorb_frist_tage > 0);

comment on column public.companies.papierkorb_frist_tage is
  'Nach wie vielen Tagen die Startseite der Spitze auf Verworfenes im Papierkorb hinweist (M01d); leer = kein Hinweis. Löscht nichts.';

-- ---------------------------------------------------------------------------
-- Datenauskunft: wer verworfen hat, gehört der Person, nicht dem Kunden
-- ---------------------------------------------------------------------------

/*
  Gezielt eingefügt wie E50 und M01b; wiederholbar, und ohne Einfügestelle
  bricht die Migration ab.

  - Beim Kunden gehen Kennung und Name dessen, der verworfen hat, aus den
    Angeboten: das sind Angaben über einen Mitarbeiter (wie die
    Monteurkennung an den Scheinen derselben Auskunft).
  - Bei der Person steht als Bearbeiter die Anzahl der Angebote, die sie
    verworfen hat — der Inhalt gehört den Kunden.

  Die Löschung einer Person ändert nichts: ihr Konto bleibt deaktiviert
  stehen, solange Einträge sie nennen, und „wer verworfen hat“ ist wie
  „wer gemahnt hat“ eine Angabe am Beleg eines anderen. Die Löschung eines
  Kunden ebenso: ein verworfenes Angebot zählt zu „Angebote“ und hält den
  Kunden wie jedes andere, bis es endgültig gelöscht ist.
*/
do $migration$
declare quelle text; marke text;
begin
  quelle := pg_get_functiondef('public.person_auskunft(text,uuid,integer)'::regprocedure);
  if position('angebote_verworfen' in quelle) = 0 then
    marke := $m$select coalesce(jsonb_agg(to_jsonb(q) || jsonb_build_object('positionen', ($m$;
    if (length(quelle) - length(replace(quelle, marke, ''))) / length(marke) <> 1 then
      raise exception 'Personenauskunft: Einfügestelle Angebote fehlt oder ist nicht eindeutig';
    end if;
    quelle := replace(quelle, marke,
      $n$select coalesce(jsonb_agg(to_jsonb(q) - array['verworfen_von_uid', 'verworfen_von_name'] || jsonb_build_object('positionen', ($n$);

    marke := $m$where z.company_id = betrieb and z.erfasst_von = p_id),$m$;
    if (length(quelle) - length(replace(quelle, marke, ''))) / length(marke) <> 1 then
      raise exception 'Personenauskunft: Einfügestelle Bearbeiter fehlt oder ist nicht eindeutig';
    end if;
    quelle := replace(quelle, marke, marke || $eintrag$
      -- M01d: Angebote, die sie in den Papierkorb gelegt hat.
      'angebote_verworfen', (select count(*) from public.quotes q
        where q.company_id = betrieb and q.verworfen_von_uid = p_id),$eintrag$);
    execute quelle;
  end if;
end;
$migration$;
