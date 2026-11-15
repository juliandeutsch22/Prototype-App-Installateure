/*
  DURCHSICHT 15.11.2026, V9 — „NEU EINGEGANGEN“: DER UNTERSCHRIEBENE SCHEIN
  KOMMT IM BÜRO AN.

  WAS FEHLTE. Ein unterschriebener Schein meldete sich nur bei denen, die
  Rechnungen schreiben („nicht verrechnet“). Projektleitung und Verwaltung
  — die den Schein prüfen, ablegen oder dem Kunden nachschicken — erfuhren
  es nur, wenn sie die Scheinliste von sich aus öffneten.

  WAS JETZT GILT. Je Person ein Merker, bis wann sie die neuen Scheine
  gesehen hat (`user_prefs.scheine_gesehen_bis`). `scheine_neu` liefert die
  unterschriebenen Scheine des Betriebs danach — ohne die eigenen; beim
  ersten Mal die der letzten sieben Tage. Die Startseite zeigt sie als eine
  Zeile, die Scheinliste unter „neu eingegangen“; öffnet die Person sie
  dort, setzt `scheine_gesehen` den Merker auf jetzt.

  DATENSCHUTZ: keine neue Tabelle; der Merker ist eine Spalte an den
  Meldungsvorgaben der Person, die schon in der Datenauskunft und in der
  Löschung einer Person stehen. Die Scheine selbst liest im Betrieb jeder
  ohnehin (`work_sheets_lesen`); die Funktion gibt nur Kopf und Zeitpunkt.
*/

alter table public.user_prefs
  add column if not exists scheine_gesehen_bis timestamptz;

comment on column public.user_prefs.scheine_gesehen_bis is
  'Bis wann die Person die neu unterschriebenen Scheine gesehen hat (V9); leer: noch nie.';

create or replace function public.scheine_neu()
  returns table (id uuid, project_number text, customer_name text, datum date, unterschrieben_am timestamptz, erstellt_von_name text)
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select w.id, w.project_number, w.customer_name, w.datum, w.unterschrieben_am, w.erstellt_von_name
    from public.work_sheets w
   where w.company_id = (select app.betrieb())
     and (select app.angemeldet())
     and w.status = 'Unterschrieben'
     and w.erstellt_von_uid is distinct from (select auth.uid())
     and w.unterschrieben_am > coalesce(
           (select p.scheine_gesehen_bis from public.user_prefs p where p.user_id = (select auth.uid())),
           now() - interval '7 days')
   order by w.unterschrieben_am desc, w.id
$$;

revoke all on function public.scheine_neu() from public, anon;
grant execute on function public.scheine_neu() to authenticated;

/* „Gesehen“: der Merker auf jetzt — für die eigene Person, nur im eigenen Betrieb. */
create or replace function public.scheine_gesehen() returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  ich uuid := auth.uid();
  betrieb text := app.betrieb();
begin
  if ich is null or betrieb is null or not app.angemeldet() then
    raise exception 'Nicht angemeldet' using errcode = '42501';
  end if;
  /*
    Gibt es noch keine Vorgaben, entstehen sie mit den Vorgaben der App
    (`PREFS_DEFAULTS`: alle Meldungen an) — nicht mit den Spaltenvorgaben,
    die für drei alte Arten „aus“ sagen. Sonst schaltete das Ansehen der
    Scheinliste still Meldungen ab.
  */
  insert into public.user_prefs (user_id, company_id, scheine_gesehen_bis,
                                 notify_new_order, notify_order_ready, notify_urgent_delivery)
  values (ich, betrieb, now(), true, true, true)
  on conflict (user_id) do update set scheine_gesehen_bis = excluded.scheine_gesehen_bis;
end;
$$;

revoke all on function public.scheine_gesehen() from public, anon;
grant execute on function public.scheine_gesehen() to authenticated;

create index if not exists work_sheets_unterschrieben_am
  on public.work_sheets (company_id, unterschrieben_am desc)
  where status = 'Unterschrieben';
