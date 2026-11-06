/*
  DAS ÄNDERUNGSJOURNAL DER GESCHÄFTSOBJEKTE (M01b, U04, 06.11.2026)

  WAS FEHLTE. An Kunden, Baustellen, Angeboten, Rechnungen, Zahlungen,
  Wartungen und Benutzern stand höchstens, wann sie zuletzt geändert wurden
  (`updated_at`) — nicht von wem, nicht was vorher dastand und nicht, dass es
  ein gelöschtes Objekt überhaupt gab. Bei einer Rückfrage („wer hat die
  Telefonnummer geändert?“, „seit wann steht die Rechnung auf storniert?“,
  „wer hat die Zahlung gelöscht?“) wusste es niemand. Die Zeitbuchungen haben
  das seit E50; dieses Journal ist dieselbe Idee für die übrigen Akten.

  WAS SICH ÄNDERT.
  - `aenderungsjournal`: je Anlegen, Ändern und Löschen eines Objekts eine
    Zeile — wer (Kennung und Name zum Zeitpunkt), wann, und was: beim Ändern
    je geänderter Spalte alt und neu. Beim Anlegen und Löschen steht nur DASS
    (das Objekt zeigt seinen Stand selbst, und ein gelöschtes nennt seine
    Bezeichnung); anders als bei den Zeitbuchungen ist hier der ganze Stand
    keine Arbeitszeitaufzeichnung, und eine Kopie jedes Kunden mit Anschrift
    und Telefon in einer zweiten Tabelle wäre Datenhaltung ohne Zweck.
  - Geschrieben ausschließlich von den Triggern an den sieben Tabellen. Es
    gibt kein Recht und keine Regel zum Schreiben: das Journal ist nur dann
    etwas wert, wenn es sich nicht nachträglich glätten lässt.
  - Lesen: nur im eigenen Betrieb, nie der Mitarbeiter, und je Objekt nur, wer
    das Objekt selbst sieht (die Regel der Objekttabelle gilt dabei für den
    Leser). Die Stammdaten der Belegschaft sieht nur die Spitze. Ein
    GELÖSCHTES Objekt sieht damit nur die Spitze — es gibt keine Zeile mehr,
    an der die übrigen Rollen es sehen könnten.
  - Der Support sieht es nicht (wie E50): die Regel kennt nur den eigenen
    Betrieb, nicht `app.supportbetrieb()`.
  - Der Dienstschlüssel schreibt keine Zeilen (wie E50): mit ihm laufen nur
    der Rücklauf einer Sicherung (der das Journal aus der Sicherung
    mitbringt; eigene Zeilen verdoppelten es), das Löschen eines Betriebs und
    die Prüfungen.
  - Ebenso nichts, was ohne angemeldete Person geschieht — Arbeiten an der
    Datenbank selbst (Migrationen, die Daten nachziehen, Zeitpläne,
    Prüf- und Testbestandsskripte als `postgres`). Es gibt dort niemanden,
    dem die Zeile zuzuschreiben wäre, und eine Migration, die tausend Kunden
    nachzieht, schriebe sonst tausend Einträge ohne Urheber in die Akten. Das
    Journal hält fest, was über die App geändert wird; wer die Datenbank
    selbst bedient, steht ohnehin über ihm (er könnte es auch leeren).

  VORHANDENE VERLÄUFE WERDEN MITGELESEN, NICHT KOPIERT: Mahnungen,
  Wartungsausführungen, Kontoumstellungen und Anpassungen des
  Urlaubsanspruchs stehen schon je für sich fest. Die Sicht `objekt_verlauf`
  legt sie mit dem Journal zusammen, mit den Regeln ihrer Quellen.

  BESTEHENDE OBJEKTE haben kein Journal vor heute (Altdaten: was vorher
  geändert wurde, weiß niemand mehr). Ihre erste Änderung trägt den Stand
  davor als „alt“; die Ansicht sagt, seit wann aufgezeichnet wird.

  NICHT PROTOKOLLIERT (je Tabelle im Trigger genannt, Begründung dort):
  Kennungen, Zeitstempel, was die Datenbank selbst aus anderen Spalten rechnet
  und was ein vorhandener Verlauf schon festhält. Die POSITIONEN von Angeboten
  und Rechnungen auch nicht: das Speichern ersetzt sie als Ganzes (löschen und
  neu anlegen), ein Journal je Zeile zeigte bei jedem Speichern alle als
  gelöscht und neu, ohne dass sich etwas geändert hätte; was eine Änderung der
  Positionen bewirkt, steht in den Summen des Kopfes, und die sind
  protokolliert.
*/

