import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { FootyCoinTask } from '../types';
import { apiService } from '../services/apiService';
import { Loading } from '../components/Loading';
import { Alert, AlertType } from '../components/Alert';
import '../styles/pages/FootyCoinPage.css';

export const FootyCoinPage: React.FC = () => {
  const { user, refreshUser } = useAuth();
  const [tasks, setTasks] = useState<FootyCoinTask[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [alert, setAlert] = useState<{ message: string; type: AlertType } | null>(null);
  const [taskInProgress, setTaskInProgress] = useState<string | null>(null);
  const [pendingTelegramTask, setPendingTelegramTask] = useState<string | null>(null);

  // Fetch tasks
  useEffect(() => {
    const fetchTasks = async () => {
      try {
        setIsLoading(true);
        const response = await apiService.get('/footy-coins/tasks');
        if (response.success && response.data) {
          setTasks(response.data as FootyCoinTask[]);
        }
      } catch (error) {
        console.error('Error fetching tasks:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchTasks();
  }, []);

  const handleTaskAction = async (taskId: string, taskType: string) => {
    try {
      setTaskInProgress(taskId);

      if (taskType === 'watch_ads') {
        const confirmed = window.confirm('Watch a short ad to earn 50 Footy Coins?');
        if (!confirmed) {
          setTaskInProgress(null);
          return;
        }

        const response = await apiService.post(`/footy-coins/tasks/${taskId}/complete`, {});
        if (response.success) {
          setAlert({ message: '🎉 Earned 50 Footy Coins for watching the ad!', type: 'success' });
          await refreshUser();
          setTasks((prev) =>
            prev.map((t) =>
              t.id === taskId ? { ...t, is_completed: true, completed_at: new Date().toISOString() } : t
            )
          );
        } else {
          setAlert({ message: response.error || 'Failed to complete task', type: 'error' });
        }

      } else if (taskType === 'free_claim') {
        const response = await apiService.post(`/footy-coins/tasks/${taskId}/complete`, {});
        if (response.success) {
          setAlert({ message: '🎉 Welcome bonus claimed! 250 Footy Coins added to your balance.', type: 'success' });
          await refreshUser();
          setTasks((prev) =>
            prev.map((t) =>
              t.id === taskId ? { ...t, is_completed: true, completed_at: new Date().toISOString() } : t
            )
          );
        } else {
          setAlert({ message: response.error || 'Failed to claim bonus', type: 'error' });
        }

      } else if (taskType === 'join_telegram') {
        // Open the channel, then show a Verify button
        window.open('https://t.me/footyriddles', '_blank');
        setPendingTelegramTask(taskId);
        setAlert({ message: 'Join @footyriddles, then tap "Verify" to claim your coins!', type: 'info' });
        setTaskInProgress(null);
        return;

      } else if (taskType === 'verify_telegram') {
        const response = await apiService.post(`/footy-coins/tasks/${taskId}/verify-telegram`, {});
        if (response.success) {
          setAlert({ message: '✅ Verified! 150 Footy Coins added to your balance.', type: 'success' });
          await refreshUser();
          setPendingTelegramTask(null);
          setTasks((prev) =>
            prev.map((t) =>
              t.id === taskId ? { ...t, is_completed: true, completed_at: new Date().toISOString() } : t
            )
          );
        } else {
          setAlert({ message: response.error || 'Could not verify membership. Please join the channel first.', type: 'error' });
        }
      }

    } catch (error) {
      console.error('Error completing task:', error);
      setAlert({ message: 'Failed to complete task', type: 'error' });
    } finally {
      setTaskInProgress(null);
    }
  };

  if (isLoading) {
    return <Loading message="Loading Footy Coins..." />;
  }

  const getTaskButtonText = (task: FootyCoinTask): string => {
    if (task.is_completed) return 'Completed';
    if (task.type === 'join_telegram' && pendingTelegramTask === task.id) return 'Verify';
    switch (task.type) {
      case 'watch_ads':   return 'Watch';
      case 'free_claim':  return 'Claim';
      case 'join_telegram': return 'Join';
      default:            return 'Go';
    }
  };

  // Determine the effective action type (flip to verify once channel has been opened)
  const getEffectiveType = (task: FootyCoinTask): string => {
    if (task.type === 'join_telegram' && pendingTelegramTask === task.id) {
      return 'verify_telegram';
    }
    return task.type;
  };

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
        {/* Coin Balance Section */}
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

        {/* Earn Footy Coins Section */}
        <section className="earn-coins-section">
          <h2>Earn Footy Coins</h2>

          <div className="tasks-container">
            {tasks.length > 0 ? (
              tasks.map((task) => (
                <div
                  key={task.id}
                  className={`task-card card ${task.is_completed ? 'completed' : ''}`}
                >
                  <div className="task-header">
                    <div>
                      <h3>{task.title}</h3>
                      {task.description && <p className="task-description">{task.description}</p>}
                    </div>
                    <span className="coin-reward">+{task.reward_coins} 💰</span>
                  </div>

                  <button
                    className={`btn-task ${task.is_completed ? 'completed' : ''} ${pendingTelegramTask === task.id ? 'verify' : ''}`}
                    onClick={() => handleTaskAction(task.id, getEffectiveType(task))}
                    disabled={task.is_completed || taskInProgress === task.id}
                  >
                    {taskInProgress === task.id ? 'Processing...' : getTaskButtonText(task)}
                  </button>
                </div>
              ))
            ) : (
              <p className="no-tasks">No tasks available at the moment</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};