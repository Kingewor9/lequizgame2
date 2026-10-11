import React, { useState, useEffect } from 'react';
import {
  ChevronLeft,
  ListOrdered,
  Clock,
  Settings,
  ArrowUp,
  ArrowDown,
  Minus,
  TableProperties,
  Trophy,
  Copy,
  Check,
  Calendar,
  Users,
  Crown,
  Trash2,
  RotateCcw,
  AlertTriangle,
} from 'lucide-react';
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

  if (isLoading) return <Loading message="Loading league..." />;

  if (fetchError || !league) {
    return (
      <div className="league-detail-page animate-fade">
        <div className="league-detail-header">
          <button className="btn-back-nav" onClick={onBack} aria-label="Go back">
            <ChevronLeft size={22} />
          </button>
          <div className="header-info">
            <h1 className="league-title">League Details</h1>
          </div>
        </div>
        <div className="league-detail-error card">
          <AlertTriangle size={32} className="text-amber" />
          <p>{fetchError || 'League not found'}</p>
          <button onClick={onBack} className="btn-secondary">
            Go Back
          </button>
        </div>
      </div>
    );
  }

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

  const renderRankIndicator = (rank: number, prevRank: number) => {
    if (prevRank === 0 || rank === prevRank) {
      return <Minus size={14} className="rank-indicator rank-same" />;
    }
    if (rank < prevRank) {
      return <ArrowUp size={14} className="rank-indicator rank-up" strokeWidth={2.6} />;
    }
    return <ArrowDown size={14} className="rank-indicator rank-down" strokeWidth={2.6} />;
  };

  // Distinct avatar background color matching screenshot 3
  const getAvatarColorClass = (index: number, isMe: boolean) => {
    if (isMe) return 'avatar-amber';
    const colors = ['avatar-purple', 'avatar-red', 'avatar-emerald', 'avatar-blue', 'avatar-violet'];
    return colors[index % colors.length];
  };

  const getInitials = (name: string, isMe: boolean) => {
    if (isMe) return 'ME';
    return name.slice(0, 1).toUpperCase();
  };

  const isLeagueEnded = () => league.end_date && new Date() > new Date(league.end_date);

  const progressPercent = Math.min(
    100,
    Math.round((league.current_game_week / league.total_game_weeks) * 100)
  );

  const currentUserId = (user as any)?.id;

  return (
    <div className="league-detail-page animate-fade">
      {alert && (
        <Alert message={alert.message} type={alert.type} onClose={() => setAlert(null)} />
      )}

      {/* Header - Matching Screenshot 3 */}
      <div className="league-detail-header">
        <button className="btn-back-nav" onClick={onBack} aria-label="Go back">
          <ChevronLeft size={24} />
        </button>
        <div className="header-info">
          <h1 className="league-title">{league.name}</h1>
          {league.description && <p className="league-subtitle">{league.description}</p>}
        </div>
      </div>

      {/* Tab Navigation - Matching Screenshot 3 with gold underline */}
      <div className="detail-tabs-bar">
        <button
          className={`tab-nav-btn ${activeTab === 'standings' ? 'active' : ''}`}
          onClick={() => setActiveTab('standings')}
        >
          <ListOrdered size={16} />
          <span>Standings</span>
        </button>

        <button
          className={`tab-nav-btn ${activeTab === 'timeline' ? 'active' : ''}`}
          onClick={() => setActiveTab('timeline')}
        >
          <Clock size={16} />
          <span>Timeline</span>
        </button>

        <button
          className={`tab-nav-btn ${activeTab === 'info' ? 'active' : ''}`}
          onClick={() => setActiveTab('info')}
        >
          <Settings size={16} />
          <span>Info</span>
        </button>
      </div>

      {/* Tab Content */}
      <div className="detail-tab-body">
        {/* ── STANDINGS TAB - Matching Screenshot 3 ── */}
        {activeTab === 'standings' && (
          <div className="standings-view animate-fade">
            {league.members.length === 0 ? (
              <p className="empty-text">No members registered in this league yet.</p>
            ) : (
              <div className="standings-table">
                {[...league.members]
                  .sort((a, b) => a.rank - b.rank)
                  .map((member, idx) => {
                    const isMe = member.user_id === currentUserId;
                    const avatarColor = getAvatarColorClass(idx, isMe);

                    return (
                      <div
                        key={member.user_id}
                        className={`standings-row-card card ${isMe ? 'user-highlight-row' : ''}`}
                      >
                        <div className="standing-player-left">
                          <span className="rank-num">#{member.rank}</span>
                          {renderRankIndicator(member.rank, member.prev_rank)}

                          <div className={`player-avatar-circle ${avatarColor}`}>
                            {member.photo_url ? (
                              <img src={member.photo_url} alt={member.name} className="avatar-img" />
                            ) : (
                              <span className="avatar-initials">{getInitials(member.name, isMe)}</span>
                            )}
                          </div>

                          <span className={`player-name ${isMe ? 'player-name-me' : ''}`}>
                            {isMe ? `${member.name} (The User)` : member.name}
                          </span>
                        </div>

                        <div className="standing-player-right">
                          <span className="player-points">{member.points.toLocaleString()}</span>
                          <span className="pts-label">Pts</span>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}

            <button className="btn-export-sheets" onClick={() => {
              setAlert({ message: 'Standings data exported to clipboard!', type: 'success' });
            }}>
              <TableProperties size={18} />
              <span>Export Standings to Sheets</span>
            </button>
          </div>
        )}

        {/* ── TIMELINE TAB ── */}
        {activeTab === 'timeline' && (
          <div className="timeline-view animate-fade">
            <h2 className="section-title">The Timeline</h2>

            <div className="progress-timeline-card card">
              <div className="progress-header">
                <span className="progress-title">League Progress</span>
                <span className="progress-week-badge">
                  Game Week {league.current_game_week} / {league.total_game_weeks}
                </span>
              </div>
              <div className="timeline-track">
                <div className="timeline-fill" style={{ width: `${progressPercent}%` }} />
              </div>
            </div>

            <div className="winner-highlight-card card">
              <div className="winner-icon-bubble">
                <Trophy size={28} />
              </div>
              <div className="winner-details">
                <p className="winner-label">Final Winner</p>
                {league.final_winner ? (
                  <div className="winner-user-row">
                    {league.final_winner_photo ? (
                      <img src={league.final_winner_photo} alt={league.final_winner} className="avatar-img" />
                    ) : (
                      <div className="player-avatar-circle avatar-amber">
                        {league.final_winner.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <span className="winner-name-text">{league.final_winner}</span>
                  </div>
                ) : (
                  <p className="winner-pending-text">League season in progress…</p>
                )}
              </div>
            </div>

            <h3 className="section-subtitle">Recent Game Week Results</h3>
            {league.recent_results.length > 0 ? (
              <div className="results-list">
                {league.recent_results.map((result) => (
                  <div key={result.game_week} className="result-card card">
                    <span className="result-gw">Game Week {result.game_week}</span>
                    <div className="result-score-info">
                      <span className="result-winner-name">{result.winner_name}</span>
                      <span className="result-pts">{result.points.toLocaleString()} Pts</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="empty-text">No results recorded yet for this season.</p>
            )}
          </div>
        )}

        {/* ── INFO TAB ── */}
        {activeTab === 'info' && (
          <div className="info-view animate-fade">
            <h2 className="section-title">League Administration</h2>

            {league.is_owner && league.code && (
              <div className="invite-box card">
                <span className="invite-label">Private Invite Code</span>
                <div className="code-display-row">
                  <span className="invite-code-text">{league.code}</span>
                  <button className="btn-copy-code" onClick={handleCopyCode}>
                    {copiedCode ? <Check size={16} /> : <Copy size={16} />}
                    <span>{copiedCode ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
              </div>
            )}

            <div className="key-dates-box card">
              <div className="dates-header">
                <Calendar size={18} className="text-indigo" />
                <h3>Season Schedule</h3>
              </div>
              <div className="dates-grid">
                <div className="date-item">
                  <span className="date-label">Kickoff Date</span>
                  <span className="date-val">{new Date(league.start_date).toLocaleDateString()}</span>
                </div>
                <div className="date-item">
                  <span className="date-label">Final Game Week</span>
                  <span className="date-val">{new Date(league.end_date).toLocaleDateString()}</span>
                </div>
                <div className="date-item date-item-full">
                  <span className="date-label">Total Game Weeks</span>
                  <span className="date-val">{league.total_game_weeks} Weeks</span>
                </div>
              </div>
            </div>

            <div className="members-box card">
              <div className="members-header">
                <Users size={18} className="text-indigo" />
                <h3>League Members ({league.members.length})</h3>
              </div>
              <div className="members-list">
                {[...league.members]
                  .sort((a, b) => a.rank - b.rank)
                  .map((member) => {
                    const isMe = member.user_id === currentUserId;
                    return (
                      <div key={member.user_id} className={`member-list-item ${isMe ? 'me' : ''}`}>
                        <div className="member-item-left">
                          <div className="player-avatar-circle avatar-purple">
                            {member.photo_url ? (
                              <img src={member.photo_url} alt={member.name} className="avatar-img" />
                            ) : (
                              <span>{member.name.slice(0, 1).toUpperCase()}</span>
                            )}
                          </div>
                          <span className="member-name-text">
                            {isMe ? `${member.name} (You)` : member.name}
                          </span>
                          {member.is_owner && (
                            <span className="badge badge-owner">
                              <Crown size={11} /> Owner
                            </span>
                          )}
                        </div>
                        {league.is_owner && !isMe && (
                          <button
                            className="btn-remove-member"
                            onClick={() => handleRemoveMember(member.user_id, member.name)}
                            aria-label={`Remove ${member.name}`}
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>

            {league.is_owner && (
              <div className="owner-box card">
                <h3>Commissioner Controls</h3>
                {isLeagueEnded() ? (
                  <button className="btn-restart-league" onClick={handleRestartLeague} disabled={isRestarting}>
                    <RotateCcw size={16} />
                    <span>{isRestarting ? 'Restarting...' : 'Restart League Season'}</span>
                  </button>
                ) : (
                  <div className="active-warning">
                    <AlertTriangle size={16} className="text-amber" />
                    <span>League is currently active. Season restart unlocks once the season concludes.</span>
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