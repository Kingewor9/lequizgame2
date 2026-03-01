import React from 'react';
import '../styles/components/Navigation.css';

interface NavigationProps {
  activeTab: 'home' | 'league' | 'tournament' | 'coins';
  onTabChange: (tab: 'home' | 'league' | 'tournament' | 'coins') => void;
}

export const Navigation: React.FC<NavigationProps> = ({ activeTab, onTabChange }) => {
  return (
    <nav className="bottom-nav">
      <button
        className={`nav-item ${activeTab === 'home' ? 'active' : ''}`}
        onClick={() => onTabChange('home')}
        title="Home"
      >
        <span className="nav-icon">🏠</span>
        <span className="nav-label">Home</span>
      </button>

      <button
        className={`nav-item ${activeTab === 'league' ? 'active' : ''}`}
        onClick={() => onTabChange('league')}
        title="League"
      >
        <span className="nav-icon">🏆</span>
        <span className="nav-label">League</span>
      </button>

      <button
        className={`nav-item ${activeTab === 'tournament' ? 'active' : ''}`}
        onClick={() => onTabChange('tournament')}
        title="Tournament"
      >
        <span className="nav-icon">⚽</span>
        <span className="nav-label">Tournament</span>
      </button>

      <button
        className={`nav-item ${activeTab === 'coins' ? 'active' : ''}`}
        onClick={() => onTabChange('coins')}
        title="Footy Coins"
      >
        <span className="nav-icon">💰</span>
        <span className="nav-label">Coins</span>
      </button>
    </nav>
  );
};
