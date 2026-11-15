-- Nacharbeit F16 (Durchsicht 15.11.2026): Mahnung per Mail — Zahlungserinnerung
-- und Mahnstufen über dieselbe Edge Function, denselben Dialog und dasselbe
-- Protokoll wie Rechnung und Angebot.
--
-- DER BESTEHENDE ABLAUF BLEIBT: Eine Mahnung entsteht wie bisher im
-- Mahndialog — erst das Schreiben, dann `mahnung_festhalten`, das Stufe,
-- `gemahnt_am`, Frist und Spesen setzt und den Inhalt speichert. Per Mail
-- geht danach genau diese gespeicherte Mahnung hinaus (das PDF aus ihrem
-- Inhalt mit den Firmendaten von damals, wie „PDF“ in der Rechnung). Das
-- Senden setzt die Stufe also nicht ein zweites Mal — sie ist mit dem
-- Erstellen gesetzt, genau wie heute; die App bietet das Senden gleich nach
-- dem Erstellen an.
--
-- REGELN: wer mahnt (Buchhaltung, Geschäftsführung, Administration), nur die
-- jüngste Mahnung der Rechnung, nicht nach Storno oder Bezahlung. Das
-- Rate-Limit zählt mit — je Beleg über die Rechnung: Rechnung und ihre
-- Mahnungen zusammen höchstens fünfmal je Stunde.
--
-- Protokoll: `beleg_versand.art = 'mahnung'` mit `mahnung_id` und der
-- Rechnung (`invoice_id`) — so steht der Versand im Verlauf der Rechnung,
-- in der Datenauskunft des Kunden und in seiner Löschung (beide gehen über
-- die Rechnung). Vorlage je Betrieb: `beleg_mail_vorlagen.mahnung`.
--
-- Verträglich mit der alten App: eine neue Spalte, eine erweiterte Prüfregel,
-- ersetzte eigene Funktionen (aus 20261117041000, sonst von niemandem
-- geändert).

alter table public.beleg_versand
  add column if not exists mahnung_id uuid references public.mahnungen(id) on delete set null;

create index if not exists beleg_versand_mahnung on public.beleg_versand (mahnung_id) where mahnung_id is not null;

comment on column public.beleg_versand.mahnung_id is
  'Nacharbeit F16: die gespeicherte Mahnung, die hinausging (art = mahnung); invoice_id trägt dazu ihre Rechnung.';

alter table public.beleg_versand drop constraint if exists beleg_versand_art_check;
alter table public.beleg_versand add constraint beleg_versand_art_check
  check (art in ('rechnung', 'angebot', 'mahnung'));

-- Die Mahnung liest, wer Rechnungen liest — wie `mahnungen_lesen`.
drop policy if exists beleg_versand_lesen on public.beleg_versand;
create policy beleg_versand_lesen on public.beleg_versand
  for select using (
    (company_id = (select app.lesebetrieb())
      and case art
            when 'rechnung' then (select app.ist_buch_oder_spitze())
            when 'mahnung' then (select app.ist_buch_oder_spitze())
            when 'angebot' then (select app.ist_fuehrung()) or (select app.ist_buch_oder_spitze())
            else false
          end)
    or company_id = (select app.supportbetrieb()));

-- Die Vorlagen kennen jetzt auch die Mahnung.
create or replace function app.mail_vorlagen_gueltig(p jsonb) returns boolean
  language sql
  immutable
  set search_path = ''
as $$
  select p is null or (
    jsonb_typeof(p) = 'object'
    and not exists (select 1 from jsonb_object_keys(p) k where k not in ('rechnung', 'angebot', 'mahnung'))
    and not exists (
      select 1 from jsonb_each(p) e
       where jsonb_typeof(e.value) <> 'object'
          or exists (select 1 from jsonb_object_keys(e.value) f where f not in ('betreff', 'text'))
          or (e.value ? 'betreff' and (jsonb_typeof(e.value -> 'betreff') <> 'string'
                                       or char_length(e.value ->> 'betreff') > 200
                                       or (e.value ->> 'betreff') ~ '[\r\n]'))
          or (e.value ? 'text' and (jsonb_typeof(e.value -> 'text') <> 'string'
                                    or char_length(e.value ->> 'text') > 10000))))
