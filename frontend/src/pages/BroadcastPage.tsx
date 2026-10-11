import React, { useState } from 'react';
import { ArrowLeft, ExternalLink, Image as ImageIcon, Megaphone, Send, Users } from 'lucide-react';
import { Alert, AlertType } from '../components/Alert';
import { Loading } from '../components/Loading';
import { apiService } from '../services/apiService';
import '../styles/pages/BroadcastPage.css';

interface BroadcastResult {
  recipient_count: number;
}

interface Props {
  onBack: () => void;
}

const isValidHttpsUrl = (value: string): boolean => {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
};

export const BroadcastPage: React.FC<Props> = ({ onBack }) => {
  const [message, setMessage] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [ctaLink, setCtaLink] = useState('');
  const [ctaText, setCtaText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [alert, setAlert] = useState<{ message: string; type: AlertType } | null>(null);
  const [previewImageFailed, setPreviewImageFailed] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedMessage = message.trim();
    const trimmedImageUrl = imageUrl.trim();
    const trimmedCtaLink = ctaLink.trim();
    const trimmedCtaText = ctaText.trim();

    if (!trimmedMessage) {
      setAlert({ message: 'Write a message before sending the broadcast.', type: 'error' });
      return;
    }
    if (trimmedMessage.length > 4096) {
      setAlert({ message: 'Messages must be 4,096 characters or fewer.', type: 'error' });
      return;
    }
    if (trimmedImageUrl && trimmedMessage.length > 1024) {
      setAlert({ message: 'Messages sent with an image must be 1,024 characters or fewer.', type: 'error' });
      return;
    }
    if (trimmedImageUrl && !isValidHttpsUrl(trimmedImageUrl)) {
      setAlert({ message: 'Enter a valid HTTPS image URL.', type: 'error' });
      return;
    }
    if (Boolean(trimmedCtaLink) !== Boolean(trimmedCtaText)) {
      setAlert({ message: 'Add both a CTA link and button text, or leave both empty.', type: 'error' });
      return;
    }
    if (trimmedCtaLink && !isValidHttpsUrl(trimmedCtaLink)) {
      setAlert({ message: 'The CTA link must be a valid HTTPS URL.', type: 'error' });
      return;
    }
    if (trimmedCtaText.length > 64) {
      setAlert({ message: 'Button text must be 64 characters or fewer.', type: 'error' });
      return;
    }

    setIsSending(true);
    setAlert(null);
    const response = await apiService.post<BroadcastResult>('/admin/broadcast', {
      message: trimmedMessage,
      image_url: trimmedImageUrl || null,
      cta_link: trimmedCtaLink || null,
      cta_text: trimmedCtaText || null,
    });
    setIsSending(false);

    if (!response.success) {
      setAlert({ message: response.error || 'The broadcast could not be sent.', type: 'error' });
      return;
    }

    const recipientCount = response.data?.recipient_count ?? 0;
    setAlert({
      message: `Broadcast queued for ${recipientCount.toLocaleString()} ${recipientCount === 1 ? 'player' : 'players'}.`,
      type: 'success',
    });
    setMessage('');
    setImageUrl('');
    setCtaLink('');
    setCtaText('');
    setPreviewImageFailed(false);
  };

  if (isSending) return <Loading message="Sending broadcast..." />;

  return (
    <main className="broadcast-page">
      {alert && <Alert message={alert.message} type={alert.type} onClose={() => setAlert(null)} />}

      <button type="button" className="admin-hub-back" onClick={onBack}>
        <ArrowLeft size={16} />
        Admin options
      </button>

      <header className="broadcast-header">
        <span className="broadcast-kicker"><Megaphone size={14} /> COMMUNITY DISPATCH / 02</span>
        <h1>Broadcast message</h1>
        <p>One announcement, delivered directly to every registered player in Telegram.</p>
      </header>

      <div className="broadcast-layout">
        <form className="broadcast-form" onSubmit={handleSubmit}>
          <section className="broadcast-section">
            <div className="broadcast-section-heading">
              <span className="broadcast-step">01</span>
              <div>
                <h2>Your message</h2>
                <p>Keep the whole squad in the loop.</p>
              </div>
            </div>

            <label className="broadcast-field">
              <span>Message <b>Required</b></span>
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="Share an update with your players..."
                rows={7}
                maxLength={4096}
                required
              />
              <small className="broadcast-char-count">{message.length.toLocaleString()} / 4,096</small>
            </label>

            <label className="broadcast-field">
              <span>Image URL <b className="field-optional">Optional</b></span>
              <div className="broadcast-input-wrap">
                <ImageIcon size={17} aria-hidden="true" />
                <input
                  type="url"
                  value={imageUrl}
                  onChange={(event) => {
                    setImageUrl(event.target.value);
                    setPreviewImageFailed(false);
                  }}
                  placeholder="https://example.com/announcement.jpg"
                />
              </div>
            </label>
          </section>

          <section className="broadcast-section broadcast-cta-section">
            <div className="broadcast-section-heading">
              <span className="broadcast-step">02</span>
              <div>
                <h2>Call to action</h2>
                <p>Add a tappable button beneath the message.</p>
              </div>
            </div>

            <label className="broadcast-field">
              <span>Button text <b className="field-optional">Optional</b></span>
              <input
                type="text"
                value={ctaText}
                onChange={(event) => setCtaText(event.target.value)}
                placeholder="e.g. Open the app"
                maxLength={64}
              />
            </label>
            <label className="broadcast-field">
              <span>Button link <b className="field-optional">Optional</b></span>
              <div className="broadcast-input-wrap">
                <ExternalLink size={17} aria-hidden="true" />
                <input
                  type="url"
                  value={ctaLink}
                  onChange={(event) => setCtaLink(event.target.value)}
                  placeholder="https://example.com"
                />
              </div>
              <small>Provide both button text and link to attach an inline Telegram button.</small>
            </label>
          </section>

          <button className="broadcast-submit" type="submit" disabled={!message.trim()}>
            <Send size={17} />
            Send to all players
          </button>
        </form>

        <aside className="broadcast-preview-column">
          <div className="broadcast-preview-label">
            <span>MESSAGE PREVIEW</span>
            <span className="broadcast-live-dot">LIVE</span>
          </div>
          <div className="broadcast-preview">
            <div className="preview-bot-heading">
              <span className="preview-bot-avatar"><Megaphone size={17} /></span>
              <span><strong>Footy IQ</strong><small>bot</small></span>
            </div>
            <div className="preview-message">
              {imageUrl && !previewImageFailed && (
                <img
                  src={imageUrl}
                  alt="Broadcast attachment preview"
                  onError={() => setPreviewImageFailed(true)}
                />
              )}
              {imageUrl && previewImageFailed && (
                <div className="preview-image-fallback"><ImageIcon size={18} /> Image preview unavailable</div>
              )}
              <p>{message || <span className="preview-placeholder">Your message will appear here...</span>}</p>
              {ctaText.trim() && ctaLink.trim() && (
                <div className="preview-cta"><ExternalLink size={14} />{ctaText}</div>
              )}
              <time>now</time>
            </div>
          </div>
          <div className="broadcast-audience-note">
            <Users size={16} />
            <span>Audience <strong>All registered players</strong></span>
          </div>
          <div className="broadcast-safety-note">
            <strong>Before you send</strong>
            <span>This message will be delivered to all players who have started the Footy IQ bot.</span>
          </div>
        </aside>
      </div>
    </main>
  );
};
