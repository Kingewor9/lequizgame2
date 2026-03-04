import React, { useState, useEffect } from 'react';
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
}

export const LeaderboardPage: React.FC<Props> = ({ onBack }) => {
    const { user } = useAuth();
    const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
    const [isLoading, setIsLoading] = useState(true);
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

    if (isLoading) return <Loading message="Loading leaderboard..." />;

    const getRankArrow = (rank: number, prevRank: number) => {
        if (prevRank === 0 || rank === prevRank) return <span className="rank-arrow rank-same">—</span>;
        if (rank < prevRank) return <span className="rank-arrow rank-up">↑</span>;
        return <span className="rank-arrow rank-down">↓</span>;
    };

    const getInitials = (firstName: string, lastName: string) => {
        let initials = firstName ? firstName.charAt(0) : '';
        initials += lastName ? lastName.charAt(0) : '';
        return initials.toUpperCase() || 'U';
    };

    const currentUserId = (user as any)?.id;

    return (
        <div className="leaderboard-page">
            <div className="leaderboard-header">
                <button className="btn-back-icon" onClick={onBack}>‹</button>
                <div className="header-text">
                    <h1 className="leaderboard-title">Global Leaderboard</h1>
                    <p className="leaderboard-subtitle">Top 100 Players</p>
                </div>
            </div>

            <div className="leaderboard-content">
                {fetchError ? (
                    <div className="leaderboard-error">
                        <p>⚠️ {fetchError}</p>
                        <button onClick={onBack} className="btn-back">Go Back</button>
                    </div>
                ) : leaderboard.length === 0 ? (
                    <p className="empty-text">No data available yet.</p>
                ) : (
                    <div className="standings-list">
                        {leaderboard.map((entry) => {
                            const isMe = entry.user.id === currentUserId;
                            const displayName = entry.user.username
                                ? `@${entry.user.username}`
                                : `${entry.user.first_name} ${entry.user.last_name || ''}`.trim();

                            return (
                                <div key={entry.user.id} className={`standing-row ${isMe ? 'standing-row--me' : ''}`}>
                                    <div className="standing-left">
                                        <span className={`rank-number rank-number--${entry.rank <= 3 ? entry.rank : 'other'}`}>
                                            #{entry.rank}
                                        </span>
                                        {getRankArrow(entry.rank, entry.prev_rank)}

                                        <div className="member-avatar">
                                            {entry.user.photo_url ? (
                                                <img src={entry.user.photo_url} alt={displayName} className="avatar-img" />
                                            ) : (
                                                <div className="avatar-placeholder">
                                                    {getInitials(entry.user.first_name, entry.user.last_name)}
                                                </div>
                                            )}
                                        </div>

                                        <span className={`member-name ${isMe ? 'member-name--me' : ''}`}>
                                            {isMe ? `${displayName} (You)` : displayName}
                                        </span>
                                    </div>
                                    <div className="standing-right">
                                        <span className="member-points">{entry.score.toLocaleString()}</span>
                                        <span className="points-label">Pts</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};
