import { vi, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react';
import KatalogSuche from '@/features/quotes/KatalogSuche';
import VerloreneBuchung from '@/components/VerloreneBuchung';
import { ToastProvider } from '@/components/Toast';

const katalog = vi.hoisted(() => vi.fn());
const vormerkung = vi.hoisted(() => ({ melden: null as null | (()=>void) }));
vi.mock('@/lib/db/materials', () => ({sucheKatalog: (...a:unknown[])=>katalog(...a)}));
vi.mock('@/lib/sync/ausgangsfach',()=>({beiVormerkungFehlgeschlagen:(fn:null|(()=>void))=>{vormerkung.melden=fn;}}));
afterEach(()=>{cleanup();vi.useRealTimers();katalog.mockReset()});

it('AUDIT alter Katalogtreffer bleibt bei neuer ausstehender Suche übernehmbar',async()=>{
 katalog.mockResolvedValueOnce([{id:'v1',name:'Eckventil 1/2',verkaufspreis:8.5,unit:'Stk'}]);
 katalog.mockImplementation(()=>new Promise(()=>{}));
 const wahl=vi.fn();
 render(<KatalogSuche companyId="perl" onWahl={wahl} onSchliessen={()=>{}}/>);
 fireEvent.change(screen.getByLabelText('Artikel aus dem Katalog'),{target:{value:'Ventil'}});
 await screen.findByRole('button',{name:'Eckventil 1/2 übernehmen'});
 fireEvent.change(screen.getByLabelText('Artikel aus dem Katalog'),{target:{value:'Kupferrohr'}});
 await waitFor(()=>expect(katalog).toHaveBeenCalledTimes(2));
 fireEvent.click(screen.getByRole('button',{name:'Eckventil 1/2 übernehmen'}));
 expect(wahl).toHaveBeenCalledWith(expect.objectContaining({id:'v1'}));
 console.log('AUDIT-BELEG: Suche Kupferrohr ausstehend, alter Treffer Eckventil ohne Kennzeichnung auswählbar.');
});

it('AUDIT Fehler einer endgültig abgelehnten Vormerkung verschwindet nach 3,5 Sekunden',()=>{
 vi.useFakeTimers();
 render(<ToastProvider><VerloreneBuchung/></ToastProvider>);
 act(()=>vormerkung.melden?.());
 expect(screen.getByText(/Eine vorgemerkte Buchung konnte nicht gesendet/)).toBeInTheDocument();
 act(()=>vi.advanceTimersByTime(3501));
 expect(screen.queryByText(/Eine vorgemerkte Buchung konnte nicht gesendet/)).toBeNull();
 console.log('AUDIT-BELEG: endgültiger Nachsendefehler nach 3501 ms nicht mehr sichtbar.');
});
