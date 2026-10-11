import React, { useState, useEffect } from 'react';
import { ChevronLeft, ArrowUp, ArrowDown, Minus, Trophy, AlertTriangle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiService } from '../services/apiService';
import { Loading } from '../components/Loading';
import '../styles/pages/LeaderboardPage.css';

interface LeaderboardEntry {
  rank: number;
  prev_rank: number;
  user: {
    id: string;
    first_name: string;
    last_name: string;
    username: string;
    photo_url: string | null;
  };
  score: number;
}

interface Props {
  onBack: () => void;
  onSelectUser: (userId: string) => void;
}

export const LeaderboardPage: React.FC<Props> = ({ onBack, onSelectUser }) => {
  const { user } = useAuth();
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<LeaderboardEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    const fetchLeaderboard = async () => {
      try {
        setIsLoading(true);
        const response = await apiService.get('/users/leaderboard/global?limit=100');
        if (response.success && response.data) {
          setLeaderboard(response.data as LeaderboardEntry[]);
        } else {
          setFetchError(response.error || 'Could not load leaderboard');
        }
      } catch (err) {
        console.error('Error fetching global leaderboard:', err);
        setFetchError('Network error. Please try again.');
      } finally {
        setIsLoading(false);
      }
    };
    fetchLeaderboard();
  }, []);

  useEffect(() => {
    const trimmedQuery = searchQuery.trim();
    if (!trimmedQuery) {
      setSearchResults([]);
      return;
    }

    const controller = new AbortController();
    const fetchSearchResults = async () => {
      try {
        setIsSearching(true);
        const response = await apiService.get(`/users/leaderboard/search?q=${encodeURIComponent(trimmedQuery)}`);
        if (response.success && response.data) {
          setSearchResults(response.data as LeaderboardEntry[]);
        } else {
          setSearchResults([]);
        }
      } catch (err) {
        console.error('Error searching leaderboard:', err);
        setSearchResults([]);
      } finally {
        if (!controller.signal.aborted) {
          setIsSearching(false);
        }
      }
    };

    const timeout = window.setTimeout(fetchSearchResults, 250);
    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [searchQuery]);

  if (isLoading) return <Loading message="Loading global leaderboard..." />;

  const renderRankArrow = (rank: number, prevRank: number) => {
    if (prevRank === 0 || rank === prevRank) {
      return <Minus size={14} className="rank-indicator rank-same" />;
    }
    if (rank < prevRank) {
      return <ArrowUp size={14} className="rank-indicator rank-up" strokeWidth={2.6} />;
    }
    return <ArrowDown size={14} className="rank-indicator rank-down" strokeWidth={2.6} />;
  };

  const getInitials = (firstName: string, lastName: string) => {
    let initials = firstName ? firstName.charAt(0) : '';
    initials += lastName ? lastName.charAt(0) : '';
    return initials.toUpperCase() || 'U';
  };

  const getAvatarColorClass = (index: number, isMe: boolean) => {
    if (isMe) return 'avatar-amber';
    const colors = ['avatar-purple', 'avatar-red', 'avatar-emerald', 'avatar-blue', 'avatar-violet'];
    return colors[index % colors.length];
  };

  const currentUserId = (user as any)?.id;

  return (
    <div className="leaderboard-page animate-fade">
      <div className="leaderboard-header">
        <button className="btn-back-nav" onClick={onBack} aria-label="Go back">
          <ChevronLeft size={24} />
        </button>
        <div className="header-info">
          <h1 className="leaderboard-title">Global Leaderboard</h1>
          <p className="leaderboard-subtitle">Top Football Trivia Legends Worldwide</p>
        </div>
      </div>

      <div className="leaderboard-content">
        <div className="leaderboard-search-wrap">
          <input
            type="text"
            className="leaderboard-search-input"
            placeholder="Search leaderboard by name or Telegram username"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search players on the leaderboard"
          />
          {isSearching && <span className="leaderboard-search-state">Searching...</span>}
        </div>

        {searchQuery.trim() && searchResults.length > 0 && (
          <div className="leaderboard-search-results">
            {searchResults.map((entry) => {
              const isMe = entry.user.id === currentUserId;
              const displayName = entry.user.username
                ? `@${entry.user.username}`
                : `${entry.user.first_name} ${entry.user.last_name || ''}`.trim();

              return (
                <button
                  key={entry.user.id}
                  type="button"
                  className="leaderboard-search-result"
                  onClick={() => onSelectUser(entry.user.id)}
                  aria-label={`View ${displayName}'s profile`}
                >
                  <span className="search-result-rank">#{entry.rank}</span>
                  <span className="search-result-name">{isMe ? `${displayName} (You)` : displayName}</span>
                  <span className="search-result-score">{entry.score.toLocaleString()} pts</span>
                </button>
              );
            })}
          </div>
        )}

        {fetchError ? (
          <div className="leaderboard-error card">
            <AlertTriangle size={32} className="text-amber" />
            <p>{fetchError}</p>
            <button onClick={onBack} className="btn-secondary">
              Go Back
            </button>
          </div>
        ) : leaderboard.length === 0 ? (
          <div className="empty-leaderboard card">
            <Trophy size={32} className="text-amber" />
            <p>No leaderboard entries yet. Be the first to rank!</p>
          </div>
        ) : (
          <div className="standings-table">
            {leaderboard.map((entry, idx) => {
              const isMe = entry.user.id === currentUserId;
              const displayName = entry.user.username
                ? `@${entry.user.username}`
                : `${entry.user.first_name} ${entry.user.last_name || ''}`.trim();
              const avatarColor = getAvatarColorClass(idx, isMe);

              return (
                <button
                  key={entry.user.id}
                  type="button"
                  className={`standings-row-card card ${isMe ? 'user-highlight-row' : ''}`}
                  onClick={() => onSelectUser(entry.user.id)}
                  aria-label={`View ${displayName}'s profile`}
                >
                  <div className="standing-player-left">
                    <span className="rank-num">#{entry.rank}</span>
                    {renderRankArrow(entry.rank, entry.prev_rank)}

                    <div className={`player-avatar-circle ${avatarColor}`}>
                      {entry.user.photo_url ? (
                        <img src={entry.user.photo_url} alt={displayName} className="avatar-img" />
                      ) : (
                        <span className="avatar-initials">
                          {isMe ? 'ME' : getInitials(entry.user.first_name, entry.user.last_name)}
                        </span>
                      )}
                    </div>

                    <span className={`player-name ${isMe ? 'player-name-me' : ''}`}>
                      {isMe ? `${displayName} (You)` : displayName}
                    </span>
                  </div>

                  <div className="standing-player-right">
                    <span className="player-points">{entry.score.toLocaleString()}</span>
                    <span className="pts-label">Pts</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
