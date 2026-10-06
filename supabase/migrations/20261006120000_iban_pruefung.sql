-- ===========================================================================
-- IBAN UND BIC PRÜFEN (Testbericht Runde 3, H3)
-- ===========================================================================
--
-- Alle Belege des Pilotbetriebs trugen „IBAN AT74123456“ — zehn Zeichen statt
-- zwanzig, ohne gültige Prüfziffer. Nichts prüfte.
--
-- JETZT, dieselbe Regel wie `shared/iban.ts`:
--   - Beim Speichern der Firmendaten: Leerzeichen raus, Grossbuchstaben,
--     Länge je Land, Prüfziffer (Modulo 97); BIC im Format. Geprüft wird nur,
--     was sich ändert — ein Altbestand hält das Speichern anderer Felder
--     nicht auf, die Oberfläche markiert ihn.
--   - Eine Rechnung entsteht nicht, solange in den Firmendaten eine
--     ungültige IBAN steht. Eine leere bleibt erlaubt: dann nennt die
--     Rechnung eben kein Konto (wie bisher, mit Hinweis).

create or replace function app.iban_fehler(p_iban text) returns text
  language plpgsql immutable
  set search_path = ''
as $$
declare
  n text := upper(regexp_replace(coalesce(p_iban, ''), '\s', '', 'g'));
  land text;
  soll integer;
  umgestellt text;
  rest integer := 0;
  z text;
  ziffern text;
  i integer;
  j integer;
begin
  if n = '' then
    return null;
  end if;
  if n !~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]+$' then
    return 'Die IBAN beginnt mit dem Länderkürzel und zwei Prüfziffern, danach nur Buchstaben und Ziffern.';
  end if;
  land := substr(n, 1, 2);
  soll := ('{"AD":24,"AT":20,"BE":16,"BG":22,"CH":21,"CY":28,"CZ":24,"DE":22,"DK":18,"EE":20,'
           '"ES":24,"FI":18,"FO":18,"FR":27,"GB":22,"GI":23,"GL":18,"GR":27,"HR":21,"HU":28,'
           '"IE":22,"IS":26,"IT":27,"LI":21,"LT":20,"LU":20,"LV":21,"MC":27,"MT":31,"NL":18,'
           '"NO":15,"PL":28,"PT":25,"RO":24,"SE":24,"SI":19,"SK":24,"SM":27,"VA":22}'::jsonb ->> land)::integer;
  if soll is not null and length(n) <> soll then
    return format('Eine IBAN aus %s hat %s Zeichen, diese hat %s.', land, soll, length(n));
  end if;
  if soll is null and (length(n) < 15 or length(n) > 34) then
    return format('Eine IBAN hat 15 bis 34 Zeichen, diese hat %s.', length(n));
  end if;
  umgestellt := substr(n, 5) || substr(n, 1, 4);
  for i in 1..length(umgestellt) loop
    z := substr(umgestellt, i, 1);
    ziffern := case when z ~ '[A-Z]' then (ascii(z) - 55)::text else z end;
    for j in 1..length(ziffern) loop
      rest := (rest * 10 + substr(ziffern, j, 1)::integer) % 97;
    end loop;
  end loop;
  if rest <> 1 then
    return 'Die Prüfziffer der IBAN stimmt nicht — bitte jede Stelle vergleichen.';
  end if;
  return null;
end;
$$;

create or replace function app.bic_fehler(p_bic text) returns text
  language sql immutable
  set search_path = ''
as $$
  select case
    when upper(regexp_replace(coalesce(p_bic, ''), '\s', '', 'g')) = '' then null
    when upper(regexp_replace(p_bic, '\s', '', 'g')) ~ '^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$' then null
    else 'Ein BIC hat 8 oder 11 Zeichen: vier Buchstaben für die Bank, zwei für das Land, dann Ort und Filiale (z. B. BKAUATWW).'
  end
$$;

revoke all on function app.iban_fehler(text) from public, anon;
revoke all on function app.bic_fehler(text) from public, anon;
grant execute on function app.iban_fehler(text) to authenticated, service_role;
grant execute on function app.bic_fehler(text) to authenticated, service_role;

create or replace function app.bankverbindung_pruefen() returns trigger
  language plpgsql
  set search_path = ''
as $$
declare
  f text;
begin
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

drop trigger if exists companies_bankverbindung on public.companies;
create trigger companies_bankverbindung
  before insert or update of iban, bic on public.companies
  for each row execute function app.bankverbindung_pruefen();

/*
  KEINE RECHNUNG MIT UNGÜLTIGER IBAN. Die Meldung sagt, wo es zu ändern ist;
  die App springt dorthin.
*/
create or replace function app.rechnung_iban_pruefen() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  f text;
begin
  select app.iban_fehler(c.iban) into f from public.companies c where c.id = new.company_id;
  if f is not null then
    raise exception 'Die IBAN in den Firmendaten ist ungültig (%) — bitte zuerst unter Einstellungen › Firmendaten berichtigen', f
      using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke all on function app.rechnung_iban_pruefen() from public, anon, authenticated;

drop trigger if exists invoices_iban on public.invoices;
create trigger invoices_iban
  before insert on public.invoices
  for each row execute function app.rechnung_iban_pruefen();
