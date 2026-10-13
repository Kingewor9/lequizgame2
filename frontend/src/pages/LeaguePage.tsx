import React, { useState, useEffect } from 'react';
import { Shield, Star, Plus, LogIn, Search, X, Lock, Globe, Users } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { UserLeague, League } from '../types';
import { apiService } from '../services/apiService';
import { Modal } from '../components/Modal';
import { Loading } from '../components/Loading';
import { Alert, AlertType } from '../components/Alert';
import { LeagueCard } from '../components/LeagueCard';
import { LeagueWelcomeModal } from '../components/LeagueWelcomeModal';
import { LeagueDetailPage } from './LeagueDetailPage';
import { useGameSound } from '../context/GameSoundContext';
import '../styles/pages/LeaguePage.css';

interface Props {
  openLeagueId?: string | null;
  onLeagueOpened?: () => void;
}

export const LeaguePage: React.FC<Props> = ({ openLeagueId, onLeagueOpened }) => {
  const { user, telegramUser } = useAuth();
  const { playSound } = useGameSound();
  const [selectedLeagueId, setSelectedLeagueId] = useState<string | null>(null);
  const [welcomeLeague, setWelcomeLeague] = useState<{ id: string; name: string } | null>(null);
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
  const [maxMembers, setMaxMembers] = useState('');
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

  const todayISO = new Date().toISOString().split('T')[0];

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

  useEffect(() => {
    if (!openLeagueId) return;
    setSelectedLeagueId(openLeagueId);
    onLeagueOpened?.();
  }, [openLeagueId, onLeagueOpened]);

  if (selectedLeagueId) {
    return (
      <LeagueDetailPage
        leagueId={selectedLeagueId}
        onBack={() => setSelectedLeagueId(null)}
      />
    );
  }

  if (isLoading) return <Loading message="Loading leagues..." />;

  const resetCreateForm = () => {
    setLeagueName('');
    setLeagueDescription('');
    setIsPrivate(false);
    setTotalWeeks(4);
    setMaxMembers('');
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

    const parsedMaxMembers = maxMembers.trim();
    if (parsedMaxMembers && Number(parsedMaxMembers) < 1) {
      setAlert({ message: 'Maximum members must be at least 1', type: 'error' });
      return;
    }

    try {
      const response = await apiService.post('/leagues', {
        name: leagueName,
        description: leagueDescription,
        is_private: isPrivate,
        total_game_weeks: totalWeeks,
        max_members: parsedMaxMembers ? Number(parsedMaxMembers) : null,
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
        const joinedLeague = response.data as { league_id: string; name?: string };
        setShowJoinModal(false);
        setJoinCode('');
        await refreshLeagues();
        playSound('leagueWelcome');
        setWelcomeLeague({ id: joinedLeague.league_id, name: joinedLeague.name || 'your new league' });
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
        const joinedLeague = response.data as { league_id: string; name?: string };
        await refreshLeagues();
        playSound('leagueWelcome');
        const leagueName = joinedLeague.name || displayedPublicLeagues.find((league) => league.id === leagueId)?.name;
        setWelcomeLeague({ id: joinedLeague.league_id || leagueId, name: leagueName || 'your new league' });
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

  const userIdentifier = telegramUser?.username 
    ? `@${telegramUser.username}` 
    : user?.id 
    ? `user-${user.id.slice(0, 18)}`
    : 'user-guest';

  return (
    <div className="league-page animate-fade">
      {welcomeLeague && (
        <LeagueWelcomeModal
          leagueName={welcomeLeague.name}
          onClose={() => setWelcomeLeague(null)}
          onViewLeague={() => {
            setWelcomeLeague(null);
            setSelectedLeagueId(welcomeLeague.id);
          }}
        />
      )}
      {alert && (
        <Alert message={alert.message} type={alert.type} onClose={() => setAlert(null)} />
      )}

      <div className="league-content">
        {/* Header - Matching Screenshot 1 */}
        <section className="leagues-header-section">
          <h1 className="leagues-hub-title">Leagues Hub</h1>
          <div className="user-id-badge">
            <span className="user-id-label">User ID:</span>
            <code className="user-id-code">{userIdentifier}</code>
          </div>
        </section>

        {/* Action Buttons Row - Matching Screenshot 1 */}
        <section className="leagues-actions-row">
          <button className="btn-indigo btn-action" onClick={() => setShowCreateModal(true)}>
            <Plus size={18} strokeWidth={2.4} />
            <span>Create League</span>
          </button>
          <button className="btn-emerald btn-action" onClick={() => setShowJoinModal(true)}>
            <LogIn size={18} strokeWidth={2.4} />
            <span>Join League</span>
          </button>
        </section>

        {/* My Leagues Section - Matching Screenshot 1 */}
        <section className="leagues-section">
          <div className="section-heading-row">
            <Shield size={20} className="section-icon section-icon-indigo" />
            <h2 className="section-title">My Leagues</h2>
          </div>

          {userLeagues.length > 0 ? (
            <div className="leagues-cards-list">
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
            <div className="empty-leagues-box card">
              <Shield size={28} className="empty-box-icon" />
              <h3>No Leagues Joined Yet</h3>
              <p>Create a league with friends or join one of the popular leagues below.</p>
            </div>
          )}
        </section>

        {/* Search Bar - Matching Screenshot 1 */}
        <div className="league-search-container">
          <Search size={18} className="search-input-icon" />
          <input
            type="text"
            className="league-search-input"
            placeholder="Search public leagues..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
          {hasSearched ? (
            <button className="search-clear-btn" onClick={clearSearch}>
              <X size={16} />
            </button>
          ) : (
            <button
              className="search-submit-btn"
              onClick={handleSearch}
              disabled={!searchQuery.trim() || isSearching}
            >
              {isSearching ? '...' : <Search size={16} />}
            </button>
          )}
        </div>

        {/* Popular Public Leagues Section - Matching Screenshot 1 */}
        <section className="leagues-section">
          <div className="section-heading-row">
            <Star size={20} className="section-icon section-icon-amber" />
            <h2 className="section-title">
              {hasSearched ? `Results for "${searchQuery}"` : 'Popular Public Leagues'}
            </h2>
            {hasSearched && (
              <button className="btn-link-reset" onClick={clearSearch}>
                Clear
              </button>
            )}
          </div>

          {joinableLeagues.length > 0 ? (
            <div className="leagues-cards-list">
              {joinableLeagues.map((league) => (
                <div key={league.id} className="public-league-card card">
                  <div className="public-league-body">
                    <div className="public-league-header">
                      <h4>{league.name}</h4>
                    </div>
                    {league.description && (
                      <p className="public-league-desc">{league.description}</p>
                    )}
                    <div className="public-league-meta">
                      <div className="stat-chip">
                        <Users size={14} className="chip-icon chip-icon-indigo" />
                        <span>{league.total_members} Members</span>
                      </div>
                    </div>
                  </div>
                  <button
                    className="btn-emerald btn-join-action"
                    onClick={() => handleJoinPublicLeague(league.id)}
                  >
                    <LogIn size={15} />
                    <span>Join League</span>
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="no-leagues-text">
              {hasSearched ? 'No leagues found. Try a different query.' : 'No public leagues available right now.'}
            </p>
          )}
        </section>
      </div>

      {/* ── Create League Modal ── */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => {
          setShowCreateModal(false);
          resetCreateForm();
        }}
        title="Create a New League"
      >
        <form
          className="league-form"
          onSubmit={(e) => {
            e.preventDefault();
            handleCreateLeague();
          }}
        >
          <div className="form-group">
            <label htmlFor="league-name">League Name *</label>
            <input
              id="league-name"
              type="text"
              placeholder="e.g. The Champions' Circle"
              value={leagueName}
              onChange={(e) => setLeagueName(e.target.value)}
              maxLength={50}
            />
          </div>

          <div className="form-group">
            <label htmlFor="league-description">Description (Optional)</label>
            <textarea
              id="league-description"
              placeholder="Elite-level strategic drafting. For serious players only."
              value={leagueDescription}
              onChange={(e) => setLeagueDescription(e.target.value)}
              maxLength={200}
              rows={3}
            />
          </div>

          <div className="form-group">
            <label htmlFor="total-weeks">Duration (Game Weeks)</label>
            <select
              id="total-weeks"
              value={totalWeeks}
              onChange={(e) => setTotalWeeks(Number(e.target.value))}
            >
              {[1, 2, 3, 4, 5, 6].map((w) => (
                <option key={w} value={w}>
                  {w} {w === 1 ? 'Week' : 'Weeks'}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="max-members">Max Members (Optional)</label>
            <input
              id="max-members"
              type="number"
              min={1}
              placeholder="e.g. 20"
              value={maxMembers}
              onChange={(e) => setMaxMembers(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label htmlFor="start-date">Start Date *</label>
            <input
              id="start-date"
              type="date"
              value={startDate}
              min={todayISO}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label>Calculated End Date</label>
            <div className={`end-date-pill ${endDate ? 'set' : ''}`}>
              {endDate || 'Select a start date above'}
            </div>
          </div>

          <div className="form-group-checkbox">
            <input
              id="private-league"
              type="checkbox"
              checked={isPrivate}
              onChange={(e) => setIsPrivate(e.target.checked)}
            />
            <label htmlFor="private-league">Make this league private</label>
          </div>

          <div className="form-privacy-note">
            {isPrivate ? (
              <span className="privacy-badge">
                <Lock size={13} /> A 6-character invite code will be required to join.
              </span>
            ) : (
              <span className="privacy-badge">
                <Globe size={13} /> Anyone can find and join this league in Discover.
              </span>
            )}
          </div>

          <button type="submit" className="btn-indigo btn-submit-full">
            <Plus size={16} />
            <span>Create League</span>
          </button>
        </form>
      </Modal>

      {/* ── Join Private League Modal ── */}
      <Modal
        isOpen={showJoinModal}
        onClose={() => setShowJoinModal(false)}
        title="Join a League with Code"
      >
        <form
          className="league-form"
          onSubmit={(e) => {
            e.preventDefault();
            handleJoinPrivateLeague();
          }}
        >
          <div className="form-group">
            <label htmlFor="join-code">6-Character League Code</label>
            <input
              id="join-code"
              type="text"
              placeholder="e.g. AB12CD"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              maxLength={6}
              className="code-input-field"
            />
          </div>
          <p className="form-hint">
            <Lock size={13} /> Ask the league commissioner or owner for their 6-character code.
          </p>
          <button
            type="submit"
            className="btn-emerald btn-submit-full"
            disabled={joinCode.trim().length !== 6}
          >
            <LogIn size={16} />
            <span>Join League</span>
          </button>
        </form>
      </Modal>
    </div>
  );
};