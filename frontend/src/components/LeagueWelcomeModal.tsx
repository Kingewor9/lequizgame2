import React from 'react';
import { ArrowRight, BadgeCheck, X } from 'lucide-react';
import '../styles/components/LeagueWelcomeModal.css';

interface Props {
  leagueName: string;
  onViewLeague: () => void;
  onClose: () => void;
}

export const LeagueWelcomeModal: React.FC<Props> = ({ leagueName, onViewLeague, onClose }) => (
  <div
    className="league-welcome-overlay"
    onClick={onClose}
    role="presentation"
  >
    <section
      className="league-welcome-card"
      role="dialog"
      aria-modal="true"
      aria-labelledby="league-welcome-title"
      onClick={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        className="league-welcome-close"
        onClick={onClose}
        aria-label="Close welcome message"
      >
        <X size={18} />
      </button>

      <div className="league-welcome-icon-orbit" aria-hidden="true">
        <span className="league-welcome-orbit-ring" />
        <BadgeCheck className="league-welcome-icon" strokeWidth={1.7} />
      </div>

      <p className="league-welcome-kicker">SQUAD JOINED</p>
      <h2 id="league-welcome-title">Welcome to {leagueName}</h2>
      <p className="league-welcome-message">
        You&apos;re officially in. Meet your league, track the standings, and battle your way to the top.
      </p>

      <button type="button" className="league-welcome-action" onClick={onViewLeague}>
        View league
        <ArrowRight size={17} />
      </button>
      <button type="button" className="league-welcome-later" onClick={onClose}>
        Maybe later
      </button>
    </section>
  </div>
);