$$;

revoke all on function app.mail_vorlagen_gueltig(jsonb) from public, anon;
grant execute on function app.mail_vorlagen_gueltig(jsonb) to authenticated, service_role;

create or replace function public.beleg_versand_vorbereiten(
  p_art text,
  p_beleg uuid,
  p_an text[],
  p_kopie boolean,
  p_betreff text,
  p_anhang_bytes integer,
  p_anhang_sha256 text,
  p_mit_link boolean default false
) returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  betrieb text := app.betrieb();
  firma public.companies;
  rechnung public.invoices;
  angebot public.quotes;
  mahnung public.mahnungen;
  letzte uuid;
  nummer text;
  adresse text;
  wer text;
  neu uuid;
  heute date := (now() at time zone 'Europe/Vienna')::date;
begin
  if betrieb is null or not app.betriebsmitglied(betrieb) then
    raise exception 'Belege per Mail sendet, wer im Betrieb angemeldet ist.' using errcode = '42501';
  end if;
  if p_art = 'rechnung' then
    if not app.hat_rolle(array['Buchhaltung', 'Geschäftsführung', 'Administrator']) then
      raise exception 'Rechnungen per Mail sendet, wer Rechnungen schreibt.' using errcode = '42501';
    end if;
  elsif p_art = 'mahnung' then
    -- Wie beim Mahnen (`mahnungen_anlegen`): wer Rechnungen schreibt.
    if not app.hat_rolle(array['Buchhaltung', 'Geschäftsführung', 'Administrator']) then
      raise exception 'Mahnungen per Mail sendet, wer mahnt.' using errcode = '42501';
    end if;
  elsif p_art = 'angebot' then
    if not app.hat_rolle(array['Projektleiter', 'Geschäftsführung', 'Administrator']) then
      raise exception 'Angebote per Mail sendet die Führung.' using errcode = '42501';
    end if;
  else
    raise exception 'Per Mail gehen Rechnungen, Mahnungen und Angebote.' using errcode = '22023';
  end if;

  select * into firma from public.companies c where c.id = betrieb;
  if firma.beleg_mail_antwort is null then
    raise exception 'Bitte zuerst unter Einstellungen → Rechnungsvorgaben eine Antwortadresse für Belege eintragen — dorthin antwortet der Kunde.'
      using errcode = '55000';
  end if;

  -- Empfänger: eine bis drei gültige Adressen, jede einmal.
  if p_an is null or cardinality(p_an) not between 1 and 3 then
    raise exception 'Eine bis drei Empfängeradressen.' using errcode = '22023';
  end if;
  foreach adresse in array p_an loop
    if not app.mailadresse_gueltig(adresse) then
      raise exception '„%“ ist keine gültige E-Mail-Adresse.', left(coalesce(adresse, ''), 80) using errcode = '22023';
    end if;
  end loop;
  if (select count(distinct lower(a)) from unnest(p_an) a) <> cardinality(p_an) then
    raise exception 'Jede Empfängeradresse nur einmal.' using errcode = '22023';
  end if;
  if p_betreff is null or char_length(btrim(p_betreff)) not between 1 and 200 or p_betreff ~ '[\r\n]' then
    raise exception 'Der Betreff steht in einer Zeile und hat 1 bis 200 Zeichen.' using errcode = '22023';
  end if;
  if p_anhang_bytes is null or p_anhang_bytes not between 1 and 6291456 then
    raise exception 'Der Anhang ist leer oder größer als 6 MB.' using errcode = '22023';
  end if;
  if p_anhang_sha256 is null or p_anhang_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'Die Prüfsumme des Anhangs fehlt.' using errcode = '22023';
  end if;

  if p_art = 'rechnung' then
    if coalesce(p_mit_link, false) then
      raise exception 'Einen Annahme-Link gibt es nur beim Angebot.' using errcode = '22023';
    end if;
    select * into rechnung from public.invoices i where i.id = p_beleg and i.company_id = betrieb;
    if rechnung.id is null then
      raise exception 'Diese Rechnung gibt es hier nicht.' using errcode = 'P0002';
    end if;
    if rechnung.payment_status = 'Storniert' then
      raise exception 'Rechnung % ist storniert — eine stornierte Forderung geht nicht mehr hinaus.', rechnung.invoice_number
        using errcode = '55000';
    end if;
    nummer := rechnung.invoice_number;
  elsif p_art = 'mahnung' then
    if coalesce(p_mit_link, false) then
      raise exception 'Einen Annahme-Link gibt es nur beim Angebot.' using errcode = '22023';
    end if;
    select * into mahnung from public.mahnungen m where m.id = p_beleg and m.company_id = betrieb;
    if mahnung.id is null then
      raise exception 'Diese Mahnung gibt es hier nicht.' using errcode = 'P0002';
    end if;
    select * into rechnung from public.invoices i where i.id = mahnung.invoice_id;
    if rechnung.payment_status = 'Storniert' then
      raise exception 'Rechnung % ist storniert — die Mahnung geht nicht mehr hinaus.', rechnung.invoice_number
        using errcode = '55000';
    end if;
    if rechnung.payment_status in ('Bezahlt', 'Überzahlt') or rechnung.total_brutto - rechnung.bezahlt_betrag <= 0 then
      raise exception 'Rechnung % ist inzwischen bezahlt — die Mahnung geht nicht mehr hinaus.', rechnung.invoice_number
        using errcode = '55000';
    end if;
    -- Nur die jüngste Mahnung: eine ältere Stufe nach einer neueren hinauszuschicken, nähme die Mahnung zurück.
    select m.id into letzte from public.mahnungen m
     where m.invoice_id = rechnung.id order by m.stufe desc, m.datum desc, m.angelegt_am desc limit 1;
    if letzte is distinct from mahnung.id then
      raise exception 'Zu Rechnung % gibt es eine neuere Mahnung — per Mail geht nur die jüngste.', rechnung.invoice_number
        using errcode = '55000';
    end if;
    nummer := rechnung.invoice_number;
  else
    select * into angebot from public.quotes q where q.id = p_beleg and q.company_id = betrieb;
    if angebot.id is null then
      raise exception 'Dieses Angebot gibt es hier nicht.' using errcode = 'P0002';
    end if;
    if angebot.status not in ('Entwurf', 'Versendet', 'Angenommen') then
      raise exception 'Angebot % ist „%“ — es geht nicht mehr hinaus.', angebot.quote_number, angebot.status
        using errcode = '55000';
    end if;
    -- A5: ein leeres Angebot geht nicht hinaus — auch nicht per Mail.
    if angebot.status = 'Entwurf' and not app.angebot_hat_position(angebot.id) then
      raise exception 'Angebot % hat keine Position — ein leeres Angebot wird nicht versendet', angebot.quote_number
        using errcode = '55000';
    end if;
    -- Mit Link nur, wenn es einen offenen gibt: sonst stünde im Protokoll ein Link, den der Kunde nicht öffnen kann.
    if coalesce(p_mit_link, false) and not exists (
         select 1 from public.angebot_links a
          where a.quote_id = angebot.id and a.widerrufen_am is null
            and a.angenommen_am is null and a.abgelehnt_am is null and a.gueltig_bis >= heute) then
      raise exception 'Zu Angebot % gibt es keinen offenen Annahme-Link.', angebot.quote_number using errcode = '55000';
    end if;
    nummer := angebot.quote_number;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('beleg_versand:' || betrieb, 0));
  if (select count(*) from public.beleg_versand v
       where v.company_id = betrieb and v.von_uid = auth.uid() and v.angefragt_am > now() - interval '1 hour') >= 30
     or (select count(*) from public.beleg_versand v
          where v.company_id = betrieb and v.angefragt_am > now() - interval '1 hour') >= 100
     or (select count(*) from public.beleg_versand v
          where v.company_id = betrieb and v.angefragt_am > now() - interval '1 day') >= 400 then
    raise exception 'Zu viele Mails in kurzer Zeit — bitte später noch einmal versuchen.' using errcode = 'P0429';
  end if;
  if (select count(*) from public.beleg_versand v
       where v.company_id = betrieb and v.angefragt_am > now() - interval '1 hour'
         and (v.invoice_id = coalesce(rechnung.id, p_beleg) or v.quote_id = p_beleg)) >= 5 then
    raise exception '% ging in der letzten Stunde schon fünfmal hinaus — bitte später noch einmal versuchen.', nummer
      using errcode = 'P0429';
  end if;

  select u.name into wer from public.users u where u.id = auth.uid();
  insert into public.beleg_versand
    (company_id, art, invoice_id, quote_id, mahnung_id, beleg_nummer, an, kopie_an, betreff, anhang_name, anhang_bytes,
     anhang_sha256, mit_link, von_uid, von_name)
  values
    (betrieb, p_art, rechnung.id, angebot.id, mahnung.id, nummer, p_an,
     case when coalesce(p_kopie, false) then firma.beleg_mail_antwort end,
     btrim(p_betreff),
     (case p_art when 'rechnung' then 'Rechnung_' when 'angebot' then 'Angebot_'
        else case mahnung.stufe when 1 then 'Zahlungserinnerung_' when 2 then 'Mahnung_' else 'Letzte_Mahnung_' end
      end) || regexp_replace(nummer, '[^A-Za-z0-9._-]', '_', 'g') || '.pdf',
     p_anhang_bytes, p_anhang_sha256, coalesce(p_mit_link, false), auth.uid(), wer)
  returning id into neu;

  return jsonb_build_object(
    'id', neu,
    'nummer', nummer,
    'firma', firma.name,
    'antwort', firma.beleg_mail_antwort,
    'kopie', case when coalesce(p_kopie, false) then firma.beleg_mail_antwort end,
    'dateiname', (select v.anhang_name from public.beleg_versand v where v.id = neu));
