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
  const [userLeagues, setUserLeagues] = useState<UserLeague[]>([]);
  const [publicLeagues, setPublicLeagues] = useState<League[]>([]);
  const [searchResults, setSearchResults] = useState<League[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);

  // ── Detail page navigation ────────────────────────────────────────────────
  // When this is set, we render LeagueDetailPage instead of the list
  const [selectedLeagueId, setSelectedLeagueId] = useState<string | null>(null);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [alert, setAlert] = useState<{ message: string; type: AlertType } | null>(null);

  // Create form
  const [leagueName, setLeagueName] = useState('');
  const [leagueDescription, setLeagueDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);

  // Join form
  const [joinCode, setJoinCode] = useState('');

  // Search
  const [searchQuery, setSearchQuery] = useState('');

  // ── If a league is selected, show its detail page ─────────────────────────
  if (selectedLeagueId) {
    return (
      <LeagueDetailPage
        leagueId={selectedLeagueId}
        onBack={() => setSelectedLeagueId(null)}
      />
    );
  }

  // ── Initial data load ─────────────────────────────────────────────────────
  useEffect(() => {
    const fetchLeagues = async () => {
      try {
        setIsLoading(true);

        const [myRes, publicRes] = await Promise.all([
          apiService.get('/leagues/user'),
          apiService.get('/leagues/public?limit=3'),
        ]);

        if (myRes.success && myRes.data) {
          setUserLeagues(myRes.data as UserLeague[]);
        }
        if (publicRes.success && publicRes.data) {
          setPublicLeagues(publicRes.data as League[]);
        }
      } catch (error) {
        console.error('Error fetching leagues:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchLeagues();
  }, []);

  // ── Create league ─────────────────────────────────────────────────────────
  const handleCreateLeague = async () => {
    if (!leagueName.trim()) {
      setAlert({ message: 'Please enter a league name', type: 'error' });
      return;
    }

    try {
      const response = await apiService.post('/leagues', {
        name: leagueName,
        description: leagueDescription,
        is_private: isPrivate,
      });

      if (response.success && response.data) {
        setUserLeagues((prev) => [...prev, response.data as UserLeague]);
        setAlert({ message: 'League created successfully!', type: 'success' });
        setShowCreateModal(false);
        setLeagueName('');
        setLeagueDescription('');
        setIsPrivate(false);
      } else {
        setAlert({ message: response.error || 'Failed to create league', type: 'error' });
      }
    } catch {
      setAlert({ message: 'Error creating league', type: 'error' });
    }
  };

  // ── Join private league with code ─────────────────────────────────────────
  const handleJoinPrivateLeague = async () => {
    if (joinCode.trim().length !== 6) {
      setAlert({ message: 'Please enter a valid 6-character code', type: 'error' });
      return;
    }

    try {
      const response = await apiService.post('/leagues/join', {
        code: joinCode.toUpperCase(),
      });

      if (response.success && response.data) {
        setUserLeagues((prev) => [...prev, response.data as UserLeague]);
        setAlert({ message: 'Joined league successfully!', type: 'success' });
        setShowJoinModal(false);
        setJoinCode('');
      } else {
        setAlert({ message: response.error || 'Failed to join league', type: 'error' });
      }
    } catch {
      setAlert({ message: 'Error joining league', type: 'error' });
    }
  };

  // ── Join public league directly ───────────────────────────────────────────
  const handleJoinPublicLeague = async (leagueId: string, fromSearch = false) => {
    try {
      const response = await apiService.post(`/leagues/${leagueId}/join-public`, {});

      if (response.success && response.data) {
        setUserLeagues((prev) => [...prev, response.data as UserLeague]);

        if (fromSearch) {
          setSearchResults((prev) => prev.filter((l) => l.id !== leagueId));
        } else {
          setPublicLeagues((prev) => prev.filter((l) => l.id !== leagueId));
        }

        setAlert({ message: 'Joined league successfully!', type: 'success' });
      } else {
        setAlert({ message: response.error || 'Failed to join league', type: 'error' });
      }
    } catch {
      setAlert({ message: 'Error joining league', type: 'error' });
    }
  };

  // ── Search public leagues ─────────────────────────────────────────────────
  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setAlert({ message: 'Please enter a search term', type: 'error' });
      return;
    }

    try {
      setIsSearching(true);
      setHasSearched(true);
      const response = await apiService.get(
        `/leagues/search?q=${encodeURIComponent(searchQuery)}`
      );

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

  if (isLoading) {
    return <Loading message="Loading leagues..." />;
  }

  const displayedPublicLeagues = hasSearched ? searchResults : publicLeagues;
  const joinedLeagueIds = new Set(userLeagues.map((ul) => ul.league_id));
  const joinableLeagues = displayedPublicLeagues.filter((l) => !joinedLeagueIds.has(l.id));

  return (
    <div className="league-page">
      {alert && (
        <Alert message={alert.message} type={alert.type} onClose={() => setAlert(null)} />
      )}

      <div className="league-content">

        {/* Section 1: Create / Join */}
        <section className="action-buttons">
          <button className="btn-primary" onClick={() => setShowCreateModal(true)}>
            ➕ Create League
          </button>
          <button className="btn-secondary" onClick={() => setShowJoinModal(true)}>
            🔑 Join with Code
          </button>
        </section>

        {/* Section 2: My Leagues */}
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
                  // Tapping View opens the detail page for that league
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

        {/* Section 3 & 4: Discover Leagues */}
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
            <h3>
              {hasSearched ? `Results for "${searchQuery}"` : 'Top Public Leagues'}
            </h3>
            {hasSearched && (
              <button className="btn-link" onClick={clearSearch}>
                Back to top leagues
              </button>
            )}
          </div>

          {joinableLeagues.length > 0 ? (
            <div className="public-leagues-list">
              {joinableLeagues.map((league) => (
                <div key={league.id} className="public-league-card card">
                  <div className="league-info">
                    <h4>{league.name}</h4>
                    {league.description && (
                      <p className="description">{league.description}</p>
                    )}
                    <span className="member-count">👥 {league.total_members} members</span>
                  </div>
                  <button
                    className="btn-primary btn-sm"
                    onClick={() => handleJoinPublicLeague(league.id, hasSearched)}
                  >
                    Join
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="no-leagues-text">
              {hasSearched ? 'No leagues found. Try a different search.' : 'No public leagues yet.'}
            </p>
          )}
        </section>
      </div>

      {/* Create League Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
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
            <p className="form-hint">
              🔒 A 6-character invite code will be generated. Only people with the code can join.
            </p>
          )}
          {!isPrivate && (
            <p className="form-hint">
              🌍 This league will appear in the public list for anyone to join.
            </p>
          )}

          <button type="submit" className="btn-primary btn-full">
            Create League
          </button>
        </form>
      </Modal>

      {/* Join Private League Modal */}
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

          <p className="form-hint">
            🔑 Ask the league creator for their invite code.
          </p>

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