create table if not exists public.aenderungsjournal (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.companies(id),
  objektart text not null,
  objekt_id uuid not null,
  bezug_id uuid,
  kunde_id uuid,
  art text not null,
  aenderungen jsonb not null default '{}'::jsonb,
  bezeichnung text,
  von_uid uuid,
  von_name text,
  am timestamptz not null default clock_timestamp(),
  constraint aenderungsjournal_objektart check (objektart in ('kunde', 'baustelle', 'angebot', 'rechnung', 'zahlung', 'wartung', 'benutzer')),
  constraint aenderungsjournal_art check (art in ('angelegt', 'geaendert', 'geloescht'))
);

/*
  KEINE FREMDSCHLÜSSEL AUF OBJEKT, KUNDE UND PERSON (wie E50). Das Journal
  eines gelöschten Objekts bleibt, und ein Journal soll nichts festhalten:
  hinge es am Objekt, ließe sich keines mehr löschen. Die Kennungen kommen
  ohnehin nur aus den Triggern, also aus einer gültigen Zeile.

  `bezug_id`: bei einer Zahlung die Rechnung — im Verlauf der Rechnung stehen
  ihre Zahlungen, auch gelöschte.

  `kunde_id`: der Kunde, zu dem das Objekt gehört. Gelesen wird darüber
  nichts; sie ist da, damit das Löschen eines Kunden (DSGVO Art. 17) auch die
  Werte in den Journalzeilen seiner Objekte findet — eine Zeile eines längst
  gelöschten Angebots trägt sonst keinen Hinweis mehr, wem es galt.

  KEINE ZÄHLNUMMER ALS SCHLÜSSEL (wie E50): der Rücklauf spielt die Zeilen
  mit ihrer Kennung zurück. Die Reihenfolge trägt `am` — die Uhrzeit des
  Schreibens, nicht der Transaktion, damit Anlegen und Ändern in einem Zug
  nacheinander stehen.
*/
create index if not exists aenderungsjournal_objekt on public.aenderungsjournal (company_id, objektart, objekt_id, am desc);
create index if not exists aenderungsjournal_bezug on public.aenderungsjournal (company_id, bezug_id, am desc) where bezug_id is not null;
create index if not exists aenderungsjournal_von on public.aenderungsjournal (company_id, von_uid);
create index if not exists aenderungsjournal_kunde on public.aenderungsjournal (company_id, kunde_id) where kunde_id is not null;

comment on table public.aenderungsjournal is
  'Änderungsjournal der Geschäftsobjekte (M01b): Anlegen, Ändern, Löschen — wer, wann, was. Nur von Triggern geschrieben; lesen, wer das Objekt sieht (Benutzer: nur die Spitze).';

alter table public.aenderungsjournal enable row level security;
revoke all on public.aenderungsjournal from public, anon, authenticated;
grant select on public.aenderungsjournal to authenticated;

drop policy if exists aenderungsjournal_lesen on public.aenderungsjournal;
create policy aenderungsjournal_lesen on public.aenderungsjournal for select
  using (
    company_id = (select app.lesebetrieb())
    and (select app.rolle()) is distinct from 'Mitarbeiter'
    and (
      (select app.ist_spitze())
      or case objektart
           when 'kunde' then exists (select 1 from public.customers t where t.id = aenderungsjournal.objekt_id)
           when 'baustelle' then exists (select 1 from public.projects t where t.id = aenderungsjournal.objekt_id)
           when 'angebot' then exists (select 1 from public.quotes t where t.id = aenderungsjournal.objekt_id)
           when 'rechnung' then exists (select 1 from public.invoices t where t.id = aenderungsjournal.objekt_id)
           -- Eine Zahlung über ihre Rechnung und mit der Regel der Zahlungen
           -- (`zahlungen_lesen`: Buchhaltung und Spitze) — nicht über die Zeile
           -- der Zahlung selbst: sonst sähe die Buchhaltung eine GELÖSCHTE
           -- Zahlung im Verlauf ihrer Rechnung nicht, und genau die ist der
           -- häufigste Grund, dort nachzusehen.
           when 'zahlung' then (select app.ist_buch_oder_spitze())
             and exists (select 1 from public.invoices t where t.id = aenderungsjournal.bezug_id)
           when 'wartung' then exists (select 1 from public.wartungen t where t.id = aenderungsjournal.objekt_id)
           -- Benutzer: Lohnstammdaten, nur die Spitze (oben).
           else false
         end
    )
  );

