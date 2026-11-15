/*
  EIN LEERES ANGEBOT WIRD NICHT ANGENOMMEN (Durchsicht 15.11.2026, A14).

  WAS DIE DURCHSICHT FAND. A5 sperrte Versand und Annahme-Link für ein
  Angebot ohne Position — angenommen werden konnte es weiter: ein leerer
  Entwurf ließ sich im Büro mit „Annehmen → Baustelle“ annehmen und legte
  eine Baustelle mit Budget 0 an; ein Link, der vor A5 für ein leeres
  Angebot entstand, nahm es beim Kunden an.

  WAS JETZT GILT.
  1. `quotes_annahme_nur_mit_positionen`: der Wechsel nach „Angenommen“
     braucht mindestens eine Position (Titel und Text zählen nicht, wie bei
     A5). Der Trigger sitzt an der Zeile, damit jeder Weg ihn trifft:
     `angebot_annehmen` (auch die alte App), `angebot_annehmen_mit_ziel`,
     der Annahme-Link (er läuft mit dem Dienstschlüssel — darum hier keine
     Ausnahme für ihn) und ein direktes Setzen des Stands. Der Rücklauf
     einer Sicherung fügt Zeilen ein und ist nicht betroffen.
  2. Der Annahme-Link eines leeren Angebots ist gegenstandslos
     (`app.angebot_link_zustand`): der Kunde sieht dieselbe Seite wie bei
     einem ungültigen Link statt einer Störung, und die Annahme erreicht
     den Trigger gar nicht erst.

  ALTDATEN. Ein schon angenommenes leeres Angebot bleibt, wie es ist.
*/

create or replace function app.angebot_annahme_pruefen() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if new.status = 'Angenommen' and old.status is distinct from 'Angenommen'
     and not app.angebot_hat_position(new.id) then
    raise exception 'Angebot % hat keine Position — ein leeres Angebot wird nicht angenommen', old.quote_number
      using errcode = '55000';
  end if;
  return new;
end;
$$;

revoke all on function app.angebot_annahme_pruefen() from public, anon, authenticated;

drop trigger if exists quotes_annahme_nur_mit_positionen on public.quotes;
create trigger quotes_annahme_nur_mit_positionen
  before update of status on public.quotes
  for each row execute function app.angebot_annahme_pruefen();

create or replace function app.angebot_link_zustand(l public.angebot_links, q public.quotes) returns text
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select case
    when l.angenommen_am is not null then 'angenommen'
    when l.abgelehnt_am is not null then 'abgelehnt'
    when l.widerrufen_am is not null then 'widerrufen'
    when (now() at time zone 'Europe/Vienna')::date > l.gueltig_bis then 'abgelaufen'
    when q.id is null or q.status is distinct from 'Versendet' then 'gegenstandslos'
    when exists (select 1 from public.quotes x
                  where x.id in (select app.angebot_fassungen(q.id))
                    and x.id <> q.id and x.status = 'Angenommen') then 'gegenstandslos'
    -- A4: eine Fassung, die nach diesem Link entstand, überholt ihn.
    when app.angebot_link_neuere_fassung(l) is not null then 'neuere_fassung'
    -- A14: ein leeres Angebot (Link aus der Zeit vor A5) wird nicht angenommen.
    when not app.angebot_hat_position(q.id) then 'gegenstandslos'
    when app.angebot_link_inhalt(q) is distinct from l.schnappschuss -> 'angebot' then 'geaendert'
    else 'offen'
  end
$$;

revoke all on function app.angebot_link_zustand(public.angebot_links, public.quotes) from public, anon, authenticated;
