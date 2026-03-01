// Type declaration for Adsgram SDK
declare global {
  interface Window {
    Adsgram: any;
  }
}

import React, { useState, useEffect, useRef } from 'react';
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
    id: 'free_claim',
    type: 'free_claim',
    title: 'Welcome Bonus',
    description: 'Claim your one-time welcome gift of 250 Footy Coins.',
    reward_coins: 250,
    icon: '🎁',
  },
  {
    id: 'join_telegram',
    type: 'join_telegram',
    title: 'Join Our Telegram Channel',
    description: 'Join @footyriddles on Telegram and earn 150 Footy Coins.',
    reward_coins: 150,
    icon: '✈️',
  },
];

export const FootyCoinPage: React.FC = () => {
  const { user, refreshUser } = useAuth();
  const [alert, setAlert] = useState<{ message: string; type: AlertType } | null>(null);
  const [taskInProgress, setTaskInProgress] = useState<string | null>(null);
  const [completedTasks, setCompletedTasks] = useState<Set<string>>(new Set());
  const [pendingTelegramVerify, setPendingTelegramVerify] = useState(false);
  const [isAdLoading, setIsAdLoading] = useState(false);

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

  // ── Watch Ad ──────────────────────────────────────────────────────────────
  const handleWatchAd = async () => {
    if (!adControllerRef.current) {
      setAlert({ message: 'Ad system not ready. Please refresh.', type: 'error' });
      return;
    }

    setIsAdLoading(true);

    adControllerRef.current
      .show()
      .then(async () => {
        setTaskInProgress('watch_ads');
        try {
          const response = await apiService.post('/footy-coins/tasks/ad/complete', {});
          if (response.success) {
            setAlert({ message: '🎉 Earned 50 Footy Coins for watching the ad!', type: 'success' });
            await refreshUser();
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

  // ── Welcome Bonus ─────────────────────────────────────────────────────────
  const handleFreeClaim = async () => {
    const taskId = backendTaskIds['free_claim'];
    if (!taskId) {
      setAlert({ message: 'Task not available. Please try again later.', type: 'error' });
      return;
    }

    setTaskInProgress('free_claim');
    try {
      const response = await apiService.post(`/footy-coins/tasks/${taskId}/complete`, {});
      if (response.success) {
        setAlert({ message: '🎉 Welcome bonus claimed! 250 Footy Coins added.', type: 'success' });
        await refreshUser();
        setCompletedTasks((prev) => new Set(prev).add('free_claim'));
      } else {
        setAlert({ message: response.error || 'Failed to claim bonus', type: 'error' });
      }
    } catch {
      setAlert({ message: 'Failed to claim bonus', type: 'error' });
    } finally {
      setTaskInProgress(null);
    }
  };

  // ── Join Telegram ─────────────────────────────────────────────────────────
  const handleJoinTelegram = () => {
    window.open('https://t.me/footyriddles', '_blank');
    setPendingTelegramVerify(true);
    setAlert({ message: 'Join @footyriddles, then tap "Verify" to claim your coins!', type: 'info' });
  };

  const handleVerifyTelegram = async () => {
    const taskId = backendTaskIds['join_telegram'];
    if (!taskId) {
      setAlert({ message: 'Task not available. Please try again later.', type: 'error' });
      return;
    }

    setTaskInProgress('join_telegram');
    try {
      const response = await apiService.post(`/footy-coins/tasks/${taskId}/verify-telegram`, {});
      if (response.success) {
        setAlert({ message: '✅ Verified! 150 Footy Coins added to your balance.', type: 'success' });
        await refreshUser();
        setPendingTelegramVerify(false);
        setCompletedTasks((prev) => new Set(prev).add('join_telegram'));
      } else {
        setAlert({ message: response.error || 'Could not verify. Please join the channel first.', type: 'error' });
      }
    } catch {
      setAlert({ message: 'Verification failed. Try again.', type: 'error' });
    } finally {
      setTaskInProgress(null);
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
    if (type === 'join_telegram' && pendingTelegramVerify) return 'Verify';
    if (type === 'free_claim') return 'Claim';
    if (type === 'join_telegram') return 'Join';
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
    if (type === 'join_telegram' && pendingTelegramVerify) return `${base} btn-task--verify`;
    return base;
  };

  const handleClick = (type: string) => {
    if (type === 'watch_ads') return handleWatchAd();
    if (type === 'free_claim') return handleFreeClaim();
    if (type === 'join_telegram') {
      if (pendingTelegramVerify) return handleVerifyTelegram();
      return handleJoinTelegram();
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
              <span className="coin-icon">💰</span>
              <span className="amount">{user?.footy_coins || 0}</span>
            </div>
            <p className="coin-description">Use coins to play quizzes and compete</p>
          </div>
        </section>

        {/* Earn Section */}
        <section className="earn-coins-section">
          <h2>Earn Footy Coins</h2>
          <p className="earn-subtitle">Complete tasks below to earn free Footy Coins</p>

          <div className="tasks-container">
            {TASKS.map((task) => (
              <div
                key={task.id}
                className={`task-card card ${
                  completedTasks.has(task.type) && task.type !== 'watch_ads' ? 'completed' : ''
                }`}
              >
                <div className="task-left">
                  <div className="task-icon-badge">{task.icon}</div>
                  <div className="task-info">
                    <h3 className="task-title">{task.title}</h3>
                    <p className="task-description">{task.description}</p>
                    <span className="task-reward">+{task.reward_coins} 💰</span>
                  </div>
                </div>

                <button
                  className={getButtonClass(task.type)}
                  onClick={() => handleClick(task.type)}
                  disabled={isButtonDisabled(task.type)}
                >
                  {getButtonLabel(task.type)}
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};