/*
  DER RIEGEL GEGEN DEN SUPPORT ist hier `support_schreibt_nicht` und nicht
  `support_niemals` wie bei E50. Der Grund ist die Stufe „mitarbeiten“: mit
  ihr darf der Support Kunden, Baustellen, Angebote, Rechnungen und Wartungen
  ändern (`supportzugang.test.ts`), und jede solche Änderung schreibt — im
  Namen des Supports — eine Zeile hierher. `support_niemals` ließe genau
  diese Zeile scheitern und damit die Änderung selbst. Schreiben kann der
  Support hier trotzdem nichts von sich aus: es gibt kein Recht dazu, und der
  Riegel hält ihn auch dann auf, wenn eines Tages eines dazukäme — außer mit
  einer Schreibfreigabe für genau diesen Betrieb, mit der er die Objekte
  ohnehin ändern darf.
*/
drop trigger if exists aenderungsjournal_kein_support_schreiben on public.aenderungsjournal;
create trigger aenderungsjournal_kein_support_schreiben
  before insert or update or delete on public.aenderungsjournal
  for each row execute function app.support_schreibt_nicht();

-- ---------------------------------------------------------------------------
-- Datenschutz: was mit einem Kunden gelöscht wird, verschwindet auch hier
-- ---------------------------------------------------------------------------

/*
  DSGVO ART. 17. Wird ein Kunde gelöscht, geht er aus dem Bestand — sein
  Name, seine Anschrift und seine Kontaktdaten dürften dann nicht in den
  Spalten „alt“ und „neu“ des Journals weiterleben. Wer wann was geändert hat,
  bleibt (Rechenschaft, Art. 5 Abs. 2); die Werte werden zu
  `{"entfernt": true}`.

  `p_ganz`: der Kunde geht ganz (gelöscht). Dann verlieren ALLE Zeilen mit
  seiner Kennung ihre Werte — die des Kunden und die seiner Objekte; ein
  Kunde lässt sich nur löschen, wenn keine Baustelle, kein Angebot, keine
  Rechnung und keine Wartung mehr auf ihn zeigt (Fremdschlüssel), es sind
  also nur noch Zeilen gelöschter Objekte. Die BEZEICHNUNG des Kunden (sein
  Name) geht mit: ein Name ohne Kunden dahinter ist genau das Personendatum,
  das die Löschung entfernen soll; die Kennung bleibt und genügt, um die
  Löschung selbst zu belegen. Ebenso die Bezeichnung einer Wartung (die
  Anlage, Freitext beim Kunden). Belegnummern (Angebot, Rechnung, Baustelle)
  und Zahlungen bleiben stehen: sie sind keine Angaben über den Kunden.

  Sonst (`person_loeschen` behält den Kunden, weil Belege aufbewahrt werden
  müssen): genau das, was die Löschung auch am Bestand entfernt —
  Ansprechpartner, Telefon, E-Mail und Notizen am Kunden, Ansprechpartner
  und Telefon an seinen Baustellen, und seine Wartungen ganz.
*/
create or replace function app.journal_kunde_vergessen(p_betrieb text, p_kunde uuid, p_ganz boolean) returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  am_kunden constant text[] := array['contact_name', 'contact_phone', 'email', 'notes'];
  an_baustellen constant text[] := array['contact_name', 'contact_phone'];
  weg constant jsonb := '{"entfernt": true}'::jsonb;
