import React, { useState, useEffect } from 'react';
import { Zap, ListOrdered, Timer, Star, Clock, Coins, ChevronRight, CheckCircle2, Hourglass, Image as ImageIcon } from 'lucide-react';
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
  }, [isExpired, isCurrentlyLocked]);

  useEffect(() => {
    if (timeUntilLive <= 0) return;
    const interval = setInterval(() => {
      setTimeUntilLive((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [timeUntilLive]);

  if (isExpired) {
    return null;
  }

  return (
    <div className="quiz-card card">
      <div className="quiz-card-header">
        <div className="quiz-title-wrapper">
          <Zap size={20} className="quiz-icon-zap" />
          <h3 className="quiz-card-title">
            Today's Quiz: <span className="quiz-name-highlight">{quiz.name}</span>
            {quiz.quiz_type === 'image_text' && (
              <span className="quiz-badge-image-trivia">
                <ImageIcon size={11} /> Image Quiz
              </span>
            )}
          </h3>
        </div>
        {quiz.cost_in_footy_coins > 0 && (
          <div className="quiz-cost-pill">
            <Coins size={13} />
            <span>{quiz.cost_in_footy_coins}</span>
          </div>
        )}
      </div>

      <div className="quiz-metrics-grid">
        <div className="metric-cell">
          <ListOrdered size={16} className="metric-icon metric-icon-slate" />
          <span className="metric-text">{quiz.total_questions} Questions</span>
        </div>

        <div className="metric-cell">
          <Timer size={16} className="metric-icon metric-icon-slate" />
          <span className="metric-text">{quiz.time_limit_seconds} Seconds</span>
        </div>

        <div className="metric-cell">
          <Star size={16} className="metric-icon metric-icon-amber" />
          <span className="metric-text">{quiz.total_points} Points</span>
        </div>

        <div className="metric-cell">
          <Clock size={16} className="metric-icon metric-icon-slate" />
          <span className="metric-text">
            Expires In:{' '}
            <span className={`metric-time ${!isCurrentlyLocked && timeRemaining < 3600 ? 'urgent' : ''}`}>
              {isCurrentlyLocked ? 'Scheduled' : formatTimeRemaining(timeRemaining)}
            </span>
          </span>
        </div>
      </div>

      {quiz.already_played ? (
        <div className="quiz-status-banner completed">
          <CheckCircle2 size={18} className="banner-icon" />
          <span>You've completed today's quiz. Come back tomorrow!</span>
        </div>
      ) : isCurrentlyLocked ? (
        <div className="quiz-status-banner locked">
          <Hourglass size={18} className="banner-icon" />
          <span>Goes live in: {formatTimeRemaining(timeUntilLive)}</span>
        </div>
      ) : (
        <button
          className="btn-primary start-quiz-btn"
          onClick={() => onStartClick(quiz)}
          disabled={isLoading}
        >
          <ChevronRight size={18} strokeWidth={2.5} />
          <span>{isLoading ? 'Starting Quiz...' : 'Start Quiz'}</span>
        </button>
      )}
    </div>
  );
};
