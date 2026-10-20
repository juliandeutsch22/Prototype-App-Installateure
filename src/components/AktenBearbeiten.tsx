import { useEffect, useState, type ReactNode } from 'react';
import BottomSheet from './BottomSheet';
import ConfirmDialog from './ConfirmDialog';

/** Das Schließen eines Fensters ist keine Zustimmung zum Verlust eines Entwurfs. */
export default function AktenBearbeiten({ offen, titel, geaendert, speichert, onSchliessen, onVerwerfen, children }: {
  offen: boolean;
  titel: string;
  geaendert: boolean;
  speichert: boolean;
  onSchliessen: () => void;
  onVerwerfen: () => void;
  children: ReactNode;
}) {
  const [fragen, setFragen] = useState(false);
  useEffect(() => { if (!offen) setFragen(false); }, [offen]);
  function schliessen() {
    if (speichert) return;
    if (geaendert) setFragen(true);
    else onSchliessen();
  }
  return <>
    <BottomSheet open={offen} onClose={schliessen} label={titel} titel={titel} auchBreit breit>
      <div className="akten-editor">{children}</div>
    </BottomSheet>
    <ConfirmDialog open={offen && fragen} title="Ungespeicherte Änderungen verwerfen?"
      message="Die Änderungen sind noch nicht gespeichert. Beim Verwerfen wird der gespeicherte Stand wiederhergestellt."
      confirmLabel="Verwerfen" onCancel={() => setFragen(false)} onConfirm={() => {
        onVerwerfen();
        setFragen(false);
        onSchliessen();
      }} />
  </>;
}
