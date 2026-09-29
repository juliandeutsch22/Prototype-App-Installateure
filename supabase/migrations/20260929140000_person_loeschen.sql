/*
  LÖSCHEN JE PERSON (DSGVO Art. 17; offene Punkte B8, Teil 2).

  Verlangt eine Person die Löschung, muss der Betrieb löschen, was er nicht
  mehr braucht — und darf nicht löschen, was er aufbewahren muss (Art. 17
  Abs. 3 lit. b). Für einen Installationsbetrieb in Österreich heisst das
  vor allem § 132 BAO: Bücher, Aufzeichnungen und Belege sieben Jahre, ab
  dem Ende des Kalenderjahrs. Darunter fallen Rechnungen und Zahlungen, die
  Scheine (sie sind der Leistungsnachweis zur Rechnung), Angebote (als
  Geschäftsbriefe), und bei der Belegschaft Zeitaufzeichnungen, Urlaube,
  Krankenstände und Monatsbilanzen — die Grundlage der Lohnverrechnung.

  WAS DIESER AUFRUF TUT — mit Probelauf, wie die Kundenübernahme:
    - SOFORT gelöscht wird, was keiner Aufbewahrung unterliegt:
        Belegschaft: Einstellungen und Push-Adressen, Einträge im
          Fehlerprotokoll, die Einsatzplanung (Einsätze, Rüstlisten, Teams
          und Leitung an Baustellen);
        Kunde: Wartungen (die Erinnerung ist eine Dienstleistung, keine
          Pflicht), Ansprechpartner, Telefon, E-Mail und Notizen — am Kunden
          und an seinen Baustellen.
    - GESPERRT (Art. 18) bleibt, was aufbewahrt werden muss: das Konto ist
      deaktiviert, der Kunde inaktiv. Der Bericht nennt je Art, wie viele
      Einträge es sind und bis wann sie aufbewahrt werden müssen.
    - Ein Kunde OHNE Belege — keine Baustelle, kein Angebot, keine Rechnung,
      kein Schein — geht ganz.

  WAS ER NICHT TUT, UND WARUM: Einträge nach Ablauf der Frist löschen. Vor
  2031 läuft in diesem Bestand keine Frist ab, und was dann geschehen soll
  — löschen oder anonymisieren, und was mit dem Namen einer Person auf den
  Belegen ANDERER (dem Schein des Kunden, dem Urlaub, den sie genehmigt
  hat) —, ist eine Entscheidung des Betriebs mit dem Steuerberater. Sie
  steht in `docs/offene-punkte.md`.

  NUR ÜBER DIE KENNUNG. Die Auskunft findet ältere Zeilen auch über den
  Namen; gelöscht wird so nie — ein Namensvetter verlöre sonst seine Daten.
  Über den Namen gefundene Belege zählen aber mit, wenn es darum geht, ob
  ein Kunde ganz gehen darf: im Zweifel bleibt er gesperrt.

  WER: wie bei der Auskunft nur Geschäftsführung und Administration des
  eigenen Betriebs, kein Support. Eine Person der Belegschaft muss zuerst
  deaktiviert sein — wer noch arbeitet, braucht seine Einsätze.
*/

-- Ende der Aufbewahrung nach § 132 BAO: sieben Jahre ab Ende des Kalenderjahrs.
create or replace function app.aufbewahrt_bis(p_datum date) returns date
  language sql immutable
  set search_path = ''
as $$
  select make_date(extract(year from p_datum)::integer + 7, 12, 31)
$$;

revoke all on function app.aufbewahrt_bis(date) from public, anon, authenticated;

create or replace function public.person_loeschen(
  p_art text,
  p_id uuid,
  p_nur_pruefen boolean default true
) returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  betrieb text := app.betrieb();
  person public.users;
  kunde public.customers;
  sofort jsonb;
  aufbewahren jsonb;
  ganz boolean := false;
  rechtsgrund constant text := '§ 132 BAO — sieben Jahre ab Ende des Kalenderjahrs';
