import React from 'react';
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
  const total_members = 'total_members' in league ? (league as League).total_members : (league as UserLeague).league.total_members;

  return (
    <div className={`league-card card ${isUserLeague ? 'user-league' : ''}`}>
      <div className="league-header flex-between">
        <div>
          <h3>{leagueObj.name}</h3>
          {leagueObj.description && <p className="league-description">{leagueObj.description}</p>}
        </div>
        {isOwnLeague && <span className="badge badge-primary">OWNER</span>}
      </div>

      {isUserLeague && (
        <div className="league-stats">
          <div className="stat-item flex-between">
            <span className="stat-label">Your Rank:</span>
            <span className="stat-value">#{userRank}</span>
          </div>
          <div className="stat-item flex-between">
            <span className="stat-label">Your Points:</span>
            <span className="stat-value">{userPoints}</span>
          </div>
          <div className="stat-item flex-between">
            <span className="stat-label">Members:</span>
            <span className="stat-value">{total_members}</span>
          </div>
        </div>
      )}

      {!isUserLeague && (
        <div className="league-info">
          <div className="info-item flex-between">
            <span className="info-label">Members:</span>
            <span className="info-value">{total_members}</span>
          </div>
          <div className="info-item flex-between">
            <span className="info-label">Type:</span>
            <span className="info-value">{leagueObj.is_private ? 'Private' : 'Public'}</span>
          </div>
        </div>
      )}

      <div className="league-actions">
        {showJoinButton && (
          <button className="btn-primary btn-join" onClick={onJoinClick}>
            Join League
          </button>
        )}
        {(isUserLeague || isOwnLeague) && (
          <button className="btn-secondary btn-view" onClick={onViewClick}>
            View Details
          </button>
        )}
      </div>
    </div>
  );
};
