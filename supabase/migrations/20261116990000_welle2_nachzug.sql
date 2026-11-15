/*
  NACHZUG DER WELLE 2 (Durchsicht 15.11.2026). Was erst im Zusammenspiel der
  Pakete 3–8 und der bestehenden Prüfnetze auffiel — gesammelt hier, damit
  jede Paketmigration so bleibt, wie sie geprüft wurde.
*/

/*
  KEIN SCHREIBEN ÜBER EINEN SUPPORTZUGANG — der Riegel, den jede Tabelle mit
  `company_id` trägt (`schema.test.ts`). Beide Tabellen schreiben nur
  Funktionen (Monatsabschluss, Klärung eines Rechnungsversuchs); ein
  Lesezugang des Supports darf auch über sie nichts ändern.
*/
drop trigger if exists zeit_monatsabschluesse_kein_support_schreiben on public.zeit_monatsabschluesse;
create trigger zeit_monatsabschluesse_kein_support_schreiben
  before insert or update or delete on public.zeit_monatsabschluesse
  for each row execute function app.support_schreibt_nicht();

drop trigger if exists rechnungsversuche_ohne_beleg_kein_support_schreiben on public.rechnungsversuche_ohne_beleg;
create trigger rechnungsversuche_ohne_beleg_kein_support_schreiben
  before insert or update or delete on public.rechnungsversuche_ohne_beleg
  for each row execute function app.support_schreibt_nicht();

/*
  DAS ÄNDERUNGSJOURNAL KENNT JEDE SPALTE (`aenderungsjournal.test.ts`): als
  Text oder als Ausnahme. Die neuen Spalten der Welle 2 sind Technik bzw.
  aus anderem gerechnet und kommen in den Verlauf nicht als eigene Zeile:
  - `invoices.erstellungsversuch`: Kennung gegen doppeltes Ausstellen (G2);
  - `invoices.leistungsnachweis`: mit dem Beleg eingefrorener Nachweis (V9) —
    er steht im PDF, nicht als Feldänderung;
  - `invoices.storno_bezahlt`: beim Storno festgehaltener Zahlstand (G8) —
    wie `bezahlt_betrag` aus den Zahlungen gerechnet;
  - `invoices.material_je_ausgabe`: wie die Rechnung ihr Material zählte (M2);
  - `zahlungseingaenge.umbuchung`: verbindet die beiden Zahlungen einer
    Umbuchung (G4); die Art „Umbuchung“ steht als Text im Verlauf.
*/
drop trigger if exists invoices_journal on public.invoices;
create trigger invoices_journal
  after insert or update or delete on public.invoices
  for each row execute function app.journal_protokollieren(
    'rechnung', '{id,company_id,created_at,updated_at,aussteller_stand,storno_aussteller_stand,project_id,customer_id,vorrechnungen,bezahlt_betrag,skonto_betrag,mahnkosten_betrag,mahnstufe,gemahnt_am,mahnfrist,mahnspesen,erstellungsversuch,leistungsnachweis,storno_bezahlt,material_je_ausgabe}');

drop trigger if exists zahlungen_journal on public.zahlungseingaenge;
create trigger zahlungen_journal
  after insert or update or delete on public.zahlungseingaenge
  for each row execute function app.journal_protokollieren(
    'zahlung', '{id,company_id,created_at,updated_at,erfasst_von,erfasst_von_name,invoice_id,umbuchung}');

/*
  DIE PLATTFORM DEAKTIVIERT EINEN BETRIEB — und `app.konto_sperren` schließt
  seit K10 die offenen Passwort-Bitten jedes Kontos. `passwort_anfragen`
  trägt den Support-Riegel, ebenso `user_prefs`, aus dem K2 die
  Push-Anmeldungen räumt; der Riegel hielt das Plattformkonto für einen
  Supportzugang und brach das Deaktivieren mit „darf lesen und sonst nichts“
  ab (Betrieb deaktivieren, löschen, Push-Anmeldungen, Passwort-Bitten).

  Der Riegel lässt deshalb durch, was `app.passwort_anfragen_schliessen` und
  `app.push_anmeldungen_entfernen` innerhalb der Sperre schreiben: jede
  setzt eine Markierung nur für ihre eigene Anweisung und nimmt sie gleich
  wieder weg. Von aussen ist sie
  nicht zu setzen — `set_config` steht nicht auf der Schnittstelle, und
  beide Funktionen sind für Konten nicht ausführbar.
*/
create or replace function app.passwort_anfragen_schliessen(p_uid uuid) returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  perform set_config('app.plattform_sperrt', 'an', true);
  update public.passwort_anfragen a
     set erledigt_am = now(), erledigt_wie = 'deaktiviert'
   where a.user_id = p_uid and a.erledigt_am is null;
  perform set_config('app.plattform_sperrt', '', true);
end;
$$;
revoke all on function app.passwort_anfragen_schliessen(uuid) from public, anon, authenticated;

create or replace function app.push_anmeldungen_entfernen(p_uid uuid) returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  perform set_config('app.plattform_sperrt', 'an', true);
  update public.user_prefs
     set push_tokens = '{}'::text[], updated_at = now()
   where user_id = p_uid
     and cardinality(push_tokens) > 0;
  perform set_config('app.plattform_sperrt', '', true);
end;
$$;
revoke all on function app.push_anmeldungen_entfernen(uuid) from public, anon, authenticated;

do $$
declare
  alt text := pg_get_functiondef('app.support_schreibt_nicht()'::regprocedure);
  stelle text := 'if not app.ist_plattform() then';
begin
  if position(stelle in alt) = 0 then
    raise exception 'support_schreibt_nicht: Stelle nicht gefunden';
  end if;
  execute replace(alt, stelle,
    'if not app.ist_plattform() or current_setting(''app.plattform_sperrt'', true) = ''an'' then');
end;
$$;