begin
  if betrieb is null or not app.betriebsmitglied(betrieb)
     or not app.hat_rolle(array['Geschäftsführung', 'Administrator']) then
    raise exception 'Eine Löschung nach DSGVO veranlasst die Geschäftsführung'
      using errcode = '42501';
  end if;

  if p_art = 'mitarbeiter' then
    select * into person from public.users u where u.id = p_id and u.company_id = betrieb;
    if person.id is null then
      raise exception 'Diese Person gibt es in diesem Betrieb nicht' using errcode = 'P0002';
    end if;
    if person.active is distinct from false then
      raise exception 'Zuerst das Konto deaktivieren — wer noch arbeitet, braucht Einsätze und Zeiten'
        using errcode = '55000';
    end if;

    sofort := jsonb_build_object(
      'einstellungen', (select count(*) from public.user_prefs p where p.user_id = p_id),
      'fehlerprotokoll', (select count(*) from public.fehlerprotokoll f
                           where f.company_id = betrieb and f.user_id = p_id),
      'einsaetze', (select count(*) from public.assignments e
                     where e.company_id = betrieb and e.user_id = p_id),
      'ruestlisten', (select count(*) from public.einsatz_material r
                       where r.company_id = betrieb and p_id = any(r.uids)),
      'baustellen', (select count(*) from public.projects b
                      where b.company_id = betrieb
                        and (p_id = any(b.assigned_employees) or p_id = any(b.project_managers))));

    select coalesce(jsonb_agg(z) filter (where (z ->> 'anzahl')::integer > 0), '[]'::jsonb)
      into aufbewahren
      from (
        select jsonb_build_object('was', 'Zeitbuchungen', 'anzahl', count(*),
                                  'bis', max(app.aufbewahrt_bis(t.date)), 'grund', rechtsgrund) as z
          from public.time_entries t where t.company_id = betrieb and t.user_id = p_id
        union all
        select jsonb_build_object('was', 'Urlaube und Zeitausgleich', 'anzahl', count(*),
                                  'bis', max(app.aufbewahrt_bis(v.bis)), 'grund', rechtsgrund)
          from public.vacations v where v.company_id = betrieb and v.user_id = p_id
        union all
        select jsonb_build_object('was', 'Krankmeldungen', 'anzahl', count(*),
                                  'bis', max(app.aufbewahrt_bis(k.bis)), 'grund', rechtsgrund)
          from public.krankmeldungen k where k.company_id = betrieb and k.user_id = p_id
        union all
        select jsonb_build_object('was', 'Monatsbilanzen', 'anzahl', count(*),
                                  'bis', max(app.aufbewahrt_bis((m.monat || '-01')::date)), 'grund', rechtsgrund)
          from public.monthly_stats m where m.company_id = betrieb and m.user_id = p_id
        union all
        select jsonb_build_object('was', 'Materialanforderungen', 'anzahl', count(*),
                                  'bis', max(app.aufbewahrt_bis(o.created_at::date)), 'grund', rechtsgrund)
          from public.material_orders o where o.company_id = betrieb and o.user_id = p_id
      ) teile;

    if not p_nur_pruefen then
      delete from public.user_prefs p where p.user_id = p_id;
      delete from public.fehlerprotokoll f where f.company_id = betrieb and f.user_id = p_id;
      delete from public.assignments e where e.company_id = betrieb and e.user_id = p_id;
      update public.einsatz_material r
         set uids = array_remove(r.uids, p_id)
       where r.company_id = betrieb and p_id = any(r.uids);
      update public.projects b
         set assigned_employees = array_remove(b.assigned_employees, p_id),
             project_managers = array_remove(b.project_managers, p_id)
       where b.company_id = betrieb
         and (p_id = any(b.assigned_employees) or p_id = any(b.project_managers));
    end if;

    return jsonb_build_object(
      'art', 'mitarbeiter', 'person', person.name, 'geloescht', not p_nur_pruefen,
      'sofort', sofort, 'aufbewahren', aufbewahren, 'ganz', false,
      'hinweis', 'Das Konto bleibt deaktiviert. Name und Anmeldename bleiben, solange Einträge aufbewahrt werden müssen — sie stehen auf ihnen.');

  elsif p_art = 'kunde' then
    select * into kunde from public.customers c where c.id = p_id and c.company_id = betrieb;
    if kunde.id is null then
      raise exception 'Diesen Kunden gibt es in diesem Betrieb nicht' using errcode = 'P0002';
    end if;

    sofort := jsonb_build_object(
      'wartungen', (select count(*) from public.wartungen w
                     where w.company_id = betrieb and w.customer_id = p_id),
      'kontaktdaten', (select count(*) from (
                         select 1 where num_nonnulls(kunde.contact_name, kunde.contact_phone,
                                                     kunde.email, kunde.notes) > 0
                         union all
                         select 1 from public.projects b
                          where b.company_id = betrieb and b.customer_id = p_id
                            and num_nonnulls(b.contact_name, b.contact_phone) > 0) k));

    -- Über Kennung ODER Namen: im Zweifel bleibt der Kunde gesperrt.
    select coalesce(jsonb_agg(z) filter (where (z ->> 'anzahl')::integer > 0), '[]'::jsonb)
      into aufbewahren
      from (
        select jsonb_build_object('was', 'Rechnungen samt Zahlungen', 'anzahl', count(*),
                                  'bis', max(app.aufbewahrt_bis(r.invoice_date)), 'grund', rechtsgrund) as z
          from public.invoices r
         where r.company_id = betrieb
           and (r.customer_id = p_id or lower(btrim(r.customer_name)) = lower(btrim(kunde.name)))
        union all
        select jsonb_build_object('was', 'Scheine samt Unterschrift und Fotos', 'anzahl', count(*),
                                  'bis', max(app.aufbewahrt_bis(s.datum)), 'grund', rechtsgrund)
          from public.work_sheets s
         where s.company_id = betrieb
           and (s.customer_id = p_id or lower(btrim(s.customer_name)) = lower(btrim(kunde.name)))
        union all
        select jsonb_build_object('was', 'Angebote', 'anzahl', count(*),
                                  'bis', max(app.aufbewahrt_bis(q.quote_date)), 'grund', rechtsgrund)
          from public.quotes q
         where q.company_id = betrieb
           and (q.customer_id = p_id or lower(btrim(q.customer_name)) = lower(btrim(kunde.name)))
        union all
        -- Die Baustelle trägt Zeiten und Material der Belegschaft; sie geht
        -- mit dem letzten Beleg an ihr, frühestens sieben Jahre nach Anlage.
        select jsonb_build_object('was', 'Baustellen mit Name und Adresse', 'anzahl', count(*),
                                  'bis', max(app.aufbewahrt_bis(coalesce(b.end_date, b.created_at::date))),
                                  'grund', rechtsgrund)
          from public.projects b
         where b.company_id = betrieb
           and (b.customer_id = p_id or lower(btrim(b.customer_name)) = lower(btrim(kunde.name)))
      ) teile;

    ganz := jsonb_array_length(aufbewahren) = 0;

    if not p_nur_pruefen then
      delete from public.wartungen w where w.company_id = betrieb and w.customer_id = p_id;
      if ganz then
        delete from public.customers c where c.id = p_id;
      else
        update public.customers c
           set contact_name = null, contact_phone = null, email = null, notes = null, active = false
         where c.id = p_id;
        update public.projects b
           set contact_name = null, contact_phone = null
         where b.company_id = betrieb and b.customer_id = p_id
           and num_nonnulls(b.contact_name, b.contact_phone) > 0;
      end if;
    end if;

    return jsonb_build_object(
      'art', 'kunde', 'person', kunde.name, 'geloescht', not p_nur_pruefen,
      'sofort', sofort, 'aufbewahren', aufbewahren, 'ganz', ganz,
      'hinweis', case when ganz
        then 'Keine Belege — der Kunde geht ganz.'
        else 'Der Kunde bleibt inaktiv. Name, Adresse und UID bleiben, solange Belege aufbewahrt werden müssen — sie stehen auf ihnen.'
      end);

  else
    raise exception 'Unbekannte Art: % — erwartet „mitarbeiter" oder „kunde"', p_art
      using errcode = '22023';
  end if;
end;
$$;

revoke all on function public.person_loeschen(text, uuid, boolean) from public, anon;
grant execute on function public.person_loeschen(text, uuid, boolean) to authenticated;
