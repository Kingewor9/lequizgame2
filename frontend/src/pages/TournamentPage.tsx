import React, { useState, useEffect } from 'react';
import '../styles/pages/TournamentPage.css';

export const TournamentPage: React.FC = () => {
  const [displayedText, setDisplayedText] = useState('');
  const targetText = 'TOURNAMENTS';
  const [isTextComplete, setIsTextComplete] = useState(false);

  useEffect(() => {
    let currentIndex = 0;
    const interval = setInterval(() => {
      if (currentIndex <= targetText.length) {
        setDisplayedText(targetText.substring(0, currentIndex));
        if (currentIndex === targetText.length) {
          setIsTextComplete(true);
        }
        currentIndex++;
      } else {
        clearInterval(interval);
      }
    }, 80);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="tournament-page">
      {/* Animated background layer */}
      <div className="tournament-bg-gradient"></div>
      <div className="tournament-grid-pattern"></div>
      <div className="tournament-floating-orbs"></div>

      <div className="tournament-content">
        {/* Main hero card */}
        <div className="tournament-hero">
          {/* Accent bars */}
          <div className="accent-bar accent-bar--left"></div>
          <div className="accent-bar accent-bar--right"></div>

          {/* Floating decorative elements */}
          <div className="trophy-float trophy-float--1">🏆</div>
          <div className="trophy-float trophy-float--2">⚽</div>
          <div className="trophy-float trophy-float--3">💰</div>

          {/* Main content */}
          <div className="hero-content">
            <div className="eyebrow-text">
              <span className="eyebrow-dot"></span>
              <span>LAUNCHING SOON</span>
            </div>

            <h1 className="hero-title">
              <span className="title-animated">{displayedText}</span>
              <span className={`title-cursor ${isTextComplete ? 'hidden' : ''}`}></span>
            </h1>

            <div className="tournament-features">
              <div className="feature-item">
                <div className="feature-icon">💵</div>
                <div className="feature-text">
                  <p className="feature-label">Cash Rewards</p>
                  <p className="feature-desc">Win real money</p>
                </div>
              </div>

              <div className="feature-divider"></div>

              <div className="feature-item">
                <div className="feature-icon">🌍</div>
                <div className="feature-text">
                  <p className="feature-label">Global Compete</p>
                  <p className="feature-desc">Weekly tournaments</p>
                </div>
              </div>

              <div className="feature-divider"></div>

              <div className="feature-item">
                <div className="feature-icon">🏅</div>
                <div className="feature-text">
                  <p className="feature-label">Elite Rankings</p>
                  <p className="feature-desc">Prove yourself</p>
                </div>
              </div>
            </div>

            <p className="hero-description">
              Compete against football fans worldwide. Win cash prizes, climb the leaderboard, and become a tournament legend.
            </p>

            <div className="teaser-box">
              <div className="teaser-label">🔔 Get Notified When We Launch</div>
              <button className="notify-btn">Remind Me</button>
            </div>
          </div>

          {/* Stats counter */}
          <div className="stats-corner">
            <div className="stat-badge">
              <span className="stat-number">50k+</span>
              <span className="stat-label">Players Ready</span>
            </div>
          </div>
        </div>

        {/* Bottom decorative element */}
        <div className="tournament-footer-accent"></div>
      </div>
    </div>
  );
};
