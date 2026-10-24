/*
  RETOURE: WER ZURÜCKGEBRACHT HAT UND WER ERFASST HAT (A4 der Durchsicht vom
  24.10.2026)

  WAS FEHLTE. `retoure_anlegen` nahm eine Retoure nur „auf den eigenen
  Namen“ an. Erfasste das Lager unter „Anforderungen › Retouren“, was ein
  Monteur hereinbrachte, stand sie auf dem Namen des Lagers (T-16). Wer das
  Material zurückgebracht hatte, war nirgends festgehalten — und der Monteur
  sah seine Rückgabe nicht unter „Meine Anforderungen“.

  WIE. Die Retoure gehört der Person, die das Material zurückgebracht hat
  (`user_id`, wie bei jeder Anforderung). Das Lager und die Führung dürfen
  dafür jede Person des Betriebs wählen; alle anderen nur sich selbst. Wer
  erfasst hat, steht daneben in `erfasst_von` und `erfasst_von_name` — wie
  bei Zahlungseingängen und Lagerbewegungen.

  „ERFASST VON“ BEI JEDER ANFORDERUNG. Auch eine Anforderung, die die
  Führung für jemanden anlegt (das erlaubt die Regel `material_orders_anlegen`
  seit jeher), trägt damit, wer sie angelegt hat. Gesetzt wird es aus der
  Anmeldung, nicht aus einem Wert der App; danach ändert es niemand. Der
  Rücklauf einer Sicherung (Dienstschlüssel) behält, was er mitbringt.

  DER NAME DER PERSON, die zurückgebracht hat, kommt aus der Belegschaft,
  nicht aus der App — sonst stünde ein Name an der Retoure, der zu keiner
  Kennung passt.

  ALTBESTAND. Anforderungen und Retouren von vor dieser Migration bleiben
  ohne „erfasst von“; eine Retoure des Lagers von davor bleibt auf dessen
  Namen. Wer damals zurückgebracht hat, weiß die Datenbank nicht.

  DATENSCHUTZ. Die Retoure steht in der Datenauskunft der Person, die
  zurückgebracht hat (über `user_id`, wie bisher die Anforderungen), und
  bleibt bei ihrer Löschung so lange wie die Anforderungen. Wer für andere
  erfasst hat, sieht in seiner Auskunft nur die Anzahl („als Bearbeiter“).
*/

alter table public.material_orders add column if not exists erfasst_von uuid;
alter table public.material_orders add column if not exists erfasst_von_name text;

/*
  SECURITY DEFINER, damit der Name nicht vom Zeilenschutz der Belegschaft
  abhängt — gelesen wird genau die Zeile der Anmeldung.
*/
create or replace function app.anforderung_erfasst_von() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if app.ist_dienst() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.erfasst_von := (select auth.uid());
    new.erfasst_von_name := (select u.name from public.users u where u.id = (select auth.uid()));
    return new;
  end if;
  if new.erfasst_von is distinct from old.erfasst_von
     or new.erfasst_von_name is distinct from old.erfasst_von_name then
    raise exception 'Wer eine Anforderung erfasst hat, steht fest'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function app.anforderung_erfasst_von() from public, anon, authenticated;

drop trigger if exists material_orders_erfasst_von on public.material_orders;
create trigger material_orders_erfasst_von
  before insert or update on public.material_orders
  for each row execute function app.anforderung_erfasst_von();

-- ---------------------------------------------------------------------------
-- retoure_anlegen: auch für eine andere Person des Betriebs
-- (Rumpf wie in 20260930380000_lagerbewegungen.sql; geändert sind die
-- Prüfung der Person und ihr Name)
-- ---------------------------------------------------------------------------

create or replace function public.retoure_anlegen(p_beleg jsonb)
  returns uuid
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  neu uuid := coalesce((p_beleg ->> 'id')::uuid, gen_random_uuid());
  betrieb text := p_beleg ->> 'company_id';
  katalog uuid := nullif(p_beleg ->> 'material_id', '')::uuid;
  person uuid := nullif(p_beleg ->> 'user_id', '')::uuid;
  personname text;
