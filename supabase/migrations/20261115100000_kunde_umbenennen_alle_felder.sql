/*
  KUNDE UMBENENNEN: ALLE FELDER DER MASKE — UND KEIN STILLES VERSCHLUCKEN
  MEHR (Durchsicht 15.11.2026, A2).

  WAS FALSCH WAR. Wer einen Kunden in der Kundenakte oder der Kundenliste
  speichert, schickt den Namen mit, und `updateCustomer` geht dann über
  diese Funktion (damit der Name in derselben Transaktion an die Baustellen
  wandert). Die Fassung aus `20260930330000` zählt ihre Spalten einzeln auf;
  `lieferantennummer` kam erst mit `20261019300000` und fehlte darin. Die
  Nummer ging verloren, die Maske meldete „Gespeichert“. Derselbe Fehler war
  am 30.09. schon einmal da (Straße, PLZ, Ort, Land, Kundennummer).

  WAS SICH ÄNDERT.
  1. `lieferantennummer` wird übernommen — wie die Felder aus M12: steht der
     Schlüssel im Rest, gilt sein Wert, auch `null` (leeren).
  2. Ein Schlüssel, den die Funktion nicht kennt, wird ABGEWIESEN, bevor
     etwas geschrieben wird. Das ist der eigentliche Schutz: kommt die
     nächste Spalte dazu und fehlt hier, scheitert das Speichern sofort mit
     einer Meldung statt Wochen später als leeres Feld aufzufallen.
  3. Bewusst übergangen werden nur Spalten, die die Datenbank selbst führt
     (Kennung, Betrieb, Zeitstempel, die beiden Prüfmerker). Die heutige
     Oberfläche schickt keine davon; sie stehen hier, damit ein Aufrufer,
     der einmal den ganzen gelesenen Kunden zurückgibt, nicht scheitert —
     ihr Wert vom Gerät wäre ohnehin der falsche: `adresse_pruefen` und
     `angaben_pruefen` setzen die Auslöser `customers_adresse` und
     `customers_z_angaben_pruefen`, `updated_at` setzt `customers_updated_at`,
     den Betrieb hält `customers_betrieb_fest`.

  WAS GLEICH BLEIBT.
  - Die Signatur `(uuid, text, jsonb)`: Telefone mit der alten App rufen die
    Funktion weiter genau so auf. Die alte App schickt dieselben Schlüssel
    wie die neue (die Formulare in `KundenakteView.alsEntwurf` und im
    „Bearbeiten“ der Kundenliste haben seit dem 19.10. denselben Satz) —
    keiner davon wird jetzt abgewiesen.
  - Die Felder von früher behalten ihre Bedeutung: bei den sieben ältesten
    (Anschrift als Zeile, Ansprechpartner, Telefon, E-Mail, UID, Notizen,
    aktiv) heisst `null` weiter „unverändert“, bei den M12-Feldern und der
    Kundenart „leeren“. Die Oberfläche schickt bei Text nie `null`, sondern
    `''`; eine Vereinheitlichung brächte keinem Benutzer etwas und könnte
    einen Aufrufer treffen, der sich auf das Bisherige verlässt.

  WARUM WEITER MIT DEN RECHTEN DES AUFRUFERS (security invoker). Die Regel
  aus CLAUDE.md, neue Datenbankfunktionen als `security definer` anzulegen,
  ist für Funktionen gedacht, die selbst entscheiden, wer was darf. Diese
  hier soll das gerade NICHT: das Ändern des Kunden muss durch denselben
  Zeilenschutz (`customers_aendern`, Kunden pflegen, eigener Betrieb,
  Support nur lesend) wie der andere Zweig von `updateCustomer`, der ohne
  Namen direkt `update` schickt. Als `security definer` liefe sie am
  Zeilenschutz vorbei, und die Berechtigung stünde ein zweites Mal hier —
  zwei Wahrheiten, die auseinanderlaufen können. Der einzige Schritt, der
  mehr Rechte braucht (der Name auf den Baustellen), liegt schon in der eng
  geschnittenen `app.kundenname_nachziehen` und läuft erst, NACHDEM die
  Kundenzeile durch den Zeilenschutz gegangen ist.
  `set search_path = ''` bleibt; neu wird auch `anon` das Ausführen
  entzogen (bisher nur `public` — `anon` hatte die Freigabe aus den
  Voreinstellungen von Supabase behalten; ohne Anmeldung trifft der
  Zeilenschutz ohnehin keine Zeile).
*/

