-- DER WOCHENPLAN FÜR ALLE — als Einstellung des Betriebs, ab Werk aus.
--
-- GEFRAGT: „Sollte der Wochenplan aus der Einsatzplanung für alle ersichtlich
-- sein?" In einem kleinen Betrieb hilft es, zu wissen, wer wo ist — für
-- Fahrgemeinschaften, geliehenes Werkzeug, eine kurze Rückfrage. Ob ein
-- Betrieb das will, entscheidet er selbst; deshalb ein Schalter und keine
-- Vorgabe.
--
-- WAS DER MONTEUR DABEI SIEHT UND WAS NICHT. Die Einsätze der Kollegen darf
-- er schon heute lesen (Zeilenschutz `assignments_lesen`). Die Urlaube der
-- anderen NICHT — und das bleibt so: `vacations_lesen` wird nicht angefasst.
-- Stattdessen liefert eine eigene Funktion für den Wochenplan genau drei
-- Dinge: WER, VON, BIS. Kein Grund, keine Tageszahl, kein Antragsstand,
-- keine Notiz. In der Ansicht heisst das „abwesend".

alter table companies
  add column if not exists wochenplan_fuer_alle boolean not null default false;

comment on column companies.wochenplan_fuer_alle is
  'Zeigt allen Mitarbeitern einen reinen Lese-Wochenplan (wer ist wo; '
  'Abwesenheit ohne Grund). Ab Werk aus.';

/*
  NUR GENEHMIGTER URLAUB, nur der eigene Betrieb, nur ein überschaubarer
  Zeitraum. SECURITY DEFINER, weil der Zeilenschutz der Urlaubstabelle dem
  Monteur fremde Zeilen verweigert — genau das soll er ja auch weiterhin tun.
  Die Funktion gibt deshalb nicht die Zeilen heraus, sondern nur, was der
  Wochenplan zeigt.

  Das Büro (Führung, Buchhaltung, Spitze) bekommt die Antwort auch bei
  ausgeschaltetem Schalter — es sieht dieselben Urlaube ohnehin in voller
  Form. Der Support nicht: `app.betriebsmitglied` schliesst ihn aus.
*/
create or replace function public.wochenplan_abwesend(p_von date, p_bis date)
  returns table (user_id uuid, von date, bis date)
  language sql stable
  security definer
  set search_path = ''
as $$
  select v.user_id, greatest(v.von, p_von), least(v.bis, p_bis)
    from public.vacations v
    join public.companies c on c.id = v.company_id
   where v.company_id = app.betrieb()
     and app.betriebsmitglied(v.company_id)
     and (c.wochenplan_fuer_alle or app.ist_fuehrung() or app.ist_buch_oder_spitze())
     and v.status = 'Genehmigt'
     and v.bis >= p_von
     and v.von <= p_bis
     and p_bis >= p_von
     and p_bis - p_von <= 62
$$;

revoke all on function public.wochenplan_abwesend(date, date) from public, anon;
grant execute on function public.wochenplan_abwesend(date, date) to authenticated;
