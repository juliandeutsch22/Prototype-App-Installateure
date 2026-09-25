-- ÜBER DEN EIGENEN ANTRAG ENTSCHEIDET JEMAND ANDERER.
--
-- Aus dem Launch-Check (25.09.2026, K4): Julian Deutsch hat seinen eigenen
-- Urlaubsantrag genehmigt („Genehmigt von Julian Deutsch"). Geschäftsführung
-- und Administration dürfen immer entscheiden — also auch über sich selbst.
-- Ein Vier-Augen-Prinzip gab es nicht.
--
-- DIE AUSNAHME, OHNE DIE ES NICHT GEHT: gibt es im Betrieb sonst niemanden,
-- der entscheiden darf (die Geschäftsführerin eines Zwei-Personen-Betriebs),
-- dann entscheidet sie auch über sich. Sonst bliebe ihr Antrag für immer
-- offen, und sie trüge ihren Urlaub nirgends ein.
--
-- AUSGENOMMEN IST DER BETRIEBSURLAUB: er bucht allen denselben Zeitraum, auch
-- der Person, die ihn anlegt. Das ist keine Entscheidung über den eigenen
-- Antrag, sondern eine über den Betrieb.

/*
  Wer ausser dieser Person entscheiden dürfte — dieselbe Regel wie
  `app.darf_urlaub_entscheiden`, nur für die anderen aktiven Konten.
*/
create or replace function app.entscheidet_jemand_anderer(p_betrieb text, p_person uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select exists (
    select 1
      from public.users u
      join public.companies c on c.id = u.company_id
     where u.company_id = p_betrieb
       and u.id <> p_person
       and u.active
       and (u.role in ('Geschäftsführung', 'Administrator')
            or (coalesce(array_length(c.vacation_approvers, 1), 0) = 0 and u.role = 'Buchhaltung')
            or u.id = any(c.vacation_approvers)))
$$;

revoke all on function app.entscheidet_jemand_anderer(text, uuid) from public, anon;
grant execute on function app.entscheidet_jemand_anderer(text, uuid) to authenticated;

/*
  ALS WÄCHTER AN DER TABELLE, nicht in den Funktionen: entschieden wird über
  `urlaub_entscheiden`, eingetragen über `urlaub_eintragen` — beide schreiben
  hier, und ein dritter Weg käme ohne die Regel davon.
*/
create or replace function app.urlaub_vier_augen() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if app.ist_dienst() or auth.uid() is null or new.betriebsurlaub_id is not null then
    return new;
  end if;
  if new.user_id = auth.uid()
     and new.status in ('Genehmigt', 'Abgelehnt')
     and (tg_op = 'INSERT' or old.status is distinct from new.status)
     and app.entscheidet_jemand_anderer(new.company_id, new.user_id) then
    raise exception 'Über den eigenen Antrag entscheidet jemand anderer — hier gilt das Vier-Augen-Prinzip.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists vacations_vier_augen on public.vacations;
create trigger vacations_vier_augen
  before insert or update on public.vacations
  for each row execute function app.urlaub_vier_augen();
