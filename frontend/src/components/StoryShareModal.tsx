import React, { useState } from 'react';
import {
  Camera,
  Check,
  Copy,
  Download,
  Send,
  X,
} from 'lucide-react';
import { apiService } from '../services/apiService';
import '../styles/components/StoryShareModal.css';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  cardDataUrl: string | null;
  cardBlob: Blob | null;
  points: number;
  botUsername?: string;
}

export const StoryShareModal: React.FC<Props> = ({
  isOpen,
  onClose,
  cardDataUrl,
  points,
  botUsername = 'footyiqgamebot',
}) => {
  const [isPosting, setIsPosting] = useState(false);
  const [copiedTag, setCopiedTag] = useState(false);
  const [storyShared, setStoryShared] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const cleanBotTag = botUsername.startsWith('@') ? botUsername : `@${botUsername}`;

  const handleCopyBotTag = async () => {
    try {
      await navigator.clipboard.writeText(cleanBotTag);
      setCopiedTag(true);
      setTimeout(() => setCopiedTag(false), 2000);
    } catch (err) {
      console.error('Failed to copy bot tag:', err);
    }
  };

  const handleDownloadStoryImage = () => {
    if (!cardDataUrl) return;
    const a = document.createElement('a');
    a.href = cardDataUrl;
    a.download = `footy-iq-story-${points}pts.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleShareToStory = async () => {
    if (!cardDataUrl) return;
    setIsPosting(true);
    setErrorMessage(null);

    try {
      // 1. Upload card image to backend to get public HTTPS URL
      const uploadRes = await apiService.post<{ card_id: string; image_url: string }>(
        '/quizzes/share-card',
        { image_data: cardDataUrl }
      );

      const publicImageUrl = uploadRes.success && uploadRes.data?.image_url
        ? uploadRes.data.image_url
        : null;

      const tg = (window as Window & {
        Telegram?: {
          WebApp?: {
            shareToStory?: (
              mediaUrl: string,
              params?: {
                text?: string;
                widget_link?: { url: string; name?: string };
              }
            ) => void;
          };
        };
      }).Telegram?.WebApp;

      if (tg?.shareToStory && publicImageUrl) {
        tg.shareToStory(publicImageUrl, {
          text: `I scored ${points} points on Footy IQ! Think you can beat me? ⚽ Search ${cleanBotTag}`,
          widget_link: {
            url: `https://t.me/${cleanBotTag.replace('@', '')}`,
            name: 'Play Footy IQ',
          },
        });
        setStoryShared(true);
      } else {
        // Fallback: download the image and give clear instructions
        handleDownloadStoryImage();
        setErrorMessage(
          'Image saved to your gallery! Open Telegram and add it directly to your Story.'
        );
      }
    } catch (err) {
      console.error('Story share error:', err);
      handleDownloadStoryImage();
      setErrorMessage('Image saved! You can now post it directly to your Telegram Story.');
    } finally {
      setIsPosting(false);
    }
  };

  return (
    <div className="story-modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="story-modal-container animate-fade"
        role="dialog"
        aria-modal="true"
        aria-labelledby="story-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="story-modal-close"
          onClick={onClose}
          aria-label="Close"
        >
          <X size={20} />
        </button>

        <div className="story-modal-header">
          <div className="story-icon-badge">
            <Camera size={26} />
          </div>
          <h2 id="story-modal-title">Share to Telegram Story</h2>
          <p className="story-modal-subtitle">
            Showcase your football score on your story with our official bot handle attached!
          </p>
        </div>

        {cardDataUrl && (
          <div className="story-card-preview-wrapper">
            <img
              src={cardDataUrl}
              alt="Generated Story Scorecard"
              className="story-card-preview-img"
            />
          </div>
        )}

        {errorMessage && (
          <div className="story-info-note">
            <span>{errorMessage}</span>
          </div>
        )}

        {storyShared && (
          <div className="story-success-note">
            <Check size={18} />
            <span>Story composer opened! Tap share to post.</span>
          </div>
        )}

        <div className="story-modal-actions">
          <button
            type="button"
            className="btn-story-primary"
            onClick={handleShareToStory}
            disabled={isPosting || !cardDataUrl}
          >
            <Send size={18} />
            <span>{isPosting ? 'Uploading...' : 'Post to Telegram Story'}</span>
          </button>

          <div className="story-modal-secondary-actions">
            <button
              type="button"
              className="btn-story-secondary"
              onClick={handleDownloadStoryImage}
              disabled={!cardDataUrl}
            >
              <Download size={18} />
              <span>Download Card</span>
            </button>

            <button
              type="button"
              className="btn-story-secondary"
              onClick={handleCopyBotTag}
            >
              {copiedTag ? <Check size={18} className="text-emerald" /> : <Copy size={18} />}
              <span>{copiedTag ? 'Copied!' : cleanBotTag}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
