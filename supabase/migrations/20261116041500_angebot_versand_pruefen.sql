/*
  VERSENDEN ERST MIT POSITIONEN, UND EIN RÜCKWEG FÜR EINEN FEHLTIPP
  (Durchsicht 15.11.2026, A5).

  WAS DIE DURCHSICHT FAND. Ein Angebot ohne Positionen ließ sich versenden
  und verlinken — „Eingang → Angebot anlegen“ führt auf die Akte eines
  leeren Entwurfs, und gleich daneben stand „Als versendet markieren“. Ein
  Tipp, und das leere Angebot über 0,00 € war „Versendet“ und nicht mehr
  bearbeitbar; über den Link bekam der Kunde ein Angebot ohne Positionen zur
  Unterschrift. „Als versendet/abgelehnt markieren“ wirkten ohne Rückfrage
  und ohne Rückweg.

  WAS JETZT GILT (`quotes_versand_pruefen`, an jedem Weg, auch der alten App):
  1. Entwurf → Versendet nur mit mindestens einer Position (Titel und Text
     zählen nicht). Ein Annahme-Link entsteht nur für ein Angebot mit
     Position (`angebot_links_nur_mit_positionen`) — auch für ein schon
     versendetes aus dem Bestand.
  2. Versendet → Entwurf („zurück in den Entwurf“), solange kein Link des
     Angebots geöffnet, angenommen oder abgelehnt wurde. Was beim Kunden
     schon gelesen wurde, wird als neue Fassung überarbeitet. Ein offener,
     ungeöffneter Link wird dabei widerrufen; Tag des Versands und
     Firmendaten des Versands fallen weg — es war kein Versand.
  3. Abgelehnt → Versendet/Entwurf („Ablehnung zurücknehmen“), wenn die
     Ablehnung im Büro vermerkt war: hat der Kunde über den Link abgelehnt,
     bleibt das stehen. Nicht, wenn inzwischen eine andere Fassung
     angenommen ist. Der Tag des Versands bleibt der alte.

  Die Rückfragen stehen in der Oberfläche; die Regeln hier, damit kein Weg
  an ihnen vorbeiführt. Ausgenommen sind der Dienstschlüssel und die
  Rücknahme einer Annahme (A1), die ihre eigenen Regeln mitbringen.

  ALTDATEN. Nichts wird umgeschrieben: ein schon versendetes leeres Angebot
  bleibt, wie es ist; nur ein neuer Link entsteht dafür nicht mehr.
*/

create or replace function app.angebot_hat_position(p_angebot uuid) returns boolean
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select exists (select 1 from public.quote_lines l where l.quote_id = p_angebot and l.art = 'position')
$$;

revoke all on function app.angebot_hat_position(uuid) from public, anon, authenticated;

create or replace function app.angebot_versand_pruefen() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  andere text;
begin
  if app.ist_dienst() or coalesce(current_setting('app.annahme_zurueck', true), '') = 'ja'
     or new.status is not distinct from old.status then
    return new;
  end if;

  if old.status = 'Entwurf' and new.status = 'Versendet' and not app.angebot_hat_position(new.id) then
    raise exception 'Angebot % hat keine Position — ein leeres Angebot wird nicht versendet', old.quote_number
      using errcode = '55000';
  end if;

  if old.status = 'Versendet' and new.status = 'Entwurf' then
    if exists (select 1 from public.angebot_links a
                where a.quote_id = new.id
                  and (a.zuerst_geoeffnet_am is not null or a.angenommen_am is not null or a.abgelehnt_am is not null)) then
      raise exception 'Der Kunde hat den Annahme-Link zu % schon geöffnet — zurück in den Entwurf geht nicht mehr; überarbeiten als neue Fassung', old.quote_number
        using errcode = '55000';
    end if;
    update public.angebot_links a
       set widerrufen_am = now(), widerrufen_von_uid = auth.uid(),
           widerrufen_von_name = (select u.name from public.users u where u.id = auth.uid())
     where a.quote_id = new.id
       and a.widerrufen_am is null and a.angenommen_am is null and a.abgelehnt_am is null;
    new.versendet_am := null;
    new.aussteller_stand := null;
  end if;

  if old.status = 'Abgelehnt' and new.status in ('Versendet', 'Entwurf') then
    if exists (select 1 from public.angebot_links a where a.quote_id = new.id and a.abgelehnt_am is not null) then
      raise exception 'Der Kunde hat % über den Link abgelehnt — das bleibt; überarbeiten als neue Fassung', old.quote_number
        using errcode = '55000';
    end if;
    select x.quote_number into andere from public.quotes x
     where x.id in (select app.angebot_fassungen(new.id)) and x.id <> new.id and x.status = 'Angenommen'
     limit 1;
    if andere is not null then
      raise exception 'Von diesem Angebot ist inzwischen die Fassung % angenommen — % bleibt abgelehnt', andere, old.quote_number
        using errcode = '55000';
    end if;
    new.abgelehnt_am := null;
    -- Wieder versendet heißt: wie vor der Ablehnung — derselbe Tag, dieselben Firmendaten.
    if new.status = 'Versendet' then
      new.versendet_am := old.versendet_am;
      new.aussteller_stand := old.aussteller_stand;
    else
      new.versendet_am := null;
      new.aussteller_stand := null;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function app.angebot_versand_pruefen() from public, anon, authenticated;

-- Nach `quotes_status_zeit` und `quotes_aussteller` (Reihenfolge nach Namen): hier gilt das letzte Wort.
drop trigger if exists quotes_versand_pruefen on public.quotes;
create trigger quotes_versand_pruefen
  before update of status on public.quotes
  for each row execute function app.angebot_versand_pruefen();

create or replace function app.angebot_links_nur_mit_positionen() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if not app.angebot_hat_position(new.quote_id) then
    raise exception 'Ein Angebot ohne Position bekommt keinen Annahme-Link — erst Positionen eintragen'
      using errcode = '55000';
  end if;
  return new;
end;
$$;

revoke all on function app.angebot_links_nur_mit_positionen() from public, anon, authenticated;

drop trigger if exists angebot_links_nur_mit_positionen on public.angebot_links;
create trigger angebot_links_nur_mit_positionen
  before insert on public.angebot_links
  for each row execute function app.angebot_links_nur_mit_positionen();
