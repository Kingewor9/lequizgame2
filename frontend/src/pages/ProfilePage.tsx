import React, { useEffect, useState } from 'react';
import { Award, ChevronLeft, Crown, Medal, Shield, Trophy } from 'lucide-react';
import { Loading } from '../components/Loading';
import { useAuth } from '../context/AuthContext';
import { apiService } from '../services/apiService';
import { User } from '../types';
import { CAREER_MILESTONES, getCurrentMilestone } from '../constants/milestones';
import '../styles/pages/ProfilePage.css';

interface PlayerProfile extends User {
  league_wins: number;
  tournament_wins: number;
}

interface Props {
  userId: string;
  onBack: () => void;
}

export const ProfilePage: React.FC<Props> = ({ userId, onBack }) => {
  const { user: currentUser } = useAuth();
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [photoFailed, setPhotoFailed] = useState(false);

  useEffect(() => {
    let isCurrent = true;

    const fetchProfile = async () => {
      setIsLoading(true);
      setError(null);
      setPhotoFailed(false);

      const response = await apiService.get<PlayerProfile>(`/users/${userId}`);
      if (!isCurrent) return;

      if (response.success && response.data) {
        setProfile(response.data);
      } else {
        setError(response.error || 'Could not load this player profile.');
      }
      setIsLoading(false);
    };

    fetchProfile().catch((fetchError: unknown) => {
      if (!isCurrent) return;
      console.error('Error fetching player profile:', fetchError);
      setError('Network error. Please try again.');
      setIsLoading(false);
    });

    return () => {
      isCurrent = false;
    };
  }, [userId]);

  if (isLoading) return <Loading message="Loading player profile..." />;

  if (error || !profile) {
    return (
      <div className="profile-page animate-fade">
        <div className="profile-header">
          <button className="btn-back-nav" onClick={onBack} aria-label="Go back">
            <ChevronLeft size={24} />
          </button>
          <div className="profile-heading">
            <span className="profile-eyebrow">PLAYER CARD</span>
            <h1>Profile unavailable</h1>
          </div>
        </div>
        <div className="profile-error card" role="alert">
          <p>{error || 'This player could not be found.'}</p>
          <button className="btn-secondary" onClick={onBack}>Go back</button>
        </div>
      </div>
    );
  }

  const displayName = [profile.first_name, profile.last_name].filter(Boolean).join(' ');
  const initials = [profile.first_name?.[0], profile.last_name?.[0]]
    .filter(Boolean)
    .join('')
    .toUpperCase() || 'U';
  const currentMilestone = getCurrentMilestone(profile.overall_score);
  const nextMilestone = CAREER_MILESTONES.find(
    (milestone) => milestone.points > profile.overall_score
  );
  const previousMilestonePoints = currentMilestone?.points || 0;
  const nextMilestonePoints = nextMilestone?.points || previousMilestonePoints;
  const milestoneProgress = nextMilestone
    ? Math.min(100, Math.max(
      0,
      ((profile.overall_score - previousMilestonePoints)
        / (nextMilestonePoints - previousMilestonePoints)) * 100
    ))
    : 100;
  const pointsToNextMilestone = nextMilestone
    ? Math.max(0, nextMilestone.points - profile.overall_score)
    : 0;
  const milestoneEmptyState = currentUser?.id === profile.id
    ? 'Your journey starts here'
    : `${profile.first_name || 'This player'}'s journey starts here`;

  return (
    <div className="profile-page animate-fade">
      <div className="profile-header">
        <button className="btn-back-nav" onClick={onBack} aria-label="Go back">
          <ChevronLeft size={24} />
        </button>
        <div className="profile-heading">
          <span className="profile-eyebrow">PLAYER CARD</span>
          <h1>Player profile</h1>
        </div>
      </div>

      <section className="profile-hero card">
        <div className="profile-hero-glow" />
        <div className="profile-avatar-frame">
          {profile.photo_url && !photoFailed ? (
            <img
              src={profile.photo_url}
              alt={`${displayName}'s Telegram profile`}
              className="profile-avatar"
              onError={() => setPhotoFailed(true)}
            />
          ) : (
            <span className="profile-avatar-fallback">{initials}</span>
          )}
          <span className="profile-avatar-mark"><Trophy size={15} /></span>
        </div>
        <div className="profile-identity">
          <h2>{displayName || profile.username || 'Football fan'}</h2>
          <p className="profile-username">
            {profile.username ? `@${profile.username}` : 'Telegram player'}
          </p>
          <span className="profile-member-tag">
            <Award size={13} />
            FOOTY IQ PLAYER
          </span>
        </div>
        <div className="profile-rank-stamp" aria-label={`Global rank ${profile.global_rank || 'unranked'}`}>
          <Crown size={15} />
          <span>RANK</span>
          <strong>{profile.global_rank > 0 ? `#${profile.global_rank}` : '—'}</strong>
        </div>
      </section>

      <section className="profile-score card" aria-label="Overall points and ranking">
        <div>
          <span className="profile-section-label">CAREER POINTS</span>
          <strong className="profile-points">{profile.overall_score.toLocaleString()}</strong>
        </div>
        <div className="profile-score-divider" />
        <div className="profile-score-rank">
          <span className="profile-section-label">GLOBAL RANK</span>
          <strong>{profile.global_rank > 0 ? `#${profile.global_rank}` : 'Unranked'}</strong>
          <span className="profile-player-count">
            of {profile.global_total_players.toLocaleString()} players
          </span>
        </div>
      </section>

      <section className="profile-milestone card" aria-label="Career milestone progress">
        <div className="profile-milestone-heading">
          <div>
            <span className="profile-section-label">CAREER MILESTONE</span>
            <h2>{currentMilestone?.title || milestoneEmptyState}</h2>
          </div>
          <span className="profile-milestone-badge" aria-hidden="true">
            <Shield size={20} />
          </span>
        </div>
        <div
          className="profile-milestone-track"
          role="progressbar"
          aria-label={nextMilestone ? `Progress to ${nextMilestone.title}` : 'All milestones achieved'}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(milestoneProgress)}
        >
          <span style={{ width: `${milestoneProgress}%` }} />
        </div>
        <div className="profile-milestone-foot">
          {nextMilestone ? (
            <>
              <span><strong>{pointsToNextMilestone.toLocaleString()}</strong> points to {nextMilestone.title}</span>
              <span>{milestoneProgress.toFixed(0)}%</span>
            </>
          ) : (
            <span>Every milestone achieved. You&apos;re a Legend.</span>
          )}
        </div>
      </section>

      <section className="profile-achievements">
        <div className="profile-section-heading">
          <div>
            <span className="profile-eyebrow">CAREER HONOURS</span>
            <h2>Achievements</h2>
          </div>
          <Medal size={20} />
        </div>
        <div className="profile-achievement-grid">
          <article className="profile-achievement-card profile-league-award">
            <div className="achievement-icon"><Trophy size={20} /></div>
            <span className="achievement-count">{profile.league_wins}</span>
            <span className="achievement-label">League trophies</span>
            <span className="achievement-detail">Public &amp; private leagues</span>
          </article>
          <article className="profile-achievement-card profile-tournament-award">
            <div className="achievement-icon"><Medal size={20} /></div>
            <span className="achievement-count">{profile.tournament_wins}</span>
            <span className="achievement-label">Tournament wins</span>
            <span className="achievement-detail">Tournament championships</span>
          </article>
          <article className="profile-achievement-card profile-milestone-award">
            <div className="achievement-icon"><Shield size={20} /></div>
            <span className="achievement-count">{currentMilestone?.title || '—'}</span>
            <span className="achievement-label">Current milestone</span>
            <span className="achievement-detail">Career reputation</span>
          </article>
        </div>
      </section>
    </div>
  );
};
