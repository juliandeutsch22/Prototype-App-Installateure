import { useEffect, useState } from 'react';
import { useAuth } from '@/app/AuthContext';
import { updateCompany } from '@/lib/db/company';
import { istAn } from '@/lib/module';
import { grundAus } from '@/lib/fehlerGrund';
import Card from '@/components/Card';
import Button from '@/components/Button';
import { InputField } from '@/components/Field';
import { useToast } from '@/components/Toast';
export default function TimerEinstellungen() {
  const { user, company, reloadCompany } = useAuth(); const toast = useToast();
  const [minuten, setMinuten] = useState(String(company?.timerErinnerungMin ?? 600));
  const [fehler, setFehler] = useState<string | null>(null); const [speichert, setSpeichert] = useState(false);
  useEffect(() => { setMinuten(String(company?.timerErinnerungMin ?? 600)); }, [company?.timerErinnerungMin]);
  if (!user || !istAn(company?.modules, 'zeiterfassung.timer_erinnerung')) return null;
  async function speichern() {
    if (!user) return; const n = Number(minuten);
    if (!Number.isSafeInteger(n) || n < 1) { setFehler('Bitte eine positive Anzahl Minuten eingeben'); return; }
    setFehler(null); setSpeichert(true);
    try { await updateCompany(user.companyId, { timerErinnerungMin: n }); await reloadCompany(); toast.success('Timer-Erinnerung gespeichert'); }
    catch (e) { setFehler(grundAus(e, 'Die Einstellung konnte nicht gespeichert werden.')); } finally { setSpeichert(false); }
  }
  return <Card title="Timer-Erinnerung" hint="Der Timer erinnert in diesem Abstand, solange er läuft oder in Pause steht. Die Prüfung erfolgt alle 15 Minuten. „Weiterlaufen lassen“ beginnt den Abstand neu. Push wird nur an registrierte Geräte mit aktivierter persönlicher Timer-Benachrichtigung gesendet. Es wird niemals automatisch Arbeitszeit gebucht.">
    <InputField id="timer-erinnerung" label="Erinnern nach (Minuten)" type="number" min="1" step="1" value={minuten} onChange={(e) => setMinuten(e.target.value)} />
    {fehler && <p role="alert" className="text-sm text-danger">{fehler}</p>}
    <Button variant="secondary" disabled={speichert || Number(minuten) === (company?.timerErinnerungMin ?? 600)} onClick={() => void speichern()}>Erinnerung speichern</Button>
  </Card>;
}
