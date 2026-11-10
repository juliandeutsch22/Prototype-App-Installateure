/*
  NACHRICHTEN: DIE ZAHL BLEIBT EHRLICH (Durchsicht 10.11.2026) — drei
  Korrekturen an den Funktionen aus `20261108800000_nachrichten.sql`. Keine
  Tabelle ändert sich, keine Zeile wird umgeschrieben; jede Funktion ist die
  volle letzte Fassung mit der einen Änderung.

  1. WER DIE BAUSTELLE NICHT MEHR SIEHT, ZÄHLT DORT NICHTS. Die Zahl im Menü
     und auf der Startseite summierte jede eigene Teilnahme; der Posteingang
     zeigt aber nur Threads, deren Baustelle man noch sieht, und „gelesen“
     weist bei den anderen ab. Wer aus dem Team genommen wurde, behielt so
     eine Zahl, die er nirgends sah und nie loswurde. Jetzt zählt
     `nachrichten_ungelesen` mit derselben Bedingung wie der Posteingang;
     `offene_posten` und die App fragen sie. Die Zahl in der Zeile bleibt
     stehen: wer die Baustelle wieder sieht, hat sein Ungelesenes wieder.

  2. LÖSCHEN NIMMT NUR, WAS GEZÄHLT WURDE. Eine Nachricht von vor dem
     Beitritt (Runde) bzw. vor dem Wieder-Folgen (Baustelle) war nie in der
     Zahl dieser Person, das Löschen zog sie trotzdem ab. Jetzt nur, wenn sie
     ab dem, was die Person sieht (`sichtbar_ab`), und ab ihrem Beitritt kam.
     Damit das beim Wieder-Folgen und beim Wieder-Erwähnen stimmt, setzt
     beides `beigetreten_am` neu — nur bei einer verlassenen Teilnahme; wer
     schon folgt, behält seinen Beitritt.

  3. STUMM SCHALTEN MACHT NICHT ZUM FOLGENDEN. Es legte bei einem Thread, dem
     man nicht folgt, eine Teilnahme an — ab da kamen Zahl und Teilnahme wie
     beim Folgen. Jetzt ändert es nur eine vorhandene Teilnahme; eine
     verlassene bleibt verlassen.
*/

-- ---------------------------------------------------------------------------
-- 1. Die eigene Zahl — wie der Posteingang
-- ---------------------------------------------------------------------------

/*
  DIE EIGENE ZAHL UNGELESENER NACHRICHTEN, über alle Gespräche, die der
  Posteingang zeigt: privat, solange man drin ist; beim Thread nur, solange
  man die Baustelle sieht (`nachrichten_postfach`, `app.nachrichten_baustelle_lesbar`).
  Weist nie ab — das Menü fragt bei jedem Seitenwechsel, auch ohne Konto
  eines Betriebs; dann ist es null.
*/
create or replace function public.nachrichten_ungelesen() returns bigint
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select coalesce(sum(t.ungelesen), 0)::bigint
    from public.nachrichten_teilnehmer t
    join public.nachrichten_kanaele k on k.id = t.kanal_id
   where t.user_id = auth.uid()
     and t.company_id = app.betrieb()
     and t.verlassen_am is null
     and t.ungelesen > 0
     and not app.ist_plattform()
     and (k.privat or app.nachrichten_baustelle_lesbar(k.project_id, t.user_id))
$$;

revoke all on function public.nachrichten_ungelesen() from public, anon;
grant execute on function public.nachrichten_ungelesen() to authenticated, service_role;

/*
  OFFENE POSTEN — Fassung aus `20261108800000_nachrichten.sql`; nur die
  Nachrichten zählt jetzt `nachrichten_ungelesen`.
*/
create or replace function public.offene_posten(p_heute date default current_date)
  returns table (urlaub bigint, anforderungen bigint, mahnungen bigint, nachrichten bigint)
  language sql stable
  set search_path = ''
as $$
  select
    case when app.darf_urlaub_entscheiden(app.betrieb())
      then (select count(*) from public.vacations v
             where v.company_id = app.betrieb()
               and v.status = 'Beantragt'
               and (v.user_id is distinct from auth.uid()
                    or not app.entscheidet_jemand_anderer(v.company_id, v.user_id)))
      else 0::bigint end,

    case when app.hat_rolle(array['Verwaltung']) or app.ist_fuehrung()
      then (select count(*) from public.material_orders m
             where m.company_id = app.betrieb()
               and m.status = 'Offen')
      else 0::bigint end,

    case when app.ist_buch_oder_spitze()
      then (select count(*) from public.invoices i
             where i.company_id = app.betrieb()
               -- Wortgleich zum Teilindex `invoices_offen`; steht hier etwas
               -- anderes, greift er nicht mehr.
               and i.payment_status in ('Offen', 'Überfällig', 'Teilbezahlt')
               and i.total_brutto - i.bezahlt_betrag > 0
               and app.mahnung_faellig(i.payment_status, app.mahnbar_ab(i, p_heute), i.mahnstufe,
                                       i.gemahnt_am, i.mahnfrist, p_heute))
      else 0::bigint end,

    public.nachrichten_ungelesen()
