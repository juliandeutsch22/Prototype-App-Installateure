/*
  DER BASISZINSSATZ, ZENTRAL GEPFLEGT (Stand-Datei 11.1, Punkt 2)

  Der Basiszinssatz der OeNB gilt für ganz Österreich und ändert sich zum
  1. Jänner und 1. Juli. Bisher trug ihn jeder Betrieb selbst ein
  (`companies.rates.basiszinssaetze`, seit 20260930350000). Bei vielen
  Betrieben heisst das: dieselbe Zahl, halbjährlich, in jedem Betrieb — und
  wer es vergisst, mahnt Unternehmer ohne Zinsen.

  Jetzt pflegt ihn der Betreiber an einer Stelle. Die Einträge der Betriebe
  bleiben unangetastet und gelten weiter als Rückfall für jedes Halbjahr, für
  das hier nichts steht; die App legt beide zusammen (`basiszinsVerlauf`).
  Darum wird hier nichts übernommen und nichts umgeschrieben.

  Ohne Personenbezug und ohne Zeitstempel: wer einen Satz wann eingetragen
  hat, steht bewusst nicht darin. Die Zahl ist öffentlich, ein Name daneben wäre nur ein weiterer
  Eintrag für Auskunft und Löschung.
*/

create table if not exists public.basiszinssaetze (
  ab date primary key
    check (extract(day from ab) = 1 and extract(month from ab) in (1, 7)),
  satz numeric not null check (abs(satz) <= 20)
);

alter table public.basiszinssaetze enable row level security;

-- Lesen darf jeder Angemeldete: die Zahl ist öffentlich, und jede Mahnung
-- jedes Betriebs braucht sie.
drop policy if exists basiszinssaetze_lesen on public.basiszinssaetze;
create policy basiszinssaetze_lesen on public.basiszinssaetze
  for select to authenticated using (true);

revoke all on table public.basiszinssaetze from public, anon, authenticated;
grant select on table public.basiszinssaetze to authenticated;

/*
  Schreiben nur über diese beiden Funktionen und nur als Plattformkonto. Kein
  Recht auf die Tabelle selbst: so prüft eine Stelle die Form, nicht jede
  Oberfläche für sich.
*/
create or replace function public.basiszinssatz_setzen(p_ab date, p_satz numeric)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if not app.ist_plattform() then
    raise exception 'Den Basiszinssatz pflegt der Betreiber' using errcode = '42501';
  end if;
  if p_ab is null or extract(day from p_ab) <> 1 or extract(month from p_ab) not in (1, 7) then
    raise exception 'Der Basiszinssatz gilt ab dem 1. Jänner oder 1. Juli' using errcode = '22023';
  end if;
  if p_satz is null or abs(p_satz) > 20 then
    raise exception 'Der Basiszinssatz ist ein Prozentsatz' using errcode = '22023';
  end if;

  insert into public.basiszinssaetze (ab, satz)
  values (p_ab, p_satz)
  on conflict (ab) do update set satz = excluded.satz;
end;
$$;

create or replace function public.basiszinssatz_entfernen(p_ab date)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if not app.ist_plattform() then
    raise exception 'Den Basiszinssatz pflegt der Betreiber' using errcode = '42501';
  end if;
  delete from public.basiszinssaetze where ab = p_ab;
end;
$$;

revoke all on function public.basiszinssatz_setzen(date, numeric) from public, anon;
revoke all on function public.basiszinssatz_entfernen(date) from public, anon;
grant execute on function public.basiszinssatz_setzen(date, numeric) to authenticated;
grant execute on function public.basiszinssatz_entfernen(date) to authenticated;