begin
  if p_ganz then
    update public.aenderungsjournal j
       set aenderungen = (select coalesce(jsonb_object_agg(e.key, weg), '{}'::jsonb) from jsonb_each(j.aenderungen) e),
           bezeichnung = case when j.objektart in ('kunde', 'wartung') then null else j.bezeichnung end
     where j.company_id = p_betrieb and j.kunde_id = p_kunde;
    return;
  end if;

  update public.aenderungsjournal j
     set aenderungen = (select jsonb_object_agg(e.key, case when e.key = any(am_kunden) then weg else e.value end)
                          from jsonb_each(j.aenderungen) e)
   where j.company_id = p_betrieb and j.objektart = 'kunde' and j.objekt_id = p_kunde
     and j.aenderungen ?| am_kunden;

  update public.aenderungsjournal j
     set aenderungen = (select jsonb_object_agg(e.key, case when e.key = any(an_baustellen) then weg else e.value end)
                          from jsonb_each(j.aenderungen) e)
   where j.company_id = p_betrieb and j.objektart = 'baustelle' and j.kunde_id = p_kunde
     and j.aenderungen ?| an_baustellen;

  update public.aenderungsjournal j
     set aenderungen = (select coalesce(jsonb_object_agg(e.key, weg), '{}'::jsonb) from jsonb_each(j.aenderungen) e),
         bezeichnung = null
   where j.company_id = p_betrieb and j.objektart = 'wartung' and j.kunde_id = p_kunde;
end;
$$;

