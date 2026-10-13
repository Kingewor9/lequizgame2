import React from 'react';
import { ArrowRight, Trophy, X } from 'lucide-react';
import { LeagueWinNotification } from '../types';
import '../styles/components/LeagueWinModal.css';

interface Props {
  win: LeagueWinNotification;
  onViewLeague: () => void;
  onClose: () => void;
}

export const LeagueWinModal: React.FC<Props> = ({ win, onViewLeague, onClose }) => (
  <div className="league-win-overlay" role="presentation" onClick={onClose}>
    <section
      className="league-win-card"
      role="dialog"
      aria-modal="true"
      aria-labelledby="league-win-title"
      onClick={(event) => event.stopPropagation()}
    >
      <div className="league-win-confetti" aria-hidden="true">
        {Array.from({ length: 20 }, (_, index) => (
          <span className="league-win-confetti-piece" key={index} />
        ))}
      </div>

      <button
        type="button"
        className="league-win-close"
        onClick={onClose}
        aria-label="Close championship message"
      >
        <X size={18} />
      </button>

      <div className="league-win-medallion" aria-hidden="true">
        <span className="league-win-medallion-ring" />
        <Trophy className="league-win-trophy" strokeWidth={1.65} />
      </div>

      <p className="league-win-kicker">SEASON {win.season} COMPLETE</p>
      <h2 id="league-win-title">You&apos;re the champion!</h2>
      <p className="league-win-message">
        What a season. You came out on top in
      </p>
      <p className="league-win-league-name">{win.league_name}</p>

      <button type="button" className="league-win-action" onClick={onViewLeague}>
        See the final standings
        <ArrowRight size={18} />
      </button>
      <button type="button" className="league-win-later" onClick={onClose}>
        Celebrate later
      </button>
    </section>
  </div>
);
