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

  console.log('[QuizCard] expires_at:', quiz.expires_at, 'now:', new Date().toISOString(), 'isExpired:', isExpired, 'timeRemaining:', timeRemaining);

  useEffect(() => {
    if (isExpired) return;

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
          <span className={`detail-value ${timeRemaining < 3600 ? 'text-error' : ''}`}>
            {formatTimeRemaining(timeRemaining)}
          </span>
        </div>
      </div>

      {/* ── Show locked state if already played, otherwise show Start button ── */}
      {quiz.already_played ? (
        <div className="quiz-played-banner">
          ✅ You've completed today's quiz. Come back tomorrow!
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
