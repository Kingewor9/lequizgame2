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
import { Alert, AlertType } from '../components/Alert';
import { Loading } from '../components/Loading';
import { Modal } from '../components/Modal';
import { QuizCard } from '../components/QuizCard';
import { QuizQuestion } from '../components/QuizQuestion';
import { apiService } from '../services/apiService';
import { Quiz, QuizResponse, Tournament, TournamentFixture, TournamentStanding } from '../types';
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
}

interface TournamentAnswer {
  questionId: string;
  answerId: string;
  answerText?: string;
  isCorrect: boolean;
}

type TournamentScreen = 'list' | 'game' | 'fixtures' | 'table';

const formatDate = (value: string) => new Date(value).toLocaleString([], {
  dateStyle: 'medium',
  timeStyle: 'short',
});

const ProfileImage: React.FC<{ name: string; photoUrl?: string; className?: string }> = ({
  name,
  photoUrl,
  className = '',
}) => (
  <div className={`tournament-avatar ${className}`}>
    {photoUrl ? <img src={photoUrl} alt="" /> : <span>{name.slice(0, 1).toUpperCase()}</span>}
  </div>
);

const formatRules = (
  <div className="tournament-rules">
    <p>Every season has up to 20 registered players and is scheduled to begin on the date set by the admin.</p>
    <ol>
      <li>Fixtures are generated as a double round-robin. With 20 players, that is 38 daily gameweeks.</li>
      <li>Each gameweek, both opponents receive the same tournament quiz and have until it closes to submit once.</li>
      <li>The player with the higher quiz score wins 3 league points. A tied score earns each player 1 point.</li>
      <li>If only one opponent submits, that player wins by forfeit (3 points); if neither submits, no league points are awarded.</li>
      <li>Quiz points stay separate from main-game and private-league scores. Standings use league points, then quiz point difference.</li>
      <li>After the final gameweek, the season ends and the highest-ranked player(s) are announced as champion(s).</li>
    </ol>
  </div>
);

