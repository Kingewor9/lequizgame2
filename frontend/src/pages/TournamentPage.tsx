import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Coins,
  Crown,
  ListOrdered,
  ShieldCheck,
  Swords,
  Trophy,
  Users,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useGameSound } from '../context/GameSoundContext';
import { Alert, AlertType } from '../components/Alert';
import { Loading } from '../components/Loading';
import { Modal } from '../components/Modal';
import { QuizCard } from '../components/QuizCard';
import { QuizQuestion } from '../components/QuizQuestion';
import { apiService } from '../services/apiService';
import {
  Quiz,
  QuizResponse,
  Tournament,
  TournamentBracketRound,
  TournamentFixture,
  TournamentGroup,
  TournamentStanding,
} from '../types';
import '../styles/pages/TournamentPage.css';

interface TournamentDetail {
  tournament: Tournament;
  registered: boolean;
  current_gameweek: number;
  live_quiz: Quiz | null;
  current_fixture: TournamentFixture | null;
  fixtures: TournamentFixture[];
  standings: TournamentStanding[];
  user_standing: TournamentStanding | null;
  groups: TournamentGroup[];
  road_to_final: TournamentBracketRound[];
  final_standings: TournamentStanding[];
}

interface TournamentAnswer {
  questionId: string;
  answerId: string;
  answerText?: string;
  isCorrect: boolean;
}

type TournamentScreen = 'list' | 'game' | 'fixtures' | 'table' | 'bracket';

const formatDate = (value: string) => new Date(value).toLocaleString([], {
  dateStyle: 'medium',
  timeStyle: 'short',
});

const placeLabels: Record<number, string> = {
  1: '1st',
  2: '2nd',
  3: '3rd',
  4: '4th',
};

const rewardForPlace = (tournament: Tournament, place: number) =>
  tournament.place_rewards?.[String(place)] || 0;

const TournamentPrizeList: React.FC<{ tournament: Tournament }> = ({ tournament }) => {
  const prizes = Object.entries(tournament.place_rewards || {})
    .map(([place, amount]) => ({ place: Number(place), amount }))
    .filter(({ place, amount }) => placeLabels[place] && amount > 0)
    .sort((first, second) => first.place - second.place);

  if (prizes.length === 0) return null;

  return (
    <div className="tournament-prize-list" aria-label="Tournament Footy Coin prizes">
      <span className="tournament-prize-label">PRIZES</span>
      {prizes.map(({ place, amount }) => (
        <span className="tournament-prize-item" key={place}>
          <strong>{placeLabels[place]}</strong>
          <Coins size={13} />
          {amount.toLocaleString()}
        </span>
      ))}
    </div>
  );
};

const ProfileImage: React.FC<{ name: string; photoUrl?: string; className?: string }> = ({
  name,
  photoUrl,
  className = '',
}) => (
  <div className={`tournament-avatar ${className}`}>
    {photoUrl ? <img src={photoUrl} alt="" /> : <span>{name.slice(0, 1).toUpperCase()}</span>}
  </div>
);

const formatRules = (tournamentType: Tournament['tournament_type']) => (
  <div className="tournament-rules">
    {tournamentType === 'group_knockout' ? (
      <>
        <p>The competition opens with 32 players split randomly into eight groups of four. Registration closes at the scheduled start; if all 32 places are not filled, the tournament is cancelled and entry fees are refunded.</p>
        <ol>
          <li>Each group plays a home-and-away round robin: six fixtures per player across six daily quiz rounds.</li>
          <li>Group points are awarded for each fixture: 3 for a win, 1 for a draw, and 0 for a loss or a match with no submissions.</li>
          <li>Group ranking is decided by points, quiz-point difference, quiz points scored, head-to-head points, then a pre-drawn lot. The top two players in each group advance.</li>
          <li>The Round of 16 pairs group winners with runners-up by random draw. Players from the same group cannot meet in this round.</li>
          <li>The Round of 16, quarter-finals, semi-finals, and final are all single-match eliminations. Higher quiz score advances; ties are broken by accuracy, then faster completion, then a draw lot.</li>
          <li>Complete the tournament quiz for your fixture before it closes. A single submission wins by forfeit; if neither player submits a knockout quiz, a draw lot decides who advances.</li>
          <li>Tournament quiz scores affect tournament results only, not your main-game leaderboard or private leagues. Configured prizes are credited automatically after the final.</li>
        </ol>
      </>
    ) : (
      <>
        <p>Every season has up to 20 registered players and is scheduled to begin on the date set by the admin.</p>
        <ol>
          <li>Fixtures are generated as a double round-robin. With 20 players, that is 38 daily gameweeks.</li>
          <li>Each gameweek, both opponents receive the same tournament quiz and have until it closes to submit once.</li>
          <li>The player with the higher quiz score wins 3 league points. A tied score earns each player 1 point.</li>
          <li>If only one opponent submits, that player wins by forfeit (3 points); if neither submits, no league points are awarded.</li>
          <li>Quiz points stay separate from main-game and private-league scores. Standings use league points, then quiz point difference.</li>
          <li>After the final gameweek, the season ends and the highest-ranked player(s) are announced as champion(s). Configured place prizes are credited automatically; tied players each receive the full reward for their place.</li>
        </ol>
      </>
    )}
  </div>
);

interface TournamentPageProps {
  onUnreadCountChange: (count: number) => void;
}