$$;

revoke all on function public.offene_posten(date) from public, anon;
grant execute on function public.offene_posten(date) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Löschen nimmt nur, was gezählt wurde
-- ---------------------------------------------------------------------------

/*
  SENDEN — Fassung aus `20261108800000_nachrichten.sql`. Geändert: wer beim
  Thread als Entfolgter schreibt oder erwähnt wird, folgt ab jetzt wieder —
  mit neuem Beitritt, damit das Löschen einer älteren Nachricht ihm nichts
  abzieht. Wer schon folgt, bleibt unberührt.
*/
create or replace function public.nachricht_senden(
  p_id uuid,
  p_kanal uuid,
  p_text text,
  p_anhaenge jsonb default '[]'::jsonb,
  p_erwaehnt uuid[] default '{}'::uuid[],
  p_geraet_zeit timestamptz default null,
  p_aus uuid default null
) returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  ich public.users := app.darf_nachrichten();
  k public.nachrichten_kanaele;
  vorhanden public.nachrichten;
  aus public.nachrichten;
  sperre text;
  inhalt text := nullif(btrim(coalesce(p_text, ''), E' \t\r\n'), '');
  dateien jsonb := coalesce(p_anhaenge, '[]'::jsonb);
  eimer text;
  hash text;
  erwaehnt uuid[] := '{}'::uuid[];
  a jsonb;
  objekt record;
  nr integer := 0;
  jetzt timestamptz := clock_timestamp();
