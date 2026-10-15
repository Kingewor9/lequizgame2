import React, { useState, useEffect, useRef } from 'react';
import { Check, Coins, Copy, Gift, Send, Share2, Star, Users } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiService } from '../services/apiService';
import { Loading } from '../components/Loading';
import { Alert, AlertType } from '../components/Alert';
import '../styles/pages/FootyCoinPage.css';

// ── Hardcoded task definitions ─────────────────────────────────────────────
const TASKS = [
  {
    id: 'watch_ads',
    type: 'watch_ads',
    title: 'Earn 50 Footy Coins',
    description: 'Watch a short ad without skipping to claim your reward. Can be repeated!',
    reward_coins: 50,
    icon: '⚡',
  },
  {
    id: 'join_telegram',
    type: 'join_telegram',
    title: 'Join Our Gaming Channel',
    description: 'Join @footyriddles on Telegram and earn 150 Footy Coins.',
    reward_coins: 150,
    icon: '🔊',
  },
];

interface StarsInvoiceResponse {
  purchase_id: string;
  invoice_url: string;
  amount: number;
  stars: number;
}

interface StarsPurchaseStatus {
  status: 'pending' | 'paid';
  amount: number;
}

interface ReferralInfo {
  referral_code: string;
  referral_link: string;
  successful_referrals: number;
  reward_per_referral: number;
}

type TelegramInvoiceStatus = 'paid' | 'cancelled' | 'failed' | string;

