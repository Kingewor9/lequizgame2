import React from 'react';
import '../styles/pages/TournamentPage.css';

export const TournamentPage: React.FC = () => {
  return (
    <div className="tournament-page">
      <div className="tournament-content">
        <div className="coming-soon-banner">
          <div className="banner-icon">⚽</div>
          <h1>Coming Soon</h1>
          <p>Earn cash rewards by competing in weekly global tournaments</p>
          <p className="banner-subtitle">Stay tuned for an exciting experience!</p>
        </div>
      </div>
    </div>
  );
};
