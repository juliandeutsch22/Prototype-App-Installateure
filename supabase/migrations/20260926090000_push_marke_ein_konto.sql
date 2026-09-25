-- Eine Push-Marke gehoert genau EINEM Konto (Prueflauf 25.09.2026, P1-18).

/*
  DAS GERAET STAND BEI ZWEI KONTEN.

  Die Marke von Firebase Cloud Messaging bezeichnet ein GERAET, nicht einen
  Menschen. Auf dem geteilten Baustellen-Tablet meldet sich morgens Max an
  und schaltet die Meldungen ein, abends Erna — dieselbe Marke landete in
  beiden Zeilen von `user_prefs`. Ab dann bekam das Tablet die Meldungen
  BEIDER, auch die von Max, waehrend Erna angemeldet ist: Abwesenheiten,
  Materialanforderungen, Namen.

  Die App meldet das Geraet beim Abmelden inzwischen selbst ab. Das deckt den
  geordneten Fall; ein Abmelden ohne Netz, ein geloeschter Browserspeicher
  oder eine Anmeldung ueber einen abgelaufenen Zugang laufen daran vorbei.
  Deshalb raeumt das Setzen einer Marke sie hier bei den ANDEREN Konten des
  Betriebs weg — in derselben Anweisung, in der sie beim eigenen Konto
  eingetragen wird.

  WARUM JETZT SECURITY DEFINER. Die Zeilen der Kollegen sind fuer den
  Aufrufer unsichtbar und unveraenderlich (`user_prefs_lesen`/`_aendern`:
  nur die eigene). Die Funktion darf dort genau eines: DIESE Marke
  entfernen, und nur im eigenen Betrieb. Die Pruefung auf Anmeldung und
  Betrieb steht deshalb vor allem anderen, und die eigene Zeile wird wie
  bisher nur fuer `auth.uid()` im eigenen Betrieb geschrieben — was vorher
  der Zeilenschutz erzwang, steht jetzt ausdruecklich in der Bedingung.

  Signatur, Rueckgabe und Rechte bleiben, wie sie in
  `20260912190000_einstellungen.sql` stehen.
*/
create or replace function public.push_marke_setzen(
  p_token text,
  p_an boolean
) returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  betrieb text := app.betrieb();
  ich uuid := auth.uid();
begin
  if betrieb is null or ich is null or not app.angemeldet() then
    raise exception 'Nicht angemeldet' using errcode = '42501';
  end if;
  if coalesce(p_token, '') = '' then
    raise exception 'Ohne Marke kein Geraet' using errcode = '22023';
  end if;

  if p_an then
    -- Dasselbe Geraet bei einem anderen Konto desselben Betriebs: dort weg.
    update public.user_prefs
       set push_tokens = array_remove(push_tokens, p_token)
     where company_id = betrieb
       and user_id <> ich
       and p_token = any(push_tokens);
  end if;

  insert into public.user_prefs (user_id, company_id, push_tokens)
       values (ich, betrieb,
               case when p_an then array[p_token] else '{}'::text[] end)
  on conflict (user_id) do update
     set push_tokens = case
           when p_an then
             -- Zweimal dasselbe Geraet ist immer noch ein Geraet.
             case when p_token = any(public.user_prefs.push_tokens)
                  then public.user_prefs.push_tokens
                  else array_append(public.user_prefs.push_tokens, p_token) end
           else array_remove(public.user_prefs.push_tokens, p_token)
         end,
         updated_at = now()
   -- Vorher erzwang das der Zeilenschutz; als Definer steht es hier.
   where public.user_prefs.company_id = betrieb;
end;
$$;

revoke all on function public.push_marke_setzen(text, boolean) from public;
revoke all on function public.push_marke_setzen(text, boolean) from anon;
grant execute on function public.push_marke_setzen(text, boolean) to authenticated;