begin
  if p_id is null or p_kanal is null then
    raise exception 'Kennung und Gespräch fehlen' using errcode = '22023';
  end if;
  if jsonb_typeof(dateien) <> 'array' then
    raise exception 'Anhänge als Liste erwartet' using errcode = '22023';
  end if;
  select * into k from public.nachrichten_kanaele where id = p_kanal and company_id = ich.company_id;
  if k.id is null then
    raise exception 'Dieses Gespräch gibt es nicht' using errcode = '42501';
  end if;
  eimer := case when k.privat then 'nachrichten-privat' else 'nachrichten' end;

  hash := md5(concat_ws('|', k.id::text, coalesce(inhalt, ''),
                        (select coalesce(string_agg(x ->> 'id', ',' order by x ->> 'id'), '')
                           from jsonb_array_elements(dateien) x)));

  -- Schon angekommen? Dann ist dies die Zweitzustellung aus dem Ausgangsfach.
  select * into vorhanden from public.nachrichten where id = p_id;
  if vorhanden.id is not null then
    if vorhanden.von_uid is not distinct from ich.id and vorhanden.kanal_id = k.id and vorhanden.sende_hash = hash then
      return jsonb_build_object('id', vorhanden.id, 'gesendet_am', vorhanden.gesendet_am, 'neu', false);
    end if;
    raise exception 'Unter dieser Kennung steht schon eine andere Nachricht' using errcode = '23505';
  end if;

  sperre := app.nachrichten_schreibsperre(k.id);
  if sperre is not null then
    raise exception '%', sperre using errcode = case when app.nachrichten_kanal_lesbar(k.id) then '55000' else '42501' end;
  end if;
  if inhalt is null and jsonb_array_length(dateien) = 0 then
    raise exception 'Eine Nachricht braucht einen Text oder einen Anhang' using errcode = '22023';
  end if;
  if length(inhalt) > 20000 then
    raise exception 'Eine Nachricht hat höchstens 20 000 Zeichen — längere Texte bitte als Datei anhängen' using errcode = '22001';
  end if;

  -- Übernahme in die Baustelle: nur die eigene, private, nicht gelöschte Nachricht.
  if p_aus is not null then
    select * into aus from public.nachrichten where id = p_aus and company_id = ich.company_id;
    if aus.id is null or aus.von_uid is distinct from ich.id or not aus.privat or aus.geloescht_am is not null
       or not app.nachrichten_kanal_lesbar(aus.kanal_id) then
      raise exception 'Übernehmen lässt sich nur eine eigene Nachricht aus einem privaten Gespräch' using errcode = '42501';
    end if;
    if k.art <> 'baustelle' then
      raise exception 'Übernommen wird in den Thread einer Baustelle' using errcode = '22023';
    end if;
  end if;

  if k.art <> 'direkt' then
    select coalesce(array_agg(distinct x), '{}'::uuid[]) into erwaehnt
      from unnest(coalesce(p_erwaehnt, '{}'::uuid[])) x
     where x <> ich.id
       and case when k.privat
                then exists (select 1 from public.nachrichten_teilnehmer t join public.users u on u.id = t.user_id and u.active
                              where t.kanal_id = k.id and t.user_id = x and t.verlassen_am is null)
                else app.nachrichten_baustelle_lesbar(k.project_id, x) end;
  end if;

  insert into public.nachrichten (id, kanal_id, company_id, von_uid, von_name, text, erwaehnt,
                                  gesendet_am, geraet_zeit, sende_hash)
  values (p_id, k.id, ich.company_id, ich.id, ich.name, inhalt, erwaehnt, jetzt, p_geraet_zeit, hash);

  for a in select * from jsonb_array_elements(dateien) loop
    begin
      perform (a ->> 'id')::uuid;
    exception when invalid_text_representation then
      raise exception 'Ein Anhang hat keine gültige Kennung' using errcode = '22023';
    end;
    select o.name, o.owner_id, coalesce((o.metadata ->> 'size')::bigint, 0) as bytes,
           coalesce(o.metadata ->> 'mimetype', 'application/octet-stream') as art
      into objekt
      from storage.objects o
     where o.bucket_id = eimer
       and o.name = format('nachrichten/%s/%s/%s/%s', ich.company_id, k.id, p_id, a ->> 'id');
    if objekt.name is null or objekt.owner_id is distinct from ich.id::text then
      raise exception 'Ein Anhang ist nicht (vollständig) hochgeladen' using errcode = '23503';
    end if;
    insert into public.nachricht_anhaenge (id, nachricht_id, kanal_id, company_id, eimer, pfad, name, bytes, inhaltsart, reihenfolge)
    values ((a ->> 'id')::uuid, p_id, k.id, ich.company_id, eimer, objekt.name,
            left(coalesce(nullif(btrim(a ->> 'name'), ''), 'Anhang'), 200), greatest(objekt.bytes, 1), objekt.art, nr);
    nr := nr + 1;
  end loop;

  update public.nachrichten_kanaele set letzte_nachricht_am = jetzt where id = k.id;

  -- Wer folgt: der Schreiber, die Erwähnten, beim Thread einer Baustelle auch Team und Leitung.
  insert into public.nachrichten_teilnehmer (kanal_id, user_id, company_id, beigetreten_am)
  select k.id, x, ich.company_id, jetzt
    from unnest(array[ich.id] || erwaehnt) x
  on conflict (kanal_id, user_id) do nothing;
  if k.art = 'baustelle' then
    update public.nachrichten_teilnehmer set verlassen_am = null, beigetreten_am = jetzt
     where kanal_id = k.id and (user_id = ich.id or user_id = any(erwaehnt)) and verlassen_am is not null;
    insert into public.nachrichten_teilnehmer (kanal_id, user_id, company_id, beigetreten_am)
    select k.id, x, ich.company_id, jetzt
      from public.projects p, unnest(p.assigned_employees || p.project_managers) x
     where p.id = k.project_id
       and exists (select 1 from public.users u where u.id = x and u.company_id = ich.company_id and u.active)
    on conflict (kanal_id, user_id) do nothing;
    -- Wer die Baustelle nicht mehr sieht, zählt hier nichts mehr.
    update public.nachrichten_teilnehmer t set ungelesen = 0
     where t.kanal_id = k.id and t.ungelesen > 0
       and not app.nachrichten_baustelle_lesbar(k.project_id, t.user_id);
  end if;

  update public.nachrichten_teilnehmer t
     set ungelesen = case when t.user_id = ich.id then 0 else t.ungelesen + 1 end,
         gelesen_bis = case when t.user_id = ich.id then jetzt else t.gelesen_bis end,
         zuletzt = jetzt
   where t.kanal_id = k.id and t.verlassen_am is null
     and (t.user_id = ich.id or k.privat or app.nachrichten_baustelle_lesbar(k.project_id, t.user_id));

  if aus.id is not null then
    update public.nachrichten set uebernommen_nach = p_id where id = aus.id;
  end if;

  perform app.push_anstossen(jsonb_build_object(
    'quelle', 'nachricht', 'art', 'neu',
    'zeile', jsonb_build_object('id', p_id, 'company_id', ich.company_id)));

  return jsonb_build_object('id', p_id, 'gesendet_am', jetzt, 'neu', true);
end;
$$;

revoke all on function public.nachricht_senden(uuid, uuid, text, jsonb, uuid[], timestamptz, uuid) from public, anon;
grant execute on function public.nachricht_senden(uuid, uuid, text, jsonb, uuid[], timestamptz, uuid) to authenticated;

