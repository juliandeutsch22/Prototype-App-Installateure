/*
  KUNDE MIT UNGÜLTIGER PLZ ODER E-MAIL: UNTER „ANSCHRIFT PRÜFEN“ (Testbericht Runde 6, M6)

  WAS DER BERICHT FAND. Ein Kunde mit PLZ „82“ (Österreich) und E-Mail
  „juliandeutsch22@gmail“ ließ sich speichern; das Formular zeigte nur den
  Hinweis „vier Ziffern“, und der Zähler „Anschrift prüfen“ blieb bei 0.
  Erst die E-Rechnung scheiterte an der Anschrift.

  WAS JETZT GILT.
  - Die App fragt beim Speichern nach („Trotzdem speichern“, `angabenZuPruefen`).
    Ein Verbot ist es nicht: die Prüfung ist grob, und ausländische
    Postleitzahlen haben viele Formen.
  - Was trotzdem gespeichert wird, steht unter „Anschrift prüfen“. Dafür
    rechnet die Datenbank `angaben_pruefen`: die bisherige Markierung
    (`adresse_pruefen`, die alte Zeile ließ sich nicht zerlegen) ODER eine
    PLZ, die nicht zum Land passt, ODER eine E-Mail ohne Endung. Dieselben
    Regeln wie `plzFehler` und `mailFehler` in `src/lib/adresse.ts`.
  - `adresse_pruefen` bleibt, was es war, und hält weiter die Rechnung auf
    (`app.rechnung_empfaenger_pruefen`). Ob eine solche PLZ eine Rechnung
    aufhält oder nur warnt, entscheidet der Rechnungsteil — hier ändert sich
    daran nichts.

  EINE GEWÖHNLICHE SPALTE, KEINE BERECHNETE. Der Rücklauf aus der Sicherung
  (`scripts/ruecklauf.mjs`) spielt Zeilen so ein, wie sie ausgeleitet wurden;
  in eine berechnete Spalte ließe sich dort nichts schreiben.

  DER BESTAND. Die neue Spalte wird einmal gesetzt, wo sie wahr ist — ohne
  die Auslöser, damit `updated_at` und alle Angaben der Kunden bleiben, wie
  sie sind. Keine Anschrift und keine E-Mail ändert sich; Altkunden mit einer
  solchen Angabe erscheinen nur unter „Anschrift prüfen“.
*/

alter table public.customers
  add column if not exists angaben_pruefen boolean not null default false;

comment on column public.customers.angaben_pruefen is
  'Anschrift prüfen: adresse_pruefen oder PLZ passt nicht zum Land oder E-Mail ohne Endung — setzt nur die Datenbank';

create or replace function app.kunde_angaben_falsch(
  p_adresse_pruefen boolean, p_plz text, p_land text, p_email text
) returns boolean
  language sql
  immutable
  security definer
  set search_path = ''
as $$
  select coalesce(p_adresse_pruefen, false)
      or (coalesce(btrim(p_plz), '') <> '' and case
            when upper(coalesce(nullif(btrim(p_land), ''), 'AT')) in ('AT', 'CH', 'LI', 'HU', 'SI')
              then btrim(p_plz) !~ '^[0-9]{4}$'
            when upper(btrim(p_land)) = 'DE'
              then btrim(p_plz) !~ '^[0-9]{5}$'
            else btrim(p_plz) !~ '^[A-Za-z0-9 -]{3,10}$'
          end)
      or (coalesce(btrim(p_email), '') <> ''
          and btrim(p_email) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@.]{2,}$')
$$;

revoke all on function app.kunde_angaben_falsch(boolean, text, text, text) from public, anon, authenticated;

/*
  „z_“ IM NAMEN: Auslöser einer Tabelle laufen in der Reihenfolge ihrer
  Namen. Dieser läuft nach `customers_adresse`, das `adresse_pruefen` und
  die Teile der Anschrift setzt, und hat damit das letzte Wort.
*/
create or replace function app.kunde_angaben_pruefen() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  new.angaben_pruefen := app.kunde_angaben_falsch(new.adresse_pruefen, new.plz, new.land, new.email);
  return new;
end;
$$;

revoke all on function app.kunde_angaben_pruefen() from public, anon, authenticated;

drop trigger if exists customers_z_angaben_pruefen on public.customers;
create trigger customers_z_angaben_pruefen
  before insert or update on public.customers
  for each row execute function app.kunde_angaben_pruefen();

-- Der Bestand, ohne Auslöser: nur die neue Spalte, und nur wo sie wahr ist.
alter table public.customers disable trigger user;
update public.customers
   set angaben_pruefen = true
 where not angaben_pruefen
   and app.kunde_angaben_falsch(adresse_pruefen, plz, land, email);
alter table public.customers enable trigger user;

create index if not exists customers_angaben_pruefen
  on public.customers (company_id) where angaben_pruefen;
