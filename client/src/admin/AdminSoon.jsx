import { Hammer } from 'lucide-react';
import { AdminHeader } from './ui.jsx';

export default function AdminSoon({ title, phase }) {
  return (
    <>
      <AdminHeader title={title} />
      <div className="card scales flex flex-col items-center gap-2 px-6 py-16 text-center">
        <Hammer className="h-7 w-7 text-ink-400" aria-hidden="true" />
        <p className="font-display text-xl font-bold text-ink-100">{phase ? `Arrives in Phase ${phase}` : 'Nothing here'}</p>
        {phase && <p className="max-w-md text-sm text-ink-400">The database tables and permissions for this section already exist; the management UI and API ship with this phase.</p>}
      </div>
    </>
  );
}
