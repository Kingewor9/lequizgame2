import React, { useState, useEffect } from 'react';
//import { useAuth } from '../context/AuthContext'; use later when we want to display user-specific info in the league page
import { UserLeague, League } from '../types';
import { apiService } from '../services/apiService';
import { Modal } from '../components/Modal';
import { Loading } from '../components/Loading';
import { Alert, AlertType } from '../components/Alert';
import { LeagueCard } from '../components/LeagueCard';
import '../styles/pages/LeaguePage.css';

export const LeaguePage: React.FC = () => {
  //const { user } = useAuth(); //use later when we want to display user-specific info in the league page
  const [userLeagues, setUserLeagues] = useState<UserLeague[]>([]);
  const [publicLeagues, setPublicLeagues] = useState<League[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [_showSearchResults, setShowSearchResults] = useState(false); //remove the underscore from the showsearchresult later
  const [alert, setAlert] = useState<{ message: string; type: AlertType } | null>(null);

  // Form states
  const [leagueName, setLeagueName] = useState('');
  const [leagueDescription, setLeagueDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch user leagues
  useEffect(() => {
    const fetchLeagues = async () => {
      try {
        setIsLoading(true);
        const response = await apiService.get('/leagues/my-leagues');
        if (response.success && response.data) {
          setUserLeagues(response.data as UserLeague[]);//Take note of this change
        }

        // Fetch public leagues
        const publicResponse = await apiService.get('/leagues/public?limit=3');
        if (publicResponse.success && publicResponse.data) {
          setPublicLeagues(publicResponse.data as League[]);//Take note of this change
        }
      } catch (error) {
        console.error('Error fetching leagues:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchLeagues();
  }, []);

  const handleCreateLeague = async () => {
    if (!leagueName.trim()) {
      setAlert({ message: 'Please enter a league name', type: 'error' });
      return;
    }

    try {
      const response = await apiService.post('/leagues/create', {
        name: leagueName,
        description: leagueDescription,
        is_private: isPrivate,
      });

      if (response.success && response.data) {
        setUserLeagues((prev) => [...prev, response.data as UserLeague]);//Take note of this change
        setAlert({ message: 'League created successfully!', type: 'success' });
        setShowCreateModal(false);
        setLeagueName('');
        setLeagueDescription('');
        setIsPrivate(false);
      } else {
        setAlert({ message: response.error || 'Failed to create league', type: 'error' });
      }
    } catch (error) {
      console.error('Error creating league:', error);
      setAlert({ message: 'Error creating league', type: 'error' });
    }
  };

  const handleJoinLeague = async () => {
    if (!joinCode.trim()) {
      setAlert({ message: 'Please enter a league code', type: 'error' });
      return;
    }

    try {
      const response = await apiService.post('/leagues/join', {
        code: joinCode.toUpperCase(),
      });

      if (response.success && response.data) {
        setUserLeagues((prev) => [...prev, response.data as UserLeague]);//Take note of this change
        setAlert({ message: 'Joined league successfully!', type: 'success' });
        setShowJoinModal(false);
        setJoinCode('');
      } else {
        setAlert({ message: response.error || 'Failed to join league', type: 'error' });
      }
    } catch (error) {
      console.error('Error joining league:', error);
      setAlert({ message: 'Error joining league', type: 'error' });
    }
  };

  const handleSearchLeagues = async () => {
    if (!searchQuery.trim()) {
      setAlert({ message: 'Please enter a search term', type: 'error' });
      return;
    }

    try {
      const response = await apiService.get(`/leagues/search?q=${encodeURIComponent(searchQuery)}`);
      if (response.success && response.data) {
        setPublicLeagues(response.data as League[]);//Take note of this change
        setShowSearchResults(true);
      } else {
        setAlert({ message: 'No leagues found', type: 'info' });
      }
    } catch (error) {
      console.error('Error searching leagues:', error);
    }
  };

  const handleJoinPublicLeague = async (leagueId: string) => {
    try {
      const response = await apiService.post(`/leagues/${leagueId}/join-public`, {});

      if (response.success && response.data) {
        setUserLeagues((prev) => [...prev, response.data as UserLeague]);//Take note of this change
        setPublicLeagues((prev) => prev.filter((l) => l.id !== leagueId));
        setAlert({ message: 'Joined league successfully!', type: 'success' });
      } else {
        setAlert({ message: response.error || 'Failed to join league', type: 'error' });
      }
    } catch (error) {
      console.error('Error joining league:', error);
    }
  };

  if (isLoading) {
    return <Loading message="Loading leagues..." />;
  }

  return (
    <div className="league-page">
      {alert && (
        <Alert
          message={alert.message}
          type={alert.type}
          onClose={() => setAlert(null)}
        />
      )}

      <div className="league-content">
        {/* Action Buttons */}
        <section className="action-buttons">
          <button className="btn-primary" onClick={() => setShowCreateModal(true)}>
            Create League
          </button>
          <button className="btn-secondary" onClick={() => setShowJoinModal(true)}>
            Join League
          </button>
        </section>

        {/* My Leagues Section */}
        {userLeagues.length > 0 ? (
          <section className="my-leagues">
            <h2>My Leagues</h2>
            {userLeagues.map((league) => (
              <LeagueCard
                key={league.id}
                league={league}
                isOwnLeague={league.is_owner}
                userRank={league.rank}
                userPoints={league.points}
                isUserLeague={true}
                onViewClick={() => {
                  // Navigate to league details
                }}
              />
            ))}
          </section>
        ) : (
          <section className="no-leagues-message">
            <p>You haven't joined any leagues yet.</p>
            <p>Create or join a league to get started!</p>
          </section>
        )}

        {/* Search Section */}
        <section className="search-section">
          <h2>Discover Leagues</h2>
          <div className="search-bar">
            <input
              type="text"
              placeholder="Search public leagues..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSearchLeagues()}
            />
            <button
              className="btn-search"
              onClick={handleSearchLeagues}
              disabled={!searchQuery.trim()}
            >
              🔍
            </button>
          </div>
        </section>

        {/* Public Leagues */}
        <section className="public-leagues">
          <h3>Popular Public Leagues</h3>
          {publicLeagues.length > 0 ? (
            publicLeagues.map((league) => (
              <div key={league.id} className="public-league-card card">
                <div className="league-info">
                  <h4>{league.name}</h4>
                  {league.description && <p className="description">{league.description}</p>}
                  <div className="league-meta">
                    <span className="member-count">👥 {league.total_members} members</span>
                  </div>
                </div>
                <button
                  className="btn-primary btn-join-league"
                  onClick={() => handleJoinPublicLeague(league.id)}
                >
                  Join
                </button>
              </div>
            ))
          ) : (
            <p className="no-leagues-text">No public leagues found. Try searching!</p>
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
            <label htmlFor="league-name">League Name</label>
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
              placeholder="Enter league description"
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
            <label htmlFor="private-league">This league is a private league</label>
          </div>

          {isPrivate && (
            <p className="form-hint">
              Your league will be private. Members can only join with the code.
            </p>
          )}

          <button type="submit" className="btn-primary">
            Create League
          </button>
        </form>
      </Modal>

      {/* Join League Modal */}
      <Modal
        isOpen={showJoinModal}
        onClose={() => setShowJoinModal(false)}
        title="Join a League"
      >
        <form className="league-form" onSubmit={(e) => { e.preventDefault(); handleJoinLeague(); }}>
          <div className="form-group">
            <label htmlFor="join-code">League Code (6 characters)</label>
            <input
              id="join-code"
              type="text"
              placeholder="Enter 6-digit league code"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              maxLength={6}
            />
          </div>

          <p className="form-hint">
            Ask the league creator for the 6-digit code to join a private league.
          </p>

          <button type="submit" className="btn-primary">
            Join League
          </button>
        </form>
      </Modal>
    </div>
  );
};
