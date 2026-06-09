import React, { useState, useEffect } from 'react';
import { Quiz } from '../types';
import { formatTimeRemaining, isQuizExpired, getTimeUntilExpiry } from '../services/utilService';
import '../styles/components/QuizCard.css';

interface QuizCardProps {
  quiz: Quiz;
  onStartClick: (quiz: Quiz) => void;
  isLoading?: boolean;
}

export const QuizCard: React.FC<QuizCardProps> = ({ quiz, onStartClick, isLoading = false }) => {
  const [timeRemaining, setTimeRemaining] = useState(getTimeUntilExpiry(quiz.expires_at));
  const isExpired = isQuizExpired(quiz.expires_at);

  const [timeUntilLive, setTimeUntilLive] = useState(quiz.scheduled_for ? getTimeUntilExpiry(quiz.scheduled_for) : 0);
  const isCurrentlyLocked = timeUntilLive > 0;

  useEffect(() => {
    if (isExpired || isCurrentlyLocked) return;

    const interval = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 0) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isExpired]);

  useEffect(() => {
    if (timeUntilLive <= 0) return;
    const interval = setInterval(() => {
      setTimeUntilLive((prev) => prev > 0 ? prev - 1 : 0);
    }, 1000);
    return () => clearInterval(interval);
  }, [timeUntilLive]);

  if (isExpired) {
    return null;
  }

  return (
    <div className="quiz-card card">
      <div className="quiz-header flex-between">
        <h3>{quiz.name}</h3>
        <span className="quiz-status">Today's Quiz</span>
      </div>

      <div className="quiz-details">
        <div className="detail-row flex-between">
          <span className="detail-label">Questions:</span>
          <span className="detail-value">{quiz.total_questions}</span>
        </div>

        <div className="detail-row flex-between">
          <span className="detail-label">Duration:</span>
          <span className="detail-value">{quiz.time_limit_seconds}s</span>
        </div>

        <div className="detail-row flex-between">
          <span className="detail-label">Total Points:</span>
          <span className="detail-value">{quiz.total_points}</span>
        </div>

        <div className="detail-row flex-between">
          <span className="detail-label">Cost:</span>
          <span className="detail-value">{quiz.cost_in_footy_coins} 💰</span>
        </div>

        <div className="detail-row flex-between">
          <span className="detail-label">Expires In:</span>
          <span className={`detail-value ${!isCurrentlyLocked && timeRemaining < 3600 ? 'text-error' : ''}`}>
            {isCurrentlyLocked ? 'Pending Go-Live...' : formatTimeRemaining(timeRemaining)}
          </span>
        </div>
      </div>

      {/* ── Show locked state if already played, otherwise show Start button ── */}
      {quiz.already_played ? (
        <div className="quiz-played-banner">
          ✅ You've completed today's quiz. Come back tomorrow!
        </div>
      ) : isCurrentlyLocked ? (
        <div className="quiz-locked-banner" style={{background: 'rgba(255, 51, 102, 0.1)', color: '#ff3366', padding: '12px', borderRadius: '8px', textAlign: 'center', fontWeight: 'bold', border: '1px solid rgba(255, 51, 102, 0.3)'}}>
          ⏳ Goes live in: {formatTimeRemaining(timeUntilLive)}
        </div>
      ) : (

        <button
          className="btn-primary start-quiz-btn"
          onClick={() => onStartClick(quiz)}
          disabled={isLoading}
        >
          {isLoading ? 'Starting...' : 'Start Quiz'}
        </button>
      )}
    </div>
  );
};
