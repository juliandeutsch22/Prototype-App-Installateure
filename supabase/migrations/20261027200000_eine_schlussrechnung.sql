-- ===========================================================================
-- EINE GÜLTIGE SCHLUSSRECHNUNG JE BAUSTELLE (Testbericht Runde 6, M7)
-- ===========================================================================
--
-- Nach der Schlussrechnung RE-2026-1510 bot „Neue Rechnung“ für dieselbe
-- Baustelle wieder eine Schlussrechnung an und stellte 24 Stunden zusammen.
-- Die Maske weicht jetzt aus; die Datenbank muss es trotzdem sperren, denn
-- eine zweite gültige Schlussrechnung ist fachlich nie richtig: die
-- Schlussrechnung ist die Endabrechnung der Baustelle und zieht die
-- Vorrechnungen ab (§ 11 Abs 12 UStG). Zwei davon hiessen zwei
-- Endabrechnungen, und welche gilt, wüsste weder der Kunde noch die Kanzlei.
-- Was nach der Schlussrechnung noch geleistet wird, geht als Rechnung; soll
-- die Schlussrechnung anders aussehen, wird sie storniert und neu ausgestellt.
--
-- Gesperrt wird beim Anlegen und beim Aufheben eines Stornos (eine
-- stornierte Schlussrechnung käme sonst neben die neue zurück). Bestehende
-- Daten werden nicht angefasst; der Dienstschlüssel (Rückspielen einer
-- Sicherung) ist ausgenommen wie bei den übrigen Rechnungsregeln.
--
-- Die Baustelle gilt in beiden Schreibweisen der Nummer (mit und ohne „PR-“),
-- wie in `ausgegebenes_material`. Gleichzeitiges Anlegen wartet über eine
-- Sperre je Betrieb und Baustelle aufeinander.
--
-- Der Auslöser heisst bewusst `invoices_zweite_schlussrechnung`: Auslöser
-- laufen in der Reihenfolge ihrer Namen, und `invoices_vorrechnungen` soll
-- zuerst prüfen — ein doppelter Abzug behält seine genauere Meldung.

create or replace function app.eine_schlussrechnung() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  schluessel text := regexp_replace(trim(coalesce(new.project_number, '')), '^PR-', '', 'i');
  vorhanden text;
begin
  if app.ist_dienst() or coalesce(new.art, 'einzel') <> 'schluss'
     or new.payment_status = 'Storniert' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.payment_status is distinct from 'Storniert' then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext('schlussrechnung:' || new.company_id || ':' || lower(schluessel)));

  select string_agg(i.invoice_number, ', ' order by i.invoice_number) into vorhanden
    from public.invoices i
   where i.company_id = new.company_id
     and i.id is distinct from new.id
     and i.art = 'schluss'
     and i.payment_status is distinct from 'Storniert'
     and lower(regexp_replace(trim(coalesce(i.project_number, '')), '^PR-', '', 'i')) = lower(schluessel);
  if vorhanden is not null then
    raise exception 'Für diese Baustelle gibt es schon die Schlussrechnung % — eine zweite gibt es nicht. Was danach geleistet wurde, geht als Rechnung; sonst zuerst % stornieren.', vorhanden, vorhanden
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function app.eine_schlussrechnung() from public, anon, authenticated;

drop trigger if exists invoices_zweite_schlussrechnung on public.invoices;
create trigger invoices_zweite_schlussrechnung
  before insert or update of payment_status on public.invoices
  for each row execute function app.eine_schlussrechnung();
