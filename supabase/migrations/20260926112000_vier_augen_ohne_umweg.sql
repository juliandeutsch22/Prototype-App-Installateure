-- VIER AUGEN — AUCH AUF DEN BEIDEN UMWEGEN.
--
-- Aus dem Prüflauf vom 25.09.2026 (P3-09). Seit `20260925140000_urlaub_vier_augen.sql`
-- entscheidet über den eigenen Antrag jemand anderer. Zwei Wege führten
-- daran vorbei:
--
--   1. DER BETRIEBSURLAUB. Der Wächter überspringt ihn ganz — zu Recht, denn
--      er bucht allen denselben Zeitraum, auch der Person, die ihn anlegt.
--      Seit man Mitarbeiter ausnehmen kann (`20260924220000`), lässt er sich
--      aber so zuschneiden, dass er nur noch EINE Person trifft: die
--      Buchhaltung legt „Betriebsurlaub" an, nimmt alle anderen aus und hat
--      sich damit Urlaub genehmigt.
--   2. DER ZEITAUSGLEICH DIREKT. Buchhaltung, Geschäftsführung und
--      Administration dürfen Zeitausgleich direkt in die Zeiterfassung
--      buchen (für den Monteur ohne Telefon) — also auch für sich selbst.
--
-- Die Regel ist dieselbe wie beim Antrag: für die EIGENE Person nur, wenn
-- sonst niemand entscheiden kann (`app.entscheidet_jemand_anderer`). Die
-- Geschäftsführerin eines Zwei-Personen-Betriebs bucht weiter selbst.

/*
  Trifft dieser Betriebsurlaub noch jemanden ausser dieser Person?

  Gezählt wird wie in `betriebsurlaub_anlegen`: aktive Konten des Betriebs,
  die nicht ausgenommen sind. SECURITY DEFINER, weil der Wächter sonst an
  der Leseregel der Belegschaft hinge — er läuft aus dem Anlegen heraus, und
  zurück kommt nur ein Wahrheitswert.
*/
create or replace function app.betriebsurlaub_trifft_andere(p_bu uuid, p_person uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select exists (
    select 1
      from public.betriebsurlaube b
      join public.users u on u.company_id = b.company_id
     where b.id = p_bu
       and u.id <> p_person
       and u.active is not false
       and not (u.id = any(b.ausgenommen)))
$$;

revoke all on function app.betriebsurlaub_trifft_andere(uuid, uuid) from public, anon;
grant execute on function app.betriebsurlaub_trifft_andere(uuid, uuid) to authenticated;

/*
  Rumpf wie in `20260925140000_urlaub_vier_augen.sql`; neu ist der Zweig für
  den Betriebsurlaub. Er bleibt die Ausnahme, die er war — nur nicht mehr
  für einen Betriebsurlaub, der ausser der anlegenden Person niemanden trifft.
*/
create or replace function app.urlaub_vier_augen() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if app.ist_dienst() or auth.uid() is null then
    return new;
  end if;

  if new.betriebsurlaub_id is not null then
    if tg_op = 'INSERT'
       and new.user_id = auth.uid()
       and new.status = 'Genehmigt'
       and app.entscheidet_jemand_anderer(new.company_id, new.user_id)
       and not app.betriebsurlaub_trifft_andere(new.betriebsurlaub_id, new.user_id) then
      raise exception 'Ein Betriebsurlaub, der nur dich selbst trifft, ist ein eigener Urlaub — darüber entscheidet jemand anderer (Vier-Augen-Prinzip).'
        using errcode = '42501';
    end if;
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

/*
  Rumpf wie in `20260924190000_urlaub_nur_ueber_antrag.sql`; neu ist der
  Absatz zum eigenen Zeitausgleich. Er gilt, wenn ein Zeitausgleich für die
  eigene Person entsteht oder verschoben wird — nicht für einen, der schon
  steht und an dem sich nichts Zählbares ändert.
*/
create or replace function app.urlaub_nur_ueber_antrag() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if current_user <> 'authenticated' then
    return coalesce(new, old);
  end if;

  if tg_op in ('UPDATE', 'DELETE') and old.vacation_id is not null then
    raise exception 'Dieser Tag gehört zu einem genehmigten Antrag — er ändert sich nur über den Antrag (Seite Urlaub, „zurücknehmen")'
      using errcode = '42501';
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    if new.vacation_id is not null or new.status = 'Urlaub' then
      raise exception 'Urlaub wird beantragt und genehmigt, nicht direkt gebucht'
        using errcode = '42501';
    end if;
    if new.status = 'Zeitausgleich' and not app.ist_buch_oder_spitze() then
      raise exception 'Zeitausgleich beantragt man auf der Seite Urlaub'
        using errcode = '42501';
    end if;
    if new.status = 'Zeitausgleich'
       and new.user_id = auth.uid()
       and (tg_op = 'INSERT'
            or old.status is distinct from 'Zeitausgleich'
            or new.date is distinct from old.date
            or new.start_time is distinct from old.start_time
            or new.end_time is distinct from old.end_time)
       and app.entscheidet_jemand_anderer(new.company_id, new.user_id) then
      raise exception 'Zeitausgleich für dich selbst beantragst du auf der Seite Urlaub — darüber entscheidet jemand anderer (Vier-Augen-Prinzip).'
        using errcode = '42501';
    end if;
  end if;

  -- Einen Zeitausgleich, den das Büro gebucht hat, nimmt auch nur das Büro
  -- wieder heraus: gelöscht stünde die freie Zeit plötzlich als Guthaben da.
  if tg_op in ('UPDATE', 'DELETE') and old.status = 'Zeitausgleich'
     and not app.ist_buch_oder_spitze() then
    raise exception 'Einen gebuchten Zeitausgleich ändert das Büro'
      using errcode = '42501';
  end if;

  return coalesce(new, old);
end;
$$;
