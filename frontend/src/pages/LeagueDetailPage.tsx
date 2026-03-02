import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiService } from '../services/apiService';
import { Loading } from '../components/Loading';
import { Alert, AlertType } from '../components/Alert';
import '../styles/pages/LeagueDetailPage.css';

type Tab = 'standings' | 'timeline' | 'info';

interface LeagueMember {
  user_id: string;
  name: string;
  username: string;
  photo_url: string | null;
  rank: number;
  prev_rank: number;
  points: number;
  is_owner: boolean;
}

interface GameWeekResult {
  game_week: number;
  winner_name: string;
  winner_photo: string | null;
  points: number;
}

interface LeagueDetail {
  id: string;
  name: string;
  description: string;
  is_private: boolean;
  code: string | null;
  total_members: number;
  current_game_week: number;
  total_game_weeks: number;
  start_date: string;
  end_date: string;
  is_owner: boolean;
  final_winner: string | null;
  final_winner_photo: string | null;
  members: LeagueMember[];
  recent_results: GameWeekResult[];
}

interface Props {
  leagueId: string;
  onBack: () => void;
}

export const LeagueDetailPage: React.FC<Props> = ({ leagueId, onBack }) => {
  const { user } = useAuth();

  // ALL hooks declared first — no exceptions
  const [activeTab, setActiveTab] = useState<Tab>('standings');
  const [league, setLeague] = useState<LeagueDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [alert, setAlert] = useState<{ message: string; type: AlertType } | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [isRestarting, setIsRestarting] = useState(false);

  useEffect(() => {
    const fetchLeague = async () => {
      try {
        setIsLoading(true);
        setFetchError(null);
        const response = await apiService.get(`/leagues/${leagueId}/detail`);
        if (response.success && response.data) {
          setLeague(response.data as LeagueDetail);
        } else {
          setFetchError(response.error || 'Could not load league details');
        }
      } catch (err) {
        console.error('Error fetching league:', err);
        setFetchError('Network error. Please try again.');
      } finally {
        setIsLoading(false);
      }
    };
    fetchLeague();
  }, [leagueId]);

  // ── Conditional renders AFTER all hooks ──────────────────────────────────

  if (isLoading) return <Loading message="Loading league..." />;

  if (fetchError || !league) {
    return (
      <div className="league-detail-page">
        <div className="league-detail-header">
          <button className="btn-back-icon" onClick={onBack}>‹</button>
          <div className="header-text">
            <h1 className="league-title">League Details</h1>
          </div>
        </div>
        <div className="league-detail-error">
          <p>⚠️ {fetchError || 'League not found'}</p>
          <button onClick={onBack} className="btn-back">Go Back</button>
        </div>
      </div>
    );
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  const handleCopyCode = async () => {
    if (!league.code) return;
    try {
      await navigator.clipboard.writeText(league.code);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      setAlert({ message: 'Could not copy code', type: 'error' });
    }
  };

  const handleRemoveMember = async (memberId: string, memberName: string) => {
    if (!confirm(`Remove ${memberName} from the league?`)) return;
    try {
      const response = await apiService.delete(`/leagues/${leagueId}/members/${memberId}`);
      if (response.success) {
        setLeague((prev) =>
          prev ? { ...prev, members: prev.members.filter((m) => m.user_id !== memberId) } : prev
        );
        setAlert({ message: `${memberName} removed`, type: 'success' });
      } else {
        setAlert({ message: response.error || 'Failed to remove member', type: 'error' });
      }
    } catch {
      setAlert({ message: 'Error removing member', type: 'error' });
    }
  };

  const handleRestartLeague = async () => {
    if (!confirm('Restart this league? All standings and history will be reset.')) return;
    setIsRestarting(true);
    try {
      const response = await apiService.post(`/leagues/${leagueId}/restart`, {});
      if (response.success) {
        setAlert({ message: 'League restarted successfully!', type: 'success' });
        const refresh = await apiService.get(`/leagues/${leagueId}/detail`);
        if (refresh.success && refresh.data) setLeague(refresh.data as LeagueDetail);
      } else {
        setAlert({ message: response.error || 'Failed to restart league', type: 'error' });
      }
    } catch {
      setAlert({ message: 'Error restarting league', type: 'error' });
    } finally {
      setIsRestarting(false);
    }
  };

  const getRankArrow = (rank: number, prevRank: number) => {
    if (prevRank === 0 || rank === prevRank) return <span className="rank-arrow rank-same">—</span>;
    if (rank < prevRank) return <span className="rank-arrow rank-up">↑</span>;
    return <span className="rank-arrow rank-down">↓</span>;
  };

  const getInitials = (name: string) => name.slice(0, 2).toUpperCase();

  const isLeagueEnded = () => league.end_date && new Date() > new Date(league.end_date);

  const progressPercent = Math.min(
    100,
    Math.round((league.current_game_week / league.total_game_weeks) * 100)
  );

  const currentUserId = (user as any)?.id;

  return (
    <div className="league-detail-page">
      {alert && (
        <Alert message={alert.message} type={alert.type} onClose={() => setAlert(null)} />
      )}

      {/* Sticky Header — always visible */}
      <div className="league-detail-header">
        <button className="btn-back-icon" onClick={onBack}>‹</button>
        <div className="header-text">
          <h1 className="league-title">{league.name}</h1>
          {league.description && <p className="league-subtitle">{league.description}</p>}
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="tab-nav">
        {(['standings', 'timeline', 'info'] as Tab[]).map((tab) => (
          <button
            key={tab}
            className={`tab-btn ${activeTab === tab ? 'tab-btn--active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            <span className="tab-icon">
              {tab === 'standings' ? '☰' : tab === 'timeline' ? '🕐' : '⚙️'}
            </span>
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="tab-content">

        {/* ── STANDINGS ── */}
        {activeTab === 'standings' && (
          <div className="standings-tab">
            {league.members.length === 0 ? (
              <p className="empty-text">No members yet.</p>
            ) : (
              <div className="standings-list">
                {[...league.members]
                  .sort((a, b) => a.rank - b.rank)
                  .map((member) => {
                    const isMe = member.user_id === currentUserId;
                    return (
                      <div key={member.user_id} className={`standing-row ${isMe ? 'standing-row--me' : ''}`}>
                        <div className="standing-left">
                          <span className={`rank-number rank-number--${member.rank <= 3 ? member.rank : 'other'}`}>
                            #{member.rank}
                          </span>
                          {getRankArrow(member.rank, member.prev_rank)}
                          <div className="member-avatar">
                            {member.photo_url ? (
                              <img src={member.photo_url} alt={member.name} className="avatar-img" />
                            ) : (
                              <div className="avatar-placeholder">{getInitials(member.name)}</div>
                            )}
                          </div>
                          <span className={`member-name ${isMe ? 'member-name--me' : ''}`}>
                            {isMe ? `${member.name} (You)` : member.name}
                          </span>
                        </div>
                        <div className="standing-right">
                          <span className="member-points">{member.points.toLocaleString()}</span>
                          <span className="points-label">Pts</span>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
            <button className="btn-export">☰ Export Standings to Sheets</button>
          </div>
        )}

        {/* ── TIMELINE ── */}
        {activeTab === 'timeline' && (
          <div className="timeline-tab">
            <h2 className="section-heading">The Timeline</h2>

            <div className="progress-card">
              <div className="progress-header">
                <span>League Progress</span>
                <span className="progress-label">
                  Game Week {league.current_game_week} / {league.total_game_weeks}
                </span>
              </div>
              <div className="progress-bar-track">
                <div className="progress-bar-fill" style={{ width: `${progressPercent}%` }} />
              </div>
            </div>

            <div className="winner-card">
              <div className="trophy-icon">🏆</div>
              <p className="winner-label">Final Winner:</p>
              {league.final_winner ? (
                <div className="winner-info">
                  {league.final_winner_photo ? (
                    <img src={league.final_winner_photo} alt={league.final_winner} className="winner-avatar" />
                  ) : (
                    <div className="avatar-placeholder avatar-placeholder--lg">
                      {getInitials(league.final_winner)}
                    </div>
                  )}
                  <span className="winner-name">{league.final_winner}</span>
                </div>
              ) : (
                <p className="winner-pending">League still in progress…</p>
              )}
            </div>

            <h3 className="section-subheading">Recent Results</h3>
            {league.recent_results.length > 0 ? (
              <div className="results-list">
                {league.recent_results.map((result) => (
                  <div key={result.game_week} className="result-row">
                    <span className="result-week">Game Week {result.game_week}</span>
                    <div className="result-right">
                      <span className="result-winner">{result.winner_name}</span>
                      <span className="result-points">{result.points.toLocaleString()} Pts</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="empty-text">No results yet.</p>
            )}
          </div>
        )}

        {/* ── INFO ── */}
        {activeTab === 'info' && (
          <div className="info-tab">
            <h2 className="section-heading">Administration</h2>

            {league.is_owner && league.code && (
              <div className="invite-code-card">
                <p className="invite-code-label">Invite Code</p>
                <p className="invite-code">{league.code}</p>
                <button className="btn-copy" onClick={handleCopyCode}>
                  📋 {copiedCode ? 'Copied!' : 'Copy Code'}
                </button>
              </div>
            )}

            <div className="key-dates-section">
              <h3 className="section-subheading">📅 Key Dates</h3>
              <div className="dates-grid">
                <div className="date-card">
                  <span className="date-label">Start Date</span>
                  <span className="date-value">{new Date(league.start_date).toLocaleDateString()}</span>
                </div>
                <div className="date-card">
                  <span className="date-label">End Date</span>
                  <span className="date-value">{new Date(league.end_date).toLocaleDateString()}</span>
                </div>
              </div>
              <div className="date-card date-card--full">
                <span className="date-label">Total Game Weeks</span>
                <span className="date-value">{league.total_game_weeks}</span>
              </div>
            </div>

            <div className="members-section">
              <h3 className="section-subheading">👤 Members ({league.members.length})</h3>
              <div className="members-list">
                {[...league.members]
                  .sort((a, b) => a.rank - b.rank)
                  .map((member) => {
                    const isMe = member.user_id === currentUserId;
                    return (
                      <div key={member.user_id} className={`member-row ${isMe ? 'member-row--me' : ''}`}>
                        <div className="member-row-left">
                          <div className="member-avatar">
                            {member.photo_url ? (
                              <img src={member.photo_url} alt={member.name} className="avatar-img" />
                            ) : (
                              <div className="avatar-placeholder">{getInitials(member.name)}</div>
                            )}
                          </div>
                          <span className={`member-name ${isMe ? 'member-name--me' : ''}`}>
                            {isMe ? `${member.name} (You)` : member.name}
                          </span>
                          {member.is_owner && <span className="owner-badge">🏆</span>}
                        </div>
                        {league.is_owner && !isMe && (
                          <button
                            className="btn-remove"
                            onClick={() => handleRemoveMember(member.user_id, member.name)}
                          >
                            🗑
                          </button>
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>

            {league.is_owner && (
              <div className="owner-actions">
                <h3 className="owner-actions-title">Owner Actions</h3>
                {isLeagueEnded() ? (
                  <button className="btn-restart" onClick={handleRestartLeague} disabled={isRestarting}>
                    {isRestarting ? 'Restarting...' : '🔄 Restart League'}
                  </button>
                ) : (
                  <div className="restart-warning">
                    ⚠️ The league is still active. Restart will only be available after the league ends.
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};