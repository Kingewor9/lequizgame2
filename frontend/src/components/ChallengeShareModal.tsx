import React, { useState } from 'react';
import {
  Check,
  Copy,
  Download,
  Gift,
  Send,
  Swords,
  X,
} from 'lucide-react';
import '../styles/components/ChallengeShareModal.css';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  cardDataUrl: string | null;
  cardBlob: Blob | null;
  points: number;
  referralCode: string;
  userName: string;
  botUsername?: string;
}

export const ChallengeShareModal: React.FC<Props> = ({
  isOpen,
  onClose,
  cardDataUrl,
  points,
  referralCode,
  userName,
  botUsername = 'footyiqgamebot',
}) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const cleanBotUsername = botUsername.replace(/^@/, '');
  const challengeLink = `https://t.me/${cleanBotUsername}?startapp=chl_${referralCode}_${points}`;
  const shareText = `🔥 ${userName} scored ${points} points in Footy IQ! ⚽ Think you can beat their score? Tap the link to challenge ${userName} to a 1v1 quiz battle! ⚔️`;
  const telegramShareUrl = `https://t.me/share/url?url=${encodeURIComponent(challengeLink)}&text=${encodeURIComponent(shareText)}`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(challengeLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch (err) {
      console.error('Failed to copy link:', err);
    }
  };

  const handleShareToTelegram = () => {
    const telegram = (window as Window & {
      Telegram?: { WebApp?: { openTelegramLink?: (url: string) => void } };
    }).Telegram?.WebApp;

    if (telegram?.openTelegramLink) {
      telegram.openTelegramLink(telegramShareUrl);
    } else {
      window.open(telegramShareUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const handleDownloadImage = () => {
    if (!cardDataUrl) return;
    const a = document.createElement('a');
    a.href = cardDataUrl;
    a.download = `footy-iq-challenge-${points}pts.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="challenge-modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="challenge-modal-container animate-fade"
        role="dialog"
        aria-modal="true"
        aria-labelledby="challenge-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="challenge-modal-close"
          onClick={onClose}
          aria-label="Close"
        >
          <X size={20} />
        </button>

        <div className="challenge-modal-header">
          <div className="challenge-icon-badge">
            <Swords size={28} />
          </div>
          <h2 id="challenge-modal-title">Challenge a Friend</h2>
          <p className="challenge-modal-subtitle">
            Share your quiz scorecard and challenge any player, group, or channel to a 1v1 battle!
          </p>
        </div>

        {cardDataUrl && (
          <div className="challenge-card-preview-wrapper">
            <img
              src={cardDataUrl}
              alt="Generated Quiz Scorecard"
              className="challenge-card-preview-img"
            />
          </div>
        )}

        <div className="challenge-bonus-banner">
          <div className="challenge-bonus-icon">
            <Gift size={20} />
          </div>
          <div className="challenge-bonus-text">
            <strong>25 Footy Coins Bounty</strong>
            <span>
              If a new player joins Footy IQ through your challenge link, you’ll automatically receive 25 Footy Coins!
            </span>
          </div>
        </div>

        <div className="challenge-modal-actions">
          <button
            type="button"
            className="btn-challenge-primary"
            onClick={handleShareToTelegram}
          >
            <Send size={18} />
            <span>Share to Chats / Groups / Channels</span>
          </button>

          <div className="challenge-modal-secondary-actions">
            <button
              type="button"
              className="btn-challenge-secondary"
              onClick={handleCopyLink}
            >
              {copied ? <Check size={18} className="text-emerald" /> : <Copy size={18} />}
              <span>{copied ? 'Link Copied!' : 'Copy Challenge Link'}</span>
            </button>

            <button
              type="button"
              className="btn-challenge-secondary"
              onClick={handleDownloadImage}
              disabled={!cardDataUrl}
            >
              <Download size={18} />
              <span>Save Card Image</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
