import React from 'react';
import {
  ChevronRight,
  Swords,
  UserRound,
  X,
} from 'lucide-react';
import '../styles/components/ChallengeInviteModal.css';

export interface ChallengeInviteData {
  challenger: {
    id: string;
    name: string;
    first_name?: string;
    username?: string | null;
    photo_url?: string | null;
    overall_score?: number;
  };
  score?: number | null;
}

interface Props {
  isOpen: boolean;
  invite: ChallengeInviteData | null;
  onAccept: () => void;
  onDismiss: () => void;
  isLoading?: boolean;
}

export const ChallengeInviteModal: React.FC<Props> = ({
  isOpen,
  invite,
  onAccept,
  onDismiss,
  isLoading = false,
}) => {
  if (!isOpen || !invite) return null;

  const { challenger, score } = invite;
  const displayName = challenger.name || challenger.first_name || 'A Football Fan';

  return (
    <div className="invite-modal-overlay" role="presentation" onClick={onDismiss}>
      <div
        className="invite-modal-card animate-fade"
        role="dialog"
        aria-modal="true"
        aria-labelledby="invite-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="invite-modal-close"
          onClick={onDismiss}
          aria-label="Close"
        >
          <X size={20} />
        </button>

        <div className="invite-modal-hero">
          <div className="invite-avatar-wrapper">
            {challenger.photo_url ? (
              <img
                src={challenger.photo_url}
                alt={displayName}
                className="invite-avatar-img"
              />
            ) : (
              <div className="invite-avatar-fallback">
                <UserRound size={32} />
              </div>
            )}
            <div className="invite-swords-badge" aria-hidden="true">
              <Swords size={16} />
            </div>
          </div>

          <span className="invite-modal-tag">1V1 BATTLE INVITE</span>
          <h2 id="invite-modal-title">Challenge Accepted?</h2>
        </div>

        <div className="invite-message-container">
          <p className="invite-main-statement">
            <strong>{displayName}</strong>
            {score !== null && score !== undefined ? (
              <>
                {' '}scored <span className="invite-score-highlight">+{score} points</span> in a football quiz and is challenging you to beat their score!
              </>
            ) : (
              ' is challenging you to a head-to-head 1v1 battle!'
            )}
          </p>
          <p className="invite-sub-explanation">
            Go head-to-head over 24 hours. Play quizzes, rack up points, and claim Footy Coins and bragging rights!
          </p>
        </div>

        <div className="invite-modal-actions">
          <button
            type="button"
            className="btn-invite-accept"
            onClick={onAccept}
            disabled={isLoading}
          >
            <Swords size={20} />
            <span>{isLoading ? 'Setting up battle...' : `Challenge ${challenger.first_name || displayName} Now`}</span>
            <ChevronRight size={18} />
          </button>

          <button
            type="button"
            className="btn-invite-dismiss"
            onClick={onDismiss}
            disabled={isLoading}
          >
            Maybe Later
          </button>
        </div>
      </div>
    </div>
  );
};