/* LÖSCHEN — Fassung aus `20261108800000_nachrichten.sql`; abgezogen wird nur, wo sie gezählt wurde. */
create or replace function public.nachricht_loeschen(p_id uuid) returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  ich public.users := app.darf_nachrichten();
  n public.nachrichten;
begin
  select * into n from public.nachrichten where id = p_id and company_id = ich.company_id;
  if n.id is null or n.von_uid is distinct from ich.id or not app.nachrichten_kanal_lesbar(n.kanal_id) then
    raise exception 'Löschen lässt sich nur eine eigene Nachricht' using errcode = '42501';
  end if;
  if n.geloescht_am is not null then
    return;
  end if;
  update public.nachrichten set text = null, erwaehnt = '{}', bearbeitet_am = null, geloescht_am = now() where id = n.id;
  -- Wer sie noch nicht gelesen hatte, zählt sie nicht mehr — aber nur, wenn
  -- sie bei ihm gezählt wurde: vor dem (Wieder-)Beitritt bzw. vor dem, was
  -- er sehen darf, kam sie nicht in seine Zahl.
  update public.nachrichten_teilnehmer t set ungelesen = t.ungelesen - 1
   where t.kanal_id = n.kanal_id and t.user_id <> ich.id and t.ungelesen > 0
     and (t.gelesen_bis is null or t.gelesen_bis < n.gesendet_am)
     and n.gesendet_am >= greatest(t.sichtbar_ab, t.beigetreten_am);
  if app.nachrichten_anhaenge_entfernen(array[n.id]) > 0 then
    perform app.nachrichten_aufraeumen_anstossen();
  end if;
end;
$$;

revoke all on function public.nachricht_loeschen(uuid) from public, anon;
grant execute on function public.nachricht_loeschen(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Stumm und Folgen
-- ---------------------------------------------------------------------------

/*
  STUMM — keine Push-Meldung mehr aus diesem Gespräch, außer man wird
  erwähnt. Die Zahl bleibt. Nur an der eigenen vorhandenen Teilnahme: im
  privaten Gespräch hat sie jeder, der es lesen darf; beim Thread hat sie
  nur, wer folgt oder gefolgt ist — wer nur liest, bekommt ohnehin keinen
  Push, und eine neue Teilnahme hieße „folgt“.
*/
create or replace function public.nachrichten_stumm(p_kanal uuid, p_stumm boolean) returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare ich public.users := app.darf_nachrichten();
begin
  if not app.nachrichten_kanal_lesbar(p_kanal) then
    raise exception 'Dieses Gespräch gibt es nicht oder es ist nicht deines' using errcode = '42501';
  end if;
  update public.nachrichten_teilnehmer set stumm = coalesce(p_stumm, false)
   where kanal_id = p_kanal and user_id = ich.id;
end;
$$;

revoke all on function public.nachrichten_stumm(uuid, boolean) from public, anon;
grant execute on function public.nachrichten_stumm(uuid, boolean) to authenticated;

/*
  FOLGEN — Fassung aus `20261108800000_nachrichten.sql`. Geändert: wer
  wieder folgt, tritt neu bei (`beigetreten_am`); was vorher kam, war nicht in
  seiner Zahl und wird beim Löschen nicht abgezogen.
*/
create or replace function public.nachrichten_folgen(p_kanal uuid, p_folgen boolean) returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  ich public.users := app.darf_nachrichten();
  k public.nachrichten_kanaele;
begin
  select * into k from public.nachrichten_kanaele where id = p_kanal and company_id = ich.company_id;
  if k.id is null or k.art <> 'baustelle' or not app.nachrichten_kanal_lesbar(k.id) then
    raise exception 'Folgen gibt es beim Thread einer Baustelle' using errcode = '42501';
  end if;
  if coalesce(p_folgen, false) then
    insert into public.nachrichten_teilnehmer (kanal_id, user_id, company_id, gelesen_bis, zuletzt)
    values (k.id, ich.id, ich.company_id, clock_timestamp(), k.letzte_nachricht_am)
    on conflict (kanal_id, user_id) do update set verlassen_am = null, beigetreten_am = clock_timestamp()
     where public.nachrichten_teilnehmer.verlassen_am is not null;
  else
    update public.nachrichten_teilnehmer set verlassen_am = clock_timestamp(), ungelesen = 0
     where kanal_id = k.id and user_id = ich.id;
  end if;
end;
$$;

revoke all on function public.nachrichten_folgen(uuid, boolean) from public, anon;
grant execute on function public.nachrichten_folgen(uuid, boolean) to authenticated;