revoke all on function app.journal_kunde_vergessen(text, uuid, boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Der Schreiber
-- ---------------------------------------------------------------------------

/*
  EIN SCHREIBER FÜR SIEBEN TABELLEN. Was je Tabelle verschieden ist, kommt
  als Argument des Triggers: `tg_argv[0]` die Objektart, `tg_argv[1]` die
  Spalten ohne Protokoll. So steht die Ausnahmeliste dort, wo die Tabelle
  angebunden wird, und eine Prüfung kann sie aus `pg_trigger` lesen und mit
  der Textliste der App vergleichen — eine neue Spalte fällt dort auf, statt
  still zu fehlen.

  `security definer`, weil niemand sonst in das Journal schreiben darf;
  `after`, damit er sieht, was die übrigen Trigger aus der Zeile gemacht
  haben — protokolliert wird, was wirklich gespeichert ist.

  LEER BLEIBT LEER. Die Formulare schicken ein leeres Feld als „“, wo die
  Datenbank `null` hatte (und umgekehrt); eine leere Liste statt keiner. Für
  den Menschen hat sich dabei nichts geändert, also steht es nicht im Journal
  — sonst schriebe jedes Speichern ohne Änderung eine Zeile.
*/
create or replace function app.journal_protokollieren() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  objektart constant text := tg_argv[0];
  ohne constant text[] := tg_argv[1]::text[];
  leer constant jsonb[] := array['null'::jsonb, '""'::jsonb, '[]'::jsonb, '{}'::jsonb];
  stand jsonb;
  alt jsonb;
  neu jsonb;
  spalte text;
  unterschied jsonb := '{}'::jsonb;
  art text;
  inhalt jsonb := '{}'::jsonb;
  bezug uuid;
  kunde uuid;
  bezeichnung text;
  wer text;
begin
  if tg_op = 'DELETE' then
    stand := to_jsonb(old);
  else
    stand := to_jsonb(new);
  end if;

  -- Dienstschlüssel und Arbeiten ohne Anmeldung schreiben nicht (siehe oben).
  -- Eine Zeile ohne Betrieb gehört keinem Betrieb — und damit in kein Journal.
  if not app.ist_dienst() and auth.uid() is not null and stand ->> 'company_id' is not null then
    if tg_op = 'INSERT' then
      art := 'angelegt';
    elsif tg_op = 'DELETE' then
      art := 'geloescht';
    else
      alt := to_jsonb(old);
      neu := stand;
      for spalte in select jsonb_object_keys(neu) loop
        if spalte = any(ohne)
           or alt -> spalte is not distinct from neu -> spalte
           or ((alt -> spalte) = any(leer) and (neu -> spalte) = any(leer)) then
          continue;
        end if;
        unterschied := unterschied || jsonb_build_object(spalte, jsonb_build_object('alt', alt -> spalte, 'neu', neu -> spalte));
      end loop;
      art := 'geaendert';
      inhalt := unterschied;
    end if;

    if art <> 'geaendert' or unterschied <> '{}'::jsonb then
      bezug := case when objektart = 'zahlung' then (stand ->> 'invoice_id')::uuid end;
      kunde := case objektart
                 when 'kunde' then (stand ->> 'id')::uuid
                 when 'benutzer' then null
                 when 'zahlung' then (select i.customer_id from public.invoices i where i.id = (stand ->> 'invoice_id')::uuid)
                 else (stand ->> 'customer_id')::uuid
               end;
      -- Woran ein Mensch das Objekt erkennt, auch wenn es nicht mehr da ist.
      bezeichnung := case objektart
        when 'kunde' then stand ->> 'name'
        when 'baustelle' then stand ->> 'project_number'
        when 'angebot' then stand ->> 'quote_number'
        when 'rechnung' then stand ->> 'invoice_number'
        when 'zahlung' then
          -- Wie `euro()` der App (de-AT): geschütztes Leerzeichen als Tausendertrennung, Komma vor den Cent.
          '€ ' || translate(to_char((stand ->> 'betrag')::numeric, 'FM999,999,999,990.00'), ',.', chr(160) || ',')
          || ' vom ' || to_char((stand ->> 'datum')::date, 'DD.MM.YYYY')
          || coalesce(' · ' || nullif(btrim(stand ->> 'art'), ''), '')
        when 'wartung' then stand ->> 'anlage'
        when 'benutzer' then stand ->> 'name'
      end;
      -- Wer im Supporteinblick ändert, steht nicht in der Belegschaft — dann sein Plattformkonto.
      wer := coalesce(
        (select u.name from public.users u where u.id = auth.uid()),
        (select 'Support (' || coalesce(nullif(btrim(p.name), ''), 'Senklot') || ')'
           from public.platform_admins p where p.id = auth.uid()));

      insert into public.aenderungsjournal
        (company_id, objektart, objekt_id, bezug_id, kunde_id, art, aenderungen, bezeichnung, von_uid, von_name)
      values
        (stand ->> 'company_id', objektart, (stand ->> 'id')::uuid, bezug, kunde, art, inhalt, bezeichnung, auth.uid(), wer);
    end if;
  end if;

  -- Auch mit dem Dienstschlüssel: ein gelöschter Kunde ist gelöscht, egal auf welchem Weg.
  if tg_op = 'DELETE' and objektart = 'kunde' then
    perform app.journal_kunde_vergessen(old.company_id, old.id, true);
  end if;
  return null;
end;
$$;

revoke all on function app.journal_protokollieren() from public, anon, authenticated;

/*
  DIE SIEBEN TABELLEN UND WAS JE OHNE PROTOKOLL BLEIBT.

  Überall: `id`, `company_id` (stehen in der Zeile des Journals),
  `created_at`, `updated_at` (stehen als `am`).

  Kunden: `adresse_pruefen`, `angaben_pruefen` — Prüfvermerke, die die
  Datenbank aus Anschrift, PLZ und E-Mail rechnet (`kunde_adresse`,
  `kunde_angaben_pruefen`); was sich geändert hat, steht in diesen Spalten.

  Baustellen: `customer_id` — die Kennung; der Name steht in `customer_name`.

  Angebote: `aussteller_stand` (Stand der Firmendaten beim Ausstellen, setzt
  die Datenbank), `customer_id`, `project_id` (Kennungen; Name und Nummer
  stehen daneben, die Kennung der Baustelle rechnet `baustelle_aufloesen`
  aus der Nummer), `vorgaenger_id` (die Fassung davor, bleibt fest),
  `versendet_am`, `angenommen_am`, `abgelehnt_am` (setzt `angebot_status_zeit`
  beim Wechsel des Stands; der Wechsel selbst steht mit Zeit im Journal).

  Rechnungen: `aussteller_stand`, `storno_aussteller_stand`, `project_id`,
  `customer_id` (wie oben), `vorrechnungen` (die Abzüge der Anzahlungen, beim
  Ausstellen fest), `bezahlt_betrag`, `skonto_betrag` (die Summe der
  Zahlungen, gerechnet von `zahlstand_setzen`; jede Zahlung steht selbst im
  Verlauf der Rechnung), `mahnstufe`, `gemahnt_am`, `mahnfrist`,
  `mahnspesen` (schreibt nur `mahnung_festhalten`, zugleich mit der Mahnung,
  die genau diese Werte trägt und mitgelesen wird — im Journal stünde jede
  Mahnung sonst zweimal).

  Zahlungen: `erfasst_von`, `erfasst_von_name` (das „wer“ der Zeile),
  `invoice_id` (steht als `bezug_id`).

  Wartungen: `customer_id` (Kennung; der Name steht in `customer_name`).
  `faellig_am` und `offene_baustelle` WERDEN protokolliert: den nächsten
  Termin legt auch ein Mensch fest („für einen vereinbarten Ausweichtag
  änderbar“), und die eingeplante Baustelle setzt „Baustelle anlegen“ bzw.
  „Erledigt“ — beides Handlungen, kein Rechenergebnis.

  Benutzer: `einstufung_verlauf` (führt `einstufung_verlauf_fuehren` selbst
  als eigenen Verlauf).
*/
drop trigger if exists customers_journal on public.customers;
create trigger customers_journal
  after insert or update or delete on public.customers
  for each row execute function app.journal_protokollieren(
    'kunde', '{id,company_id,created_at,updated_at,adresse_pruefen,angaben_pruefen}');

drop trigger if exists projects_journal on public.projects;
create trigger projects_journal
  after insert or update or delete on public.projects
  for each row execute function app.journal_protokollieren(
    'baustelle', '{id,company_id,created_at,updated_at,customer_id}');

drop trigger if exists quotes_journal on public.quotes;
create trigger quotes_journal
  after insert or update or delete on public.quotes
  for each row execute function app.journal_protokollieren(
    'angebot', '{id,company_id,created_at,updated_at,aussteller_stand,customer_id,project_id,vorgaenger_id,versendet_am,angenommen_am,abgelehnt_am}');

drop trigger if exists invoices_journal on public.invoices;
create trigger invoices_journal
  after insert or update or delete on public.invoices
  for each row execute function app.journal_protokollieren(
    'rechnung', '{id,company_id,created_at,updated_at,aussteller_stand,storno_aussteller_stand,project_id,customer_id,vorrechnungen,bezahlt_betrag,skonto_betrag,mahnstufe,gemahnt_am,mahnfrist,mahnspesen}');

/*
  `zahlungen_journal` und nicht `zahlungseingaenge_journal`: Trigger feuern in
  der Reihenfolge ihrer Namen, und so steht die Zahlung VOR dem, was sie an
  der Rechnung bewirkt (`zahlungen_wirken` → Stand „Bezahlt“).
*/
drop trigger if exists zahlungen_journal on public.zahlungseingaenge;
create trigger zahlungen_journal
  after insert or update or delete on public.zahlungseingaenge
  for each row execute function app.journal_protokollieren(
    'zahlung', '{id,company_id,created_at,updated_at,erfasst_von,erfasst_von_name,invoice_id}');

drop trigger if exists wartungen_journal on public.wartungen;
create trigger wartungen_journal
  after insert or update or delete on public.wartungen
  for each row execute function app.journal_protokollieren(
    'wartung', '{id,company_id,created_at,updated_at,customer_id}');

drop trigger if exists users_journal on public.users;
create trigger users_journal
  after insert or update or delete on public.users
  for each row execute function app.journal_protokollieren(
    'benutzer', '{id,company_id,created_at,updated_at,einstufung_verlauf}');

-- ---------------------------------------------------------------------------
-- Die Lesesicht: Journal und vorhandene Verläufe zusammen
-- ---------------------------------------------------------------------------

/*
  MIT DEN RECHTEN DES LESERS (`security_invoker`): jeder Teil liest mit der
  Regel seiner Quelle. Die Sicht zeigt also niemandem mehr als die Quellen —
  nur an einer Stelle. Die Kennung ist Text, weil die Kontoumstellungen eine
  Zählnummer tragen; eine entfernte Anpassung des Urlaubsanspruchs steht als
  zweiter Eintrag derselben Zeile da (wann sie galt, wann sie ging) und trägt
  deshalb eine eigene Kennung.
*/
create or replace view public.objekt_verlauf with (security_invoker = true) as
  select 'journal'::text as quelle, j.id::text as id, j.company_id, j.objektart, j.objekt_id, j.bezug_id,
         j.art, j.aenderungen, j.bezeichnung, j.von_name, j.am
    from public.aenderungsjournal j
  union all
  select 'mahnung', m.id::text, m.company_id, 'rechnung', m.invoice_id, null::uuid,
         'gemahnt', jsonb_build_object('stufe', m.stufe, 'datum', m.datum, 'frist', m.frist, 'spesen', m.spesen),
         null::text, m.gemahnt_von_name, m.angelegt_am
    from public.mahnungen m
  union all
  select 'wartung_ausfuehrung', a.id::text, a.company_id, 'wartung', a.wartung_id, null::uuid,
         'ausgefuehrt', jsonb_build_object('am', a.am, 'baustelle', a.baustelle),
         null::text, null::text, a.created_at
    from public.wartung_ausfuehrungen a
  union all
  select 'konto_umstellung', k.id::text, k.company_id, 'benutzer', k.user_id, null::uuid,
         'konto_umgestellt', jsonb_build_object('nach', k.nach, 'grund', k.grund),
         null::text, k.durch_name, k.am
    from public.konto_umstellungen k
  union all
  select 'urlaubsanspruch', u.id::text, u.company_id, 'benutzer', u.user_id, null::uuid,
         'urlaubsanspruch_angepasst', jsonb_build_object('urlaubsjahr', u.urlaubsjahr, 'tage', u.tage, 'grund', u.grund),
         null::text, u.angelegt_von_name, u.created_at
    from public.urlaubsanspruch_anpassungen u
  union all
  select 'urlaubsanspruch', u.id::text || ':entfernt', u.company_id, 'benutzer', u.user_id, null::uuid,
         'urlaubsanspruch_entfernt', jsonb_build_object('urlaubsjahr', u.urlaubsjahr, 'tage', u.tage, 'grund', u.entfernt_grund),
         null::text, u.entfernt_von_name, u.entfernt_am
    from public.urlaubsanspruch_anpassungen u
   where u.entfernt_am is not null;

comment on view public.objekt_verlauf is
  'Verlauf eines Geschäftsobjekts (M01b): Änderungsjournal und vorhandene Verläufe (Mahnungen, Wartungsausführungen, Kontoumstellungen, Urlaubsanpassungen) — mit den Regeln der Quellen.';

revoke all on public.objekt_verlauf from public, anon, authenticated;
grant select on public.objekt_verlauf to authenticated;

-- ---------------------------------------------------------------------------
-- Datenauskunft: Stammdaten-Verlauf, als Bearbeiter die Anzahl, beim Kunden
-- sein Journal
-- ---------------------------------------------------------------------------

/*
  Gezielt eingefügt wie E50 (`20261105100000_zeitbuchung_verlauf.sql`);
  wiederholbar, und ohne Einfügestelle bricht die Migration ab.

  Beim Kunden ohne den Namen dessen, der geändert hat, und ohne die Team-
  und Leitungsspalten der Baustellen: das sind Angaben über Mitarbeiter, nicht
  über den Kunden (wie bei Baustellen und Terminen in derselben Auskunft).
*/
do $migration$
declare quelle text; marke text;
begin
  quelle := pg_get_functiondef('public.person_auskunft(text,uuid,integer)'::regprocedure);
  if position('aenderungsjournal' in quelle) = 0 then
    marke := $m$from public.zeitbuchung_verlauf v where v.company_id = betrieb and v.user_id = p_id),$m$;
    if position(marke in quelle) = 0 then raise exception 'Personenauskunft: Einfügestelle Verlauf fehlt'; end if;
    quelle := replace(quelle, marke, marke || $eintrag$
      -- M01b: der Verlauf der eigenen Stammdaten, laut Änderungsjournal.
      'stammdaten_verlauf', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'art', j.art, 'aenderungen', j.aenderungen, 'von', j.von_name, 'am', j.am)
                 order by j.am, j.id), '[]'::jsonb)
          from public.aenderungsjournal j
         where j.company_id = betrieb and j.objektart = 'benutzer' and j.objekt_id = p_id),$eintrag$);

    marke := $m$where v.company_id = betrieb and v.von_uid = p_id and v.user_id <> p_id),$m$;
    if position(marke in quelle) = 0 then raise exception 'Personenauskunft: Einfügestelle Bearbeiter fehlt'; end if;
    quelle := replace(quelle, marke, marke || $eintrag$
      -- M01b: Änderungen an Kunden, Baustellen, Belegen, Wartungen und an anderen Personen.
      'aenderungsjournal_eintraege', (select count(*) from public.aenderungsjournal j
        where j.company_id = betrieb and j.von_uid = p_id
          and not (j.objektart = 'benutzer' and j.objekt_id = p_id)),$eintrag$);

    marke := $m$from public.uid_pruefungen u where u.company_id = betrieb and u.customer_id = p_id),$m$;
    if position(marke in quelle) = 0 then raise exception 'Personenauskunft: Einfügestelle Kunde fehlt'; end if;
    quelle := replace(quelle, marke, marke || $eintrag$
      -- M01b: was an ihm und seinen Objekten geändert wurde — ohne die Namen der Bearbeiter.
      'aenderungsjournal', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'objekt', j.objektart, 'bezeichnung', j.bezeichnung, 'art', j.art,
                 'aenderungen', j.aenderungen - array['assigned_employees', 'project_managers'], 'am', j.am)
                 order by j.am, j.id), '[]'::jsonb)
          from public.aenderungsjournal j
         where j.company_id = betrieb and j.kunde_id = p_id),$eintrag$);
    execute quelle;
  end if;
