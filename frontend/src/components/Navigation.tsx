import React from 'react';
import { Home, Users, Trophy, Coins, ShieldCheck } from 'lucide-react';
import '../styles/components/Navigation.css';
import { User } from '../types';

interface NavigationProps {
  activeTab: 'home' | 'league' | 'tournament' | 'coins' | 'admin';
  user: User | null;
  onTabChange: (tab: 'home' | 'league' | 'tournament' | 'coins' | 'admin') => void;
}

export const Navigation: React.FC<NavigationProps> = ({ activeTab, user, onTabChange }) => {
  return (
    <nav className="bottom-nav" aria-label="Main Navigation">
      <button
        className={`nav-item ${activeTab === 'home' ? 'active' : ''}`}
        onClick={() => onTabChange('home')}
        aria-label="Home"
      >
        <div className="nav-icon-container">
          <Home size={21} strokeWidth={activeTab === 'home' ? 2.4 : 1.8} />
        </div>
        <span className="nav-label">Home</span>
      </button>

      <button
        className={`nav-item ${activeTab === 'league' ? 'active' : ''}`}
        onClick={() => onTabChange('league')}
        aria-label="Leagues"
      >
        <div className="nav-icon-container">
          <Users size={21} strokeWidth={activeTab === 'league' ? 2.4 : 1.8} />
        </div>
        <span className="nav-label">League</span>
      </button>

      <button
        className={`nav-item ${activeTab === 'tournament' ? 'active' : ''}`}
        onClick={() => onTabChange('tournament')}
        aria-label="Tournament"
      >
        <div className="nav-icon-container">
          <Trophy size={21} strokeWidth={activeTab === 'tournament' ? 2.4 : 1.8} />
        </div>
        <span className="nav-label">Tournament</span>
      </button>

      <button
        className={`nav-item ${activeTab === 'coins' ? 'active' : ''}`}
        onClick={() => onTabChange('coins')}
        aria-label="Footy Coins"
      >
        <div className="nav-icon-container">
          <Coins size={21} strokeWidth={activeTab === 'coins' ? 2.4 : 1.8} />
        </div>
        <span className="nav-label">Coins</span>
      </button>

      {user?.is_admin && (
        <button
          className={`nav-item ${activeTab === 'admin' ? 'active' : ''}`}
          onClick={() => onTabChange('admin')}
          aria-label="Admin"
        >
          <div className="nav-icon-container">
            <ShieldCheck size={21} strokeWidth={activeTab === 'admin' ? 2.4 : 1.8} />
          </div>
          <span className="nav-label">Admin</span>
        </button>
      )}
    </nav>
  );
};