begin
  if betrieb is null
     or not (app.betriebsmitglied(betrieb) or app.support_schreibt(betrieb))
     or person is null then
    raise exception 'Eine Retoure legt man im eigenen Betrieb an'
      using errcode = '42501';
  end if;

  /*
    FÜR JEMAND ANDEREN nur das Lager und die Führung — sie nehmen am Regal
    entgegen, was ein anderer hereinbringt. Die Person muss zum Betrieb
    gehören; sonst stünde eine Retoure auf einer fremden Kennung.
  */
  if person is distinct from auth.uid() then
    if not (app.hat_rolle(array['Verwaltung']) or app.ist_fuehrung()) then
      raise exception 'Eine Retoure für jemand anderen erfasst das Lager'
        using errcode = '42501';
    end if;
    if not exists (select 1 from public.users u where u.id = person and u.company_id = betrieb) then
      raise exception 'Diese Person gehört nicht zu diesem Betrieb'
        using errcode = '42501';
    end if;
  end if;
  personname := coalesce((select u.name from public.users u where u.id = person), p_beleg ->> 'user_name');

  -- Ein Katalogartikel eines anderen Betriebs bekäme sonst die Gutschrift.
  if katalog is not null and not exists (
    select 1 from public.materials m where m.id = katalog and m.company_id = betrieb
  ) then
    katalog := null;
  end if;

  if katalog is null and (p_beleg ->> 'condition') = 'neu' then
    katalog := app.katalogeintrag(betrieb, p_beleg ->> 'material_name');
  end if;

  insert into public.material_orders (
    id, company_id, material_id, material_name, quantity, note,
    project_number, status, is_urgent, transaction_type, condition,
    user_id, user_name, processed, source
  ) values (
    neu, betrieb, katalog, p_beleg ->> 'material_name',
    (p_beleg ->> 'quantity')::numeric, p_beleg ->> 'note',
    p_beleg ->> 'project_number', 'Erledigt',
    coalesce((p_beleg ->> 'is_urgent')::boolean, false), 'return',
    p_beleg ->> 'condition', person,
    personname, true, p_beleg ->> 'source'
  );

  if katalog is not null and (p_beleg ->> 'condition') = 'neu' then
    perform app.lager_kontext('retoure', null, null, null,
      coalesce('Baustelle ' || nullif(p_beleg ->> 'project_number', ''), 'Retoure') || ' · ' || coalesce(personname, ''), neu);
    perform public.bestand_anpassen(katalog, (p_beleg ->> 'quantity')::numeric);
    perform app.lager_kontext_leeren();
  end if;

  return neu;
end;
$$;

revoke all on function public.retoure_anlegen(jsonb) from public, anon;
grant execute on function public.retoure_anlegen(jsonb) to authenticated;

/*
  DIE DATENAUSKUNFT dessen, der für andere erfasst hat, zählt diese
  Retouren und Anforderungen unter „als Bearbeiter“ — der Inhalt gehört der
  Person, auf die sie lauten. Gezielt eingefügt wie in
  `20261013140000_auszug_arbeitskopien.sql`; wiederholbar, und ohne
  Einfügestelle bricht die Migration ab.
*/
do $migration$
declare quelle text; marke text;
begin
  quelle := pg_get_functiondef('public.person_auskunft(text,uuid,integer)'::regprocedure);
  if position('anforderungen_fuer_andere_erfasst' in quelle) = 0 then
    marke := $m$        where z.company_id = betrieb and z.erfasst_von = p_id),$m$;
    if position(marke in quelle) = 0 then raise exception 'Personenauskunft: Einfügestelle fehlt'; end if;
    execute replace(quelle, marke, marke || $eintrag$
      'anforderungen_fuer_andere_erfasst', (select count(*) from public.material_orders o
        where o.company_id = betrieb and o.erfasst_von = p_id and o.user_id is distinct from p_id),$eintrag$);
  end if;
end;
$migration$;
