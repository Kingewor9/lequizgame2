import React, { useState, useEffect, useCallback } from 'react';
import { ChevronRight, Coins, ListOrdered, Trophy, CheckCircle2, Target, Sparkles, Clock, Volume2, VolumeX, Swords } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { BattleSummary, Quiz, QuizResponse } from '../types';
import { apiService } from '../services/apiService';
import { QuizCard } from '../components/QuizCard';
import { Modal } from '../components/Modal';
import { Loading } from '../components/Loading';
import { Alert, AlertType } from '../components/Alert';
import { QuizQuestion } from '../components/QuizQuestion';
import { ShowAdButton } from '../components/ShowAdButton';
import { LeaderboardPage } from './LeaderboardPage';
import { ProfilePage } from './ProfilePage';
import { BattlePage } from './BattlePage';
import { formatQuizTimer } from '../services/utilService';
import { useGameSound } from '../context/GameSoundContext';
import '../styles/pages/HomePage.css';

interface HomePageProps {
  onCoinsClick: () => void;
  onUnreadCountChange: (count: number) => void;
}

export const HomePage: React.FC<HomePageProps> = ({ onCoinsClick, onUnreadCountChange }) => {
  const { user, telegramUser, refreshUser } = useAuth();
  const { isSoundEnabled, toggleSound, playSound } = useGameSound();
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [currentQuiz, setCurrentQuiz] = useState<Quiz | null>(null);
  const [isQuizLoading, setIsQuizLoading] = useState(false);
  const [showQuizModal, setShowQuizModal] = useState(false);
  const [quizLoading, setQuizLoading] = useState(true);
  const [alert, setAlert] = useState<{ message: string; type: AlertType } | null>(null);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [showBattles, setShowBattles] = useState(false);
  const [battleTargetUserId, setBattleTargetUserId] = useState<string | null>(null);
  const [battleSummary, setBattleSummary] = useState<BattleSummary>({
    pending_incoming: 0,
    pending_outgoing: 0,
    active: 0,
    unread_count: 0,
  });

  // Quiz state
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<
    Array<{ questionId: string; answerId: string; answerText?: string; isCorrect: boolean }>
  >([]);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [quizStarted, setQuizStarted] = useState(false);
  const [quizResults, setQuizResults] = useState<QuizResponse | null>(null);
  const [isBoosterLoading, setIsBoosterLoading] = useState(false);

  const refreshBattleSummary = useCallback(async () => {
    const response = await apiService.get<BattleSummary>('/battles/summary');
    if (response.success && response.data) {
      setBattleSummary(response.data);
    } else {
      console.error('Could not fetch battle notifications:', response.error || 'Unexpected API response');
    }
  }, []);

  // ── Fetch today's quizzes ────────────────────────────────────────────────────
  useEffect(() => {
    const fetchQuizzes = async (showLoading = false) => {
      try {
        if (showLoading) setQuizLoading(true);
        const response = await apiService.get('/quizzes/today');
        if (response.success && response.data) {
          const quizzesData = Array.isArray(response.data) ? response.data : [response.data];
          setQuizzes((currentQuizzes) => (quizzesData as Quiz[]).map((quiz) => {
            const currentQuiz = currentQuizzes.find((current) => current.id === quiz.id);
            return currentQuiz?.already_played ? { ...quiz, already_played: true } : quiz;
          }));
        }
      } catch (error) {
        console.error('Error fetching quizzes:', error);
      } finally {
        if (showLoading) setQuizLoading(false);
      }
    };

    void fetchQuizzes(true);
    const refreshInterval = window.setInterval(() => void fetchQuizzes(), 30000);

    // Refresh user rank separately — failure must never affect quiz display
    refreshUser().catch((e) => console.error('refreshUser error:', e));
    return () => window.clearInterval(refreshInterval);
  }, []);

  useEffect(() => {
    let mounted = true;
    const fetchSummary = async () => {
      if (!mounted) return;
      await refreshBattleSummary();
    };
    void fetchSummary();
    const interval = window.setInterval(() => void fetchSummary(), 15000);
    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, [refreshBattleSummary]);

  useEffect(() => {
    const unreadQuizzes = quizzes.filter((quiz) => !quiz.already_played).length;
    onUnreadCountChange(unreadQuizzes + battleSummary.unread_count);
  }, [quizzes, battleSummary.unread_count, onUnreadCountChange]);

  // ── Quiz timer ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!quizStarted || !currentQuiz) return;
    if (timeRemaining <= 0) {
      handleQuizTimeout();
      return;
    }
    const timer = setInterval(() => {
      setTimeRemaining((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [quizStarted, timeRemaining, currentQuiz]);

  const handleStartQuiz = async (selectedQuiz: Quiz) => {
    if (!selectedQuiz || !user) return;

    // ── Block replay on the frontend ─────────────────────────────────────
    if (selectedQuiz.already_played) {
      setAlert({
        message: "You've already completed this quiz. Come back later!",
        type: 'warning',
      });
      return;
    }

    if (user.footy_coins < selectedQuiz.cost_in_footy_coins) {
      setAlert({
        message: `You need ${selectedQuiz.cost_in_footy_coins} Footy Coins to play this quiz. Earn more in the Coins tab!`,
        type: 'error',
      });
      return;
    }

    try {
      setIsQuizLoading(true);

      const deductResponse = await apiService.post('/users/spend-coins', {
        amount: selectedQuiz.cost_in_footy_coins,
        reason: `Quiz: ${selectedQuiz.name}`,
      });

      if (!deductResponse.success) {
        setAlert({ message: deductResponse.error || 'Failed to start quiz', type: 'error' });
        return;
      }

      const quizResponse = await apiService.get(`/quizzes/${selectedQuiz.id}`);
      if (quizResponse.success && quizResponse.data) {
        const startResponse = await apiService.post(`/quizzes/${selectedQuiz.id}/start`, {});
        if (!startResponse.success) {
          setAlert({
            message: startResponse.error || 'Could not start quiz. Please try again.',
            type: 'error',
          });
          return;
        }

        setCurrentQuiz(quizResponse.data as Quiz);
        setQuizStarted(true);
        setCurrentQuestionIndex(0);
        setAnswers([]);
        setSelectedAnswer(null);
        setIsAnswered(false);
        setTimeRemaining(selectedQuiz.time_limit_seconds);
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
    if (!currentQuiz || !currentQuiz.questions) return;

    const currentQuestion = currentQuiz.questions[currentQuestionIndex];
    const isCorrect = optionId === currentQuestion.correct_option_id;

    playSound('answerSelect');
    window.setTimeout(() => playSound(isCorrect ? 'correct' : 'incorrect'), 90);
    setSelectedAnswer(optionId);
    setIsAnswered(true);

    if (isCorrect) {
      triggerVibration([50, 30, 50]);
    } else {
      triggerVibration([100, 50, 100]);
    }

    const newAnswer = { questionId: currentQuestion.id, answerId: optionId, isCorrect };
    const updatedAnswers = [...answers, newAnswer];
    setAnswers(updatedAnswers);
    const isLastQuestion = currentQuestionIndex >= (currentQuiz.questions.length - 1);

    window.setTimeout(() => {
      if (!isLastQuestion) {
        setCurrentQuestionIndex((prev) => prev + 1);
        setSelectedAnswer(null);
        setIsAnswered(false);
      } else {
        handleQuizComplete(updatedAnswers);
      }
    }, isLastQuestion ? 500 : 1500);
  };

  const handleTextAnswerSubmit = async (answerText: string, isCorrect: boolean) => {
    if (!currentQuiz || !currentQuiz.questions) return;

    const currentQuestion = currentQuiz.questions[currentQuestionIndex];

    playSound('answerSelect');
    window.setTimeout(() => playSound(isCorrect ? 'correct' : 'incorrect'), 90);
    setSelectedAnswer(answerText);
    setIsAnswered(true);

    if (isCorrect) {
      triggerVibration([50, 30, 50]);
    } else {
      triggerVibration([100, 50, 100]);
    }

    const newAnswer = {
      questionId: currentQuestion.id,
      answerId: answerText,
      answerText: answerText,
      isCorrect,
    };
    const updatedAnswers = [...answers, newAnswer];
    setAnswers(updatedAnswers);
    const isLastQuestion = currentQuestionIndex >= (currentQuiz.questions.length - 1);

    window.setTimeout(() => {
      if (!isLastQuestion) {
        setCurrentQuestionIndex((prev) => prev + 1);
        setSelectedAnswer(null);
        setIsAnswered(false);
      } else {
        handleQuizComplete(updatedAnswers);
      }
    }, isLastQuestion ? 500 : 1500);
  };

  const triggerVibration = (pattern: number[] = [100]) => {
    if (navigator.vibrate) navigator.vibrate(pattern);
  };

  const handleQuizComplete = async (completionAnswers?: Array<{ questionId: string; answerId: string; answerText?: string; isCorrect: boolean }>) => {
    if (!currentQuiz || !user) return;

    const answersToSubmit = completionAnswers || answers;

    const submissionAnswers = answersToSubmit.map((a) => ({
      question_id: a.questionId,
      selected_option_id: a.answerId,
      answer_text: a.answerText || a.answerId,
    }));

    try {
      const submitResponse = await apiService.post(`/quizzes/${currentQuiz.id}/submit`, {
        answers: submissionAnswers,
        time_taken_seconds: currentQuiz.time_limit_seconds - timeRemaining,
      });

      if (submitResponse.success && submitResponse.data) {
        setQuizResults(submitResponse.data as QuizResponse);
        const result = submitResponse.data as QuizResponse;
        if (result.points_earned > 0) {
          playSound('points');
          window.setTimeout(() => playSound('complete'), 380);
        } else {
          playSound('complete');
        }
        setQuizzes((prev) =>
          prev.map((q) => (q.id === currentQuiz.id ? { ...q, already_played: true } : q))
        );
        void refreshUser();
      } else {
        setAlert({ message: 'Failed to submit quiz. Please try again.', type: 'error' });
      }
    } catch (error) {
      console.error('Error submitting quiz:', error);
      setAlert({ message: 'Error submitting quiz', type: 'error' });
    }
  };

  const handleLeaderboardBoosterReward = async () => {
    if (!currentQuiz || !quizResults || currentQuiz.destination === 'tournament') return;

    setIsBoosterLoading(true);
    try {
      const response = await apiService.post<{
        leaderboard_bonus: number;
        leaderboard_booster: NonNullable<QuizResponse['leaderboard_booster']>;
      }>(`/quizzes/${currentQuiz.id}/leaderboard-booster`, {});
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Could not double your leaderboard points.');
      }

      setQuizResults((current) => current ? {
        ...current,
        leaderboard_bonus: response.data!.leaderboard_bonus,
        leaderboard_booster: response.data!.leaderboard_booster,
      } : current);
      await refreshUser();
    } finally {
      setIsBoosterLoading(false);
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
  if (showBattles) {
    return (
      <BattlePage
        onBack={() => {
          setShowBattles(false);
          setBattleTargetUserId(null);
          void refreshBattleSummary();
        }}
        initialPlayerId={battleTargetUserId}
      />
    );
  }
  if (profileUserId) {
    return (
      <ProfilePage
        userId={profileUserId}
        onBack={() => setProfileUserId(null)}
        onChallenge={(targetUserId) => {
          setProfileUserId(null);
          setBattleTargetUserId(targetUserId);
          setShowBattles(true);
        }}
      />
    );
  }
  if (showLeaderboard) {
    return (
      <LeaderboardPage
        onBack={() => setShowLeaderboard(false)}
        onSelectUser={setProfileUserId}
      />
    );
  }

  const displayName = telegramUser?.first_name || user?.username || 'Alex FootyFan';

  return (
    <div className="home-page animate-fade">
      {alert && (
        <Alert message={alert.message} type={alert.type} onClose={() => setAlert(null)} />
      )}

      <div className="home-content">
        {/* Welcome Section - Matches Screenshot 2 */}
        <section className="welcome-section">
          <div className="welcome-heading-row">
            <h1 className="welcome-title">
              Welcome, <span className="welcome-name">{displayName}</span>!
            </h1>
            <div className="welcome-actions">
              <button
                type="button"
                className="home-coin-balance"
                onClick={onCoinsClick}
                aria-label={`Footy Coins balance: ${user?.footy_coins ?? 0}. Open Footy Coins`}
              >
                <Coins size={17} aria-hidden="true" />
                <span>{(user?.footy_coins ?? 0).toLocaleString()}</span>
              </button>
              <button
                type="button"
                className={`sound-toggle ${isSoundEnabled ? 'sound-toggle-on' : ''}`}
                onClick={toggleSound}
                data-sound="none"
                aria-label={isSoundEnabled ? 'Turn game sounds off' : 'Turn game sounds on'}
                aria-pressed={isSoundEnabled}
                title={isSoundEnabled ? 'Sound on' : 'Sound off'}
              >
                {isSoundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
              </button>
            </div>
          </div>
          <p className="welcome-subtitle">Test your football knowledge & climb the ranks</p>
        </section>

        <button
          type="button"
          className="home-battle-entry"
          onClick={() => setShowBattles(true)}
        >
          <span className="home-battle-emblem"><Swords size={23} /></span>
          <span className="home-battle-copy">
            <strong>1v1 Battle</strong>
            <span>
              {battleSummary.pending_incoming > 0
                ? `${battleSummary.pending_incoming} challenge${battleSummary.pending_incoming === 1 ? '' : 's'} waiting for your reply`
                : battleSummary.pending_outgoing > 0
                  ? `${battleSummary.pending_outgoing} challenge${battleSummary.pending_outgoing === 1 ? '' : 's'} pending acceptance`
                  : battleSummary.active > 0
                    ? `${battleSummary.active} live battle${battleSummary.active === 1 ? '' : 's'} · check the scores`
                    : 'Challenge a player · win 150 Footy Coins'}
            </span>
          </span>
          {battleSummary.pending_incoming > 0 && (
            <span className="home-battle-pending-count" aria-label={`${battleSummary.pending_incoming} challenges need your reply`}>
              {battleSummary.pending_incoming}
            </span>
          )}
          <ChevronRight size={19} />
        </button>

        {/* Today's Quiz Section */}
        <section className="quiz-section">
          {quizzes.length > 0 ? (
            <div className="quizzes-wrapper">
              {quizzes.map((q) => (
                <QuizCard key={q.id} quiz={q} onStartClick={handleStartQuiz} isLoading={isQuizLoading} />
              ))}
            </div>
          ) : (
            <div className="no-quiz-card card">
              <Clock size={28} className="no-quiz-icon" />
              <h3>No Quizzes Live Right Now</h3>
              <p>Check back shortly for today's football trivia!</p>
            </div>
          )}
        </section>

        {/* Overall Score Section - Matches Screenshot 2 */}
        <section className="score-section card">
          <div className="score-header">
            <span className="score-heading-label">Overall Score</span>
            <div className="score-actions">
              <button
                className="btn-view-leaderboard"
                onClick={() => setShowLeaderboard(true)}
                aria-label="View Leaderboard"
              >
                <span>View Leaderboard</span>
                <ChevronRight size={15} strokeWidth={2.4} />
              </button>
              <button
                className="btn-view-profile"
                onClick={() => {
                  if (user) setProfileUserId(user.id);
                }}
                aria-label="View your profile"
                disabled={!user}
              >
                <span>View Profile</span>
                <ChevronRight size={15} strokeWidth={2.4} />
              </button>
            </div>
          </div>

          <div className="score-number-display">
            {(user?.overall_score ?? 14500).toLocaleString()}
          </div>

          <div className="score-rank-badge-row">
            <ListOrdered size={16} className="rank-list-icon" />
            <span className="rank-info-text">
              Global Rank:{' '}
              <strong className="rank-highlight-number">
                #{user?.global_rank || 47}
              </strong>{' '}
              / {(user?.global_total_players || 250999).toLocaleString()} players
            </span>
          </div>
        </section>
      </div>

      {/* Quiz Modal */}
      <Modal
        isOpen={showQuizModal}
        onClose={handleCloseQuizModal}
        title={quizResults ? 'Quiz Results' : currentQuiz?.name || 'Daily Quiz'}
        closeButton={!quizStarted || !!quizResults}
      >
        {!quizResults && quizStarted && currentQuiz?.questions && (
          <div className="quiz-container">
            <div className="quiz-timer-pill">
              <Clock size={16} />
              <span className={timeRemaining < 30 ? 'timer-warning' : ''}>
                {formatQuizTimer(timeRemaining)}
              </span>
            </div>
            <QuizQuestion
              question={currentQuiz.questions[currentQuestionIndex]}
              currentIndex={currentQuestionIndex}
              totalQuestions={currentQuiz.questions.length}
              selectedOptionId={selectedAnswer}
              isAnswered={isAnswered}
              isCorrect={
                selectedAnswer ? answers[currentQuestionIndex]?.isCorrect ?? null : null
              }
              onOptionSelect={handleOptionSelect}
              onTextAnswerSubmit={handleTextAnswerSubmit}
            />
          </div>
        )}

        {quizResults && (
          <div className="results-container animate-fade">
            <div className="results-hero">
              <div className="results-trophy-badge">
                <Trophy size={32} />
              </div>
              <h3>Quiz Completed!</h3>
              <p className="results-subtitle">Great effort on the pitch today!</p>
            </div>

            <div className="results-stats-grid">
              <div className="result-metric-card">
                <CheckCircle2 size={18} className="text-emerald" />
                <span className="metric-title">Correct</span>
                <span className="metric-val text-emerald">
                  {quizResults.correct_answers}/{quizResults.total_questions}
                </span>
              </div>

              <div className="result-metric-card">
                <Target size={18} className="text-indigo" />
                <span className="metric-title">Accuracy</span>
                <span className="metric-val">{quizResults.accuracy_rate}%</span>
              </div>

              <div className="result-metric-card">
                <Sparkles size={18} className="text-amber" />
                <span className="metric-title">Points</span>
                <span className="metric-val text-amber">
                  +{quizResults.points_earned + (quizResults.leaderboard_bonus || 0)}
                </span>
                {(quizResults.leaderboard_bonus || 0) > 0 && (
                  <span className="booster-points-note">
                    x2 applied to leaderboard
                  </span>
                )}
              </div>

              <div className="result-metric-card">
                <Clock size={18} className="text-muted" />
                <span className="metric-title">Time Taken</span>
                <span className="metric-val">
                  {Math.floor(quizResults.time_taken_seconds / 60)}:
                  {String(quizResults.time_taken_seconds % 60).padStart(2, '0')}
                </span>
              </div>
            </div>

            {currentQuiz?.destination !== 'tournament' &&
              quizResults.leaderboard_booster?.available && (
                <div className="leaderboard-booster">
                  <div className="leaderboard-booster-copy">
                    <Sparkles size={20} aria-hidden="true" />
                    <div>
                      <strong>Double your leaderboard points</strong>
                      <span>
                        Watch a short ad to add {quizResults.points_earned} points to your global score.
                        {' '}{quizResults.leaderboard_booster.uses_remaining} boosts left today.
                      </span>
                    </div>
                  </div>
                  <ShowAdButton
                    className="leaderboard-booster-button"
                    isLoading={isBoosterLoading}
                    onReward={handleLeaderboardBoosterReward}
                    onError={(error) => {
                      const message = error instanceof Error
                        ? error.message
                        : 'The ad could not be completed. Please try again.';
                      setAlert({ message, type: 'error' });
                    }}
                  >
                    Watch ad to apply x2
                  </ShowAdButton>
                </div>
              )}

            <button className="btn-primary results-done-btn" onClick={handleCloseQuizModal}>
              Back to Hub
            </button>
          </div>
        )}
      </Modal>
    </div>
  );
};