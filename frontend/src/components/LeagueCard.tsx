import React from 'react';
import { ListOrdered, Star, Users, ChevronRight, Crown, LogIn } from 'lucide-react';
import { UserLeague, League } from '../types';
import '../styles/components/LeagueCard.css';

interface LeagueCardProps {
  league: UserLeague | League;
  onViewClick?: () => void;
  onJoinClick?: () => void;
  isOwnLeague?: boolean;
  showJoinButton?: boolean;
  userRank?: number;
  userPoints?: number;
  isUserLeague?: boolean;
}

export const LeagueCard: React.FC<LeagueCardProps> = ({
  league,
  onViewClick,
  onJoinClick,
  isOwnLeague = false,
  showJoinButton = false,
  userRank,
  userPoints,
  isUserLeague = false,
}) => {
  const leagueObj = 'is_private' in league ? league : (league as any).league;
  const total_members =
    'total_members' in league ? (league as League).total_members : (league as UserLeague).league.total_members;

  const getLeagueStatus = () => {
    if (!leagueObj.start_date || !leagueObj.end_date) return null;

    const startDate = new Date(leagueObj.start_date);
    const endDate = new Date(leagueObj.end_date);
    const now = new Date();

    if (now < startDate) {
      const diffMs = startDate.getTime() - now.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffMins = Math.floor(diffMs / (1000 * 60));

      if (diffDays > 0) return { label: `Starts in ${diffDays}d`, status: 'inactive' };
      if (diffHours > 0) return { label: `Starts in ${diffHours}h`, status: 'inactive' };
      if (diffMins > 0) return { label: `Starts in ${diffMins}m`, status: 'inactive' };
      return { label: 'Starts soon', status: 'inactive' };
    }

    if (now >= startDate && now < endDate) {
      return { label: 'Active', status: 'active' };
    }

    return { label: 'Ended', status: 'ended' };
  };

  const statusInfo = getLeagueStatus();

  return (
    <div
      className={`league-card card ${isUserLeague ? 'user-league-card' : ''}`}
      onClick={isUserLeague ? onViewClick : undefined}
      role={isUserLeague ? 'button' : undefined}
      tabIndex={isUserLeague ? 0 : undefined}
    >
      <div className="league-card-main">
        <div className="league-card-info">
          <div className="league-title-row">
            <h3 className="league-name">{leagueObj.name}</h3>
            {isOwnLeague && (
              <span className="badge badge-owner">
                <Crown size={11} /> Owner
              </span>
            )}
            {statusInfo && !isOwnLeague && (
              <span className={`badge badge-${statusInfo.status}`}>{statusInfo.label}</span>
            )}
          </div>

          {leagueObj.description && (
            <p className="league-description">{leagueObj.description}</p>
          )}

          {isUserLeague ? (
            <div className="league-stats-row">
              {userRank !== undefined && (
                <div className="stat-chip">
                  <ListOrdered size={14} className="chip-icon chip-icon-emerald" />
                  <span>
                    Rank: <strong>#{userRank}</strong>
                  </span>
                </div>
              )}
              {userPoints !== undefined && (
                <div className="stat-chip">
                  <Star size={14} className="chip-icon chip-icon-amber" />
                  <span>
                    Pts: <strong>{(userPoints || 0).toLocaleString()}</strong>
                  </span>
                </div>
              )}
              <div className="stat-chip">
                <Users size={14} className="chip-icon chip-icon-indigo" />
                <span>{total_members}</span>
              </div>
            </div>
          ) : (
            <div className="league-meta-row">
              <div className="stat-chip">
                <Users size={14} className="chip-icon chip-icon-indigo" />
                <span>{total_members} members</span>
              </div>
              <span className="league-type-label">
                {leagueObj.is_private ? 'Private League' : 'Public League'}
              </span>
            </div>
          )}
        </div>

        {isUserLeague && (
          <button
            className="league-arrow-btn"
            onClick={(e) => {
              e.stopPropagation();
              onViewClick?.();
            }}
            aria-label="View league standings"
          >
            <ChevronRight size={18} strokeWidth={2.4} />
          </button>
        )}

        {showJoinButton && (
          <button
            className="btn-primary btn-join-league"
            onClick={(e) => {
              e.stopPropagation();
              onJoinClick?.();
            }}
          >
            <LogIn size={15} />
            <span>Join</span>
          </button>
        )}
      </div>
    </div>
  );
};
