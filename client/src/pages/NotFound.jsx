import { usePageTitle } from '../lib/usePageTitle.js';
import { Button } from '../components/ui/Button.jsx';

export default function NotFound() {
  usePageTitle('Not found');
  return (
    <div className="container-page grid min-h-[60vh] place-items-center text-center">
      <div>
        <p className="font-display text-8xl font-bold text-dragon-500">404</p>
        <h1 className="mt-2 text-3xl font-bold">Lost in the city</h1>
        <p className="mt-2 text-ink-400">This page doesn’t exist — or the Dragonz already cleaned it up.</p>
        <Button to="/" className="mt-6">Back to base</Button>
      </div>
    </div>
  );
}
