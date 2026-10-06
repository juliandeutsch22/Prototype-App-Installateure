-- ===========================================================================
-- DEN KUNDENNAMEN NUR DORT NACHZIEHEN, WO ER SICH ÄNDERT (Testbericht Runde 3, G9)
-- ===========================================================================
--
-- Beim Speichern der Kundenakte stand „Gespeichert, 3 Baustellen
-- nachgezogen“ — auch wenn nur die Telefonnummer geändert war. Die Funktion
-- schrieb den Namen auf jede Baustelle des Kunden und zählte sie alle. Jetzt
-- zählt sie nur Baustellen, auf denen der Name tatsächlich anders war; die
-- Meldung in der App sagt, was geschehen ist.
--
-- Rumpf wie 20260924200000_kunden_pflegen.sql, dazu die Bedingung.

create or replace function app.kundenname_nachziehen(p_kunde uuid, p_name text)
  returns integer
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  betrieb text;
  betroffen integer;
begin
  select c.company_id into betrieb from public.customers c where c.id = p_kunde;
  if betrieb is null or not app.darf(betrieb) or not app.darf_kunden_pflegen() then
    raise exception 'Kunde darf nicht geändert werden' using errcode = '42501';
  end if;
  update public.projects
     set customer_name = p_name
   where customer_id = p_kunde
     and company_id = betrieb
     and customer_name is distinct from p_name;
  get diagnostics betroffen = row_count;
  return betroffen;
end;
$$;

revoke all on function app.kundenname_nachziehen(uuid, text) from public, anon;
grant execute on function app.kundenname_nachziehen(uuid, text) to authenticated;