export const FootyCoinPage: React.FC = () => {
  const { user, refreshUser } = useAuth();
  const [alert, setAlert] = useState<{ message: string; type: AlertType } | null>(null);
  const [taskInProgress, setTaskInProgress] = useState<string | null>(null);
  const [completedTasks, setCompletedTasks] = useState<Set<string>>(new Set());
  const [pendingTelegramVerify, setPendingTelegramVerify] = useState<Set<string>>(new Set());
  const [isAdLoading, setIsAdLoading] = useState(false);
  const [purchaseAmount, setPurchaseAmount] = useState('100');
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [referralInfo, setReferralInfo] = useState<ReferralInfo | null>(null);
  const [isReferralLoading, setIsReferralLoading] = useState(true);
  const [isReferralCopied, setIsReferralCopied] = useState(false);

  // Track which task IDs exist on the backend (for one-time tasks)
  const [backendTaskIds, setBackendTaskIds] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);

  const adControllerRef = useRef<any>(null);

  // Initialize Adsgram
  useEffect(() => {
    if (window.Adsgram) {
      const blockId = import.meta.env.VITE_ADSGRAM_BLOCK_ID;
      if (blockId) {
        adControllerRef.current = window.Adsgram.init({
          blockId,
          debug: import.meta.env.DEV,
        });
      }
    }
  }, []);

  // Fetch completion status from backend (which tasks has this user already done)
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        setIsLoading(true);
        const response = await apiService.get('/footy-coins/tasks');
        if (response.success && response.data) {
          const data = response.data as any[];
          const ids: Record<string, string> = {};
          const done = new Set<string>();

          data.forEach((t) => {
            // Map backend type → local task id
            ids[t.type] = t.id;
            if (t.is_completed) done.add(t.type);
          });

          setBackendTaskIds(ids);
          setCompletedTasks(done);
        }
      } catch (err) {
        console.error('Could not fetch task status:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchStatus();
  }, []);

  useEffect(() => {
    const fetchReferralInfo = async () => {
      try {
        const response = await apiService.get<ReferralInfo>('/footy-coins/referrals');
        if (!response.success || !response.data) {
          setAlert({
            message: response.error || 'Could not load your invite link.',
            type: 'error',
          });
          return;
        }
        setReferralInfo(response.data);
      } catch (error) {
        console.error('Could not fetch referral information:', error);
        setAlert({ message: 'Could not load your invite link.', type: 'error' });
      } finally {
        setIsReferralLoading(false);
      }
    };

    void fetchReferralInfo();
  }, []);

  const handleCopyReferralLink = async () => {
    if (!referralInfo) return;
    try {
      await navigator.clipboard.writeText(referralInfo.referral_link);
      setIsReferralCopied(true);
      setAlert({ message: 'Invite link copied. Share it with a friend!', type: 'success' });
      window.setTimeout(() => setIsReferralCopied(false), 2000);
    } catch (error) {
      console.error('Could not copy referral link:', error);
      setAlert({ message: 'Could not copy the invite link. Please try again.', type: 'error' });
    }
  };

  const handleShareReferralLink = () => {
    if (!referralInfo) return;
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(referralInfo.referral_link)}&text=${encodeURIComponent('Join me on Footy IQ and play football quizzes!')}`;
    const telegram = (window as Window & {
      Telegram?: { WebApp?: { openTelegramLink?: (url: string) => void } };
    }).Telegram?.WebApp;

    if (telegram?.openTelegramLink) {
      telegram.openTelegramLink(shareUrl);
    } else {
      window.open(shareUrl, '_blank', 'noopener,noreferrer');
    }
  };

  // ── Watch Ad ──────────────────────────────────────────────────────────────
  const handleWatchAd = async () => {
    if (!adControllerRef.current) {
      setAlert({ message: 'Ad system not ready. Please refresh.', type: 'error' });
      return;
    }

    const taskId = backendTaskIds['watch_ads'];
    if (!taskId) {
      setAlert({ message: 'Task not available. Please try again later.', type: 'error' });
      return;
    }

    setIsAdLoading(true);

    adControllerRef.current
      .show()
      .then(async () => {
        setTaskInProgress('watch_ads');
        try {
          const response = await apiService.post(`/footy-coins/tasks/${taskId}/complete`, {});
          if (response.success) {
            setAlert({ message: '🎉 Earned 50 Footy Coins for watching the ad!', type: 'success' });
            await refreshUser();
            // Don't mark watch_ads as completed since it's repeatable
          } else {
            setAlert({ message: response.error || 'Failed to claim ad reward', type: 'error' });
          }
        } catch {
          setAlert({ message: 'Failed to claim ad reward', type: 'error' });
        } finally {
          setTaskInProgress(null);
        }
      })
      .catch(() => {
        setAlert({ message: 'You must watch the full ad to earn coins.', type: 'error' });
      })
      .finally(() => setIsAdLoading(false));
  };

  // ── Join Telegram ─────────────────────────────────────────────────────────
  const handleJoinTelegram = (taskType: string) => {
    const channel = taskType === 'join_announcement'
      ? { url: 'https://t.me/Footyiqgame', username: '@footyiqgame' }
      : { url: 'https://t.me/footyriddles', username: '@footyriddles' };
    window.open(channel.url, '_blank', 'noopener,noreferrer');
    setPendingTelegramVerify((pending) => new Set(pending).add(taskType));
    setAlert({
      message: `Join ${channel.username}, then tap "Verify" to claim your coins!`,
      type: 'info',
    });
  };

  const handleVerifyTelegram = async (taskType: string) => {
    const taskId = backendTaskIds[taskType];
    if (!taskId) {
      setAlert({ message: 'Task not available. Please try again later.', type: 'error' });
      return;
    }

    setTaskInProgress(taskType);
    try {
      const response = await apiService.post(`/footy-coins/tasks/${taskId}/verify-telegram`, {});
      if (response.success) {
        const reward = taskType === 'join_announcement' ? 200 : 150;
        setAlert({ message: `✅ Verified! ${reward} Footy Coins added to your balance.`, type: 'success' });
        await refreshUser();
        setPendingTelegramVerify((pending) => {
          const next = new Set(pending);
          next.delete(taskType);
          return next;
        });
        setCompletedTasks((prev) => new Set(prev).add(taskType));
      } else {
        setAlert({ message: response.error || 'Could not verify. Please join the channel first.', type: 'error' });
      }
    } catch {
      setAlert({ message: 'Verification failed. Try again.', type: 'error' });
    } finally {
      setTaskInProgress(null);
    }
  };

  const handlePurchaseCoins = async () => {
    const amount = Number(purchaseAmount);
    if (!Number.isSafeInteger(amount) || amount < 1 || amount > 10_000_000) {
      setAlert({ message: 'Enter a whole number from 1 to 10,000,000.', type: 'error' });
      return;
    }

    const telegram = (window as Window & {
      Telegram?: {
        WebApp?: {
          openInvoice?: (
            invoiceUrl: string,
            callback: (status: TelegramInvoiceStatus) => void
          ) => void;
        };
      };
    }).Telegram?.WebApp;

    if (!telegram?.openInvoice) {
      setAlert({
        message: 'Telegram Stars checkout is only available inside the Telegram app.',
        type: 'error',
      });
      return;
    }

    setIsPurchasing(true);
    try {
      const response = await apiService.post<StarsInvoiceResponse>(
        '/footy-coins/stars/purchase',
        { amount }
      );
      if (!response.success || !response.data) {
        setAlert({ message: response.error || 'Could not create a Stars invoice.', type: 'error' });
        setIsPurchasing(false);
        return;
      }

      const { purchase_id: purchaseId, invoice_url: invoiceUrl } = response.data;
      telegram.openInvoice(invoiceUrl, (status) => {
        setIsPurchasing(false);
        if (status === 'cancelled') return;
        if (status !== 'paid') {
          setAlert({ message: 'Telegram could not complete this payment. Please try again.', type: 'error' });
          return;
        }

        const confirmPayment = async () => {
          for (let attempt = 0; attempt < 12; attempt += 1) {
            const purchase = await apiService.get<StarsPurchaseStatus>(
              `/footy-coins/stars/purchases/${purchaseId}`
            );
            if (purchase.success && purchase.data?.status === 'paid') {
              await refreshUser();
              setAlert({
                message: `${amount.toLocaleString()} Footy Coins added to your balance!`,
                type: 'success',
              });
              return;
            }
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }

          setAlert({
            message: 'Payment received. Your Footy Coins are being credited and will appear shortly.',
            type: 'info',
          });
        };

        void confirmPayment().catch((error: unknown) => {
          console.error('Could not confirm Stars purchase:', error);
          setAlert({
            message: 'Payment received. Your Footy Coins are being credited and will appear shortly.',
            type: 'info',
          });
        });
      });
    } catch (error) {
      console.error('Could not start Telegram Stars checkout:', error);
      setAlert({ message: 'Could not start Stars checkout. Please try again.', type: 'error' });
      setIsPurchasing(false);
    }
  };

  // ── Button helpers ────────────────────────────────────────────────────────
  const getButtonLabel = (type: string): string => {
    if (type === 'watch_ads') {
      if (isAdLoading) return 'Loading Ad...';
      if (taskInProgress === 'ad_reward') return 'Processing...';
      return 'Watch & Earn';
    }
    if (completedTasks.has(type)) return 'Completed';
    if (taskInProgress === type) return 'Processing...';
    if ((type === 'join_telegram' || type === 'join_announcement') && pendingTelegramVerify.has(type)) return 'Verify';
    if (type === 'join_telegram' || type === 'join_announcement') return 'Join';
    return 'Go';
  };

  const isButtonDisabled = (type: string): boolean => {
    if (type === 'watch_ads') return isAdLoading || taskInProgress === 'ad_reward';
    return completedTasks.has(type) || taskInProgress === type;
  };

  const getButtonClass = (type: string): string => {
    const base = 'btn-task';
    if (type === 'watch_ads') return `${base} btn-task--ad`;
    if (completedTasks.has(type)) return `${base} btn-task--done`;
    if ((type === 'join_telegram' || type === 'join_announcement') && pendingTelegramVerify.has(type)) return `${base} btn-task--verify`;
    return base;
  };

  const handleClick = (type: string) => {
    if (type === 'watch_ads') return handleWatchAd();
    if (type === 'join_telegram' || type === 'join_announcement') {
      if (pendingTelegramVerify.has(type)) return handleVerifyTelegram(type);
      return handleJoinTelegram(type);
    }
  };

  if (isLoading) {
    return <Loading message="Loading Footy Coins..." />;
  }

  return (
    <div className="footy-coin-page">
      {alert && (
        <Alert
          message={alert.message}
          type={alert.type}
          onClose={() => setAlert(null)}
        />
      )}

      <div className="coin-content">
        {/* Balance Card */}
        <section className="coin-balance-section">
          <div className="balance-card">
            <h2>Your Footy Coins</h2>
            <div className="coin-amount">
              <Coins size={38} className="coin-icon" aria-hidden="true" />
              <span className="amount">{user?.footy_coins || 0}</span>
            </div>
            <p className="coin-description">Use coins to play quizzes and compete</p>
          </div>
        </section>

        <section className="buy-coins-card card" aria-labelledby="buy-coins-heading">
          <div className="buy-coins-heading-row">
            <div className="buy-coins-icon"><Star size={21} fill="currentColor" /></div>
            <div>
              <span className="buy-coins-eyebrow">TOP UP YOUR BALANCE</span>
              <h2 id="buy-coins-heading">Buy Footy Coins</h2>
            </div>
          </div>
          <p className="buy-coins-copy">
            Choose your amount. Pay securely with Telegram Stars.
          </p>

          <label className="coin-amount-label" htmlFor="coin-purchase-amount">
            Footy Coins
          </label>
          <div className="coin-purchase-input-wrap">
            <Coins size={19} aria-hidden="true" />
            <input
              id="coin-purchase-amount"
              type="number"
              min="1"
              max="10000000"
              step="1"
              inputMode="numeric"
              value={purchaseAmount}
              onChange={(event) => setPurchaseAmount(event.target.value)}
              aria-describedby="coin-price-note"
            />
            <span className="coin-purchase-unit">COINS</span>
          </div>
          <div className="coin-quick-amounts" aria-label="Quick coin amounts">
            {[100, 500, 1000].map((amount) => (
              <button
                key={amount}
                type="button"
                className={Number(purchaseAmount) === amount ? 'active' : ''}
                onClick={() => setPurchaseAmount(String(amount))}
                disabled={isPurchasing}
              >
                {amount.toLocaleString()}
              </button>
            ))}
          </div>

          <div className="coin-price-row" id="coin-price-note">
            <span>You'll pay</span>
            <strong>
              <Star size={15} fill="currentColor" />
              {Number(purchaseAmount || 0).toLocaleString()} Stars
            </strong>
          </div>
          <p className="coin-rate-note">1 Footy Coin = 1 Telegram Star</p>
          <button
            type="button"
            className="btn-buy-coins"
            onClick={handlePurchaseCoins}
            disabled={
              isPurchasing
              || !Number.isSafeInteger(Number(purchaseAmount))
              || Number(purchaseAmount) < 1
              || Number(purchaseAmount) > 10_000_000
            }
          >
            <Star size={18} fill="currentColor" />
            {isPurchasing ? 'Preparing checkout…' : 'Continue with Stars'}
          </button>
        </section>

        {/* Earn Section */}
        <section className="earn-coins-section">
          <h2>Earn Footy Coins</h2>
          <p className="earn-subtitle">Complete tasks below to earn free Footy Coins</p>

          <div className="tasks-container">
            {TASKS.map((task) => (
              <article
                key={task.id}
                className={`task-card task-card--${task.type} ${completedTasks.has(task.type) && task.type !== 'watch_ads' ? 'completed' : ''
                  }`}
              >
                <div className="task-card-top">
                  <div className="task-icon-badge" aria-hidden="true">{task.icon}</div>
                  <span className="task-reward">+{task.reward_coins} coins</span>
                </div>
                <p className="task-eyebrow">
                  {task.type === 'watch_ads' ? 'REPEATABLE REWARD' : 'JOIN THE COMMUNITY'}
                </p>
                <h3 className="task-title">{task.title}</h3>
                <p className="task-description">{task.description}</p>
                <button
                  type="button"
                  className={getButtonClass(task.type)}
                  onClick={() => handleClick(task.type)}
                  disabled={isButtonDisabled(task.type)}
                >
                  {getButtonLabel(task.type)}
                </button>
              </article>
            ))}
          </div>

          <div className="earn-community-cards">
            <section className="announcement-channel-card" aria-labelledby="announcement-channel-heading">
              <div className="announcement-channel-top">
                <div className="announcement-channel-icon"><Send size={20} aria-hidden="true" /></div>
                <span className="announcement-channel-reward">+200 coins</span>
              </div>
              <p className="announcement-channel-eyebrow">THE LATEST FROM FOOTY IQ</p>
              <h3 id="announcement-channel-heading">Join our Announcement channel</h3>
              <p className="announcement-channel-copy">Join @footyiqgame and earn 200 footy coins</p>
              <button
                type="button"
                className={getButtonClass('join_announcement')}
                onClick={() => handleClick('join_announcement')}
                disabled={!backendTaskIds.join_announcement || isButtonDisabled('join_announcement')}
              >
                {getButtonLabel('join_announcement')}
              </button>
            </section>

            <section className="referral-card" aria-labelledby="referral-heading">
              <div className="referral-card-top">
                <div className="referral-icon"><Gift size={21} aria-hidden="true" /></div>
                <span className="referral-reward">+{referralInfo?.reward_per_referral ?? 10} coins</span>
              </div>
              <p className="referral-eyebrow">PASS IT ON</p>
              <h3 id="referral-heading">Bring your squad.</h3>
              <p className="referral-copy">
                Invite a friend to launch Footy IQ. You get 10 Footy Coins when they join — and a Telegram
                notification when your reward lands.
              </p>
              <div className="referral-count">
                <Users size={17} aria-hidden="true" />
                <span>
                  {isReferralLoading
                    ? 'Counting your successful invites…'
                    : `${referralInfo?.successful_referrals ?? 0} successful ${referralInfo?.successful_referrals === 1 ? 'invite' : 'invites'}`}
                </span>
              </div>
              <div className="referral-link-row">
                <span className="referral-link" title={referralInfo?.referral_link}>
                  {referralInfo?.referral_link || (isReferralLoading ? 'Preparing your invite link…' : 'Invite link unavailable')}
                </span>
                <button
                  type="button"
                  className="referral-copy-button"
                  onClick={handleCopyReferralLink}
                  disabled={!referralInfo || isReferralLoading}
                  aria-label="Copy invite link"
                >
                  {isReferralCopied ? <Check size={17} /> : <Copy size={17} />}
                </button>
              </div>
              <button
                type="button"
                className="referral-share-button"
                onClick={handleShareReferralLink}
                disabled={!referralInfo || isReferralLoading}
              >
                <Share2 size={17} />
                Share invite
              </button>
            </section>
          </div>
        </section>
      </div>
    </div>
  );
};