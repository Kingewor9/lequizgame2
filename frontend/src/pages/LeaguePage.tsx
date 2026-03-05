import React, { useState, useEffect } from 'react';
import { UserLeague, League } from '../types';
import { apiService } from '../services/apiService';
import { Modal } from '../components/Modal';
import { Loading } from '../components/Loading';
import { Alert, AlertType } from '../components/Alert';
import { LeagueCard } from '../components/LeagueCard';
import { LeagueDetailPage } from './LeagueDetailPage';
import '../styles/pages/LeaguePage.css';

export const LeaguePage: React.FC = () => {
  const [selectedLeagueId, setSelectedLeagueId] = useState<string | null>(null);
  const [userLeagues, setUserLeagues] = useState<UserLeague[]>([]);
  const [publicLeagues, setPublicLeagues] = useState<League[]>([]);
  const [searchResults, setSearchResults] = useState<League[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [alert, setAlert] = useState<{ message: string; type: AlertType } | null>(null);

  // Create form states
  const [leagueName, setLeagueName] = useState('');
  const [leagueDescription, setLeagueDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [totalWeeks, setTotalWeeks] = useState<number>(4);
  const [startDate, setStartDate] = useState('');

  // Join form
  const [joinCode, setJoinCode] = useState('');

  // Search
  const [searchQuery, setSearchQuery] = useState('');

  // ── Auto-calculate end date ───────────────────────────────────────────────
  const getEndDate = (): string => {
    if (!startDate) return '';
    const start = new Date(startDate);
    start.setDate(start.getDate() + totalWeeks * 7);
    return start.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };

  const getEndDateISO = (): string => {
    if (!startDate) return '';
    const start = new Date(startDate);
    start.setDate(start.getDate() + totalWeeks * 7);
    return start.toISOString().split('T')[0];
  };

  // ── Today's date as min for date picker ───────────────────────────────────
  const todayISO = new Date().toISOString().split('T')[0];

  // ── Refresh user leagues and public leagues ───────────────────────────────
  const refreshLeagues = async () => {
    try {
      const [myRes, publicRes] = await Promise.all([
        apiService.get('/leagues/user'),
        apiService.get('/leagues/public?limit=3'),
      ]);
      if (myRes.success && myRes.data) setUserLeagues(myRes.data as UserLeague[]);
      if (publicRes.success && publicRes.data) setPublicLeagues(publicRes.data as League[]);
    } catch (error) {
      console.error('Error fetching leagues:', error);
    }
  };

  // ── Data load ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const fetchLeagues = async () => {
      try {
        setIsLoading(true);
        await refreshLeagues();
      } catch (error) {
        console.error('Error fetching leagues:', error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchLeagues();
  }, []);

  // ── Conditional renders AFTER all hooks ──────────────────────────────────
  if (selectedLeagueId) {
    return (
      <LeagueDetailPage
        leagueId={selectedLeagueId}
        onBack={() => setSelectedLeagueId(null)}
      />
    );
  }

  if (isLoading) return <Loading message="Loading leagues..." />;

  // ── Handlers ──────────────────────────────────────────────────────────────
  const resetCreateForm = () => {
    setLeagueName('');
    setLeagueDescription('');
    setIsPrivate(false);
    setTotalWeeks(4);
    setStartDate('');
  };

  const handleCreateLeague = async () => {
    if (!leagueName.trim()) {
      setAlert({ message: 'Please enter a league name', type: 'error' });
      return;
    }
    if (!startDate) {
      setAlert({ message: 'Please select a start date', type: 'error' });
      return;
    }

    try {
      const response = await apiService.post('/leagues', {
        name: leagueName,
        description: leagueDescription,
        is_private: isPrivate,
        total_game_weeks: totalWeeks,
        start_date: startDate,
        end_date: getEndDateISO(),
      });

      if (response.success && response.data) {
        setAlert({ message: 'League created successfully!', type: 'success' });
        setShowCreateModal(false);
        resetCreateForm();
        await refreshLeagues();
      } else {
        setAlert({ message: response.error || 'Failed to create league', type: 'error' });
      }
    } catch {
      setAlert({ message: 'Error creating league', type: 'error' });
    }
  };

  const handleJoinPrivateLeague = async () => {
    if (joinCode.trim().length !== 6) {
      setAlert({ message: 'Please enter a valid 6-character code', type: 'error' });
      return;
    }
    try {
      const response = await apiService.post('/leagues/join', { code: joinCode.toUpperCase() });
      if (response.success && response.data) {
        setAlert({ message: 'Joined league successfully!', type: 'success' });
        setShowJoinModal(false);
        setJoinCode('');
        await refreshLeagues();
      } else {
        setAlert({ message: response.error || 'Failed to join league', type: 'error' });
      }
    } catch {
      setAlert({ message: 'Error joining league', type: 'error' });
    }
  };

  const handleJoinPublicLeague = async (leagueId: string) => {
    try {
      const response = await apiService.post(`/leagues/${leagueId}/join-public`, {});
      if (response.success && response.data) {
        setAlert({ message: 'Joined league successfully!', type: 'success' });
        await refreshLeagues();
      } else {
        setAlert({ message: response.error || 'Failed to join league', type: 'error' });
      }
    } catch {
      setAlert({ message: 'Error joining league', type: 'error' });
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setAlert({ message: 'Please enter a search term', type: 'error' });
      return;
    }
    try {
      setIsSearching(true);
      setHasSearched(true);
      const response = await apiService.get(`/leagues/search?q=${encodeURIComponent(searchQuery)}`);
      if (response.success && response.data) {
        setSearchResults(response.data as League[]);
        if ((response.data as League[]).length === 0) {
          setAlert({ message: 'No leagues found for that search', type: 'info' });
        }
      }
    } catch {
      setAlert({ message: 'Error searching leagues', type: 'error' });
    } finally {
      setIsSearching(false);
    }
  };

  const clearSearch = () => {
    setSearchQuery('');
    setSearchResults([]);
    setHasSearched(false);
  };

  const displayedPublicLeagues = hasSearched ? searchResults : publicLeagues;
  const joinedLeagueIds = new Set(userLeagues.map((ul) => ul.league_id));
  const joinableLeagues = displayedPublicLeagues.filter((l) => !joinedLeagueIds.has(l.id));

  const endDate = getEndDate();

  return (
    <div className="league-page">
      {alert && (
        <Alert message={alert.message} type={alert.type} onClose={() => setAlert(null)} />
      )}

      <div className="league-content">
        <section className="action-buttons">
          <button className="btn-primary" onClick={() => setShowCreateModal(true)}>
            ➕ Create League
          </button>
          <button className="btn-secondary" onClick={() => setShowJoinModal(true)}>
            🔑 Join with Code
          </button>
        </section>

        <section className="my-leagues-section">
          <h2>My Leagues</h2>
          {userLeagues.length > 0 ? (
            <div className="leagues-list">
              {userLeagues.map((league) => (
                <LeagueCard
                  key={league.id}
                  league={league}
                  isOwnLeague={league.is_owner}
                  userRank={league.rank}
                  userPoints={league.points}
                  isUserLeague={true}
                  onViewClick={() => setSelectedLeagueId(league.league_id)}
                />
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <p>You haven't joined any leagues yet.</p>
              <p>Create one or join a public league below!</p>
            </div>
          )}
        </section>

        <section className="discover-section">
          <h2>Discover Leagues</h2>
          <div className="search-bar">
            <input
              type="text"
              placeholder="Search public leagues..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
            />
            {hasSearched ? (
              <button className="btn-search btn-clear" onClick={clearSearch}>✕</button>
            ) : (
              <button
                className="btn-search"
                onClick={handleSearch}
                disabled={!searchQuery.trim() || isSearching}
              >
                {isSearching ? '...' : '🔍'}
              </button>
            )}
          </div>

          <div className="public-leagues-header">
            <h3>{hasSearched ? `Results for "${searchQuery}"` : 'Top Public Leagues'}</h3>
            {hasSearched && (
              <button className="btn-link" onClick={clearSearch}>Back to top leagues</button>
            )}
          </div>

          {joinableLeagues.length > 0 ? (
            <div className="public-leagues-list">
              {joinableLeagues.map((league) => {
                // Inline status logic — same pattern as LeagueCard.tsx
                const getStatus = () => {
                  if (!league.start_date || !league.end_date) return null;
                  const start = new Date(league.start_date);
                  const end = new Date(league.end_date);
                  const now = new Date();
                  if (now < start) {
                    const diffMs = start.getTime() - now.getTime();
                    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
                    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
                    const diffMins = Math.floor(diffMs / (1000 * 60));
                    if (diffDays > 0) return { label: `Starts in ${diffDays}d`, status: 'inactive' };
                    if (diffHours > 0) return { label: `Starts in ${diffHours}h`, status: 'inactive' };
                    if (diffMins > 0) return { label: `Starts in ${diffMins}m`, status: 'inactive' };
                    return { label: 'Starts soon', status: 'inactive' };
                  }
                  if (now >= start && now < end) return { label: 'Active', status: 'active' };
                  return { label: 'Ended', status: 'ended' };
                };
                const statusInfo = getStatus();

                return (
                  <div key={league.id} className="public-league-card card">
                    <div className="league-info">
                      <div className="public-league-title-row">
                        <h4>{league.name}</h4>
                        {statusInfo && (
                          <span className={`badge badge-${statusInfo.status}`}>
                            {statusInfo.label}
                          </span>
                        )}
                      </div>
                      {league.description && (
                        <p className="description">{league.description}</p>
                      )}
                      <div className="league-meta">
                        <span className="member-count">👥 {league.total_members} Members</span>
                      </div>
                    </div>
                    <button
                      className="btn-primary btn-sm"
                      onClick={() => handleJoinPublicLeague(league.id)}
                    >
                      Join League
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="no-leagues-text">
              {hasSearched ? 'No leagues found. Try a different search.' : 'No public leagues yet.'}
            </p>
          )}
        </section>
      </div>

      {/* ── Create League Modal ── */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => { setShowCreateModal(false); resetCreateForm(); }}
        title="Create a New League"
      >
        <form className="league-form" onSubmit={(e) => { e.preventDefault(); handleCreateLeague(); }}>

          <div className="form-group">
            <label htmlFor="league-name">League Name *</label>
            <input
              id="league-name"
              type="text"
              placeholder="Enter league name"
              value={leagueName}
              onChange={(e) => setLeagueName(e.target.value)}
              maxLength={50}
            />
          </div>

          <div className="form-group">
            <label htmlFor="league-description">Description (Optional)</label>
            <textarea
              id="league-description"
              placeholder="What is this league about?"
              value={leagueDescription}
              onChange={(e) => setLeagueDescription(e.target.value)}
              maxLength={200}
              rows={3}
            />
          </div>

          <div className="form-group">
            <label htmlFor="total-weeks">Number of Weeks</label>
            <select
              id="total-weeks"
              value={totalWeeks}
              onChange={(e) => setTotalWeeks(Number(e.target.value))}
              className="form-select"
            >
              {[1, 2, 3, 4, 5, 6].map((w) => (
                <option key={w} value={w}>
                  {w} {w === 1 ? 'Week' : 'Weeks'}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="start-date">Start Date *</label>
            <input
              id="start-date"
              type="date"
              value={startDate}
              min={todayISO}
              onChange={(e) => setStartDate(e.target.value)}
              className="form-date"
            />
          </div>

          <div className="form-group">
            <label>End Date</label>
            <div className={`end-date-display ${endDate ? 'end-date-display--set' : ''}`}>
              {endDate || 'Select a start date and number of weeks'}
            </div>
          </div>

          <div className="form-group checkbox">
            <input
              id="private-league"
              type="checkbox"
              checked={isPrivate}
              onChange={(e) => setIsPrivate(e.target.checked)}
            />
            <label htmlFor="private-league">Make this league private</label>
          </div>

          {isPrivate && (
            <p className="form-hint">🔒 A 6-character invite code will be generated.</p>
          )}
          {!isPrivate && (
            <p className="form-hint">🌍 Anyone can find and join this league.</p>
          )}

          <button type="submit" className="btn-primary btn-full">
            Create League
          </button>
        </form>
      </Modal>

      {/* ── Join Private League Modal ── */}
      <Modal
        isOpen={showJoinModal}
        onClose={() => setShowJoinModal(false)}
        title="Join a Private League"
      >
        <form className="league-form" onSubmit={(e) => { e.preventDefault(); handleJoinPrivateLeague(); }}>
          <div className="form-group">
            <label htmlFor="join-code">6-Character League Code</label>
            <input
              id="join-code"
              type="text"
              placeholder="e.g. AB12CD"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              maxLength={6}
              className="code-input"
            />
          </div>
          <p className="form-hint">🔑 Ask the league creator for their invite code.</p>
          <button
            type="submit"
            className="btn-primary btn-full"
            disabled={joinCode.trim().length !== 6}
          >
            Join League
          </button>
        </form>
      </Modal>
    </div>
  );
};