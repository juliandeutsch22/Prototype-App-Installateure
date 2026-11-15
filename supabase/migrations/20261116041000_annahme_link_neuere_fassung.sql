/*
  DER ANNAHME-LINK EINER ÜBERHOLTEN FASSUNG (Durchsicht 15.11.2026, A4).

  WAS DIE DURCHSICHT FAND. „Neue Fassung“ rührte die Links der alten nicht
  an: `angebot_link_zustand` nannte einen Link erst „gegenstandslos“, wenn
  eine andere Fassung ANGENOMMEN war. Der Kunde öffnete die alte Mail und
  unterschrieb AN-0008, obwohl das Büro ihm gerade AN-0009 geschickt hatte —
  Baustelle mit Positionen und Budget der überholten Fassung, AN-0009 danach
  „Ersetzt“. Verhindern ließ sich das nur, wenn jemand vorher von Hand
  „Widerrufen“ tippte.

  WAS JETZT GILT.
  1. Ein Link, nach dessen Erzeugen eine weitere Fassung desselben Angebots
     entstanden ist (nicht im Papierkorb), gilt nicht mehr: Zustand
     `neuere_fassung`. Entschieden wird bei jedem Abruf aus den Fassungen —
     dieselbe Quelle für Büro und Kunde, wie bisher (`angebot_link_zustand`).
     Ein Link, den das Büro bewusst NACH der neuen Fassung für die ältere
     erzeugt, bleibt gültig: das ist eine Entscheidung, keine Überholung.
  2. Der Kunde sieht dann nicht „Link nicht gültig“, sondern „Es gibt eine
     neuere Fassung“ — mit Firma und Nummer, ohne den überholten Inhalt, bis
     zum letzten Gültigkeitstag des Links (danach wie jeder abgelaufene).
     Annehmen und Ablehnen antworten genauso und ändern nichts.
  3. Das Büro sieht beim Link, welche Fassung ihn überholt hat
     (`neuere_fassung` in `angebot_links_stand`).
  4. Widerrufen bleibt der eigene Handgriff, den es schon gab
     (`angebot_link_widerrufen`, Knopf im Abschnitt „Annahme per Link“).

  WAS GLEICH BLEIBT. Die übrigen Zustände, ihre Reihenfolge und ihre
  Antworten; die Edge Function lässt nur noch Zustände durch, die die Seite
  kennt (`KUNDEN_ZUSTAENDE` in `shared/angebotLink.ts`).

  ALTDATEN. Nichts wird umgeschrieben. Ein heute noch offener Link, dessen
  Angebot inzwischen eine neuere Fassung hat, gilt ab dieser Migration nicht
  mehr — genau der Fall, vor dem die Durchsicht warnt.
*/

-- Die jüngste Fassung, die nach dem Link entstand (nicht im Papierkorb) — oder keine.
create or replace function app.angebot_link_neuere_fassung(l public.angebot_links) returns text
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select x.quote_number
    from public.quotes x
   where x.id in (select app.angebot_fassungen(l.quote_id))
     and x.id <> l.quote_id
     and x.status <> 'Verworfen'
     and x.created_at > l.erzeugt_am
   order by x.created_at desc, x.id
   limit 1
$$;

revoke all on function app.angebot_link_neuere_fassung(public.angebot_links) from public, anon, authenticated;

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
    when app.angebot_link_inhalt(q) is distinct from l.schnappschuss -> 'angebot' then 'geaendert'
    else 'offen'
  end
$$;

revoke all on function app.angebot_link_zustand(public.angebot_links, public.quotes) from public, anon, authenticated;

/* Der Kunde sieht „neuere Fassung“ bis zum letzten Gültigkeitstag — `abgelaufen` geht in `angebot_link_zustand` vor. */
create or replace function app.angebot_link_kundensicht(l public.angebot_links, q public.quotes) returns text
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare
  zustand text;
  heute date := (now() at time zone 'Europe/Vienna')::date;
begin
  if l.id is null or app.betrieb_ruht(l.company_id)
     or not app.modul_aktiv(l.company_id, 'angebote.online_annahme') then
    return null;
  end if;
  zustand := app.angebot_link_zustand(l, q);
  if zustand in ('offen', 'neuere_fassung') then
    return zustand;
  end if;
  if zustand = 'angenommen'
     and heute <= greatest(l.gueltig_bis, (l.angenommen_am at time zone 'Europe/Vienna')::date + 30) then
    return zustand;
  end if;
  if zustand = 'abgelehnt'
     and heute <= greatest(l.gueltig_bis, (l.abgelehnt_am at time zone 'Europe/Vienna')::date + 30) then
    return zustand;
  end if;
  return null;
end;
$$;

revoke all on function app.angebot_link_kundensicht(public.angebot_links, public.quotes) from public, anon, authenticated;

/*
  Bei `neuere_fassung` nur, wer das Angebot schickte und welche Nummer es
  trug — nicht der überholte Inhalt: wer ihn sieht, nimmt ihn für gültig.
*/
create or replace function app.angebot_link_antwort(l public.angebot_links, p_zustand text) returns jsonb
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select case when p_zustand = 'neuere_fassung' then
    jsonb_build_object(
      'zustand', p_zustand,
      'firma', l.schnappschuss -> 'aussteller' ->> 'name',
      'angebot', l.schnappschuss -> 'angebot' ->> 'quoteNumber')
  else
    jsonb_build_object(
      'zustand', p_zustand,
      'gueltig_bis', l.gueltig_bis,
      'schnappschuss', l.schnappschuss,
      'pruefsumme', l.schnappschuss_hash)
    || case p_zustand
         when 'angenommen' then jsonb_build_object('entschieden_am', l.angenommen_am, 'name', l.angenommen_name)
         when 'abgelehnt' then jsonb_build_object('entschieden_am', l.abgelehnt_am, 'name', l.abgelehnt_name)
         else '{}'::jsonb
       end
  end
$$;

revoke all on function app.angebot_link_antwort(public.angebot_links, text) from public, anon, authenticated;

/* Das Büro: welche Fassung den Link überholt hat. */
create or replace function public.angebot_links_stand(p_angebot uuid) returns jsonb
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare
  q public.quotes;
begin
  if not ((select app.ist_fuehrung()) or (select app.ist_buch_oder_spitze())) then
    raise exception 'Annahme-Links liest, wer die Angebote liest' using errcode = '42501';
  end if;
  select * into q from public.quotes where id = p_angebot and company_id = (select app.lesebetrieb());
  if q.id is null then raise exception 'Angebot nicht gefunden' using errcode = 'P0002'; end if;
  return (
    select coalesce(jsonb_agg(
             to_jsonb(l) - array['schluessel_hash', 'schnappschuss', 'anfragen_fenster_ab', 'anfragen_im_fenster']
             || jsonb_build_object('zustand', app.angebot_link_zustand(l, q),
                                   'neuere_fassung', app.angebot_link_neuere_fassung(l))
             order by l.erzeugt_am desc, l.id), '[]'::jsonb)
      from public.angebot_links l
     where l.company_id = q.company_id and l.quote_id = q.id);
end;
$$;

revoke all on function public.angebot_links_stand(uuid) from public, anon;
grant execute on function public.angebot_links_stand(uuid) to authenticated;
