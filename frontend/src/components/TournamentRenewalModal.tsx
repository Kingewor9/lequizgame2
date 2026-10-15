import React, { useEffect, useState } from 'react';
import { CalendarClock, Check, Coins, Trophy, X } from 'lucide-react';
import { ApiResponse, TournamentRenewal } from '../types';
import '../styles/components/TournamentRenewalModal.css';

interface Props {
  renewal: TournamentRenewal;
  onRespond: (
    renewal: TournamentRenewal,
    decision: 'yes' | 'no'
  ) => Promise<ApiResponse<{ footy_coins?: number }>>;
  onGetCoins: () => void;
  onClose: () => void;
}

export const TournamentRenewalModal: React.FC<Props> = ({
  renewal,
  onRespond,
  onGetCoins,
  onClose,
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    setIsSubmitting(false);
  }, [renewal.tournament_id]);

  const respond = async (decision: 'yes' | 'no') => {
    setIsSubmitting(true);
    setError(null);
    try {
      const response = await onRespond(renewal, decision);
      if (!response.success) {
        setError(response.error || 'Your response could not be saved. Please try again.');
      }
    } catch (requestError) {
      console.error('Could not submit tournament renewal response:', requestError);
      setError('Your response could not be saved. Please check your connection and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const startDate = new Date(renewal.start_at);
  const dateLabel = Number.isNaN(startDate.getTime())
    ? renewal.start_at
    : new Intl.DateTimeFormat(undefined, {
      dateStyle: 'full',
      timeStyle: 'short',
    }).format(startDate);
  const needsCoins = error?.toLowerCase().includes('enough footy coins') ?? false;

  return (
    <div className="renewal-modal-overlay" role="presentation" onClick={onClose}>
      <section
        className="renewal-modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="renewal-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="renewal-modal-close"
          onClick={onClose}
          aria-label="Decide later"
          disabled={isSubmitting}
        >
          <X size={18} />
        </button>

        <div className="renewal-modal-crest" aria-hidden="true">
          <span className="renewal-crest-orbit" />
          <Trophy size={39} strokeWidth={1.6} />
        </div>

        <p className="renewal-modal-kicker">NEXT SEASON / PLAYER DECISION</p>
        <h2 id="renewal-modal-title">The next season is on the calendar.</h2>
        <p className="renewal-modal-tournament">{renewal.tournament_name}</p>

        <div className="renewal-modal-date">
          <CalendarClock size={18} aria-hidden="true" />
          <div>
            <span>RESTARTS</span>
            <strong>{dateLabel}</strong>
          </div>
        </div>

        <p className="renewal-modal-copy">
          Want to defend your place? Choose to continue before kick-off. Anyone who
          hasn&apos;t responded by then will be left out of the new season.
        </p>

        <div className="renewal-modal-fee">
          <Coins size={17} aria-hidden="true" />
          <span>Entry fee if you continue</span>
          <strong>{renewal.entry_fee.toLocaleString()} coins</strong>
        </div>
        <p className="renewal-modal-note">
          You won&apos;t be charged unless you choose to continue.
        </p>

        {error && (
          <div className="renewal-modal-error" role="alert">
            <p>{error}</p>
            {needsCoins && (
              <button type="button" onClick={onGetCoins} disabled={isSubmitting}>
                Get Footy Coins
              </button>
            )}
          </div>
        )}

        <div className="renewal-modal-actions">
          <button
            type="button"
            className="renewal-decline-button"
            onClick={() => void respond('no')}
            disabled={isSubmitting}
          >
            No, sit this one out
          </button>
          <button
            type="button"
            className="renewal-accept-button"
            onClick={() => void respond('yes')}
            disabled={isSubmitting}
          >
            <Check size={17} />
            {isSubmitting ? 'Saving choice…' : 'Yes, count me in'}
          </button>
        </div>
        <p className="renewal-modal-deadline">Your answer is due before the restart date.</p>
      </section>
    </div>
  );
};