export const TournamentPage: React.FC = () => {
  const { user, refreshUser } = useAuth();
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

  const fetchTournaments = useCallback(async () => {
    const response = await apiService.get<Tournament[]>('/tournaments');
    if (!response.success || !Array.isArray(response.data)) {
      throw new Error(response.error || 'Could not load tournaments.');
    }
    setTournaments(response.data);
  }, []);

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
    if (!activeTournamentId) return undefined;
    let mounted = true;
    const load = () => {
      fetchDetail(activeTournamentId).catch((error: unknown) => {
        if (!mounted) return;
        console.error('Could not refresh tournament:', error);
        setAlert({
          message: error instanceof Error ? error.message : 'Could not refresh tournament.',
          type: 'error',
        });
      });
      fetchTournaments().catch((error: unknown) => {
        console.error('Could not refresh tournament list:', error);
      });
    };
    load();
    const interval = window.setInterval(load, 30000);
    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, [activeTournamentId, fetchDetail, fetchTournaments]);

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
      await fetchTournaments();
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
  }, [activeQuiz, activeTournamentId, fetchDetail, fetchTournaments]);

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
                const supported = tournament.tournament_type === 'league' && tournament.available;
                const isFull = tournament.registered_count >= tournament.max_players;
                const canRegister = supported && tournament.status === 'registration'
                  && !isFull && !tournament.registered;
                const isBusy = registeringId === tournament.id;
                return (
                  <article className={`tournament-card ${!supported ? 'tournament-card-draft' : ''}`} key={tournament.id}>
                    <div className="tournament-card-topline">
                      <span className="tournament-card-index">SEASON {String(index + 1).padStart(2, '0')}</span>
                      <span className={`tournament-status tournament-status-${tournament.status}`}>
                        {tournament.status === 'registration' ? 'REGISTRATION OPEN'
                          : tournament.status === 'active' ? 'SEASON LIVE'
                            : tournament.status === 'completed' ? 'SEASON COMPLETE'
                              : tournament.status === 'cancelled' ? 'CANCELLED' : 'DRAFT'}
                      </span>
                    </div>
                    <div className="tournament-card-main">
                      <div className="tournament-card-copy">
                        <span className="tournament-format-tag">
                          {tournament.tournament_type === 'league' ? '1v1 league' : 'group stage + knockout'}
                        </span>
                        <h2>{tournament.name}</h2>
                        <p>{tournament.description || 'A new Footy IQ season is ready for challengers.'}</p>
                      </div>
                      <div className="tournament-card-crest" aria-hidden="true">
                        {tournament.status === 'completed' ? <Crown size={25} /> : <Trophy size={25} />}
                      </div>
                    </div>
                    <div className="tournament-card-meta">
                      <span><Users size={15} /> {tournament.registered_count}/{tournament.max_players} players</span>
                      <span><CalendarDays size={15} /> {formatDate(tournament.start_at)}</span>
                      <span className="tournament-entry-price">
                        <Coins size={15} /> {tournament.entry_fee === 0 ? 'Free entry' : `${tournament.entry_fee} coins`}
                      </span>
                    </div>
                    <div className="tournament-card-actions">
                      {supported ? (
                        <button type="button" className="tournament-rules-button" onClick={() => setShowRules(true)}>
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
                  {detail.tournament.status === 'active' ? `GAMEWEEK ${detail.current_gameweek} / ${detail.tournament.total_gameweeks}` : 'SEASON CENTRE'}
                </span>
                <h1>{detail.tournament.name}</h1>
                <p>{detail.tournament.description || 'The daily duel league.'}</p>
                <div className="tournament-detail-meta">
                  <span><Users size={15} /> {detail.tournament.registered_count} players</span>
                  <span><CalendarDays size={15} /> Starts {formatDate(detail.tournament.start_at)}</span>
                  <button type="button" className="tournament-rules-button" onClick={() => setShowRules(true)}>
                    <ShieldCheck size={15} /> Rules
                  </button>
                </div>
              </header>

              {!detail.registered ? (
                <div className="tournament-waiting-card">
                  <Users size={23} />
                  <h2>Registration required</h2>
                  <p>Join this season from the tournament list to see its game, table, and fixtures.</p>
                  <button type="button" className="tournament-back-button" onClick={() => setScreen('list')}>
                    Back to registration
                  </button>
                </div>
              ) : (
                <>
                  <nav className="tournament-subnav" aria-label="Tournament sections">
                    <button className={screen === 'game' ? 'active' : ''} onClick={() => setScreen('game')} type="button">Game</button>
                    <button className={screen === 'fixtures' ? 'active' : ''} onClick={() => setScreen('fixtures')} type="button">Fixtures</button>
                    <button className={screen === 'table' ? 'active' : ''} onClick={() => setScreen('table')} type="button">League table</button>
                  </nav>

                  {screen === 'game' && (
                    <div className="tournament-game-view">
                      {detail.tournament.status === 'registration' && (
                        <div className="tournament-waiting-card">
                          <Clock3 size={22} />
                          <h2>Season starts soon</h2>
                          <p>Your place is saved. The first fixtures unlock at {formatDate(detail.tournament.start_at)}.</p>
                        </div>
                      )}
                      {detail.tournament.status === 'active' && (
                        <>
                          <section className="tournament-game-section">
                            <div className="tournament-section-heading">
                              <span className="tournament-section-kicker">TODAY'S DUEL</span>
                              <span className="tournament-gameweek-chip">GW {detail.current_gameweek}</span>
                            </div>
                            {detail.live_quiz ? (
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
                              <span className="tournament-section-kicker">YOUR SEASON</span>
                              <div className="tournament-standing-stats">
                                <span><strong>{currentUserStanding?.points ?? 0}</strong><small>PTS</small></span>
                                <span><strong>{currentUserStanding?.matches_played ?? 0}</strong><small>MP</small></span>
                                <span><strong>{currentUserStanding?.wins ?? 0}-{currentUserStanding?.draws ?? 0}-{currentUserStanding?.losses ?? 0}</strong><small>W-D-L</small></span>
                              </div>
                            </div>
                            <div className="tournament-rank-block">
                              <strong>{currentUserStanding ? `#${currentUserStanding.rank}` : '—'}</strong>
                              <span>of {detail.tournament.registered_count}</span>
                            </div>
                            <button type="button" className="tournament-inline-link" onClick={() => setScreen('table')}>
                              View table <ChevronRight size={15} />
                            </button>
                          </section>

                          <section className="tournament-fixture-card">
                            <div className="tournament-section-heading">
                              <span className="tournament-section-kicker">YOUR FIXTURE</span>
                              <span className={`tournament-fixture-state ${completedFixture ? 'complete' : ''}`}>
                                {completedFixture ? 'FINAL' : 'TODAY'}
                              </span>
                            </div>
                            {!detail.current_fixture || !detail.current_fixture.opponent ? (
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
                              View previous & upcoming fixtures <ChevronRight size={16} />
                            </button>
                          </section>
                        </>
                      )}
                      {detail.tournament.status === 'completed' && (
                        <section className="tournament-champion-banner">
                          <Crown size={26} />
                          <div>
                            <span className="tournament-section-kicker">SEASON COMPLETE</span>
                            <h2>{detail.standings[0]?.name || 'Final table published'}</h2>
                            <p>Champion · {detail.standings[0]?.points ?? 0} league points</p>
                          </div>
                          <button type="button" onClick={() => setScreen('table')}>Final table <ChevronRight size={16} /></button>
                        </section>
                      )}
                    </div>
                  )}

                  {screen === 'fixtures' && (
                    <section className="tournament-fixtures-view">
                      <div className="tournament-page-section-title">
                        <div><span className="tournament-section-kicker">SEASON SCHEDULE</span><h2>Fixtures</h2></div>
                        <span>{detail.fixtures.length} gameweeks</span>
                      </div>
                      {detail.fixtures.length === 0 ? (
                        <div className="tournament-no-quiz"><Clock3 size={20} /><div><strong>Fixtures are being prepared</strong><span>They will appear when the season starts.</span></div></div>
                      ) : (
                        <div className="tournament-fixture-list">
                          {detail.fixtures.map((fixture) => (
                            <article className={`tournament-fixture-row ${fixture.gameweek === detail.current_gameweek ? 'current' : ''}`} key={fixture.id}>
                              <div className="tournament-fixture-row-meta">
                                <strong>GW {fixture.gameweek}</strong>
                                <span>{fixture.result === 'bye' || fixture.status === 'bye' ? 'Bye' : fixture.status === 'completed' ? fixture.result === 'forfeit' ? 'Forfeit' : fixture.result === 'draw' ? 'Draw' : fixture.result === null ? 'No result' : 'Final' : 'Scheduled'}</span>
                                <time>{formatDate(fixture.scheduled_at)}</time>
                              </div>
                              <div className="tournament-fixture-row-match">
                                <span>{fixture.player?.name || 'You'}</span>
                                {fixture.opponent ? (
                                  <>
                                    <strong>{fixture.player_score ?? '—'} <i>:</i> {fixture.opponent_score ?? '—'}</strong>
                                    <span>{fixture.opponent.name}</span>
                                  </>
                                ) : <strong className="tournament-bye-label">BYE</strong>}
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
                        <div><span className="tournament-section-kicker">SEASON STANDINGS</span><h2>League table</h2></div>
                        <span>GW {detail.current_gameweek || '—'} / {detail.tournament.total_gameweeks}</span>
                      </div>
                      {detail.standings.length === 0 ? (
                        <div className="tournament-no-quiz"><ListOrdered size={20} /><div><strong>Table is ready for kick-off</strong><span>Standings will update as fixtures are completed.</span></div></div>
                      ) : (
                        <div className="tournament-table-scroll">
                          <table className="tournament-table">
                            <thead>
                              <tr><th>Pos</th><th>Player</th><th>Pts</th><th>MP</th><th>GW</th><th>W</th><th>D</th><th>L</th><th>PD</th></tr>
                            </thead>
                            <tbody>
                              {detail.standings.map((standing) => (
                                <tr className={standing.user_id === user?.id ? 'current-player' : ''} key={standing.user_id}>
                                  <td>
                                    <span className={`tournament-position ${standing.rank === 1 && detail.tournament.status === 'completed' ? 'first' : ''}`}>
                                      {standing.rank === 1 && detail.tournament.status === 'completed' ? <Crown size={14} /> : standing.rank}
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
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                      <p className="tournament-table-note">MP = completed head-to-head fixtures · GW = completed gameweeks, including bye weeks · PD = quiz points for minus quiz points against.</p>
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

      <Modal isOpen={showRules} onClose={() => setShowRules(false)} title="1v1 league rules">
        {formatRules}
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
