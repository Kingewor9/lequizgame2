import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Navigation } from './components/Navigation';
import { HomePage } from './pages/HomePage';
import { LeaguePage } from './pages/LeaguePage';
import { TournamentPage } from './pages/TournamentPage';
import { FootyCoinPage } from './pages/FootyCoinPage';
import { AdminPage } from './pages/AdminPage';
import { Loading } from './components/Loading';
import { LeagueWinModal } from './components/LeagueWinModal';
import { MilestoneModal } from './components/MilestoneModal';
import { GameSoundProvider, useGameSound } from './context/GameSoundContext';
import { apiService } from './services/apiService';
import { ApiResponse, LeagueWinNotification } from './types';
import './styles/global.css';

const AppContent: React.FC = () => {
  const {
    isLoading,
    isAuthenticated,
    error,
    user,
    milestoneNotification,
    claimMilestoneNotification,
    dismissMilestoneNotification,
  } = useAuth();
  const { playSound } = useGameSound();
  const [activeTab, setActiveTab] = useState<'home' | 'league' | 'tournament' | 'coins' | 'admin'>('home');
  const [leagueWin, setLeagueWin] = useState<LeagueWinNotification | null>(null);
  const [openLeagueId, setOpenLeagueId] = useState<string | null>(null);
  const initialLeagueWinRequest = useRef<
    Promise<ApiResponse<{ win: LeagueWinNotification | null }>> | null
  >(null);

  const claimNextLeagueWin = useCallback(async () => {
    const response = await apiService.post<{ win: LeagueWinNotification | null }>(
      '/users/league-wins/claim',
      {}
    );
    if (response.success && response.data) {
      setLeagueWin(response.data.win);
      return;
    }
    console.error('Could not claim league win notification:', response.error || 'Unexpected API response');
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      initialLeagueWinRequest.current = null;
      setLeagueWin(null);
      return;
    }

    if (!initialLeagueWinRequest.current) {
      initialLeagueWinRequest.current = apiService.post<{ win: LeagueWinNotification | null }>(
        '/users/league-wins/claim',
        {}
      );
    }

    initialLeagueWinRequest.current.then((response) => {
      if (response.success && response.data) {
        setLeagueWin(response.data.win);
      } else {
        console.error('Could not claim league win notification:', response.error || 'Unexpected API response');
      }
    });
  }, [isAuthenticated]);

  const dismissLeagueWin = () => {
    setLeagueWin(null);
    void claimNextLeagueWin();
  };

  const viewWinningLeague = () => {
    if (!leagueWin) return;
    setOpenLeagueId(leagueWin.league_id);
    setActiveTab('league');
    setLeagueWin(null);
  };

  const handleUiClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const control = target.closest('button, [role="button"]');
    if (!control || control.closest('[data-sound="none"]')) return;
    playSound('click');
  };

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
        return (
          <LeaguePage
            openLeagueId={openLeagueId}
            onLeagueOpened={() => setOpenLeagueId(null)}
          />
        );
      case 'tournament':
        return <TournamentPage />;
      case 'coins':
        return <FootyCoinPage />;
      case 'admin':
        return user?.is_admin ? <AdminPage /> : <HomePage />;
      default:
        return <HomePage />;
    }
  };

  return (
    <div
      className="font-unbounded"
      onClickCapture={handleUiClick}
      style={{ display: 'flex', flexDirection: 'column', height: '100vh', position: 'relative' }}
    >
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: '90px' }} className="hide-scrollbar">
        {renderPage()}
      </div>
      <Navigation activeTab={activeTab} user={user} onTabChange={setActiveTab} />
      {leagueWin && (
        <LeagueWinModal
          win={leagueWin}
          onClose={dismissLeagueWin}
          onViewLeague={viewWinningLeague}
        />
      )}
      {milestoneNotification && (
        <MilestoneModal
          milestone={milestoneNotification}
          onClose={() => {
            dismissMilestoneNotification();
            void claimMilestoneNotification();
          }}
        />
      )}
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <GameSoundProvider>
        <AppContent />
      </GameSoundProvider>
    </AuthProvider>
  );
};
