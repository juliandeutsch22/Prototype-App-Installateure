/*
  EINE ANFORDERUNG NACHTRÄGLICH ALS EILIG MARKIEREN (12.10.2026, Plan 17 F)

  „Eil“ liess sich nur beim Anlegen setzen. Stellte sich danach heraus, dass
  es pressiert — die Baustelle steht, der Kunde wartet —, blieb nur der
  Anruf; und die Projektleitung, die bei einer Eilzustellung das Material
  mitnimmt, erfuhr davon nichts.

  WER: wer angefordert hat, das Lager (Verwaltung) und die Führung. Der
  Besteller darf es auch dann noch, wenn das Lager die Anforderung schon in
  Arbeit hat — gerade dann zählt es; ändern kann er dabei nur dieses eine
  Feld (`app.anforderung_besitzer_offen` lässt sonst nichts mehr zu).

  WANN: solange die Anforderung offen oder in Arbeit ist. Abholbereites ist
  schon da, Erledigtes vorbei, und eine Retoure muss niemand eilig bringen.

  NUR MIT BAUSTELLE — dieselbe Regel wie beim Anlegen: ohne Baustelle gibt
  es keine Projektleitung, die es mitnehmen könnte (`istEilRelevant`).

  DIE MELDUNG: wird eine Anforderung eilig, stösst der Trigger ein eigenes
  Ereignis an („eil“), mit dem, der es ausgelöst hat. Wer es bekommt,
  entscheidet die Edge Function (`push-melden`): die Projektleitung der
  Baustelle und das Lager — nicht der, der es gerade selbst gesetzt hat.
*/

create or replace function public.anforderung_eilig_setzen(p_id uuid, p_eilig boolean)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  a public.material_orders;
begin
  if p_eilig is null then
    raise exception 'Eilig: ja oder nein' using errcode = '22023';
  end if;

  select * into a from public.material_orders o where o.id = p_id for update;
  if a.id is null
     or a.company_id is distinct from app.lesebetrieb()
     or not (a.user_id = auth.uid() or app.hat_rolle(array['Verwaltung']) or app.ist_fuehrung()) then
    raise exception 'Diese Anforderung gibt es hier nicht, oder sie darf von hier aus nicht geändert werden'
      using errcode = '42501';
  end if;

  if a.transaction_type = 'return' then
    raise exception 'Eine Rückgabe ist nie eilig' using errcode = '22023';
  end if;
  if a.status not in ('Offen', 'In Bearbeitung') or a.processed then
    raise exception 'Die Anforderung ist schon abholbereit oder erledigt' using errcode = '22023';
  end if;
  if p_eilig and coalesce(btrim(a.project_number), '') = '' then
    raise exception 'Eilig geht nur mit Baustelle — ohne sie gibt es niemanden, der es mitnimmt'
      using errcode = '22023';
  end if;

  update public.material_orders set is_urgent = p_eilig where id = p_id;
end;
$$;

revoke all on function public.anforderung_eilig_setzen(uuid, boolean) from public, anon;
grant execute on function public.anforderung_eilig_setzen(uuid, boolean) to authenticated;

/*
  DER AUSLÖSER BEKOMMT EIN DRITTES EREIGNIS. Rumpf sonst wie in
  `20260914200000_push_ausloeser.sql`. Getrennte Abfragen statt `elsif`:
  ändert dieselbe Anweisung Status und Eil, gehen beide Ereignisse hinaus.
*/
create or replace function app.push_bei_anforderung() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform app.push_anstossen(jsonb_build_object(
      'art', 'neu',
      'nachher', to_jsonb(new)));
    return null;
  end if;
  if new.status is distinct from old.status then
    perform app.push_anstossen(jsonb_build_object(
      'art', 'geaendert',
      'vorher', to_jsonb(old),
      'nachher', to_jsonb(new)));
  end if;
  if new.is_urgent and not old.is_urgent then
    perform app.push_anstossen(jsonb_build_object(
      'art', 'eil',
      'von', auth.uid(),
      'vorher', to_jsonb(old),
      'nachher', to_jsonb(new)));
  end if;
  return null;
end;
$$;
