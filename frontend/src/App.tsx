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
import { TournamentRenewalModal } from './components/TournamentRenewalModal';
import { WelcomeBonusModal } from './components/WelcomeBonusModal';
import { GameSoundProvider, useGameSound } from './context/GameSoundContext';
import { apiService } from './services/apiService';
import { ApiResponse, LeagueWinNotification, TournamentRenewal } from './types';
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
    refreshUser,
    welcomeBonusAwarded,
    dismissWelcomeBonus,
  } = useAuth();
  const { playSound } = useGameSound();
  const [activeTab, setActiveTab] = useState<'home' | 'league' | 'tournament' | 'coins' | 'admin'>('home');
  const [homeUnreadCount, setHomeUnreadCount] = useState(0);
  const [tournamentUnreadCount, setTournamentUnreadCount] = useState(0);
  const [leagueWin, setLeagueWin] = useState<LeagueWinNotification | null>(null);
  const [openLeagueId, setOpenLeagueId] = useState<string | null>(null);
  const [tournamentRenewals, setTournamentRenewals] = useState<TournamentRenewal[]>([]);
  const [renewalPromptDismissed, setRenewalPromptDismissed] = useState(false);
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

  const loadTournamentRenewals = useCallback(async () => {
    const response = await apiService.get<TournamentRenewal[]>('/tournaments/renewals');
    if (response.success && Array.isArray(response.data)) {
      setTournamentRenewals(response.data);
    } else {
      console.error(
        'Could not load tournament renewal prompts:',
        response.error || 'Unexpected API response'
      );
    }
  }, []);

  const updateHomeUnreadCount = useCallback((count: number) => {
    setHomeUnreadCount(count);
  }, []);
  const updateTournamentUnreadCount = useCallback((count: number) => {
    setTournamentUnreadCount(count);
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      initialLeagueWinRequest.current = null;
      setLeagueWin(null);
      setTournamentRenewals([]);
      setRenewalPromptDismissed(false);
      setHomeUnreadCount(0);
      setTournamentUnreadCount(0);
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

  useEffect(() => {
    if (!isAuthenticated || activeTab === 'coins') return;
    setRenewalPromptDismissed(false);
    void loadTournamentRenewals();
  }, [activeTab, isAuthenticated, loadTournamentRenewals]);

  const respondToTournamentRenewal = async (
    renewal: TournamentRenewal,
    decision: 'yes' | 'no'
  ) => {
    const response = await apiService.post<{ footy_coins?: number }>(
      `/tournaments/renewals/${renewal.tournament_id}`,
      { decision }
    );
    if (!response.success) {
      await loadTournamentRenewals();
      return response;
    }
    if (response.success) {
      setTournamentRenewals((pending) => pending.filter(
        (item) => item.tournament_id !== renewal.tournament_id
      ));
      if (decision === 'yes') await refreshUser();
    }
    return response;
  };

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
        return (
          <HomePage
            onCoinsClick={() => setActiveTab('coins')}
            onUnreadCountChange={updateHomeUnreadCount}
          />
        );
      case 'league':
        return (
          <LeaguePage
            openLeagueId={openLeagueId}
            onLeagueOpened={() => setOpenLeagueId(null)}
          />
        );
      case 'tournament':
        return <TournamentPage onUnreadCountChange={updateTournamentUnreadCount} />;
      case 'coins':
        return <FootyCoinPage />;
      case 'admin':
        return user?.is_admin ? <AdminPage /> : (
          <HomePage
            onCoinsClick={() => setActiveTab('coins')}
            onUnreadCountChange={updateHomeUnreadCount}
          />
        );
      default:
        return (
          <HomePage
            onCoinsClick={() => setActiveTab('coins')}
            onUnreadCountChange={updateHomeUnreadCount}
          />
        );
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
      <Navigation
        activeTab={activeTab}
        user={user}
        homeUnreadCount={homeUnreadCount}
        tournamentUnreadCount={tournamentUnreadCount}
        onTabChange={setActiveTab}
      />
      {welcomeBonusAwarded ? (
        <WelcomeBonusModal onClose={dismissWelcomeBonus} />
      ) : tournamentRenewals.length > 0 && !renewalPromptDismissed && activeTab !== 'coins' ? (
        <TournamentRenewalModal
          renewal={tournamentRenewals[0]}
          onRespond={respondToTournamentRenewal}
          onGetCoins={() => setActiveTab('coins')}
          onClose={() => setRenewalPromptDismissed(true)}
        />
      ) : leagueWin ? (
        <LeagueWinModal
          win={leagueWin}
          onClose={dismissLeagueWin}
          onViewLeague={viewWinningLeague}
        />
      ) : milestoneNotification ? (
        <MilestoneModal
          milestone={milestoneNotification}
          onClose={() => {
            dismissMilestoneNotification();
            void claimMilestoneNotification();
          }}
        />
      ) : null}
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
