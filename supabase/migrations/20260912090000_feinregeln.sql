-- Die Regeln, die beim Portieren der 155 Emulator-Pruefungen aufgefallen sind.
--
-- Stufe 1 hat die groben Zustaendigkeiten gesetzt: wer darf lesen, wer darf
-- anlegen. firestore.rules kann aber mehr, und zwar an genau den Stellen, an
-- denen es im Betrieb wehtut — wer die MARGE sieht, wer ueber Urlaub
-- entscheidet, wer einen Administrator ernennt. Das wird hier nachgezogen.

-- ---------------------------------------------------------------------------
-- 1. Einen Administrator ernennt nur ein Administrator
-- ---------------------------------------------------------------------------

/*
  Die Geschaeftsfuehrung verwaltet Benutzer — aber nicht die Administration.
  Sonst koennte sie sich selbst befoerdern, und die Rolle, die alles darf,
  waere nur eine Formalie entfernt.

  Beide Seiten zaehlen: wer einen Administrator ANLEGT, und wer einen
  bestehenden aendert oder loescht.
*/
create or replace function app.adminrolle_geschuetzt() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.role = 'Administrator' and not app.hat_rolle(array['Administrator']) then
      raise exception 'Einen Administrator entfernt nur ein Administrator'
        using errcode = '42501';
    end if;
    return old;
  end if;

  if (new.role = 'Administrator' or (tg_op = 'UPDATE' and old.role = 'Administrator'))
     and not app.hat_rolle(array['Administrator']) then
    raise exception 'Die Rolle Administrator vergibt und ändert nur ein Administrator'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger users_adminrolle
  before insert or update or delete on users
  for each row execute function app.adminrolle_geschuetzt();

-- ---------------------------------------------------------------------------
-- 2. Module schaltet nur die Administration
-- ---------------------------------------------------------------------------

/*
  `modules` entscheidet, welche Bereiche der App es ueberhaupt gibt. Wer sich
  selbst etwas freischalten kann, hat die Rechteverwaltung umgangen — deshalb
  ist das die einzige Einstellung, an die auch die Geschaeftsfuehrung nicht
  heranreicht.

  Und `vacation_approvers` legt fest, wer ueber Urlaub entscheidet. Das gehoert
  der Geschaeftsfuehrung, nicht der Projektleitung.
*/
create or replace function app.firmeneinstellungen_geschuetzt() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if new.modules is distinct from old.modules
     and not app.hat_rolle(array['Administrator']) then
    raise exception 'Module schaltet nur die Administration' using errcode = '42501';
  end if;
  if new.vacation_approvers is distinct from old.vacation_approvers
     and not app.hat_rolle(array['Geschäftsführung', 'Administrator']) then
    raise exception 'Die Genehmigenden legt nur die Geschäftsführung fest'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger companies_einstellungen before update on companies
  for each row execute function app.firmeneinstellungen_geschuetzt();

-- ---------------------------------------------------------------------------
-- 3. Urlaub — wer entscheidet, ist einstellbar
-- ---------------------------------------------------------------------------

/*
  OHNE FESTLEGUNG entscheidet die Buchhaltung, wie es immer war. MIT
  Festlegung entscheidet, wer auf der Liste steht — auch die Verwaltung, und
  die Buchhaltung dann nicht mehr, wenn sie nicht daraufsteht.

  Die Geschaeftsfuehrung entscheidet IMMER. Ein Betrieb, der sich selbst
  aussperrt, weil jemand eine Liste falsch gepflegt hat, waere ein schlechter
  Tausch fuer etwas Sauberkeit im Modell.

  Ersetzt den groberen Trigger aus Stufe 1.
*/
create or replace function app.darf_urlaub_entscheiden(betrieb text) returns boolean
  language sql stable
  set search_path = ''
as $$
  select app.hat_rolle(array['Geschäftsführung', 'Administrator'])
      or exists (
           select 1 from public.companies c
            where c.id = betrieb
              and coalesce(array_length(c.vacation_approvers, 1), 0) = 0
              and app.ist_buch_oder_spitze())
      or exists (
           select 1 from public.companies c
            where c.id = betrieb
              and auth.uid() = any(c.vacation_approvers))
$$;

