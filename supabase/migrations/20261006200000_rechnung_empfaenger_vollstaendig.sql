-- ===========================================================================
-- RECHNUNG NUR AN EINEN VOLLSTÄNDIGEN EMPFÄNGER (Testbericht Runde 3, M9, M10)
-- ===========================================================================
--
-- M9: RE-2026-1500 und die Stornorechnung RE-2026-1503 trugen als Anschrift
-- nur „Alois-Köberl-Gasse 11“ — ohne PLZ und Ort (Altbestand, „Adresse
-- prüfen“). Name und Anschrift des Empfängers sind Pflichtangaben einer
-- Rechnung (§ 11 Abs 1 Z 1 UStG). Jetzt entsteht keine Rechnung, solange der
-- Kunde „Adresse prüfen“ trägt oder PLZ und Ort fehlen; ohne Kunden im Stamm
-- muss die Anschrift der Rechnung selbst PLZ und Ort haben.
--
-- M10: Die Kundenart (Privatperson oder Unternehmen) entscheidet über
-- Verzugszinsen und Mahnspesen. Bei Altkunden war sie leer. Jetzt verlangen
-- Rechnung und Mahnung sie — bei einem Kunden aus dem Stamm; eine UID auf der
-- Rechnung macht ihn ohnehin zum Unternehmen.
--
-- Ausgestellte Belege bleiben, wie sie sind: geprüft wird beim Anlegen.
--
-- DER RÜCKLAUF AUS DER SICHERUNG IST AUSGENOMMEN (`app.ist_dienst()`): er
-- spielt den Bestand zurück, wie er war, auch mit Altbestand. Dasselbe gilt
-- ab hier für die IBAN-Prüfung aus 20261006120000 — sonst liesse sich ein
-- Betrieb mit einer alten ungültigen IBAN nicht zurückspielen.

create or replace function app.rechnung_empfaenger_pruefen() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  k public.customers;
begin
  if app.ist_dienst() then
    return new;
  end if;
  -- Der Kunde der Baustelle; `invoices_baustelle` hat `project_id` schon gesetzt.
  select c.* into k
    from public.customers c
   where c.company_id = new.company_id
     and c.id = coalesce(new.customer_id,
                         (select p.customer_id from public.projects p where p.id = new.project_id));
  if k.id is not null then
    if k.adresse_pruefen then
      raise exception 'Die Anschrift von % ist als „Adresse prüfen“ markiert — bitte zuerst in der Kundenakte berichtigen', k.name
        using errcode = '22023';
    end if;
    if coalesce(btrim(k.plz), '') = '' or coalesce(btrim(k.ort), '') = '' then
      raise exception 'Zur Anschrift von % fehlen PLZ und Ort — bitte zuerst in der Kundenakte ergänzen', k.name
        using errcode = '22023';
    end if;
    if k.kundenart is null and coalesce(btrim(new.customer_vat_id), '') = '' then
      raise exception 'Für % ist keine Kundenart hinterlegt (Privatperson oder Unternehmen) — sie entscheidet über Zinsen und Mahnspesen; bitte in der Kundenakte festlegen', k.name
        using errcode = '22023';
    end if;
  /*
    Ohne Kunden im Stamm steht nur die Anschrift da: sie braucht eine PLZ
    (vier oder fünf Ziffern) vor dem Ort. Mit Kunden gelten seine Felder —
    so geht auch eine ausländische Postleitzahl anderer Form.
  */
  elsif coalesce(new.address, '') !~ '(^|[^0-9])[0-9]{4,5}[[:space:]]+[^[:space:]]' then
    raise exception 'Die Rechnungsanschrift hat keine PLZ und keinen Ort — bitte die Anschrift des Kunden ergänzen'
      using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke all on function app.rechnung_empfaenger_pruefen() from public, anon, authenticated;

-- Nach `invoices_baustelle` (Auslöser laufen in der Reihenfolge ihrer Namen).
drop trigger if exists invoices_kunde_vollstaendig on public.invoices;
create trigger invoices_kunde_vollstaendig
  before insert on public.invoices
  for each row execute function app.rechnung_empfaenger_pruefen();

/*
  DIE MAHNUNG VERLANGT EINE KUNDENART. Verzugszinsen (ABGB oder UGB) und
  Mahnspesen hängen an ihr; ohne sie raten Mahnlauf und Beleg.
*/
create or replace function app.mahnung_kundenart_pruefen() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  k public.customers;
begin
  if app.ist_dienst() or coalesce(new.mahnstufe, 0) <= coalesce(old.mahnstufe, 0) then
    return new;
  end if;
  if coalesce(btrim(new.customer_vat_id), '') <> '' then
    return new;
  end if;
  select c.* into k
    from public.customers c
   where c.company_id = new.company_id
     and c.id = coalesce(new.customer_id,
                         (select p.customer_id from public.projects p where p.id = new.project_id));
  if k.id is not null and k.kundenart is null then
    raise exception 'Für % ist keine Kundenart hinterlegt (Privatperson oder Unternehmen) — sie entscheidet über Zinsen und Mahnspesen; bitte vor dem Mahnen in der Kundenakte festlegen', k.name
      using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke all on function app.mahnung_kundenart_pruefen() from public, anon, authenticated;

drop trigger if exists invoices_mahnung_kundenart on public.invoices;
create trigger invoices_mahnung_kundenart
  before update of mahnstufe on public.invoices
  for each row execute function app.mahnung_kundenart_pruefen();

-- ---------------------------------------------------------------------------
-- Die IBAN-Prüfung (20261006120000): Rücklauf ausgenommen, sonst unverändert
-- ---------------------------------------------------------------------------

create or replace function app.bankverbindung_pruefen() returns trigger
  language plpgsql
  set search_path = ''
as $$
declare
  f text;
begin
  if app.ist_dienst() then
    return new;
  end if;
  if tg_op = 'INSERT' or new.iban is distinct from old.iban then
    new.iban := nullif(upper(regexp_replace(coalesce(new.iban, ''), '\s', '', 'g')), '');
    if tg_op = 'UPDATE' and new.iban is not distinct from upper(regexp_replace(coalesce(old.iban, ''), '\s', '', 'g')) then
      -- Nur anders geschrieben (Leerzeichen): kein neuer Wert, keine neue Prüfung.
      null;
    else
      f := app.iban_fehler(new.iban);
      if f is not null then
        raise exception '%', f using errcode = '22023';
      end if;
    end if;
  end if;
  if tg_op = 'INSERT' or new.bic is distinct from old.bic then
    new.bic := nullif(upper(regexp_replace(coalesce(new.bic, ''), '\s', '', 'g')), '');
    f := app.bic_fehler(new.bic);
    if f is not null then
      raise exception '%', f using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;

create or replace function app.rechnung_iban_pruefen() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  f text;
begin
  if app.ist_dienst() then
    return new;
  end if;
  select app.iban_fehler(c.iban) into f from public.companies c where c.id = new.company_id;
  if f is not null then
    raise exception 'Die IBAN in den Firmendaten ist ungültig (%) — bitte zuerst unter Einstellungen › Firmendaten berichtigen', f
      using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke all on function app.rechnung_iban_pruefen() from public, anon, authenticated;