create or replace function public.kunde_umbenennen(
  p_kunde uuid,
  p_name text,
  p_rest jsonb default '{}'::jsonb
) returns integer
  language plpgsql
  set search_path = ''
as $$
declare
  rest jsonb := coalesce(p_rest, '{}'::jsonb);
  -- Was die Maske ändern darf. Kommt eine Spalte dazu: hier UND im
  -- `update` unten ergänzen (die Prüfung gegen die Datenbank,
  -- `tests/supabase/kundeUmbenennenFelder.test.ts`, fällt sonst um).
  uebernommen constant text[] := array[
    'address', 'contact_name', 'contact_phone', 'email', 'vat_id', 'notes', 'active',
    'strasse', 'plz', 'ort', 'land', 'kundennummer', 'kundenart', 'lieferantennummer'
  ];
  -- Setzt die Datenbank selbst (siehe Kopf) — mitgeschickt, wird es übergangen.
  uebergangen constant text[] := array[
    'id', 'company_id', 'created_at', 'updated_at', 'adresse_pruefen', 'angaben_pruefen'
  ];
  unbekannt text;
  betrieb text;
begin
  if jsonb_typeof(rest) <> 'object' then
    raise exception 'Kunde nicht gespeichert: die Angaben kamen nicht als Liste von Feldern.'
      using errcode = '22023';
  end if;

  -- Vor jedem Schreiben: lieber gar nichts speichern als still nur einen Teil.
  select string_agg('„' || k || '“', ', ' order by k) into unbekannt
    from jsonb_object_keys(rest) as k
   where k <> all (uebernommen) and k <> all (uebergangen);
  if unbekannt is not null then
    raise exception 'Kunde nicht gespeichert: die Datenbank übernimmt % beim Ändern nicht. Bitte dem Support melden.', unbekannt
      using errcode = '22023';
  end if;

  select c.company_id into betrieb from public.customers c where c.id = p_kunde;
  if betrieb is null then
    raise exception 'Kunde nicht gefunden' using errcode = '42501';
  end if;

  update public.customers
     set name = p_name,
         address           = coalesce(rest ->> 'address',       address),
         contact_name      = coalesce(rest ->> 'contact_name',  contact_name),
         contact_phone     = coalesce(rest ->> 'contact_phone', contact_phone),
         email             = coalesce(rest ->> 'email',         email),
         vat_id            = coalesce(rest ->> 'vat_id',        vat_id),
         notes             = coalesce(rest ->> 'notes',         notes),
         active            = coalesce((rest ->> 'active')::boolean, active),
         strasse           = case when rest ? 'strasse'           then rest ->> 'strasse'           else strasse end,
         plz               = case when rest ? 'plz'               then rest ->> 'plz'               else plz end,
         ort               = case when rest ? 'ort'               then rest ->> 'ort'               else ort end,
         land              = case when rest ? 'land'              then rest ->> 'land'              else land end,
         kundennummer      = case when rest ? 'kundennummer'      then rest ->> 'kundennummer'      else kundennummer end,
         kundenart         = case when rest ? 'kundenart'         then rest ->> 'kundenart'         else kundenart end,
         lieferantennummer = case when rest ? 'lieferantennummer' then rest ->> 'lieferantennummer' else lieferantennummer end
   where id = p_kunde;

  if not found then
    -- Der Zeilenschutz hat die Zeile nicht durchgelassen.
    raise exception 'Kunde darf nicht geändert werden' using errcode = '42501';
  end if;

  return app.kundenname_nachziehen(p_kunde, p_name);
end;
$$;

revoke all on function public.kunde_umbenennen(uuid, text, jsonb) from public, anon;
grant execute on function public.kunde_umbenennen(uuid, text, jsonb) to authenticated;
