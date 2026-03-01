import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Navigation } from './components/Navigation';
import { HomePage } from './pages/HomePage';
import { LeaguePage } from './pages/LeaguePage';
import { TournamentPage } from './pages/TournamentPage';
import { FootyCoinPage } from './pages/FootyCoinPage';
import { Loading } from './components/Loading';
import './styles/global.css';

const AppContent: React.FC = () => {
  const { isLoading, isAuthenticated, error } = useAuth();
  const [activeTab, setActiveTab] = useState<'home' | 'league' | 'tournament' | 'coins'>('home');

  if (isLoading) {
    return <Loading message="Authenticating with Telegram..." fullScreen />;
  }

  if (error || !isAuthenticated) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          backgroundColor: '#000',
          color: '#fff',
        }}
      >
        <h1>Authentication Error</h1>
        <p style={{ color: '#999', textAlign: 'center', maxWidth: '300px' }}>
          {error || 'Failed to authenticate with Telegram. Please open this app from Telegram.'}
        </p>
      </div>
    );
  }

  const renderPage = () => {
    switch (activeTab) {
      case 'home':
        return <HomePage />;
      case 'league':
        return <LeaguePage />;
      case 'tournament':
        return <TournamentPage />;
      case 'coins':
        return <FootyCoinPage />;
      default:
        return <HomePage />;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {renderPage()}
      <Navigation activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
};
