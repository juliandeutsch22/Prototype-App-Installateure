/*
  DIE VORSCHAU DER NÄCHSTEN NUMMERN MIT DEM JAHR VOM SERVER
  (Durchsicht 15.11.2026, G12).

  NACHGESTELLT. Die Einstellungen („Nummernkreise“) fragten
  `naechste_nummern(<Jahr des Geräts>)` und setzten die Vorschau mit demselben
  Jahr zusammen. Seit G5/G10 vergibt der Server Rechnungs-, Angebots- und
  Baustellennummern aber im laufenden Jahr in Wien. Ein Gerät mit falscher Uhr
  (im Test: 2031) zeigte deshalb „Nächste: RE-2031-1001“ — eine Nummer aus
  einem Kreis, den es nicht gibt, während die nächste echte Rechnung
  RE-2026-0042 hieß. Zu Silvester zeigt ein vorgehendes Gerät ebenso das
  falsche Jahr.

  DIE LÖSUNG, NUR ANZEIGE. `naechste_nummern_vorschau()` fragt kein Jahr,
  nimmt das laufende in Wien und gibt es mit jeder Zeile zurück — die App baut
  die Vorschau mit genau diesem Jahr. Vergeben wird hier nichts (`stable`).
  `naechste_nummern(p_jahr)` bleibt unverändert für die alte App.

  Rechte wie `naechste_nummern`: angemeldet und einem Betrieb zugeordnet; die
  Zahl der nächsten Nummer ist keine geschützte Angabe (sie steht auf jedem
  Beleg).
*/
create or replace function public.naechste_nummern_vorschau()
  returns table (art text, naechste integer, jahr integer)
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select n.art, n.naechste, j.jahr
    from (select extract(year from (now() at time zone 'Europe/Vienna'))::integer as jahr) j
    cross join lateral public.naechste_nummern(j.jahr) n
$$;

revoke all on function public.naechste_nummern_vorschau() from public, anon;
grant execute on function public.naechste_nummern_vorschau() to authenticated;
