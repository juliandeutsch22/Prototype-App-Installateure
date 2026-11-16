-- Nacharbeit F13 (Durchsicht 15.11.2026): Abbuchungen im Kontoauszug — die
-- Rückzahlung eines Guthabens an den Kunden.
--
-- WIE SIE HEUTE ERFASST WIRD: im Zahlungsdialog als „Rückzahlung“, also als
-- negativer Eingang auf der Rechnung mit Guthaben (überzahlt oder storniert
-- und bezahlt); der Dialog lässt höchstens das Guthaben zu, die Datenbank
-- höchstens, was eingegangen ist (`app.zahlung_nicht_unter_null`). Genau so
-- bucht jetzt auch der Abgleich: eine Bewegung `richtung = 'aus'` mit Teilen
-- `rueckzahlung` wird zu negativen Eingängen „Überweisung“ — mit der Grenze
-- des Dialogs (höchstens das Guthaben, geprüft unter Sperre der Rechnung) und
-- derselben Wiederholungssperre (`bank_buchungen`; die App rechnet die
-- Prüfsumme einer Abbuchung mit eigener Vorsilbe).
--
-- Was keine Rückzahlung ist (Lieferanten, Löhne, Gebühren), kommt hier nie
-- an: die App zählt es als „nicht Rechnungen betreffend“.
--
-- Dazu: „schon verbucht“ wird vor jeder anderen Prüfung erkannt — sonst
-- meldete eine zweite Rückzahlung derselben Datei „kein Guthaben mehr“.
--
-- `kontoauszug_verbuchen` stammt aus 20261117040000 und wird hier ganz
-- ersetzt; eine andere Migration ändert sie nicht. Ein Aufruf ohne
-- `richtung` bucht wie bisher einen Eingang.

create or replace function public.kontoauszug_verbuchen(p_posten jsonb) returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  betrieb text := app.betrieb();
  heute date := (now() at time zone 'Europe/Vienna')::date;
  wer text;
  posten jsonb;
  teil jsonb;
  ergebnisse jsonb := '[]'::jsonb;
  v_kennung text;
  v_tag date;
  v_bank numeric(12,2);
  v_summe numeric(12,2);
  v_hinweis text;
  v_neu uuid;
  v_rechnung uuid;
  v_betrag numeric(12,2);
  v_skonto numeric(12,2);
  v_mahnkosten numeric(12,2);
  v_gesehen uuid[];
  v_aus boolean;
  v_rueck numeric(12,2);
  v_guthaben numeric(12,2);
  v_rechnung_row public.invoices;
