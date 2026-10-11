import React from 'react';
import { Trophy } from 'lucide-react';
import '../styles/pages/TournamentPage.css';

export const TournamentPage: React.FC = () => (
  <main className="tournament-page">
    <section className="tournament-coming-soon" aria-labelledby="tournament-coming-soon-title">
      <div className="tournament-trophy-orbit" aria-hidden="true">
        <span className="tournament-orbit-ring" />
        <Trophy className="tournament-trophy" strokeWidth={1.6} />
      </div>
      <p className="tournament-kicker">THE NEXT CHALLENGE</p>
      <h1 id="tournament-coming-soon-title">Coming soon</h1>
    </section>
  </main>
);
