import { Crown, Flame, Users, Video } from 'lucide-react';
import { usePageTitle } from '../lib/usePageTitle.js';
import { BrandMark } from '../components/ui/Logo.jsx';
import { Button } from '../components/ui/Button.jsx';

const PILLARS = [
  { icon: Crown, title: 'Story first', text: 'Long-running characters, real consequences and roleplay that rewards patience over chaos.' },
  { icon: Users, title: 'Family, not a roster', text: 'From prospect to Boss, every Dragon earns their place and has the crew’s back.' },
  { icon: Video, title: 'Creators together', text: 'Multiple POVs, one story. Our creators stream and upload across YouTube, Kick and Twitch.' },
  { icon: Flame, title: 'Community fuelled', text: 'Clips, edits and fan art from the community are part of the Dragonz legacy.' },
];

export default function About() {
  usePageTitle('About');
  return (
    <div className="container-page py-16">
      <div className="grid items-center gap-10 lg:grid-cols-[1.3fr_1fr]">
        <div>
          <p className="eyebrow mb-3">About the crew</p>
          <h1 className="text-5xl font-bold uppercase leading-none sm:text-6xl">Who are the Dragonz?</h1>
          <p className="mt-6 max-w-2xl text-lg text-ink-300">
            The Dragonz are a GTA RP crew and creator collective. What started as a handful of players and one garage became a
            family of members and streamers telling one connected story across the city.
          </p>
          <p className="mt-4 max-w-2xl text-ink-400">Dragonz Central brings it all together — so you can find who’s live, catch up on the story, and be part of what comes next.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button to="/members" size="lg">Meet the members</Button>
            <Button to="/register" size="lg" variant="outline">Join the community</Button>
          </div>
        </div>
        <BrandMark className="mx-auto hidden h-64 w-64 lg:block" glow />
      </div>
      <div className="mt-20 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {PILLARS.map(({ icon: Icon, title, text }) => (
          <div key={title} className="card p-6">
            <Icon className="h-6 w-6 text-dragon-400" aria-hidden="true" />
            <h2 className="mt-4 text-xl font-bold">{title}</h2>
            <p className="mt-2 text-sm text-ink-300">{text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
