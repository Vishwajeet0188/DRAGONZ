import { Hammer } from 'lucide-react';
import { usePageTitle } from '../lib/usePageTitle.js';
import { Button } from '../components/ui/Button.jsx';
import { BrandMark } from '../components/ui/Logo.jsx';

export default function ComingSoon({ title, blurb }) {
  usePageTitle(title);
  return (
    <div className="container-page grid min-h-[65vh] place-items-center py-16">
      <div className="card scales relative w-full max-w-2xl overflow-hidden p-10 text-center">
        <div className="absolute inset-0 bg-[radial-gradient(60%_100%_at_50%_0%,rgb(217_165_20/.18),transparent)]" aria-hidden="true" />
        <div className="relative">
          <BrandMark className="mx-auto block h-16 w-16" glow />
          <p className="eyebrow mt-5 inline-flex items-center gap-1.5"><Hammer className="h-3.5 w-3.5" aria-hidden="true" /> In the forge</p>
          <h1 className="mt-2 text-4xl font-bold sm:text-5xl">{title}</h1>
          {blurb && <p className="mx-auto mt-4 max-w-lg text-ink-300">{blurb}</p>}
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button to="/members">Explore members</Button>
            <Button to="/register" variant="outline">Get notified — create account</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