end;
$$;

revoke all on function public.beleg_versand_vorbereiten(text, uuid, text[], boolean, text, integer, text, boolean) from public, anon;
grant execute on function public.beleg_versand_vorbereiten(text, uuid, text[], boolean, text, integer, text, boolean) to authenticated;

/*
  IM VERLAUF DER RECHNUNG: der Zweig von `beleg_versand` in `objekt_verlauf`
  ordnet eine Mahnung der Rechnung zu (Objektart „rechnung“) und nennt die
  Belegart (`beleg_art`). Ersetzt wird genau dieser Zweig; die übrigen
  Quellen bleiben, wie andere Migrationen sie gesetzt haben.
*/
do $migration$
declare
  bisher text := rtrim(btrim(pg_get_viewdef('public.objekt_verlauf'::regclass, true)), ';');
  teile text[];
  neu text := '';
  t text;
  gefunden integer := 0;
begin
  if position('beleg_art' in bisher) > 0 then
    return;
  end if;
  teile := string_to_array(bisher, 'UNION ALL');
  foreach t in array teile loop
    if position('beleg_versand' in t) > 0 then
      gefunden := gefunden + 1;
      t := $teil$
 SELECT 'beleg_versand'::text AS quelle,
    v.id::text AS id,
    v.company_id,
    CASE WHEN v.art = 'angebot' THEN 'angebot' ELSE 'rechnung' END AS objektart,
    coalesce(v.invoice_id, v.quote_id) AS objekt_id,
    NULL::uuid AS bezug_id,
    CASE v.zustand
      WHEN 'versendet' THEN 'per_mail_versendet'
      WHEN 'gescheitert' THEN 'mailversand_gescheitert'
      ELSE 'mailversand_laeuft'
    END AS art,
    jsonb_build_object('an', to_jsonb(v.an), 'kopie', v.kopie_an, 'betreff', v.betreff, 'anhang', v.anhang_name,
      'mit_link', v.mit_link, 'fehler', v.fehler, 'beleg_art', v.art) AS aenderungen,
    v.beleg_nummer AS bezeichnung,
    v.von_name,
    v.angefragt_am AS am
   FROM public.beleg_versand v
  WHERE coalesce(v.invoice_id, v.quote_id) IS NOT NULL
$teil$;
    end if;
    neu := neu || case when neu = '' then '' else ' UNION ALL ' end || t;
  end loop;
  if gefunden <> 1 then
    raise exception 'objekt_verlauf: Zweig beleg_versand % mal gefunden', gefunden;
  end if;
  execute 'create or replace view public.objekt_verlauf with (security_invoker = true) as ' || neu;
end;
$migration$;
