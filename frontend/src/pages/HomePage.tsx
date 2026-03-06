import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Quiz, QuizResponse } from '../types';
import { apiService } from '../services/apiService';
import { QuizCard } from '../components/QuizCard';
import { Modal } from '../components/Modal';
import { Loading } from '../components/Loading';
import { Alert, AlertType } from '../components/Alert';
import { QuizQuestion } from '../components/QuizQuestion';
import { LeaderboardPage } from './LeaderboardPage';
import { formatQuizTimer } from '../services/utilService';
import '../styles/pages/HomePage.css';

export const HomePage: React.FC = () => {
  const { user, telegramUser, refreshUser } = useAuth();
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [isQuizLoading, setIsQuizLoading] = useState(false);
  const [showQuizModal, setShowQuizModal] = useState(false);
  const [quizLoading, setQuizLoading] = useState(true);
  const [alert, setAlert] = useState<{ message: string; type: AlertType } | null>(null);
  const [showLeaderboard, setShowLeaderboard] = useState(false);

  // Quiz state
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<
    Array<{ questionId: string; answerId: string; isCorrect: boolean }>
  >([]);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [quizStarted, setQuizStarted] = useState(false);
  const [quizResults, setQuizResults] = useState<QuizResponse | null>(null);

  // ── Fetch today's quiz ────────────────────────────────────────────────────
  useEffect(() => {
    const fetchQuiz = async () => {
      try {
        setQuizLoading(true);
        const response = await apiService.get('/quizzes/today');
        console.log('[HomePage] Quiz response:', response);
        if (response.success && response.data) {
          console.log('[HomePage] Setting quiz:', response.data);
          setQuiz(response.data as Quiz);
        } else {
          console.log('[HomePage] No quiz data. success:', response.success, 'data:', response.data);
        }
      } catch (error) {
        console.error('Error fetching quiz:', error);
      } finally {
        setQuizLoading(false);
      }
    };

    fetchQuiz();

    // Refresh user rank separately — failure must never affect quiz display
    refreshUser().catch((e) => console.error('refreshUser error:', e));
  }, []);

  // ── Quiz timer ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!quizStarted || !quiz) return;
    if (timeRemaining <= 0) {
      handleQuizTimeout();
      return;
    }
    const timer = setInterval(() => {
      setTimeRemaining((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [quizStarted, timeRemaining, quiz]);

  const handleStartQuiz = async () => {
    if (!quiz || !user) return;

    // ── Block replay on the frontend ─────────────────────────────────────
    if (quiz.already_played) {
      setAlert({
        message: "You've already completed today's quiz. Come back tomorrow!",
        type: 'warning',
      });
      return;
    }

    if (user.footy_coins < quiz.cost_in_footy_coins) {
      setAlert({
        message: `You need ${quiz.cost_in_footy_coins} Footy Coins to play this quiz. Watch ads to earn more coins!`,
        type: 'error',
      });
      return;
    }

    try {
      setIsQuizLoading(true);

      const deductResponse = await apiService.post('/users/spend-coins', {
        amount: quiz.cost_in_footy_coins,
        reason: `Quiz: ${quiz.name}`,
      });

      if (!deductResponse.success) {
        setAlert({ message: deductResponse.error || 'Failed to start quiz', type: 'error' });
        return;
      }

      const quizResponse = await apiService.get(`/quizzes/${quiz.id}`);
      if (quizResponse.success && quizResponse.data) {
        setQuiz(quizResponse.data as Quiz);
        setQuizStarted(true);
        setCurrentQuestionIndex(0);
        setAnswers([]);
        setSelectedAnswer(null);
        setIsAnswered(false);
        setTimeRemaining(quiz.time_limit_seconds);
        setShowQuizModal(true);
        await refreshUser();
      }
    } catch (error) {
      console.error('Error starting quiz:', error);
      setAlert({ message: 'Failed to start quiz', type: 'error' });
    } finally {
      setIsQuizLoading(false);
    }
  };

  const handleOptionSelect = async (optionId: string) => {
    if (!quiz || !quiz.questions) return;

    const currentQuestion = quiz.questions[currentQuestionIndex];
    const isCorrect = optionId === currentQuestion.correct_option_id;

    setSelectedAnswer(optionId);
    setIsAnswered(true);

    if (isCorrect) {
      triggerVibration([50, 30, 50]);
    } else {
      triggerVibration([100, 50, 100]);
    }

    setAnswers((prev) => [
      ...prev,
      { questionId: currentQuestion.id, answerId: optionId, isCorrect },
    ]);

    setTimeout(() => {
      if (currentQuestionIndex < (quiz.questions?.length || 0) - 1) {
        setCurrentQuestionIndex((prev) => prev + 1);
        setSelectedAnswer(null);
        setIsAnswered(false);
      } else {
        handleQuizComplete();
      }
    }, 1500);
  };

  const triggerVibration = (pattern: number[] = [100]) => {
    if (navigator.vibrate) navigator.vibrate(pattern);
  };

  const handleQuizComplete = async () => {
    if (!quiz || !user) return;

    const correctAnswers = answers.filter((a) => a.isCorrect).length;
    const pointsPerQuestion = quiz.total_points / quiz.total_questions;
    const pointsEarned = correctAnswers * pointsPerQuestion;
    const accuracy = Math.round((correctAnswers / answers.length) * 100);

    const result: QuizResponse = {
      id: '',
      user_id: user.id,
      quiz_id: quiz.id,
      answers: answers.map((a) => ({
        question_id: a.questionId,
        selected_option_id: a.answerId,
        is_correct: a.isCorrect,
      })),
      total_questions: quiz.total_questions,
      correct_answers: correctAnswers,
      incorrect_answers: answers.length - correctAnswers,
      points_earned: Math.round(pointsEarned),
      accuracy_rate: accuracy,
      completed_at: new Date().toISOString(),
      time_taken_seconds: quiz.time_limit_seconds - timeRemaining,
    };

    try {
      const submitResponse = await apiService.post(`/quizzes/${quiz.id}/submit`, {
        answers: result.answers,
        time_taken_seconds: result.time_taken_seconds,
      });

      if (submitResponse.success) {
        setQuizResults(result);
        // Mark as already played in local state so card updates immediately
        setQuiz((prev) => prev ? { ...prev, already_played: true } : prev);
        // Refresh user so rank/total on homepage reflects new submission
        await refreshUser();
      }
    } catch (error) {
      console.error('Error submitting quiz:', error);
    }
  };

  const handleQuizTimeout = () => {
    if (answers.length === 0) {
      setAlert({ message: 'Time limit reached. Quiz ended.', type: 'warning' });
    } else {
      handleQuizComplete();
    }
    setQuizStarted(false);
  };

  const handleCloseQuizModal = () => {
    setShowQuizModal(false);
    setQuizStarted(false);
    setCurrentQuestionIndex(0);
    setAnswers([]);
    setSelectedAnswer(null);
    setIsAnswered(false);
    setQuizResults(null);
  };

  if (quizLoading) return <Loading message="Loading today's quiz..." />;
  if (showLeaderboard) return <LeaderboardPage onBack={() => setShowLeaderboard(false)} />;

  return (
    <div className="home-page">
      {alert && (
        <Alert message={alert.message} type={alert.type} onClose={() => setAlert(null)} />
      )}

      <div className="home-content">
        {/* Welcome Section */}
        <section className="welcome-section">
          <h1>Welcome, {telegramUser?.first_name || 'User'}</h1>
          <p className="welcome-subtitle">Test your football knowledge</p>
        </section>

        {/* Today's Quiz Section */}
        <section className="quiz-section">
          <h2>Today's Quiz</h2>
          {quiz ? (
            <QuizCard quiz={quiz} onStartClick={handleStartQuiz} isLoading={isQuizLoading} />
          ) : (
            <div className="no-quiz-message">
              <p>No Quiz Yet, Check back later</p>
            </div>
          )}
        </section>

        {/* Overall Score Section */}
        <section className="score-section card">
          <div className="score-header flex-between">
            <h2>Overall Score</h2>
            <button
              className="btn-secondary view-leaderboard"
              onClick={() => setShowLeaderboard(true)}
            >
              View Leaderboard
            </button>
          </div>

          <div className="score-details">
            <div className="score-item">
              <span className="score-label">Total Points</span>
              <span className="score-value">{user?.overall_score || 0}</span>
            </div>
            <div className="score-item">
              <span className="score-label">Global Rank</span>
              <span className="score-value">
                #{user?.global_rank || 0} / {user?.global_total_players || 0} players
              </span>
            </div>
          </div>
        </section>
      </div>

      {/* Quiz Modal */}
      <Modal
        isOpen={showQuizModal}
        onClose={handleCloseQuizModal}
        title={quizResults ? 'Quiz Results' : quiz?.name || 'Quiz'}
        closeButton={!quizStarted || !!quizResults}
      >
        {!quizResults && quizStarted && quiz?.questions && (
          <div className="quiz-container">
            <div className="quiz-timer">
              <span className={timeRemaining < 30 ? 'timer-warning' : ''}>
                {formatQuizTimer(timeRemaining)}
              </span>
            </div>
            <QuizQuestion
              question={quiz.questions[currentQuestionIndex]}
              currentIndex={currentQuestionIndex}
              totalQuestions={quiz.questions.length}
              selectedOptionId={selectedAnswer}
              isAnswered={isAnswered}
              isCorrect={
                selectedAnswer ? answers[currentQuestionIndex]?.isCorrect ?? null : null
              }
              onOptionSelect={handleOptionSelect}
            />
          </div>
        )}

        {quizResults && (
          <div className="results-container">
            <div className="results-header">
              <h3>Quiz Completed!</h3>
            </div>
            <div className="results-stats">
              <div className="result-stat">
                <span className="stat-label">Correct Answers</span>
                <span className="stat-value success">
                  {quizResults.correct_answers}/{quizResults.total_questions}
                </span>
              </div>
              <div className="result-stat">
                <span className="stat-label">Accuracy</span>
                <span className="stat-value">{quizResults.accuracy_rate}%</span>
              </div>
              <div className="result-stat">
                <span className="stat-label">Points Earned</span>
                <span className="stat-value">{quizResults.points_earned}</span>
              </div>
              <div className="result-stat">
                <span className="stat-label">Time Taken</span>
                <span className="stat-value">
                  {Math.floor(quizResults.time_taken_seconds / 60)}:
                  {String(quizResults.time_taken_seconds % 60).padStart(2, '0')}
                </span>
              </div>
            </div>
            <button className="btn-primary" onClick={handleCloseQuizModal}>
              Back to Home
            </button>
          </div>
        )}
      </Modal>
    </div>
  );
};