/*
  DAS FACHÜBERGREIFENDE ÄNDERUNGSJOURNAL (M01 / U04, Kern K06, 06.11.2026)

  WAS FEHLTE. Fachliche Verläufe gibt es einzeln: Zeitbuchungen (E50,
  `zeitbuchung_verlauf`), Lagerbewegungen, Wartungsausführungen,
  Supportprotokoll. Was über diese Bereiche hinweg an einem Auftrag, einer
  Baustelle, einem Beleg geschah — wer hat was, wann, mit welchem Grund
  geändert —, ließ sich nicht an einer Stelle nachvollziehen.

  WAS SICH ÄNDERT.
  - `aenderungsjournal`: eine Zeile je fachlicher Änderung — Betrieb,
    Objekt (Typ und Kennung), Aktion, Akteur (Kennung und Name zum
    Zeitpunkt), Serverzeit, fachlicher Grund, Vorgangskennung des
    auslösenden Befehls und die geänderten Inhalte (alt/neu je Feld).
  - Geschrieben ausschließlich von `app.journal_schreiben(...)`, einer
    `security definer`-Funktion. Auf die Tabelle selbst hat niemand
    Schreibzugriff — wie bei `zeitbuchung_verlauf`: ein Protokoll, das
    sich nachträglich glätten ließe, wäre nichts wert.
  - Die Funktion setzt Betrieb und Akteur aus dem Anmeldekontext
    (`app.lesebetrieb()`, `auth.uid()`), niemals aus Parametern. Ein
    Aufrufer kann also weder in fremde Betriebe schreiben noch unter
    fremdem Namen protokollieren.
  - Lesen dürfen Führung und Buchhaltung (`app.ist_buch_oder_spitze()`) —
    dieselbe Ausgangsregel wie für betriebliche Verläufe; feinere
    objektbezogene Leseregeln folgen mit den Fachpaketen, die ihre
    Objekte ans Journal anschließen. Der Support sieht nichts
    (`app.support_niemals()`).

  BESTEHENDE VERLÄUFE bleiben führend in ihrem Fachbereich und werden
  NICHT in diese Tabelle kopiert (keine Doppelung, keine abweichenden
  Stände). Die Journalansicht blendet sie ein; diese Migration schafft
  den Unterbau, sie verändert keine bestehende Funktion.

  KEINE SICHTBARE NUTZERFUNKTION in diesem Schritt: Der Unterbau ist
  intern abgeschlossen (Tabelle, Schreibfunktion, Leserechte). Die
  Anbindung einzelner Fachbefehle und die Ansicht in den Akten folgen
  als eigene PRs des Pakets M01.

  DATENSCHUTZ. Die Zeilen gehören zum Betrieb und gehen mit ihm
  (company_id). Es werden keine vollständigen Personendatensätze
  kopiert — Akteur ist Kennung plus Name zum Zeitpunkt, wie beim
  Zeitbuchungsverlauf. Aufbewahrung und Datenauskunft werden mit dem
  ersten fachlichen Anschluss (Objektbezug) konkretisiert.
*/

create table if not exists public.aenderungsjournal (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.companies(id),
  objekt text not null,
  objekt_id text not null,
  aktion text not null,
  grund text,
  vorgang uuid,
  daten jsonb not null default '{}'::jsonb,
  von_uid uuid,
  von_name text,
  am timestamptz not null default clock_timestamp(),
  constraint aenderungsjournal_inhalte check (
    char_length(objekt) <= 100 and char_length(aktion) <= 100
    and jsonb_typeof(daten) = 'object'
  )
);

/*
  OBJEKTKENNUNG ALS TEXT. Das Journal verweist auf Objekte mit
  unterschiedlichen Kennungsarten (uuid, text), und ein Verlauf darf
  nichts festhalten: kein Fremdschlüssel auf das Objekt — eine gelöschte
  Entwurfsakte behält ihre Geschichte. Die Reihenfolge trägt `am`
  (Schreibzeit, nicht Transaktionsbeginn), wie bei E50.
*/
create index if not exists aenderungsjournal_objekt on public.aenderungsjournal (company_id, objekt, objekt_id, am);
create index if not exists aenderungsjournal_betrieb on public.aenderungsjournal (company_id, am);

comment on table public.aenderungsjournal is
  'Fachübergreifendes Änderungsjournal (M01/U04): wer änderte was, wann, warum. Nur via app.journal_schreiben; lesen Führung/Buchhaltung.';

alter table public.aenderungsjournal enable row level security;
revoke all on public.aenderungsjournal from public, anon, authenticated;
grant select on public.aenderungsjournal to authenticated;

drop policy if exists aenderungsjournal_lesen on public.aenderungsjournal;
create policy aenderungsjournal_lesen on public.aenderungsjournal for select
  using (company_id = (select app.lesebetrieb()) and (select app.ist_buch_oder_spitze()));

/*
  Der Riegel liegt auf der Tabelle, obwohl ohnehin niemand direkt
  schreiben darf: fiele eines Tages ein Recht dazu, bliebe der Support
  ausgeschlossen.
*/
drop trigger if exists aenderungsjournal_support_niemals on public.aenderungsjournal;
create trigger aenderungsjournal_support_niemals
  before insert or update or delete on public.aenderungsjournal
  for each row execute function app.support_niemals();

/*
  DER EINZIGE SCHREIBWEG. `security definer`, weil sonst niemand in die
  Tabelle schreiben kann. Betrieb und Akteur kommen aus dem Kontext;
  Inhalte bleiben fachliche Daten des aufrufenden Befehls. Die Funktion
  wird von serverseitigen Fachbefehlen (RPCs) innerhalb derselben
  Transaktion aufgerufen, damit Fachänderung und Journal gemeinsam
  gelten oder gemeinsam scheitern (Datenvertrag M00 §1).
*/
create or replace function app.journal_schreiben(
  p_objekt text,
  p_objekt_id text,
  p_aktion text,
  p_grund text default null,
  p_vorgang uuid default null,
  p_daten jsonb default '{}'::jsonb
) returns uuid
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  betrieb text;
  zeilen_id uuid;
begin
  betrieb := app.lesebetrieb();
  if betrieb is null then
    raise exception 'Journal ohne Betrieb: Anmeldung/Betriebskontext fehlt';
  end if;
  if p_objekt is null or p_objekt_id is null or p_aktion is null then
    raise exception 'Journal unvollständig: Objekt, Objektkennung und Aktion sind Pflicht';
  end if;

  insert into public.aenderungsjournal
    (company_id, objekt, objekt_id, aktion, grund, vorgang, daten, von_uid, von_name)
  values (
    betrieb, p_objekt, p_objekt_id, p_aktion, p_grund, p_vorgang,
    coalesce(p_daten, '{}'::jsonb),
    auth.uid(),
    (select u.name from public.users u where u.id = auth.uid())
  )
  returning id into zeilen_id;
  return zeilen_id;
end;
$$;

revoke all on function app.journal_schreiben(text,text,text,text,uuid,jsonb) from public, anon;
grant execute on function app.journal_schreiben(text,text,text,text,uuid,jsonb) to authenticated;
