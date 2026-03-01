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

  // Fetch tasks
  useEffect(() => {
    const fetchTasks = async () => {
      try {
        setIsLoading(true);
        const response = await apiService.get('/footy-coins/tasks');
        if (response.success && response.data) {
          setTasks(response.data as FootyCoinTask[]);//Take note of this change
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
        // Open ad viewer (would be a modal or external service)
        const confirmed = window.confirm('Watch an ad to earn 100 Footy Coins?');
        if (!confirmed) {
          setTaskInProgress(null);
          return;
        }

        const response = await apiService.post(`/footy-coins/tasks/${taskId}/complete`, {});
        if (response.success) {
          setAlert({ message: 'Earned 100 Footy Coins!', type: 'success' });
          await refreshUser();
          setTasks((prev) =>
            prev.map((t) =>
              t.id === taskId ? { ...t, is_completed: true, completed_at: new Date().toISOString() } : t
            )
          );
        }
      } else if (taskType === 'free_claim') {
        const response = await apiService.post(`/footy-coins/tasks/${taskId}/complete`, {});
        if (response.success) {
          setAlert({ message: 'Claimed 250 Footy Coins!', type: 'success' });
          await refreshUser();
          setTasks((prev) =>
            prev.map((t) =>
              t.id === taskId ? { ...t, is_completed: true, completed_at: new Date().toISOString() } : t
            )
          );
        }
      } else if (taskType === 'join_telegram') {
        // Open Telegram link
        window.open('https://t.me/footyiq', '_blank');
        const response = await apiService.post(`/footy-coins/tasks/${taskId}/complete`, {});
        if (response.success) {
          setAlert({ message: 'Earned 150 Footy Coins! Welcome to the channel.', type: 'success' });
          await refreshUser();
          setTasks((prev) =>
            prev.map((t) =>
              t.id === taskId ? { ...t, is_completed: true, completed_at: new Date().toISOString() } : t
            )
          );
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

  const getTaskButtonText = (taskType: string, isCompleted: boolean): string => {
    if (isCompleted) return 'Completed';
    switch (taskType) {
      case 'watch_ads':
        return 'Watch';
      case 'free_claim':
        return 'Claim';
      case 'join_telegram':
        return 'Join';
      default:
        return 'Go';
    }
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
                    className={`btn-task ${task.is_completed ? 'completed' : ''}`}
                    onClick={() => handleTaskAction(task.id, task.type)}
                    disabled={task.is_completed || taskInProgress === task.id}
                  >
                    {taskInProgress === task.id ? 'Processing...' : getTaskButtonText(task.type, task.is_completed)}
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