end;
$migration$;

-- ---------------------------------------------------------------------------
-- Löschung: der Stammdaten-Verlauf bleibt aufbewahrt; beim Kunden gehen die
-- Werte, die die Löschung auch am Bestand entfernt
-- ---------------------------------------------------------------------------

/*
  Bei einer Person der Belegschaft: Wochenstunden, Urlaubsanspruch,
  Einstufung, Eintritt — der Verlauf der Stammdaten ist Lohnunterlage und
  bleibt wie die Buchungen (§ 132 BAO). Beim Kunden kommt KEIN Eintrag in
  „aufbewahren“: an dieser Liste hängt, ob der Kunde ganz gehen kann
  (`ganz`), und das Journal selbst darf das nicht verhindern — es verliert
  stattdessen die Werte (`journal_kunde_vergessen`).
*/
do $migration$
declare quelle text; marke text;
begin
  quelle := pg_get_functiondef('public.person_loeschen(text,uuid,boolean)'::regprocedure);
  if position('Änderungsjournal der Stammdaten' in quelle) = 0 then
    marke := $m$from public.zeitbuchung_verlauf v where v.company_id = betrieb and v.user_id = p_id
        union all$m$;
    if position(marke in quelle) = 0 then raise exception 'Löschung: Einfügestelle Verlauf fehlt'; end if;
    quelle := replace(quelle, marke, marke || $eintrag$
        -- M01b: der Verlauf der Stammdaten ist Lohnunterlage wie die Buchungen.
        select jsonb_build_object('was', 'Änderungsjournal der Stammdaten', 'anzahl', count(*),
                                  'bis', max(app.aufbewahrt_bis((j.am at time zone 'Europe/Vienna')::date)),
                                  'grund', rechtsgrund)
          from public.aenderungsjournal j
         where j.company_id = betrieb and j.objektart = 'benutzer' and j.objekt_id = p_id
        union all$eintrag$);

    marke := $m$and num_nonnulls(b.contact_name, b.contact_phone) > 0;$m$;
    if (length(quelle) - length(replace(quelle, marke, ''))) / length(marke) <> 1 then
      raise exception 'Löschung: Einfügestelle Kontaktdaten fehlt oder ist nicht eindeutig';
    end if;
    quelle := replace(quelle, marke, marke || $eintrag$
        -- M01b: dieselben Werte auch im Änderungsjournal (geht er ganz, tut es der Trigger).
        perform app.journal_kunde_vergessen(betrieb, p_id, false);$eintrag$);
    execute quelle;
  end if;
end;
$migration$;