create or replace function app.urlaub_entscheidung_geschuetzt() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  -- Zurueckziehen darf der Antragsteller selbst, solange nicht entschieden ist.
  if new.status = 'Storniert' and old.user_id = auth.uid() and old.status = 'Beantragt' then
    return new;
  end if;

  if new.status is distinct from old.status
     and new.status in ('Genehmigt', 'Abgelehnt')
     and not app.darf_urlaub_entscheiden(new.company_id) then
    raise exception 'Über diesen Urlaubsantrag entscheidet jemand anderer'
      using errcode = '42501';
  end if;

  -- Ein entschiedener Antrag ist zu — auch fuer den Antragsteller.
  if old.status in ('Genehmigt', 'Abgelehnt')
     and not app.darf_urlaub_entscheiden(new.company_id) then
    raise exception 'Der Antrag ist bereits entschieden' using errcode = '42501';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Material — Bestand bewegt jeder, die Marge sieht nur die Spitze
-- ---------------------------------------------------------------------------

/*
  DREI STUFEN, UND DIE MITTLERE IST DIE INTERESSANTE.

    Bestand (`stock`)      — bewegt jeder: der Monteur holt ab und gibt zurueck.
    Katalog (Name, Einheit,
    Verkaufspreis, Nummer) — pflegt die Verwaltung oder die Fuehrung.
    Einkaufspreis          — setzt nur die Geschaeftsfuehrung.

  Der Einkaufspreis ist die MARGE. Wer ihn neben dem Verkaufspreis sieht,
  kennt den Aufschlag des Betriebs; das ist nichts, was die Verwaltung oder
  die Projektleitung im Alltag braucht.

  Der Trigger prueft feldweise. „Mitschmuggeln" — den Preis neben einer
  erlaubten Bestandsbuchung mitschicken — ist genau der Fall, den eine
  Richtlinie nicht faengt und dieser Trigger schon.
*/
create or replace function app.materialfelder_geschuetzt() returns trigger
  language plpgsql
  set search_path = ''
as $$
declare
  pflegt boolean := app.hat_rolle(array['Verwaltung']) or app.ist_fuehrung();
  spitze boolean := app.hat_rolle(array['Geschäftsführung', 'Administrator']);
begin
  if tg_op = 'INSERT' then
    if new.einkaufspreis is not null and not spitze then
      raise exception 'Den Einkaufspreis setzt nur die Geschäftsführung'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if new.einkaufspreis is distinct from old.einkaufspreis and not spitze then
    raise exception 'Den Einkaufspreis ändert nur die Geschäftsführung'
      using errcode = '42501';
  end if;

  if (new.name is distinct from old.name
      or new.category is distinct from old.category
      or new.article_number is distinct from old.article_number
      or new.unit is distinct from old.unit
      or new.verkaufspreis is distinct from old.verkaufspreis)
     and not pflegt then
    raise exception 'Den Katalog pflegt die Verwaltung oder die Führung'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger materials_felder
  before insert or update on materials
  for each row execute function app.materialfelder_geschuetzt();

-- ---------------------------------------------------------------------------
-- 5. Ruestliste — planen darf die Leitung, abhaken der Eingeteilte
-- ---------------------------------------------------------------------------

/*
  Der eingeteilte Monteur hakt ab, was er eingeladen hat — er aendert damit
  `geladen` und sonst nichts. Die LISTE selbst (welche Baustelle, welcher Tag,
  wer ist eingeteilt) gehoert der Planung.

  Ein NICHT eingeteilter Mitarbeiter hakt gar nichts ab: sonst bestaetigte
  jemand das Verladen von Material, das er nie gesehen hat.
*/
create or replace function app.ruestliste_geschuetzt() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if app.ist_fuehrung() then
    return new;
  end if;

  if new.date is distinct from old.date
     or new.project_number is distinct from old.project_number
     or new.uids is distinct from old.uids then
    raise exception 'Die Rüstliste plant die Leitung' using errcode = '42501';
  end if;

  if new.geladen is distinct from old.geladen
     and not (auth.uid() = any(old.uids)) then
    raise exception 'Abhaken darf nur, wer für diesen Einsatz eingeteilt ist'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger einsatz_material_schutz before update on einsatz_material
  for each row execute function app.ruestliste_geschuetzt();

-- ---------------------------------------------------------------------------
-- 6. Die Fotoliste aendert sich beim Storno nicht mit
-- ---------------------------------------------------------------------------

/*
  Der Storno ist eine Klammer um einen Beleg, keine Gelegenheit, ihn noch
  einmal anzufassen. Ein nachgeschobenes oder entferntes Foto waere genau das
  — und es waere am Pruefsummenfeld nicht zu sehen, weil die Fotos dort nur
  ueber ihren Hash haengen.
*/
create trigger work_sheet_photos_eingefroren
  before insert or update or delete on work_sheet_photos
  for each row execute function app.scheinpositionen_eingefroren();