export const TournamentPage: React.FC<TournamentPageProps> = ({ onUnreadCountChange }) => {
  const { user, refreshUser } = useAuth();
  const refreshUserRef = useRef(refreshUser);
  const { playSound } = useGameSound();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [detail, setDetail] = useState<TournamentDetail | null>(null);
  const [activeTournamentId, setActiveTournamentId] = useState<string | null>(null);
  const [screen, setScreen] = useState<TournamentScreen>('list');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [registeringId, setRegisteringId] = useState<string | null>(null);
  const [isQuizLoading, setIsQuizLoading] = useState(false);
  const [alert, setAlert] = useState<{ message: string; type: AlertType } | null>(null);
  const [showRules, setShowRules] = useState(false);
  const [rulesTournamentType, setRulesTournamentType] = useState<Tournament['tournament_type']>('league');

  const [activeQuiz, setActiveQuiz] = useState<Quiz | null>(null);
  const [quizResults, setQuizResults] = useState<QuizResponse | null>(null);
  const [showQuiz, setShowQuiz] = useState(false);
  const [quizStarted, setQuizStarted] = useState(false);
  const [quizSubmitting, setQuizSubmitting] = useState(false);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<TournamentAnswer[]>([]);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const timeRemainingRef = useRef(0);
  const quizSubmittingRef = useRef(false);
  const refreshedCompletionRef = useRef<string | null>(null);

  useEffect(() => {
    refreshUserRef.current = refreshUser;
  }, [refreshUser]);

  const fetchTournaments = useCallback(async () => {
    const response = await apiService.get<Tournament[]>('/tournaments');
    if (!response.success || !Array.isArray(response.data)) {
      throw new Error(response.error || 'Could not load tournaments.');
    }
    setTournaments(response.data);
    onUnreadCountChange(
      response.data.reduce((total, tournament) => total + (tournament.unanswered_quiz_count || 0), 0)
    );
  }, [onUnreadCountChange]);

  const fetchDetail = useCallback(async (tournamentId: string, showSpinner = false) => {
    if (showSpinner) setIsRefreshing(true);
    try {
      const response = await apiService.get<TournamentDetail>(`/tournaments/${tournamentId}`);
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Could not load tournament details.');
      }
      setDetail(response.data);
      return response.data;
    } finally {
      if (showSpinner) setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchTournaments()
      .catch((error: unknown) => {
        console.error('Could not load tournaments:', error);
        setAlert({
          message: error instanceof Error ? error.message : 'Could not load tournaments.',
          type: 'error',
        });
      })
      .finally(() => setIsLoading(false));
  }, [fetchTournaments]);

  useEffect(() => {
    let mounted = true;
    const load = () => {
      if (activeTournamentId) {
        fetchDetail(activeTournamentId).catch((error: unknown) => {
          if (!mounted) return;
          console.error('Could not refresh tournament:', error);
          setAlert({
            message: error instanceof Error ? error.message : 'Could not refresh tournament.',
            type: 'error',
          });
        });
      }
      fetchTournaments().catch((error: unknown) => {
        if (mounted) console.error('Could not refresh tournament list:', error);
      });
    };
    if (activeTournamentId) load();
    const interval = window.setInterval(load, 30000);
    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, [activeTournamentId, fetchDetail, fetchTournaments]);

  useEffect(() => {
    const tournament = detail?.tournament;
    if (tournament?.status !== 'completed') return;

    const seasonKey = `${tournament.id}:${tournament.season || 1}`;
    if (refreshedCompletionRef.current === seasonKey) return;
    refreshedCompletionRef.current = seasonKey;
    void refreshUserRef.current();
  }, [detail?.tournament.id, detail?.tournament.status, detail?.tournament.season]);

  const openTournament = async (tournamentId: string) => {
    setDetail(null);
    setActiveTournamentId(tournamentId);
    setScreen('game');
    setIsRefreshing(true);
    try {
      await fetchDetail(tournamentId);
    } catch (error) {
      console.error('Could not open tournament:', error);
      setAlert({
        message: error instanceof Error ? error.message : 'Could not open tournament.',
        type: 'error',
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleRegister = async (tournament: Tournament) => {
    setRegisteringId(tournament.id);
    try {
      const response = await apiService.post(`/tournaments/${tournament.id}/register`, {});
      if (!response.success) {
        setAlert({ message: response.error || 'Registration failed.', type: 'error' });
        return;
      }
      await refreshUser();
      await fetchTournaments();
      await openTournament(tournament.id);
      setAlert({
        message: tournament.entry_fee
          ? `You're in! ${tournament.entry_fee} Footy Coins were deducted.`
          : 'You are registered. Good luck this season!',
        type: 'success',
      });
    } catch (error) {
      console.error('Tournament registration failed:', error);
      setAlert({ message: 'Could not register for the tournament.', type: 'error' });
    } finally {
      setRegisteringId(null);
    }
  };

  const startQuiz = async (quiz: Quiz) => {
    if (!detail?.registered) {
      setAlert({ message: 'Register for this tournament to play its quiz.', type: 'warning' });
      return;
    }
    if (quiz.already_played) {
      setAlert({ message: 'You have already submitted this gameweek quiz.', type: 'warning' });
      return;
    }
    setIsQuizLoading(true);
    try {
      const fullQuizResponse = await apiService.get<Quiz>(`/quizzes/${quiz.id}`);
      if (!fullQuizResponse.success || !fullQuizResponse.data) {
        throw new Error(fullQuizResponse.error || 'Could not load the tournament quiz.');
      }
      const startResponse = await apiService.post(`/quizzes/${quiz.id}/start`, {});
      if (!startResponse.success) {
        throw new Error(startResponse.error || 'Could not start the tournament quiz.');
      }
      setActiveQuiz(fullQuizResponse.data);
      setQuizResults(null);
      setAnswers([]);
      setCurrentQuestionIndex(0);
      setSelectedAnswer(null);
      setIsAnswered(false);
      setTimeRemaining(quiz.time_limit_seconds);
      timeRemainingRef.current = quiz.time_limit_seconds;
      setQuizStarted(true);
      setShowQuiz(true);
    } catch (error) {
      console.error('Could not start tournament quiz:', error);
      setAlert({
        message: error instanceof Error ? error.message : 'Could not start tournament quiz.',
        type: 'error',
      });
    } finally {
      setIsQuizLoading(false);
    }
  };

  const submitTournamentQuiz = useCallback(async (
    answersToSubmit: TournamentAnswer[],
    secondsRemaining = timeRemainingRef.current,
  ) => {
    if (!activeQuiz || quizSubmittingRef.current) return;
    quizSubmittingRef.current = true;
    setQuizSubmitting(true);
    try {
      const response = await apiService.post<QuizResponse>(`/quizzes/${activeQuiz.id}/submit`, {
        answers: answersToSubmit.map((answer) => ({
          question_id: answer.questionId,
          selected_option_id: answer.answerId,
          answer_text: answer.answerText || answer.answerId,
        })),
        time_taken_seconds: activeQuiz.time_limit_seconds - secondsRemaining,
      });
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Could not submit tournament quiz.');
      }
      setQuizResults(response.data);
      setQuizStarted(false);
      await fetchDetail(activeQuiz.tournament_id || activeTournamentId || '');
      try {
        await fetchTournaments();
      } catch (error) {
        console.error('Could not refresh tournament unread counts:', error);
      }
    } catch (error) {
      console.error('Could not submit tournament quiz:', error);
      setQuizStarted(false);
      setShowQuiz(false);
      setAlert({
        message: error instanceof Error ? error.message : 'Could not submit tournament quiz.',
        type: 'error',
      });
    } finally {
      quizSubmittingRef.current = false;
      setQuizSubmitting(false);
    }
  }, [activeQuiz, activeTournamentId, fetchDetail, fetchTournaments, playSound]);

  useEffect(() => {
    if (quizResults) playSound('complete');
  }, [playSound, quizResults]);

  useEffect(() => {
    if (!quizStarted || !activeQuiz) return undefined;
    const interval = window.setInterval(() => {
      setTimeRemaining((remaining) => {
        if (remaining <= 1) {
          window.clearInterval(interval);
          setQuizStarted(false);
          timeRemainingRef.current = 0;
          void submitTournamentQuiz(answers, 0);
          return 0;
        }
        const next = remaining - 1;
        timeRemainingRef.current = next;
        return next;
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [quizStarted, activeQuiz, answers, submitTournamentQuiz]);

  const recordAnswer = (answerId: string, isCorrect: boolean, answerText?: string) => {
    if (!activeQuiz?.questions?.length || isAnswered) return;
    playSound(isCorrect ? 'correct' : 'incorrect');
    const question = activeQuiz.questions[currentQuestionIndex];
    const updatedAnswers = [
      ...answers,
      { questionId: question.id, answerId, answerText, isCorrect },
    ];
    setAnswers(updatedAnswers);
    setSelectedAnswer(answerId);
    setIsAnswered(true);
    window.setTimeout(() => {
      const lastQuestion = currentQuestionIndex >= activeQuiz.questions!.length - 1;
      if (lastQuestion) {
        setQuizStarted(false);
        void submitTournamentQuiz(updatedAnswers);
      } else {
        setCurrentQuestionIndex((index) => index + 1);
        setSelectedAnswer(null);
        setIsAnswered(false);
      }
    }, 1100);
  };

  const closeQuiz = () => {
    setShowQuiz(false);
    setQuizStarted(false);
    setQuizResults(null);
    setActiveQuiz(null);
    setAnswers([]);
    setSelectedAnswer(null);
    setIsAnswered(false);
    setCurrentQuestionIndex(0);
    timeRemainingRef.current = 0;
    quizSubmittingRef.current = false;
  };

  if (isLoading) return <Loading message="Loading tournaments..." />;

  const currentUserStanding = detail?.user_standing;
  const completedFixture = detail?.current_fixture?.status === 'completed';
  const userEliminated = !!detail && detail.tournament.tournament_type === 'group_knockout'
    && detail.fixtures.some((fixture) => (
      fixture.stage === 'knockout'
      && fixture.status === 'completed'
      && (fixture.player?.id === user?.id || fixture.opponent?.id === user?.id)
      && fixture.winner_user_id !== user?.id
    ));

  return (
    <main className={`tournament-page ${screen === 'list' ? 'tournament-page-list' : ''}`}>
      {alert && <Alert message={alert.message} type={alert.type} onClose={() => setAlert(null)} />}

      {screen === 'list' ? (
        <>
          <header className="tournament-page-header">
            <div>
              <span className="tournament-kicker">FOOTY IQ / COMPETITIONS</span>
              <h1>Tournaments</h1>
              <p>One season. Daily duels. A place in the history books.</p>
            </div>
            <div className="tournament-header-emblem" aria-hidden="true"><Trophy size={25} /></div>
          </header>

          {tournaments.length === 0 ? (
            <section className="tournament-empty-state">
              <span className="tournament-empty-mark"><Trophy size={30} /></span>
              <span className="tournament-empty-overline">THE LEAGUE DESK</span>
              <h2>No available tournaments</h2>
              <p>Check back later. New competitions will appear here when registration opens.</p>
            </section>
          ) : (
            <section className="tournament-list" aria-label="Available tournaments">
              {tournaments.map((tournament, index) => {
                const supported = tournament.available;
                const isFull = tournament.registered_count >= tournament.max_players;
                const canRegister = supported && tournament.status === 'registration'
                  && !isFull && !tournament.registered;
                const isBusy = registeringId === tournament.id;
                return (
                  <article
                    className={`tournament-card ${!supported ? 'tournament-card-draft' : ''} ${tournament.unanswered_quiz_count ? 'tournament-card-unread' : ''}`}
                    key={tournament.id}
                  >
                    <div className="tournament-card-topline">
                      <span className="tournament-card-index">SEASON {String(index + 1).padStart(2, '0')}</span>
                      <span className={`tournament-status tournament-status-${tournament.status}`}>
                        {tournament.status === 'registration' ? 'REGISTRATION OPEN'
                          : tournament.status === 'starting' ? 'DRAW IN PROGRESS'
                            : tournament.status === 'cancelling' ? 'CANCELLING'
                          : tournament.status === 'active' ? 'SEASON LIVE'
                            : tournament.status === 'completed' ? 'SEASON COMPLETE'
                              : tournament.status === 'cancelled' ? 'CANCELLED'
                                : tournament.status === 'renewal' ? 'RESTART SCHEDULED' : 'DRAFT'}
                      </span>
                    </div>
                    <div className="tournament-card-main">
                      <div className="tournament-card-copy">
                        <span className="tournament-format-tag">
                          {tournament.tournament_type === 'league' ? '1v1 league' : 'group stage + knockout'}
                        </span>
                        <h2>{tournament.name}</h2>
                        {!!tournament.unanswered_quiz_count && (
                          <span className="tournament-unanswered-badge">
                            <span className="tournament-unanswered-dot" aria-hidden="true" />
                            {tournament.unanswered_quiz_count}{' '}
                            {tournament.unanswered_quiz_count === 1 ? 'quiz' : 'quizzes'} waiting
                          </span>
                        )}
                        <p>{tournament.description || 'A new Footy IQ season is ready for challengers.'}</p>
                      </div>
                      <div className="tournament-card-crest" aria-hidden="true">
                        {tournament.status === 'completed' || tournament.status === 'renewal'
                          ? <Crown size={25} /> : <Trophy size={25} />}
                      </div>
                    </div>
                    <div className="tournament-card-meta">
                      <span><Users size={15} /> {tournament.registered_count}/{tournament.max_players} players</span>
                      <span><CalendarDays size={15} /> {formatDate(tournament.start_at)}</span>
                      <span className="tournament-entry-price">
                        <Coins size={15} /> {tournament.entry_fee === 0 ? 'Free entry' : `${tournament.entry_fee} coins`}
                      </span>
                    </div>
                    <TournamentPrizeList tournament={tournament} />
                    <div className="tournament-card-actions">
                      {supported ? (
                        <button
                          type="button"
                          className="tournament-rules-button"
                          onClick={() => {
                            setRulesTournamentType(tournament.tournament_type);
                            setShowRules(true);
                          }}
                        >
                          <ShieldCheck size={16} /> View rules
                        </button>
                      ) : (
                        <button type="button" className="tournament-rules-button" disabled>
                          <ShieldCheck size={16} /> Rules pending
                        </button>
                      )}
                      {!supported ? (
                        <button type="button" className="tournament-primary-button" disabled>
                          Format unavailable
                        </button>
                      ) : tournament.registered ? (
                        <button
                          type="button"
                          className="tournament-primary-button"
                          onClick={() => void openTournament(tournament.id)}
                        >
                          {tournament.status === 'completed' ? 'View final table' : 'Open tournament'}
                          <ChevronRight size={17} />
                        </button>
                      ) : canRegister ? (
                        <button
                          type="button"
                          className="tournament-primary-button"
                          onClick={() => void handleRegister(tournament)}
                          disabled={isBusy || (tournament.entry_fee > 0 && (user?.footy_coins || 0) < tournament.entry_fee)}
                        >
                          {isBusy ? 'Registering…' : tournament.entry_fee === 0 ? 'Register free' : `Register · ${tournament.entry_fee} coins`}
                          {!isBusy && <ChevronRight size={17} />}
                        </button>
                      ) : (
                        <button type="button" className="tournament-primary-button" disabled>
                          {tournament.status === 'registration' && isFull ? 'Tournament full' : 'Registration closed'}
                        </button>
                      )}
                    </div>
                    {canRegister && tournament.entry_fee > 0 && (user?.footy_coins || 0) < tournament.entry_fee && (
                      <p className="tournament-insufficient-coins">You need more Footy Coins to enter.</p>
                    )}
                  </article>
                );
              })}
            </section>
          )}
        </>
      ) : (
        <section className="tournament-detail-view">
          <button type="button" className="tournament-back-button" onClick={() => setScreen('list')}>
            <ArrowLeft size={16} /> All tournaments
          </button>
          {isRefreshing && !detail ? (
            <Loading message="Opening tournament..." />
          ) : detail ? (
            <>
              <header className="tournament-detail-header">
                <span className="tournament-kicker">
                  {detail.tournament.status === 'active'
                    ? detail.tournament.tournament_type === 'group_knockout'
                      ? `${detail.current_fixture?.round_name || 'TOURNAMENT'} / ROUND ${detail.current_gameweek}`
                      : `GAMEWEEK ${detail.current_gameweek} / ${detail.tournament.total_gameweeks}`
                    : 'SEASON CENTRE'}
                </span>
                <h1>{detail.tournament.name}</h1>
                <p>{detail.tournament.description || 'The daily duel league.'}</p>
                <div className="tournament-detail-meta">
                  <span><Users size={15} /> {detail.tournament.registered_count} players</span>
                  <span><CalendarDays size={15} /> Starts {formatDate(detail.tournament.start_at)}</span>
                  <button
                    type="button"
                    className="tournament-rules-button"
                    onClick={() => {
                      setRulesTournamentType(detail.tournament.tournament_type);
                      setShowRules(true);
                    }}
                  >
                    <ShieldCheck size={15} /> Rules
                  </button>
                </div>
                <TournamentPrizeList tournament={detail.tournament} />
              </header>

              {!detail.registered ? (
                <div className="tournament-waiting-card">
                  <Users size={23} />
                  <h2>Registration required</h2>
                  <p>
                    {detail.tournament.status === 'renewal'
                      ? 'The new season roster is being confirmed. Check your renewal prompt to choose whether to play.'
                      : 'Join this season from the tournament list to see its game, table, and fixtures.'}
                  </p>
                  <button type="button" className="tournament-back-button" onClick={() => setScreen('list')}>
                    Back to registration
                  </button>
                </div>
              ) : (
                <>
                  <nav
                    className={`tournament-subnav ${detail.tournament.tournament_type === 'group_knockout' ? 'tournament-subnav-groups' : ''}`}
                    aria-label="Tournament sections"
                  >
                    <button className={screen === 'game' ? 'active' : ''} onClick={() => setScreen('game')} type="button">Game</button>
                    <button className={screen === 'fixtures' ? 'active' : ''} onClick={() => setScreen('fixtures')} type="button">Fixtures</button>
                    <button className={screen === 'table' ? 'active' : ''} onClick={() => setScreen('table')} type="button">
                      {detail.tournament.tournament_type === 'group_knockout' ? 'Groups' : 'League table'}
                    </button>
                    {detail.tournament.tournament_type === 'group_knockout' && (
                      <button className={screen === 'bracket' ? 'active' : ''} onClick={() => setScreen('bracket')} type="button">
                        Road to final
                      </button>
                    )}
                  </nav>

                  {screen === 'game' && (
                    <div className="tournament-game-view">
                      {detail.tournament.status === 'registration' && (
                        <div className="tournament-waiting-card">
                          <Clock3 size={22} />
                          <h2>{detail.tournament.tournament_type === 'group_knockout' ? 'The draw awaits 32 players' : 'Season starts soon'}</h2>
                          <p>
                            {detail.tournament.tournament_type === 'group_knockout'
                              ? `The groups are drawn at ${formatDate(detail.tournament.start_at)}. If all 32 places are not filled, registration fees will be refunded.`
                              : `Your place is saved. The first fixtures unlock at ${formatDate(detail.tournament.start_at)}.`}
                          </p>
                        </div>
                      )}
                      {detail.tournament.status === 'cancelled' && (
                        <div className="tournament-waiting-card tournament-cancelled-card">
                          <ShieldCheck size={22} />
                          <h2>Tournament cancelled</h2>
                          <p>All 32 places were not filled before kick-off. Any entry fee has been refunded.</p>
                        </div>
                      )}
                      {detail.tournament.status === 'active' && (
                        <>
                          <section className="tournament-game-section">
                            <div className="tournament-section-heading">
                              <span className="tournament-section-kicker">
                                {userEliminated
                                  ? 'TOURNAMENT RUN COMPLETE'
                                  : detail.tournament.tournament_type === 'group_knockout'
                                  ? detail.current_fixture?.round_name || 'TOURNAMENT FIXTURE'
                                  : "TODAY'S DUEL"}
                              </span>
                              <span className="tournament-gameweek-chip">
                                {detail.current_fixture?.group_name
                                  ? `GROUP ${detail.current_fixture.group_name} · `
                                  : ''}
                                GW {detail.current_gameweek}
                              </span>
                            </div>
                            {userEliminated ? (
                              <div className="tournament-no-quiz">
                                <Trophy size={20} />
                                <div><strong>Your knockout run is complete</strong><span>See your final position and follow the remaining teams on the road to the final.</span></div>
                              </div>
                            ) : detail.live_quiz ? (
                              <QuizCard
                                quiz={detail.live_quiz}
                                onStartClick={startQuiz}
                                isLoading={isQuizLoading}
                              />
                            ) : (
                              <div className="tournament-no-quiz">
                                <Clock3 size={20} />
                                <div><strong>Quiz not posted yet</strong><span>Today's tournament quiz will appear here when the admin schedules it.</span></div>
                              </div>
                            )}
                          </section>

                          <section className="tournament-standing-card">
                            <div className="tournament-standing-icon"><ListOrdered size={20} /></div>
                            <div className="tournament-standing-content">
                              <span className="tournament-section-kicker">
                                {detail.tournament.tournament_type === 'group_knockout'
                                  ? `YOUR GROUP${currentUserStanding?.group_name ? ` · ${currentUserStanding.group_name}` : ''}`
                                  : 'YOUR SEASON'}
                              </span>
                              <div className="tournament-standing-stats">
                                <span><strong>{currentUserStanding?.points ?? 0}</strong><small>PTS</small></span>
                                <span><strong>{currentUserStanding?.matches_played ?? 0}</strong><small>MP</small></span>
                                <span><strong>{currentUserStanding?.wins ?? 0}-{currentUserStanding?.draws ?? 0}-{currentUserStanding?.losses ?? 0}</strong><small>W-D-L</small></span>
                              </div>
                            </div>
                            <div className="tournament-rank-block">
                              <strong>{currentUserStanding ? `#${currentUserStanding.rank}` : '—'}</strong>
                              <span>
                                of {detail.tournament.tournament_type === 'group_knockout'
                                  ? '4'
                                  : detail.tournament.registered_count}
                              </span>
                            </div>
                            <button type="button" className="tournament-inline-link" onClick={() => setScreen('table')}>
                            {detail.tournament.tournament_type === 'group_knockout' ? 'View groups' : 'View table'} <ChevronRight size={15} />
                            </button>
                          </section>

                          <section className="tournament-fixture-card">
                            <div className="tournament-section-heading">
                              <span className="tournament-section-kicker">YOUR FIXTURE</span>
                              <span className={`tournament-fixture-state ${completedFixture ? 'complete' : ''}`}>
                                {completedFixture ? 'FINAL' : 'TODAY'}
                              </span>
                            </div>
                            {userEliminated ? (
                              <div className="tournament-bye-state">
                                <span className="tournament-bye-icon"><Trophy size={22} /></span>
                                <div><strong>Knockout stage complete for you</strong><p>Follow the remaining fixtures in the road to the final.</p></div>
                              </div>
                            ) : !detail.current_fixture || !detail.current_fixture.opponent ? (
                              <div className="tournament-bye-state">
                                <span className="tournament-bye-icon"><CalendarDays size={22} /></span>
                                <div><strong>Bye week</strong><p>You have no opponent in GW {detail.current_gameweek}. Your next fixture is in the schedule.</p></div>
                              </div>
                            ) : (
                              <div className="tournament-matchup">
                                <div className="tournament-match-player">
                                  <ProfileImage name={detail.current_fixture.player?.name || 'You'} photoUrl={detail.current_fixture.player?.photo_url} />
                                  <strong>{detail.current_fixture.player?.name || 'You'}</strong>
                                  <span>{detail.current_fixture.player_submitted ? 'Quiz submitted' : 'Awaiting your quiz'}</span>
                                </div>
                                <div className="tournament-scoreline">
                                  <span>{detail.current_fixture.player_score ?? '—'}</span>
                                  <Swords size={16} />
                                  <span>{detail.current_fixture.opponent_score ?? '—'}</span>
                                </div>
                                <div className="tournament-match-player">
                                  <ProfileImage name={detail.current_fixture.opponent.name} photoUrl={detail.current_fixture.opponent.photo_url} />
                                  <strong>{detail.current_fixture.opponent.name}</strong>
                                  <span>{detail.current_fixture.opponent_submitted ? 'Quiz submitted' : 'Awaiting opponent'}</span>
                                </div>
                              </div>
                            )}
                            <button type="button" className="tournament-wide-link" onClick={() => setScreen('fixtures')}>
                            View tournament fixtures <ChevronRight size={16} />
                            </button>
                          </section>
                        </>
                      )}
                      {(detail.tournament.status === 'completed' || detail.tournament.status === 'renewal') && (
                        <section className="tournament-champion-banner">
                          <Crown size={26} />
                          <div>
                            <span className="tournament-section-kicker">
                              {detail.tournament.status === 'renewal'
                                ? 'NEXT SEASON SCHEDULED'
                                : 'SEASON COMPLETE'}
                            </span>
                            <h2>
                              {(detail.tournament.tournament_type === 'group_knockout'
                                ? detail.final_standings
                                : detail.standings)[0]?.name || 'Final table published'}
                            </h2>
                            <p>
                              {detail.tournament.status === 'renewal'
                                ? `Restart · ${formatDate(detail.tournament.start_at)}`
                                : detail.tournament.tournament_type === 'group_knockout'
                                  ? 'Tournament champion · knockout final'
                                  : `Champion · ${detail.standings[0]?.points ?? 0} league points`}
                            </p>
                          </div>
                          <button type="button" onClick={() => setScreen('table')}>Final table <ChevronRight size={16} /></button>
                        </section>
                      )}
                    </div>
                  )}

                  {screen === 'fixtures' && (
                    <section className="tournament-fixtures-view">
                      <div className="tournament-page-section-title">
                        <div>
                          <span className="tournament-section-kicker">SEASON SCHEDULE</span>
                          <h2>{detail.tournament.tournament_type === 'group_knockout' ? 'All fixtures' : 'Fixtures'}</h2>
                        </div>
                        <span>
                          {detail.tournament.tournament_type === 'group_knockout'
                            ? `${detail.fixtures.length} matches`
                            : `${detail.fixtures.length} gameweeks`}
                        </span>
                      </div>
                      {detail.fixtures.length === 0 ? (
                        <div className="tournament-no-quiz"><Clock3 size={20} /><div><strong>Fixtures are being prepared</strong><span>They will appear when the season starts.</span></div></div>
                      ) : (
                        <div className="tournament-fixture-list">
                          {detail.fixtures.map((fixture) => (
                            <article className={`tournament-fixture-row ${fixture.gameweek === detail.current_gameweek ? 'current' : ''}`} key={fixture.id}>
                              <div className="tournament-fixture-row-meta">
                                <strong>
                                  {fixture.group_name
                                    ? `GROUP ${fixture.group_name} · LEG ${fixture.leg || 1}`
                                    : fixture.round_name || `GW ${fixture.gameweek}`}
                                </strong>
                                <span>{fixture.result === 'bye' || fixture.status === 'bye' ? 'Bye' : fixture.status === 'completed' ? fixture.result === 'forfeit' ? 'Forfeit' : fixture.result === 'draw' ? 'Draw' : fixture.result === null ? 'No result' : 'Final' : 'Scheduled'}</span>
                                {fixture.scheduled_at && <time>{formatDate(fixture.scheduled_at)}</time>}
                              </div>
                              <div className="tournament-fixture-row-match">
                                <span>{fixture.player?.name || 'TBD'}</span>
                                {fixture.opponent ? (
                                  <>
                                    <strong>{fixture.player_score ?? '—'} <i>:</i> {fixture.opponent_score ?? '—'}</strong>
                                    <span>{fixture.opponent.name}</span>
                                  </>) : (
                                  <strong className="tournament-bye-label">
                                    {fixture.status === 'pending' ? 'VS TBD' : 'BYE'}
                                  </strong>
                                )}
                              </div>
                            </article>
                          ))}
                        </div>
                      )}
                    </section>
                  )}

                  {screen === 'table' && (
                    <section className="tournament-table-view">
                      <div className="tournament-page-section-title">
                        <div>
                          <span className="tournament-section-kicker">SEASON STANDINGS</span>
                          <h2>{detail.tournament.tournament_type === 'group_knockout' ? 'Group tables' : 'League table'}</h2>
                        </div>
                        <span>GW {detail.current_gameweek || '—'} / {detail.tournament.total_gameweeks}</span>
                      </div>
                      {detail.tournament.tournament_type === 'group_knockout' ? (
                        detail.groups.some((group) => group.standings.length > 0) ? (
                          <div className="tournament-groups-grid">
                            {detail.groups.map((group) => (
                              <section className="tournament-group-card" key={group.name}>
                                <div className="tournament-group-heading">
                                  <span>GROUP {group.name}</span>
                                  <small>TOP 2 ADVANCE</small>
                                </div>
                                <div className="tournament-group-table-wrap">
                                  <table className="tournament-group-table">
                                    <thead>
                                      <tr><th>Pos</th><th>Player</th><th>Pts</th><th>MP</th><th>GD</th></tr>
                                    </thead>
                                    <tbody>
                                      {group.standings.map((standing) => (
                                        <tr
                                          className={`${standing.user_id === user?.id ? 'current-player' : ''} ${standing.rank <= 2 ? 'qualifying' : ''}`}
                                          key={standing.user_id}
                                        >
                                          <td><span className="tournament-position">{standing.rank}</span></td>
                                          <td className="tournament-table-player">
                                            <ProfileImage name={standing.name} photoUrl={standing.photo_url} className="small" />
                                            <strong>{standing.user_id === user?.id ? 'You' : standing.name}</strong>
                                          </td>
                                          <td className="standings-points">{standing.points}</td>
                                          <td>{standing.matches_played}</td>
                                          <td className={standing.point_difference > 0 ? 'positive' : standing.point_difference < 0 ? 'negative' : ''}>
                                            {standing.point_difference > 0 ? '+' : ''}{standing.point_difference}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                  {group.standings.length === 0 && <p className="tournament-group-empty">Group draw at kick-off</p>}
                                </div>
                              </section>
                            ))}
                          </div>
                        ) : (
                          <div className="tournament-no-quiz">
                            <ListOrdered size={20} />
                            <div><strong>Groups are waiting for kick-off</strong><span>All 32 registered players are drawn into eight groups when the tournament begins.</span></div>
                          </div>
                        )
                      ) : detail.standings.length === 0 ? (
                        <div className="tournament-no-quiz"><ListOrdered size={20} /><div><strong>Table is ready for kick-off</strong><span>Standings will update as fixtures are completed.</span></div></div>
                      ) : (
                        <div className="tournament-table-scroll">
                          <table className="tournament-table">
                            <thead>
                              <tr><th>Pos</th><th>Player</th><th>Pts</th><th>MP</th><th>GW</th><th>W</th><th>D</th><th>L</th><th>PD</th><th>Prize</th></tr>
                            </thead>
                            <tbody>
                              {detail.standings.map((standing) => (
                                <tr className={standing.user_id === user?.id ? 'current-player' : ''} key={standing.user_id}>
                                  <td>
                                    <span className={`tournament-position ${standing.rank === 1 && detail.tournament.status !== 'active' ? 'first' : ''}`}>
                                      {standing.rank === 1 && detail.tournament.status !== 'active' ? <Crown size={14} /> : standing.rank}
                                    </span>
                                  </td>
                                  <td className="tournament-table-player">
                                    <ProfileImage name={standing.name} photoUrl={standing.photo_url} className="small" />
                                    <strong>{standing.user_id === user?.id ? 'You' : standing.name}</strong>
                                  </td>
                                  <td className="standings-points">{standing.points}</td>
                                  <td>{standing.matches_played}</td>
                                  <td>{standing.gameweeks_played}</td>
                                  <td>{standing.wins}</td>
                                  <td>{standing.draws}</td>
                                  <td>{standing.losses}</td>
                                  <td className={standing.point_difference > 0 ? 'positive' : standing.point_difference < 0 ? 'negative' : ''}>
                                    {standing.point_difference > 0 ? '+' : ''}{standing.point_difference}
                                  </td>
                                  <td className="tournament-table-prize">
                                    {rewardForPlace(detail.tournament, standing.rank) > 0
                                      ? `${rewardForPlace(detail.tournament, standing.rank).toLocaleString()} coins`
                                      : '—'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                      <p className="tournament-table-note">MP = completed head-to-head fixtures · GW = completed gameweeks, including bye weeks · PD = quiz points for minus quiz points against.</p>
                    </section>
                  )}

                  {screen === 'bracket' && (
                    <section className="tournament-bracket-view">
                      <div className="tournament-page-section-title">
                        <div><span className="tournament-section-kicker">THE ELIMINATION RUN</span><h2>Road to the final</h2></div>
                        <span>8 → 1 champion</span>
                      </div>
                      <p className="tournament-bracket-intro">
                        Group winners meet runners-up in a random draw. Every knockout is one match; winners advance.
                      </p>
                      <div className="tournament-bracket-rounds">
                        {detail.road_to_final.map((round) => (
                          <section className="tournament-bracket-round" key={round.name}>
                            <div className="tournament-bracket-round-heading">
                              <strong>{round.name}</strong>
                              <span>GAMEWEEK {round.gameweek}</span>
                            </div>
                            <div className={`tournament-bracket-matches tournament-bracket-matches-${round.fixtures.length}`}>
                              {round.fixtures.map((fixture) => (
                                <article
                                  className={`tournament-bracket-match ${fixture.status === 'completed' ? 'complete' : ''}`}
                                  key={fixture.id}
                                >
                                  {[fixture.player, fixture.opponent].map((player, playerIndex) => {
                                    const score = playerIndex === 0 ? fixture.player_score : fixture.opponent_score;
                                    const isWinner = !!player && fixture.winner_user_id === player.id;
                                    return (
                                      <div className={`tournament-bracket-player ${isWinner ? 'winner' : ''}`} key={`${fixture.id}-${playerIndex}`}>
                                        <ProfileImage
                                          name={player?.name || 'TBD'}
                                          photoUrl={player?.photo_url}
                                          className="small"
                                        />
                                        <strong>{player?.name || 'Awaiting qualifier'}</strong>
                                        <span>{player ? score ?? '—' : '—'}</span>
                                      </div>
                                    );
                                  })}
                                  <small className="tournament-bracket-status">
                                    {fixture.status === 'completed'
                                      ? fixture.tiebreak_method === 'draw_lots' || fixture.tiebreak_method === 'double_forfeit_draw'
                                        ? 'DECIDED BY DRAW LOT'
                                        : fixture.tiebreak_method
                                          ? `ADVANCED · ${fixture.tiebreak_method.toUpperCase()} TIE-BREAK`
                                          : 'ADVANCED'
                                      : fixture.status === 'scheduled' ? 'SINGLE-LEG TIE' : 'PENDING'}
                                  </small>
                                </article>
                              ))}
                            </div>
                          </section>
                        ))}
                      </div>
                    </section>
                  )}
                </>
              )}
            </>
          ) : (
            <Loading message="Loading tournament..." />
          )}
        </section>
      )}

      <Modal
        isOpen={showRules}
        onClose={() => setShowRules(false)}
        title={rulesTournamentType === 'group_knockout' ? 'Group + knockout rules' : '1v1 league rules'}
      >
        {formatRules(rulesTournamentType)}
      </Modal>

      <Modal
        isOpen={showQuiz}
        onClose={() => {
          if (!quizStarted && !quizSubmitting) closeQuiz();
        }}
        title={quizResults ? 'Duel submitted' : activeQuiz?.name || 'Tournament quiz'}
        closeButton={(!quizStarted && !quizSubmitting) || !!quizResults}
      >
        {!quizResults && quizStarted && activeQuiz?.questions?.[currentQuestionIndex] && (
          <div className="tournament-quiz-modal">
            <div className="tournament-quiz-timer"><Clock3 size={15} /> {Math.floor(timeRemaining / 60)}:{String(timeRemaining % 60).padStart(2, '0')}</div>
            <QuizQuestion
              question={activeQuiz.questions[currentQuestionIndex]}
              currentIndex={currentQuestionIndex}
              totalQuestions={activeQuiz.questions.length}
              selectedOptionId={selectedAnswer}
              isAnswered={isAnswered}
              isCorrect={selectedAnswer ? answers[currentQuestionIndex]?.isCorrect ?? null : null}
              onOptionSelect={(optionId) => {
                const question = activeQuiz.questions![currentQuestionIndex];
                recordAnswer(optionId, optionId === question.correct_option_id);
              }}
              onTextAnswerSubmit={(text, isCorrect) => recordAnswer(text, isCorrect, text)}
            />
          </div>
        )}
        {quizSubmitting && <p className="tournament-submit-progress">Saving your duel score…</p>}
        {quizResults && (
          <div className="tournament-quiz-result">
            <span className="tournament-result-icon"><CheckCircle2 size={28} /></span>
            <span className="tournament-section-kicker">GW {quizResults.gameweek || detail?.current_gameweek} SCORE</span>
            <strong>{quizResults.points_earned}<small> quiz points</small></strong>
            <p>{quizResults.correct_answers} of {quizResults.total_questions} correct · Your opponent will be notified.</p>
            <button className="tournament-primary-button" type="button" onClick={closeQuiz}>Back to tournament</button>
          </div>
        )}
      </Modal>
    </main>
  );
};