begin
  if betrieb is null or not app.betriebsmitglied(betrieb)
     or not app.hat_rolle(array['Buchhaltung', 'Geschäftsführung', 'Administrator']) then
    raise exception 'Den Kontoauszug verbucht, wer Zahlungen erfasst.' using errcode = '42501';
  end if;
  if p_posten is null or jsonb_typeof(p_posten) <> 'array' then
    raise exception 'Erwartet wird eine Liste von Bewegungen.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_posten) > 500 then
    raise exception 'Höchstens 500 Bewegungen auf einmal — bitte in Teilen verbuchen.' using errcode = '22023';
  end if;

  select u.name into wer from public.users u where u.id = auth.uid();

  for posten in select * from jsonb_array_elements(p_posten) loop
    v_kennung := posten ->> 'kennung';
    v_neu := null;
    begin
      if v_kennung is null or v_kennung !~ '^[0-9a-f]{64}$' then
        raise exception 'Die Kennung der Bewegung fehlt oder ist keine Prüfsumme.' using errcode = '22023';
      end if;
      /*
        SCHON VERBUCHT GEHT VOR JEDER ANDEREN PRÜFUNG: dieselbe Datei noch
        einmal soll „schon verbucht“ sagen — nicht „kein Guthaben mehr“, weil
        die erste Buchung das Guthaben verbraucht hat. Zwei gleichzeitige
        Aufrufe fängt weiter der eindeutige Index beim Einfügen.
      */
      if exists (select 1 from public.bank_buchungen b where b.company_id = betrieb and b.kennung = v_kennung) then
        ergebnisse := ergebnisse || jsonb_build_object('kennung', v_kennung, 'ergebnis', 'schon_verbucht');
        continue;
      end if;
      v_tag := (posten ->> 'buchungstag')::date;
      v_bank := (posten ->> 'betrag')::numeric;
      if v_tag is null or v_tag > heute then
        raise exception 'Der Buchungstag fehlt oder liegt in der Zukunft.' using errcode = '22023';
      end if;
      if v_bank is null or v_bank <= 0 or v_bank <> round(v_bank, 2) then
        raise exception 'Der Betrag der Bewegung ist größer null und auf den Cent genau.' using errcode = '22023';
      end if;
      if coalesce(posten ->> 'richtung', 'ein') not in ('ein', 'aus') then
        raise exception 'Die Richtung der Bewegung ist „ein“ oder „aus“.' using errcode = '22023';
      end if;
      v_aus := coalesce(posten ->> 'richtung', 'ein') = 'aus';
      if jsonb_typeof(posten -> 'teile') is distinct from 'array' or jsonb_array_length(posten -> 'teile') = 0 then
        raise exception 'Keiner Rechnung zugeordnet.' using errcode = '22023';
      end if;

      v_summe := 0;
      v_gesehen := '{}';
      for teil in select * from jsonb_array_elements(posten -> 'teile') loop
        v_rechnung := (teil ->> 'rechnung')::uuid;
        v_betrag := coalesce((teil ->> 'betrag')::numeric, 0);
        v_skonto := coalesce((teil ->> 'skonto')::numeric, 0);
        v_mahnkosten := coalesce((teil ->> 'mahnkosten')::numeric, 0);
        v_rueck := coalesce((teil ->> 'rueckzahlung')::numeric, 0);
        if v_rechnung is null or v_rechnung = any(v_gesehen) then
          raise exception 'Jede Rechnung höchstens einmal je Bewegung.' using errcode = '22023';
        end if;
        v_gesehen := v_gesehen || v_rechnung;
        if v_betrag < 0 or v_skonto < 0 or v_mahnkosten < 0 or v_rueck < 0
           or v_betrag <> round(v_betrag, 2) or v_skonto <> round(v_skonto, 2) or v_mahnkosten <> round(v_mahnkosten, 2)
           or v_rueck <> round(v_rueck, 2) then
          raise exception 'Die Beträge eines Teils sind nicht negativ und auf den Cent genau.' using errcode = '22023';
        end if;
        if v_aus and (v_betrag <> 0 or v_skonto <> 0 or v_mahnkosten <> 0 or v_rueck = 0) then
          raise exception 'Eine Abbuchung ist eine Rückzahlung eines Guthabens — kein Eingang auf die Rechnung.' using errcode = '22023';
        end if;
        if not v_aus and (v_rueck <> 0 or (v_betrag = 0 and v_skonto = 0 and v_mahnkosten = 0)) then
          raise exception 'Ein Eingang trägt einen Betrag, Skonto oder Mahnkosten — eine Rückzahlung gehört zu einer Abbuchung.' using errcode = '22023';
        end if;
        /*
          Gesperrt, bevor gerechnet wird (wie G9): die Rückzahlung prüft das
          Guthaben, und das soll niemand zwischen Prüfen und Buchen ändern.
        */
        select * into v_rechnung_row from public.invoices i where i.id = v_rechnung and i.company_id = betrieb for update;
        if v_rechnung_row.id is null then
          raise exception 'Eine der Rechnungen gibt es hier nicht.' using errcode = 'P0002';
        end if;
        if v_aus then
          -- Dieselbe Grenze wie der Zahlungsdialog: zurückgezahlt wird höchstens das Guthaben.
          v_guthaben := coalesce(v_rechnung_row.bezahlt_betrag, 0)
            - case when v_rechnung_row.payment_status = 'Storniert' then 0 else v_rechnung_row.total_brutto end;
          if v_rueck > v_guthaben then
            raise exception 'Auf % stehen % € Guthaben — mehr lässt sich nicht zurückzahlen.',
              v_rechnung_row.invoice_number, replace(greatest(v_guthaben, 0)::text, '.', ',') using errcode = '22023';
          end if;
        end if;
        v_summe := v_summe + v_betrag + v_mahnkosten + v_rueck;
      end loop;
      if v_summe > v_bank then
        raise exception 'Zugeordnet sind % €, % nur % €.',
          replace(v_summe::text, '.', ','), case when v_aus then 'abgebucht' else 'eingegangen' end,
          replace(v_bank::text, '.', ',') using errcode = '22023';
      end if;

      v_hinweis := left(nullif(btrim(coalesce(posten ->> 'hinweis', '')), ''), 300);

      insert into public.bank_buchungen (company_id, kennung, buchungstag, betrag, verbucht_von, verbucht_von_name)
      values (betrieb, v_kennung, v_tag, v_bank, auth.uid(), wer)
      on conflict (company_id, kennung) do nothing
      returning id into v_neu;
      if v_neu is null then
        ergebnisse := ergebnisse || jsonb_build_object('kennung', v_kennung, 'ergebnis', 'schon_verbucht');
        continue;
      end if;

      perform set_config('app.kontoauszug', 'ja', true);
      for teil in select * from jsonb_array_elements(posten -> 'teile') loop
        v_rechnung := (teil ->> 'rechnung')::uuid;
        v_betrag := coalesce((teil ->> 'betrag')::numeric, 0);
        v_skonto := coalesce((teil ->> 'skonto')::numeric, 0);
        v_mahnkosten := coalesce((teil ->> 'mahnkosten')::numeric, 0);
        v_rueck := coalesce((teil ->> 'rueckzahlung')::numeric, 0);
        -- In einem Insert je Rechnung: weist die Datenbank Skonto oder Mahnkosten ab, ist auch die Zahlung nicht gebucht.
        insert into public.zahlungseingaenge
          (company_id, invoice_id, datum, betrag, art, hinweis, erfasst_von, erfasst_von_name, bank_buchung)
        select betrieb, v_rechnung, v_tag, x.betrag, x.art, x.hinweis, auth.uid(), wer, v_neu
          from (values (v_betrag - v_rueck, 'Überweisung', v_hinweis),
                       (v_skonto, 'Skonto', null::text),
                       (v_mahnkosten, 'Mahnkosten', v_hinweis)) as x(betrag, art, hinweis)
         where x.betrag <> 0;
      end loop;
      perform set_config('app.kontoauszug', '', true);

      ergebnisse := ergebnisse || jsonb_build_object('kennung', v_kennung, 'ergebnis', 'gebucht');
    exception when others then
      perform set_config('app.kontoauszug', '', true);
      ergebnisse := ergebnisse || jsonb_build_object('kennung', v_kennung, 'ergebnis', 'abgewiesen', 'grund', sqlerrm);
    end;
  end loop;

  return ergebnisse;
end;
$$;

revoke all on function public.kontoauszug_verbuchen(jsonb) from public, anon;
grant execute on function public.kontoauszug_verbuchen(jsonb) to authenticated;

