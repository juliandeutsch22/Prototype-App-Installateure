-- Beim Zustandswechsel eines Scheins darf sich NUR der Zustand aendern.
--
-- Der Trigger aus Stufe 1 prueft, ob der Uebergang erlaubt ist — aber nicht,
-- was sonst noch im selben Schreibvorgang mitkommt. Genau das hat
-- firestore.rules als nurStorno() und nurWiederAufnehmen() geprueft: dort
-- stand ausdruecklich, welche Felder sich aendern duerfen, und der Rest musste
-- gleich bleiben.
--
-- Ohne diese Pruefung waere der Storno eine Gelegenheit, den Beleg noch einmal
-- anzufassen — Kundenname, Datum, Notizen —, und das Zurueckholen eines
-- verworfenen Entwurfs waere ein Weg, einen fremden Inhalt unterzuschieben.
-- Aufgefallen beim Portieren der Regelpruefung „beim Zurueckholen darf sich
-- der Inhalt NICHT aendern".

create or replace function app.nur_diese_felder(
  alt jsonb, neu jsonb, erlaubt text[]
) returns boolean
  language sql immutable
  set search_path = ''
as $$
  -- `updated_at` setzt ein eigener Trigger, `-` entfernt die erlaubten Felder
  -- von beiden Seiten. Bleibt danach ein Unterschied, wurde mehr angefasst.
  select (alt - erlaubt - 'updated_at') = (neu - erlaubt - 'updated_at')
$$;

create or replace function app.schein_zustandswechsel() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if app.ist_dienst() then return new; end if;

  if old.status = 'Entwurf' then return new; end if;

  if old.status = 'Verworfen' and new.status = 'Entwurf' then
    if not app.nur_diese_felder(to_jsonb(old), to_jsonb(new), array['status']) then
      raise exception 'Beim Zurückholen ändert sich nur der Zustand, nicht der Inhalt'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if old.status = 'Unterschrieben' and new.status = 'Storniert' then
    if not app.ist_fuehrung() then
      raise exception 'Nur die Führung darf einen unterschriebenen Schein stornieren'
        using errcode = '42501';
    end if;
    if coalesce(new.storno_grund, '') = '' then
      raise exception 'Ein Storno braucht einen Grund' using errcode = '42501';
    end if;
    if not app.nur_diese_felder(to_jsonb(old), to_jsonb(new),
                                array['status', 'storno_grund', 'storniert_von_name']) then
      raise exception 'Der Storno ist eine Klammer um den Beleg, keine Gelegenheit ihn zu ändern'
        using errcode = '42501';
    end if;
    return new;
  end if;

  raise exception 'Ein Schein im Zustand % lässt sich nicht mehr ändern (Ziel: %)',
    old.status, new.status using errcode = '42501';
end;
$$;

-- Und beim Verwerfen ebenso: ein Entwurf darf sich frei aendern, aber der
-- Schritt in den Papierkorb ist kein Anlass, gleichzeitig etwas umzuschreiben.
create or replace function app.schein_verwerfen() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if app.ist_dienst() then return new; end if;
  if old.status = 'Entwurf' and new.status = 'Verworfen'
     and not app.nur_diese_felder(to_jsonb(old), to_jsonb(new),
                                  array['status', 'verworfen_von_name']) then
    raise exception 'Beim Verwerfen ändert sich nur der Zustand' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger work_sheets_verwerfen before update on work_sheets
  for each row execute function app.schein_verwerfen();
