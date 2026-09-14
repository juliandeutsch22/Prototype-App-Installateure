-- Lagerbewegungen: abschliessen, retournieren, anpassen.
--
-- DER UMZUG VEREINFACHT HIER WIRKLICH, statt nur zu uebersetzen. Eine
-- Firestore-Transaktion darf einzelne Dokumente lesen, aber nicht SUCHEN;
-- deshalb lief die Suche nach dem Katalogeintrag vorher AUSSERHALB der
-- Transaktion, und die Transaktion musste danach noch einmal pruefen. In
-- Postgres liegt beides in einem Vorgang.
--
-- Alle drei Funktionen laufen mit den Rechten des Aufrufers. Eine Funktion,
-- die sich ueber den Zeilenschutz hinwegsetzt, waere eine Tuer neben der Tuer.

-- ---------------------------------------------------------------------------
-- Den Katalogeintrag finden
-- ---------------------------------------------------------------------------

/*
  Ueber die Kennung, sonst ueber den NAMEN.

  Bei zwei gleichnamigen Katalogeintraegen ist nicht entscheidbar, welcher
  gemeint war — dann lieber gar nichts abziehen als das Falsche. Verglichen
  wird der Name normalisiert (Kleinschreibung, Raender getrimmt), weil eine
  Anforderung „Kupferrohr 15mm " und der Katalog „Kupferrohr 15mm" derselbe
  Artikel sind und der Monteur das Leerzeichen nicht sieht.
*/
create or replace function app.katalogeintrag(p_betrieb text, p_name text)
  returns uuid
  language sql stable
  set search_path = ''
as $$
  -- `having` ohne `group by` prueft die ganze Menge: bei genau einem Treffer
  -- kommt eine Zeile zurueck, sonst gar keine — und eine skalare Funktion
  -- ohne Zeile liefert NULL. Genau das ist hier gemeint.
  select (array_agg(m.id))[1]
    from public.materials m
   where m.company_id = p_betrieb
     and lower(btrim(m.name)) = lower(btrim(p_name))
  having count(*) = 1
$$;

-- ---------------------------------------------------------------------------
-- Bestand anpassen
-- ---------------------------------------------------------------------------

/*
  Gerechnet statt einfach addiert, damit bei NULL Schluss ist. Ein negativer
  Lagerstand ist keine Aussage ueber ein Lager, sondern ein Zeichen, dass die
  Buchfuehrung nicht mehr stimmt — dann lieber die ehrliche Null, die im
  Bestand sofort als „knapp" auffaellt.
*/
create or replace function public.bestand_anpassen(p_material uuid, p_delta numeric)
  returns void
  language plpgsql
  set search_path = ''
as $$
begin
  if p_material is null then return; end if;
  update public.materials
     set stock = greatest(0, stock + p_delta)
   where id = p_material;
  -- Kein Fehler, wenn es den Artikel nicht gibt: Ad-hoc-Material hat keinen
  -- Katalogeintrag, und das ist erlaubt.
end;
$$;

revoke all on function public.bestand_anpassen(uuid, numeric) from public;
grant execute on function public.bestand_anpassen(uuid, numeric) to authenticated;

-- ---------------------------------------------------------------------------
-- Anforderung abschliessen
-- ---------------------------------------------------------------------------

/*
  IDEMPOTENT ueber `processed`. Zwei gleichzeitige Abschluesse duerfen nicht
  doppelt abziehen — deshalb wird die Zeile mit FOR UPDATE gesperrt, bevor
  irgendetwas gerechnet wird. Der zweite Aufruf findet dann `processed` und
  setzt nur noch den Status.
*/
create or replace function public.anforderung_abschliessen(p_order uuid)
  returns void
  language plpgsql
  set search_path = ''
as $$
declare
  a public.material_orders%rowtype;
  katalog uuid;
begin
  select * into a from public.material_orders where id = p_order for update;
  if not found then
    -- Entweder gibt es sie nicht, oder der Zeilenschutz laesst nicht heran.
    -- Beides ist von aussen dasselbe, und mehr zu sagen waere gespraechiger,
    -- als es sein darf.
    return;
  end if;

  if a.processed then
    update public.material_orders set status = 'Erledigt' where id = p_order;
    return;
  end if;

  if a.transaction_type <> 'return' then
    katalog := coalesce(a.material_id, app.katalogeintrag(a.company_id, a.material_name));
    if katalog is not null then
      perform public.bestand_anpassen(katalog, -coalesce(a.quantity, 0));
    end if;
  end if;

  update public.material_orders
     set status = 'Erledigt',
         processed = true,
         -- Den tatsaechlich verwendeten Katalogeintrag festhalten: sonst
         -- muesste jede spaetere Auswertung dieselbe Namenssuche wiederholen.
         material_id = coalesce(a.material_id, katalog)
   where id = p_order;
end;
$$;

revoke all on function public.anforderung_abschliessen(uuid) from public;
grant execute on function public.anforderung_abschliessen(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Retoure
-- ---------------------------------------------------------------------------

/*
  BELEG UND GUTSCHRIFT IN EINEM SCHRITT.

  Vorher wurde erst der Beleg geschrieben und danach, in einem zweiten
  Vorgang, der Bestand gutgeschrieben. Scheiterte der zweite, stand der Beleg
  schon da und der Bestand war nicht erhoeht; die Ansicht meldete „Die Retoure
  konnte nicht erfasst werden", was schlicht nicht stimmte. Wer es daraufhin
  noch einmal versuchte, legte einen ZWEITEN Beleg an.

  Zurueckgebucht wird nur bei Zustand „neu" — was beschaedigt zurueckkommt,
  geht nicht wieder ins Regal.
*/
create or replace function public.retoure_anlegen(p_beleg jsonb)
  returns uuid
  language plpgsql
  set search_path = ''
as $$
declare
  neu uuid := coalesce((p_beleg ->> 'id')::uuid, gen_random_uuid());
  betrieb text := p_beleg ->> 'company_id';
  katalog uuid := nullif(p_beleg ->> 'material_id', '')::uuid;
begin
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
    p_beleg ->> 'condition', (p_beleg ->> 'user_id')::uuid,
    p_beleg ->> 'user_name', true, p_beleg ->> 'source'
  );

  if katalog is not null and (p_beleg ->> 'condition') = 'neu' then
    perform public.bestand_anpassen(katalog, (p_beleg ->> 'quantity')::numeric);
  end if;

  return neu;
end;
$$;

revoke all on function public.retoure_anlegen(jsonb) from public;
grant execute on function public.retoure_anlegen(jsonb) to authenticated;
