-- TESTBERICHT 30.09.2026, H8 — DATENSCHUTZ BEI MONTEUREN.
--
--   Kundenstamm: Monteure lesen die Tabelle nicht mehr, sondern über
--   `kunden_im_ueberblick` nur, was sie brauchen.
--   Krankmeldungen: eine vom Büro erfasste können sie nur ansehen.

-- ---------------------------------------------------------------------------
-- H8 — der Kundenstamm
-- ---------------------------------------------------------------------------

/*
  WAS BISHER GALT: `customers_lesen` liess jeden im Betrieb alles lesen. Ein
  Monteur holte über die Schnittstelle den ganzen Kundenstamm samt E-Mail,
  UID und Notizen. Laut Handbuch lesen ihn Buchhaltung, Verwaltung und
  Leitung.

  ENTSCHIEDEN AM 30.09.2026: Monteure lesen alle Kunden, aber nur Name und
  Adresse; bei Kunden ihrer eingeteilten Baustellen dazu Ansprechpartner und
  Telefon. E-Mail, UID und Notizen bleiben bei Büro und Leitung.

  Ein Zeilenschutz kann keine Spalten ausblenden. Deshalb zwei Teile: die
  Tabelle selbst liest die Rolle Mitarbeiter gar nicht mehr, und was sie
  lesen darf, gibt `kunden_im_ueberblick` heraus.

  Keine Ansicht des Monteurs liest die Tabelle heute direkt — Schein, Einsatz,
  Baustelle und Startseite nehmen Kundenname, Adresse und Telefon von der
  Baustelle. Nachgesehen in allen Aufrufern von `lib/db/customers`: Kunden,
  Angebote, Wartungen, Baustellenliste und -akte, Rechnungen — alles Seiten,
  die der Monteur nicht betritt.

  Der Supportzugang ist keine Rolle „Mitarbeiter“ und liest wie bisher.
*/
drop policy if exists customers_lesen on public.customers;
create policy customers_lesen on public.customers
  for select using (app.darf(company_id) and app.rolle() is distinct from 'Mitarbeiter');

create or replace function public.kunden_im_ueberblick()
  returns table (
    id uuid,
    name text,
    address text,
    contact_name text,
    contact_phone text
  )
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select c.id, c.name, c.address,
         case when voll then c.contact_name end,
         case when voll then c.contact_phone end
    from public.customers c
    cross join lateral (
      select app.rolle() is distinct from 'Mitarbeiter'
          or exists (
               select 1 from public.projects p
                where p.company_id = c.company_id
                  and p.customer_id = c.id
                  and app.baustelle_einsehbar(p.id)) as voll
    ) z
   where c.company_id = app.betrieb()
     and app.darf(c.company_id)
     and c.active
   order by c.name
$$;

revoke all on function public.kunden_im_ueberblick() from public, anon;
grant execute on function public.kunden_im_ueberblick() to authenticated;

-- ---------------------------------------------------------------------------
-- H8 — Krankmeldungen
-- ---------------------------------------------------------------------------

/*
  WAS BISHER GALT: `krankmeldung_loeschen` liess jeden seine eigenen Meldungen
  löschen — auch eine, die das Büro nach einem Anruf erfasst hat. Das ist eine
  Aufzeichnung, die der Arbeitgeber braucht.

  ENTSCHIEDEN AM 30.09.2026:
    - vom Büro erfasst: der Monteur sieht sie nur an;
    - selbst erfasst: ändern und löschen, solange sie noch nicht begonnen hat;
      danach nur noch das Ende ändern.
  Wer sie erfasst hat, steht seit jeher in `gemeldet_von_uid`. Eine Meldung
  ohne Eintrag (übernommene alte Krank-Tage) gilt als selbst erfasst.

  AN DER ZEILE, nicht in den beiden Funktionen: so gilt die Regel für jeden
  Weg. Büro und Leitung (`ist_buch_oder_spitze`) und der Dienstschlüssel
  bleiben aussen vor.
*/
create or replace function app.krankmeldung_grenzen() returns trigger
  language plpgsql
  set search_path = ''
as $$
declare
  heute date := (now() at time zone 'Europe/Vienna')::date;
  vom_buero boolean := old.gemeldet_von_uid is not null and old.gemeldet_von_uid is distinct from old.user_id;
begin
  if app.ist_dienst() or app.ist_buch_oder_spitze() then
    return coalesce(new, old);
  end if;

  if vom_buero then
    raise exception 'Diese Krankmeldung hat das Büro erfasst — ändern oder löschen kann sie nur das Büro'
      using errcode = '42501';
  end if;

  if old.von <= heute then
    if tg_op = 'DELETE' then
      raise exception 'Eine Krankmeldung, die schon begonnen hat, lässt sich nicht löschen — bitte das Ende ändern'
        using errcode = '42501';
    end if;
    if new.von is distinct from old.von then
      raise exception 'Bei einer Krankmeldung, die schon begonnen hat, lässt sich nur das Ende ändern'
        using errcode = '42501';
    end if;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists krankmeldungen_grenzen on public.krankmeldungen;
create trigger krankmeldungen_grenzen
  before update or delete on public.krankmeldungen
  for each row execute function app.krankmeldung_grenzen();

/*
  DIE TAGE DER MELDUNG: `krankmeldung_loeschen` räumt ZUERST die Krank-Tage
  weg und dann die Meldung. Scheitert die Meldung am Wächter oben, rollt der
  ganze Aufruf zurück — die Tage bleiben.
*/
