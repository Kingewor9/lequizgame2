import React, { useCallback, useEffect, useState } from 'react';
import { apiService } from '../services/apiService';
import { Loading } from '../components/Loading';
import { Alert, AlertType } from '../components/Alert';
import { ArrowLeft, BarChart3, CalendarClock, Coins, Eye, Image as ImageIcon, ListFilter, Megaphone, Pencil, RotateCcw, Save, Send, Trophy, Trash2, Users, X } from 'lucide-react';
import '../styles/pages/AdminPage.css';
import { BroadcastPage } from './BroadcastPage';
import { AnalyticsPage } from './AnalyticsPage';

interface QuestionDraft {
    id: string;
    question_type: 'multiple_choice' | 'image_text';
    question_text: string;
    image_url: string;
    correct_answer_text: string;
    options: [string, string, string, string];
    correct_option_index: number;
}

interface AdminTournament {
    id: string;
    name: string;
    tournament_type: 'league' | 'group_knockout';
    status: string;
    start_at: string;
    entry_fee: number;
    registered_count: number;
    place_rewards: Record<string, number>;
}

const TOURNAMENT_PLACE_LABELS = ['Champion', 'Runner-up', '3rd place', '4th place'];
const DEFAULT_PLACE_REWARDS = [100, 50, 25, 10];

const AdminImagePreview: React.FC<{ imageUrl: string; questionNumber: number }> = ({ imageUrl, questionNumber }) => {
    const [hasError, setHasError] = useState(false);

    return (
        <div className="admin-image-preview-wrapper">
            <div className="preview-label">
                <Eye size={14} />
                <span>Live Image Preview</span>
            </div>
            {hasError ? (
                <p className="admin-image-preview-error" role="status">
                    This link did not load as an image. Use the direct image link, not the hosting page.
                </p>
            ) : (
                <div className="admin-image-preview-box">
                    <img
                        src={imageUrl}
                        alt={`Preview Question ${questionNumber}`}
                        onError={() => setHasError(true)}
                    />
                </div>
            )}
        </div>
    );
};

const AdminQuizPage: React.FC<{ onBack: () => void }> = ({ onBack }) => {
    const [isLoading, setIsLoading] = useState(false);
    const [alert, setAlert] = useState<{ message: string; type: AlertType } | null>(null);

    // Quiz Form State
    const [quizName, setQuizName] = useState('');
    const [quizDescription, setQuizDescription] = useState('');
    const [quizType, setQuizType] = useState<'multiple_choice' | 'image_text'>('multiple_choice');
    const [timeLimit, setTimeLimit] = useState<number>(30);
    const [pointsPerQuestion, setPointsPerQuestion] = useState<number>(10);
    const [costInCoins, setCostInCoins] = useState<number>(0);
    const [expiresInHours, setExpiresInHours] = useState<number>(24);
    const [quizDestination, setQuizDestination] = useState<'game' | 'tournament'>('game');
    const [tournaments, setTournaments] = useState<AdminTournament[]>([]);
    const [selectedTournamentId, setSelectedTournamentId] = useState('');
    const [tournamentListLoading, setTournamentListLoading] = useState(false);
    
    // Publish State
    const [publishMode, setPublishMode] = useState<'now' | 'schedule'>('now');
    const [scheduledFor, setScheduledFor] = useState('');

    useEffect(() => {
        if (quizDestination !== 'tournament') return;
        setTournamentListLoading(true);
        apiService.get('/admin/tournaments')
            .then((response) => {
                if (response.success && Array.isArray(response.data)) {
                    setTournaments(response.data as AdminTournament[]);
                } else {
                    setAlert({
                        message: response.error || 'Could not load tournaments for quiz routing.',
                        type: 'error',
                    });
                }
            })
            .catch((error) => {
                console.error('Could not load tournaments for quiz routing:', error);
                setAlert({ message: 'Could not load tournaments for quiz routing.', type: 'error' });
            })
            .finally(() => setTournamentListLoading(false));
    }, [quizDestination]);

    useEffect(() => {
        if (quizDestination !== 'tournament') return;
        const tournament = tournaments.find((item) => item.id === selectedTournamentId);
        if (!tournament) return;
        const startDate = new Date(tournament.start_at);
        const earliestQuizTime = startDate > new Date() ? startDate : new Date();
        const localDate = new Date(earliestQuizTime.getTime() - earliestQuizTime.getTimezoneOffset() * 60000)
            .toISOString()
            .slice(0, 16);
        setScheduledFor(localDate);
        setPublishMode('schedule');
        setCostInCoins(0);
    }, [quizDestination, selectedTournamentId, tournaments]);

    // Dynamic Questions State
    const [questions, setQuestions] = useState<QuestionDraft[]>([{
        id: Date.now().toString(),
        question_type: 'multiple_choice',
        question_text: '',
        image_url: '',
        correct_answer_text: '',
        options: ['', '', '', ''],
        correct_option_index: 0
    }]);

    const handleQuizTypeChange = (newType: 'multiple_choice' | 'image_text') => {
        setQuizType(newType);
        // Automatically set the new type on any empty or default questions
        setQuestions(questions.map(q => ({
            ...q,
            question_type: newType
        })));
    };

    const handleAddQuestion = () => {
        setQuestions([
            ...questions,
            {
                id: Date.now().toString(),
                question_type: quizType,
                question_text: '',
                image_url: '',
                correct_answer_text: '',
                options: ['', '', '', ''],
                correct_option_index: 0
            }
        ]);
    };

    const handleRemoveQuestion = (id: string) => {
        if (questions.length === 1) {
            setAlert({ message: 'A quiz must have at least one question.', type: 'error' });
            return;
        }
        setQuestions(questions.filter(q => q.id !== id));
    };

    const handleQuestionFieldChange = <K extends keyof QuestionDraft>(id: string, field: K, value: QuestionDraft[K]) => {
        setQuestions(questions.map(q => q.id === id ? { ...q, [field]: value } : q));
    };

    const handleOptionChange = (questionId: string, optionIndex: number, value: string) => {
        setQuestions(questions.map(q => {
            if (q.id === questionId) {
                const newOptions = [...q.options] as [string, string, string, string];
                newOptions[optionIndex] = value;
                return { ...q, options: newOptions };
            }
            return q;
        }));
    };

    const validateForm = () => {
        if (!quizName.trim()) return 'Quiz name is required.';
        if (questions.length === 0) return 'At least one question is required.';
        if (quizDestination === 'tournament' && !selectedTournamentId) {
            return 'Choose the tournament this quiz belongs to.';
        }
        if (quizDestination === 'tournament' && costInCoins !== 0) {
            return 'Tournament quizzes are included in the tournament entry fee.';
        }

        for (const [idx, q] of questions.entries()) {
            if (!q.question_text.trim()) return `Question ${idx + 1} is missing the question prompt.`;
            
            if (q.question_type === 'image_text') {
                if (!q.image_url.trim()) return `Question ${idx + 1} is an Image Quiz but missing the image link.`;
                try {
                    const imageUrl = new URL(q.image_url.trim());
                    if (imageUrl.hostname === 'ibb.co' || imageUrl.hostname === 'www.ibb.co') {
                        return `Question ${idx + 1} uses an ImgBB sharing page. Use its Direct link, which starts with https://i.ibb.co/.`;
                    }
                } catch {
                    return `Question ${idx + 1} needs a valid, publicly accessible image URL.`;
                }
                if (!q.correct_answer_text.trim()) return `Question ${idx + 1} is missing the expected correct answer.`;
            } else {
                for (const [oIdx, opt] of q.options.entries()) {
                    if (!opt.trim()) return `Question ${idx + 1}, Option ${oIdx + 1} is empty.`;
                }
            }
        }
        if (publishMode === 'schedule' && !scheduledFor) return 'Please select a date and time for scheduling.';
        return null;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const errorMsg = validateForm();
        if (errorMsg) {
            setAlert({ message: errorMsg, type: 'error' });
            return;
        }

        try {
            setIsLoading(true);

            const baseDate = publishMode === 'schedule' && scheduledFor ? new Date(scheduledFor) : new Date();
            const expires_at_date = new Date(baseDate.getTime());
            expires_at_date.setHours(expires_at_date.getHours() + expiresInHours);

            const payload = {
                name: quizName,
                description: quizDescription,
                quiz_type: quizType,
                total_questions: questions.length,
                time_limit_seconds: timeLimit,
                points_per_question: pointsPerQuestion,
                total_points: pointsPerQuestion * questions.length,
                cost_in_footy_coins: quizDestination === 'tournament' ? 0 : costInCoins,
                destination: quizDestination,
                tournament_id: quizDestination === 'tournament' ? selectedTournamentId : null,
                expires_at: expires_at_date.toISOString(),
                scheduled_for: publishMode === 'schedule' && scheduledFor ? new Date(scheduledFor).toISOString() : null,
                questions: questions.map((q, idx) => ({
                    question_type: q.question_type,
                    question_text: q.question_text,
                    order: idx,
                    image_url: q.question_type === 'image_text' ? q.image_url.trim() : undefined,
                    correct_answer_text: q.question_type === 'image_text' ? q.correct_answer_text.trim() : undefined,
                    options: q.question_type === 'multiple_choice' ? q.options : [],
                    correct_option_index: q.question_type === 'multiple_choice' ? q.correct_option_index : 0,
                }))
            };

            const response = await apiService.post('/admin/quizzes/bulk', payload);

            if (response.success) {
                setAlert({
                    message: quizDestination === 'tournament'
                        ? 'Tournament quiz created and routed to its registered players.'
                        : 'Quiz successfully created and sent to users!',
                    type: 'success',
                });
                // Reset form
                setQuizName('');
                setQuizDescription('');
                setQuestions([{
                    id: Date.now().toString(),
                    question_type: quizType,
                    question_text: '',
                    image_url: '',
                    correct_answer_text: '',
                    options: ['', '', '', ''],
                    correct_option_index: 0
                }]);
            } else {
                setAlert({ message: response.error || 'Failed to create quiz', type: 'error' });
            }
        } catch (err) {
            setAlert({ message: 'Network error. Attempt failed.', type: 'error' });
        } finally {
            setIsLoading(false);
        }

        // Auto clear success message
        setTimeout(() => {
            setAlert(null);
        }, 4000);
    };

    if (isLoading) return <Loading message="Publishing Quiz..." />;

    return (
        <div className="admin-page">
            {alert && <Alert message={alert.message} type={alert.type} onClose={() => setAlert(null)} />}

            <button type="button" className="admin-hub-back" onClick={onBack}>
                <ArrowLeft size={16} />
                Admin options
            </button>

            <div className="admin-header">
                <h1 className="admin-title">Send quiz</h1>
                <p className="admin-subtitle">Create & Publish Standard & Image Quizzes</p>
            </div>

            <form className="admin-form" onSubmit={handleSubmit}>
                <div className="form-section setup-section">
                    <h2 className="section-title">Quiz Details & Format</h2>

                    {/* Quiz Type Selector */}
                    <div className="input-group">
                        <label>Quiz Format</label>
                        <div className="quiz-format-toggle-bar">
                            <button
                                type="button"
                                className={`format-toggle-btn ${quizType === 'multiple_choice' ? 'active' : ''}`}
                                onClick={() => handleQuizTypeChange('multiple_choice')}
                            >
                                <ListFilter size={18} />
                                <span>Multiple Choice</span>
                            </button>
                            <button
                                type="button"
                                className={`format-toggle-btn ${quizType === 'image_text' ? 'active' : ''}`}
                                onClick={() => handleQuizTypeChange('image_text')}
                            >
                                <ImageIcon size={18} />
                                <span>Image Quiz (Type Answer)</span>
                            </button>
                        </div>
                    </div>

                    <div className="input-group">
                        <label>Quiz Destination</label>
                        <div className="quiz-format-toggle-bar" role="group" aria-label="Quiz destination">
                            <button
                                type="button"
                                className={`format-toggle-btn ${quizDestination === 'game' ? 'active' : ''}`}
                                onClick={() => setQuizDestination('game')}
                            >
                                <Send size={18} />
                                <span>Main Game</span>
                            </button>
                            <button
                                type="button"
                                className={`format-toggle-btn ${quizDestination === 'tournament' ? 'active' : ''}`}
                                onClick={() => setQuizDestination('tournament')}
                            >
                                <Trophy size={18} />
                                <span>Tournament</span>
                            </button>
                        </div>
                    </div>

                    {quizDestination === 'tournament' && (
                        <div className="input-group">
                            <label htmlFor="quiz-tournament">Send to tournament</label>
                            <select
                                id="quiz-tournament"
                                className="cyber-input"
                                value={selectedTournamentId}
                                onChange={(event) => setSelectedTournamentId(event.target.value)}
                                disabled={tournamentListLoading}
                                required
                            >
                                <option value="">
                                    {tournamentListLoading ? 'Loading tournaments…' : 'Select a tournament'}
                                </option>
                                {tournaments.map((tournament) => {
                                    const supported = tournament.tournament_type === 'league'
                                        && ['registration', 'active'].includes(tournament.status);
                                    return (
                                        <option key={tournament.id} value={tournament.id} disabled={!supported}>
                                            {tournament.name} · {supported ? '1v1 League' : 'Unavailable draft'}
                                        </option>
                                    );
                                })}
                            </select>
                            <span className="input-hint">
                                Tournament quizzes are isolated from the main game and do not have a separate coin fee.
                            </span>
                        </div>
                    )}

                    <div className="input-group">
                        <label>Quiz Title</label>
                        <input
                            type="text"
                            placeholder={quizType === 'image_text' ? "e.g. Guess the Footballer: Picture Edition" : "e.g. Champions League Final Trivia"}
                            value={quizName}
                            onChange={(e) => setQuizName(e.target.value)}
                            className="cyber-input"
                        />
                    </div>

                    <div className="input-group">
                        <label>Description (Optional)</label>
                        <textarea
                            placeholder="A brief description of this quiz"
                            value={quizDescription}
                            onChange={(e) => setQuizDescription(e.target.value)}
                            className="cyber-textarea"
                            rows={2}
                        />
                    </div>

                    <div className="settings-grid">
                        <div className="input-group">
                            <label>Time Limit (s)</label>
                            <input
                                type="number"
                                value={timeLimit}
                                onChange={(e) => setTimeLimit(Number(e.target.value))}
                                className="cyber-input"
                                min="5"
                            />
                        </div>
                        <div className="input-group">
                            <label>Points/Question</label>
                            <input
                                type="number"
                                value={pointsPerQuestion}
                                onChange={(e) => setPointsPerQuestion(Number(e.target.value))}
                                className="cyber-input"
                                min="1"
                            />
                        </div>
                        {quizDestination === 'game' ? (
                            <div className="input-group">
                                <label>Coin Cost (To play)</label>
                                <input
                                    type="number"
                                    value={costInCoins}
                                    onChange={(e) => setCostInCoins(Number(e.target.value))}
                                    className="cyber-input"
                                    min="0"
                                />
                            </div>
                        ) : (
                            <div className="input-group">
                                <label>Quiz Cost</label>
                                <div className="admin-quiz-cost-note"><Coins size={17} /> Included in entry fee</div>
                            </div>
                        )}
                        <div className="input-group">
                            <label>Expires In (Hours)</label>
                            <input
                                type="number"
                                value={expiresInHours}
                                onChange={(e) => setExpiresInHours(Number(e.target.value))}
                                className="cyber-input"
                                min="1"
                            />
                        </div>
                    </div>
                </div>

                <div className="questions-header">
                    <h2 className="section-title">Questions Engine</h2>
                    <span className="question-count">{questions.length} Question{questions.length !== 1 ? 's' : ''} • {questions.length * pointsPerQuestion} Total Pts</span>
                </div>

                <div className="questions-container">
                    {questions.map((q, idx) => (
                        <div key={q.id} className={`question-card ${q.question_type === 'image_text' ? 'image-q-card' : ''}`}>
                            <div className="question-card-header">
                                <div className="q-card-title-row">
                                    <h3>Question {idx + 1}</h3>
                                    {/* Question Type Switcher */}
                                    <div className="question-type-switch">
                                        <button
                                            type="button"
                                            className={`type-switch-btn ${q.question_type === 'multiple_choice' ? 'active' : ''}`}
                                            onClick={() => handleQuestionFieldChange(q.id, 'question_type', 'multiple_choice')}
                                        >
                                            <ListFilter size={13} />
                                            <span>Options</span>
                                        </button>
                                        <button
                                            type="button"
                                            className={`type-switch-btn ${q.question_type === 'image_text' ? 'active' : ''}`}
                                            onClick={() => handleQuestionFieldChange(q.id, 'question_type', 'image_text')}
                                        >
                                            <ImageIcon size={13} />
                                            <span>Image & Text</span>
                                        </button>
                                    </div>
                                </div>
                                <button type="button" className="btn-remove-q" onClick={() => handleRemoveQuestion(q.id)}>✕</button>
                            </div>

                            {/* Image Quiz Specific Fields */}
                            {q.question_type === 'image_text' ? (
                                <div className="image-question-fields">
                                    <div className="input-group">
                                        <label>Image Link / URL</label>
                                        <input
                                            type="url"
                                            placeholder="https://example.com/player.jpg or https://i.ibb.co/..."
                                            value={q.image_url}
                                            onChange={(e) => handleQuestionFieldChange(q.id, 'image_url', e.target.value)}
                                            className="cyber-input"
                                        />
                                        <span className="input-hint">
                                            Use a direct image URL. For ImgBB, choose the Direct link that starts with <code>https://i.ibb.co/</code>, not the <code>ibb.co</code> sharing page.
                                        </span>
                                    </div>

                                    {/* Live Preview Box */}
                                    {q.image_url.trim() && (
                                        <AdminImagePreview key={q.image_url} imageUrl={q.image_url} questionNumber={idx + 1} />
                                    )}

                                    <div className="input-group">
                                        <label>Question Prompt</label>
                                        <input
                                            type="text"
                                            placeholder="e.g. Who is this player? / Which club's stadium is this?"
                                            value={q.question_text}
                                            onChange={(e) => handleQuestionFieldChange(q.id, 'question_text', e.target.value)}
                                            className="cyber-input question-main-input"
                                        />
                                    </div>

                                    <div className="input-group">
                                        <label>Correct Answer</label>
                                        <input
                                            type="text"
                                            placeholder="e.g. Lionel Messi, Messi"
                                            value={q.correct_answer_text}
                                            onChange={(e) => handleQuestionFieldChange(q.id, 'correct_answer_text', e.target.value)}
                                            className="cyber-input"
                                        />
                                        <span className="input-hint">
                                            💡 Tip: Separate alternative acceptable answers with commas (e.g. <code>Messi, Lionel Messi</code>). User typing is case-insensitive and trims extra spaces.
                                        </span>
                                    </div>
                                </div>
                            ) : (
                                /* Multiple Choice Fields */
                                <>
                                    <div className="input-group">
                                        <label>Question Prompt</label>
                                        <input
                                            type="text"
                                            placeholder="Enter the question text..."
                                            value={q.question_text}
                                            onChange={(e) => handleQuestionFieldChange(q.id, 'question_text', e.target.value)}
                                            className="cyber-input question-main-input"
                                        />
                                    </div>

                                    <div className="options-grid">
                                        {q.options.map((opt, oIdx) => (
                                            <div key={oIdx} className={`option-wrapper ${q.correct_option_index === oIdx ? 'correct-wrapper' : ''}`}>
                                                <input
                                                    type="radio"
                                                    name={`correct-${q.id}`}
                                                    checked={q.correct_option_index === oIdx}
                                                    onChange={() => handleQuestionFieldChange(q.id, 'correct_option_index', oIdx)}
                                                    className="correct-radio"
                                                    title="Mark as correct answer"
                                                />
                                                <input
                                                    type="text"
                                                    placeholder={`Option ${oIdx + 1}`}
                                                    value={opt}
                                                    onChange={(e) => handleOptionChange(q.id, oIdx, e.target.value)}
                                                    className="cyber-input option-input"
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>
                    ))}
                </div>

                <div className="publish-mode-selector" style={{display: 'flex', gap: '1rem', marginBottom: '1.5rem', marginTop: '1rem', padding: '15px', background: 'rgba(255,255,255,0.05)', borderRadius: '12px'}}>
                    <div style={{flex: 1}}>
                        <input type="radio" id="publish-now" checked={publishMode === 'now'} onChange={() => setPublishMode('now')} style={{marginRight: '8px'}} />
                        <label htmlFor="publish-now" style={{color: 'white', fontWeight: 'bold'}}>🚀 Publish Now</label>
                    </div>
                    <div style={{flex: 1}}>
                        <input type="radio" id="publish-schedule" checked={publishMode === 'schedule'} onChange={() => setPublishMode('schedule')} style={{marginRight: '8px'}} />
                        <label htmlFor="publish-schedule" style={{color: '#ff3366', fontWeight: 'bold'}}>⏳ Schedule Quiz</label>
                    </div>
                </div>

                {publishMode === 'schedule' && (
                    <div className="input-group" style={{marginBottom: '2rem'}}>
                        <label>Schedule Go-Live Date & Time</label>
                        <input 
                            type="datetime-local" 
                            value={scheduledFor} 
                            onChange={(e) => setScheduledFor(e.target.value)} 
                            className="cyber-input"
                            style={{width: '100%', padding: '12px'}}
                        />
                    </div>
                )}

                <div className="form-actions">
                    <button type="button" className="btn-add-q" onClick={handleAddQuestion}>
                        + Add Another Question
                    </button>

                    <button type="submit" className="btn-publish-quiz">
                        {publishMode === 'now' ? '🚀 Publish Quiz to App' : '⏳ Schedule Quiz to App'}
                    </button>
                </div>
            </form>
        </div>
    );
};

const AdminTournamentPage: React.FC<{ onBack: () => void }> = ({ onBack }) => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [tournamentType, setTournamentType] = useState<'league' | 'group_knockout'>('league');
    const [entryFee, setEntryFee] = useState(0);
    const [rewardPlaces, setRewardPlaces] = useState(0);
    const [placeRewards, setPlaceRewards] = useState(DEFAULT_PLACE_REWARDS);
    const [startAt, setStartAt] = useState(() => {
        const local = new Date(tomorrow.getTime() - tomorrow.getTimezoneOffset() * 60000);
        return local.toISOString().slice(0, 16);
    });
    const [isSaving, setIsSaving] = useState(false);
    const [alert, setAlert] = useState<{ message: string; type: AlertType } | null>(null);
    const [tournaments, setTournaments] = useState<AdminTournament[]>([]);
    const [isLoadingTournaments, setIsLoadingTournaments] = useState(true);
    const [processingTournamentId, setProcessingTournamentId] = useState<string | null>(null);
    const [restartTournamentId, setRestartTournamentId] = useState<string | null>(null);
    const [editingRewardsTournamentId, setEditingRewardsTournamentId] = useState<string | null>(null);
    const [editRewardPlaces, setEditRewardPlaces] = useState(0);
    const [editPlaceRewards, setEditPlaceRewards] = useState(DEFAULT_PLACE_REWARDS);
    const [restartAt, setRestartAt] = useState(() => {
        const nextDay = new Date(Date.now() + 24 * 60 * 60 * 1000);
        return new Date(nextDay.getTime() - nextDay.getTimezoneOffset() * 60000)
            .toISOString()
            .slice(0, 16);
    });

    const refreshTournaments = useCallback(async () => {
        setIsLoadingTournaments(true);
        try {
            const response = await apiService.get<AdminTournament[]>('/admin/tournaments');
            if (!response.success || !Array.isArray(response.data)) {
                setAlert({ message: response.error || 'Could not load tournaments.', type: 'error' });
                return;
            }
            setTournaments(response.data);
        } catch (error) {
            console.error('Could not load tournaments:', error);
            setAlert({ message: 'Could not load tournaments.', type: 'error' });
        } finally {
            setIsLoadingTournaments(false);
        }
    }, []);

    useEffect(() => {
        void refreshTournaments();
    }, [refreshTournaments]);

    const handleRestart = async (tournament: AdminTournament) => {
        if (!restartAt || new Date(restartAt) <= new Date()) {
            setAlert({ message: 'Choose a restart date and time in the future.', type: 'error' });
            return;
        }
        const confirmed = window.confirm(
            `Schedule "${tournament.name}" to restart on ${new Date(restartAt).toLocaleString()}? Players will be notified and must opt in. The ${tournament.entry_fee} Footy Coin entry fee will only be charged to players who accept.`
        );
        if (!confirmed) return;

        setProcessingTournamentId(tournament.id);
        try {
            const response = await apiService.post(`/admin/tournaments/${tournament.id}/restart`, {
                start_at: new Date(restartAt).toISOString(),
            });
            if (!response.success) {
                setAlert({ message: response.error || 'Could not schedule tournament restart.', type: 'error' });
                return;
            }
            setAlert({ message: response.message || 'Tournament restart scheduled.', type: 'success' });
            setRestartTournamentId(null);
            await refreshTournaments();
        } catch (error) {
            console.error('Could not schedule tournament restart:', error);
            setAlert({ message: 'Could not schedule tournament restart.', type: 'error' });
        } finally {
            setProcessingTournamentId(null);
        }
    };

    const handleDelete = async (tournament: AdminTournament) => {
        const confirmed = window.confirm(
            `Delete "${tournament.name}" and its tournament records? This cannot be undone. Player entry fees will not be refunded.`
        );
        if (!confirmed) return;

        setProcessingTournamentId(tournament.id);
        try {
            const response = await apiService.delete(`/admin/tournaments/${tournament.id}`);
            if (!response.success) {
                setAlert({ message: response.error || 'Could not delete tournament.', type: 'error' });
                return;
            }
            setAlert({ message: response.message || 'Tournament deleted.', type: 'success' });
            await refreshTournaments();
        } catch (error) {
            console.error('Could not delete tournament:', error);
            setAlert({ message: 'Could not delete tournament.', type: 'error' });
        } finally {
            setProcessingTournamentId(null);
        }
    };

    const startEditingRewards = (tournament: AdminTournament) => {
        const rewards = tournament.place_rewards || {};
        const placeCount = Object.keys(rewards).length;
        setEditingRewardsTournamentId(tournament.id);
        setEditRewardPlaces(placeCount);
        setEditPlaceRewards(DEFAULT_PLACE_REWARDS.map(
            (defaultReward, index) => rewards[String(index + 1)] ?? defaultReward
        ));
        setRestartTournamentId(null);
    };

    const cancelEditingRewards = () => {
        setEditingRewardsTournamentId(null);
        setEditRewardPlaces(0);
    };

    const handleSaveRewards = async (tournament: AdminTournament) => {
        for (let index = 0; index < editRewardPlaces; index += 1) {
            const amount = editPlaceRewards[index];
            if (!Number.isSafeInteger(amount) || amount < 1 || amount > 1_000_000_000) {
                setAlert({
                    message: `Set a whole-number Footy Coin reward between 1 and 1,000,000,000 for ${TOURNAMENT_PLACE_LABELS[index].toLowerCase()}.`,
                    type: 'error',
                });
                return;
            }
        }

        setProcessingTournamentId(tournament.id);
        try {
            const response = await apiService.put(
                `/admin/tournaments/${tournament.id}/rewards`,
                {
                    place_rewards: Object.fromEntries(
                        Array.from({ length: editRewardPlaces }, (_, index) => [
                            String(index + 1),
                            editPlaceRewards[index],
                        ])
                    ),
                }
            );
            if (!response.success) {
                setAlert({ message: response.error || 'Could not update tournament rewards.', type: 'error' });
                return;
            }
            setAlert({ message: response.message || 'Tournament rewards updated.', type: 'success' });
            cancelEditingRewards();
            await refreshTournaments();
        } catch (error) {
            console.error('Could not update tournament rewards:', error);
            setAlert({ message: 'Could not update tournament rewards.', type: 'error' });
        } finally {
            setProcessingTournamentId(null);
        }
    };

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!name.trim()) {
            setAlert({ message: 'Tournament name is required.', type: 'error' });
            return;
        }
        if (!startAt || new Date(startAt) <= new Date()) {
            setAlert({ message: 'Choose a start date and time in the future.', type: 'error' });
            return;
        }
        for (let index = 0; index < rewardPlaces; index += 1) {
            const amount = placeRewards[index];
            if (!Number.isSafeInteger(amount) || amount < 1 || amount > 1_000_000_000) {
                setAlert({
                    message: `Set a whole-number Footy Coin reward between 1 and 1,000,000,000 for ${TOURNAMENT_PLACE_LABELS[index].toLowerCase()}.`,
                    type: 'error',
                });
                return;
            }
        }

        setIsSaving(true);
        try {
            const response = await apiService.post('/admin/tournaments', {
                name: name.trim(),
                description: description.trim(),
                tournament_type: tournamentType,
                entry_fee: entryFee,
                start_at: new Date(startAt).toISOString(),
                place_rewards: Object.fromEntries(
                    Array.from({ length: rewardPlaces }, (_, index) => [
                        String(index + 1),
                        placeRewards[index],
                    ])
                ),
            });
            if (!response.success) {
                setAlert({ message: response.error || 'Could not create tournament.', type: 'error' });
                return;
            }
            setAlert({
                message: tournamentType === 'league'
                    ? 'Tournament created. Registration closes at its scheduled start time.'
                    : 'Tournament created with 32 places. Registration closes at kick-off; entry fees are refunded if all places are not filled.',
                type: 'success',
            });
            setName('');
            setDescription('');
            setEntryFee(0);
            await refreshTournaments();
        } catch (error) {
            console.error('Could not create tournament:', error);
            setAlert({ message: 'Network error. Tournament was not created.', type: 'error' });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <main className="admin-page">
            <button type="button" className="btn-back-admin" onClick={onBack}>
                <ArrowLeft size={16} /> Back to Admin
            </button>
            <header className="admin-header">
                <span className="admin-hub-kicker">COMPETITIONS / SETUP</span>
                <h1 className="admin-title">Create tournament</h1>
                <p className="admin-subtitle">Set the format, entry fee, prize ladder, and scheduled kick-off.</p>
            </header>
            {alert && <Alert message={alert.message} type={alert.type} onClose={() => setAlert(null)} />}
            <section className="form-section tournament-management">
                <div className="tournament-management-heading">
                    <div>
                        <h2 className="section-title">Manage tournaments</h2>
                        <p className="admin-subtitle">Edit prizes before a season ends, restart completed leagues, or remove tournaments.</p>
                    </div>
                    <button
                        type="button"
                        className="tournament-refresh-button"
                        onClick={() => void refreshTournaments()}
                        disabled={isLoadingTournaments || processingTournamentId !== null}
                    >
                        <RotateCcw size={15} /> Refresh
                    </button>
                </div>
                {isLoadingTournaments ? (
                    <p className="tournament-management-empty">Loading tournaments…</p>
                ) : tournaments.length === 0 ? (
                    <p className="tournament-management-empty">No tournaments to manage yet.</p>
                ) : (
                    <ul className="tournament-management-list">
                        {tournaments.map((tournament) => {
                            const isProcessing = processingTournamentId === tournament.id;
                            const canRestart = tournament.tournament_type === 'league'
                                && tournament.status === 'completed';
                            const canEditRewards = !['completed', 'cancelled'].includes(tournament.status);
                            return (
                                <li className="tournament-management-item" key={tournament.id}>
                                    <div className="tournament-management-info">
                                        <strong>{tournament.name}</strong>
                                        <span>
                                            {tournament.status === 'renewal'
                                                ? `Restart scheduled for ${new Date(tournament.start_at).toLocaleString()}`
                                                : tournament.status.replace('_', ' ')}
                                            {' · '}{tournament.registered_count} players
                                        </span>
                                    </div>
                                    <div className="tournament-management-actions">
                                        {canEditRewards && editingRewardsTournamentId !== tournament.id && (
                                            <button
                                                type="button"
                                                className="tournament-action-button tournament-action-rewards"
                                                onClick={() => startEditingRewards(tournament)}
                                                disabled={processingTournamentId !== null}
                                            >
                                                <Pencil size={15} /> Edit rewards
                                            </button>
                                        )}
                                        {canRestart && restartTournamentId !== tournament.id && (
                                            <button
                                                type="button"
                                                className="tournament-action-button tournament-action-restart"
                                                onClick={() => setRestartTournamentId(tournament.id)}
                                                disabled={processingTournamentId !== null || restartTournamentId !== null}
                                            >
                                                <CalendarClock size={15} />
                                                Schedule restart
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            className="tournament-action-button tournament-action-delete"
                                            onClick={() => void handleDelete(tournament)}
                                            disabled={processingTournamentId !== null}
                                        >
                                            <Trash2 size={15} />
                                            {isProcessing ? 'Working…' : 'Delete'}
                                        </button>
                                    </div>
                                    {editingRewardsTournamentId === tournament.id && (
                                        <div className="tournament-rewards-editor">
                                            <div className="tournament-rewards-editor-heading">
                                                <div>
                                                    <strong>Edit prize ladder</strong>
                                                    <span>Changes apply to this season until its final standings are published.</span>
                                                </div>
                                                <button
                                                    type="button"
                                                    className="tournament-editor-close"
                                                    onClick={cancelEditingRewards}
                                                    disabled={isProcessing}
                                                    aria-label="Cancel reward editing"
                                                >
                                                    <X size={17} />
                                                </button>
                                            </div>
                                            <div className="input-group tournament-reward-place-count">
                                                <label htmlFor={`edit-reward-places-${tournament.id}`}>Places rewarded</label>
                                                <select
                                                    id={`edit-reward-places-${tournament.id}`}
                                                    className="cyber-input"
                                                    value={editRewardPlaces}
                                                    onChange={(event) => setEditRewardPlaces(Number(event.target.value))}
                                                >
                                                    <option value={0}>No coin rewards</option>
                                                    {[1, 2, 3, 4].map((places) => (
                                                        <option key={places} value={places}>
                                                            {places} {places === 1 ? 'place' : 'places'}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                            {editRewardPlaces > 0 && (
                                                <div className="tournament-reward-ladder">
                                                    {Array.from({ length: editRewardPlaces }, (_, index) => (
                                                        <div className="tournament-reward-row" key={index}>
                                                            <div className="tournament-reward-place">
                                                                <span>{String(index + 1).padStart(2, '0')}</span>
                                                                <strong>{TOURNAMENT_PLACE_LABELS[index]}</strong>
                                                            </div>
                                                            <label
                                                                className="tournament-reward-amount"
                                                                htmlFor={`edit-tournament-reward-${tournament.id}-${index + 1}`}
                                                            >
                                                                <input
                                                                    id={`edit-tournament-reward-${tournament.id}-${index + 1}`}
                                                                    className="cyber-input"
                                                                    type="number"
                                                                    min="1"
                                                                    max="1000000000"
                                                                    step="1"
                                                                    value={editPlaceRewards[index]}
                                                                    onChange={(event) => {
                                                                        const updatedRewards = [...editPlaceRewards];
                                                                        updatedRewards[index] = Number(event.target.value);
                                                                        setEditPlaceRewards(updatedRewards);
                                                                    }}
                                                                />
                                                                <span>Footy Coins</span>
                                                            </label>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                            <div className="tournament-management-actions tournament-reward-editor-actions">
                                                <button
                                                    type="button"
                                                    className="tournament-action-button tournament-action-rewards"
                                                    onClick={() => void handleSaveRewards(tournament)}
                                                    disabled={isProcessing || processingTournamentId !== null}
                                                >
                                                    <Save size={15} />
                                                    {isProcessing ? 'Saving…' : 'Save rewards'}
                                                </button>
                                                <button
                                                    type="button"
                                                    className="tournament-action-button"
                                                    onClick={cancelEditingRewards}
                                                    disabled={isProcessing}
                                                >
                                                    Cancel
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                    {restartTournamentId === tournament.id && (
                                        <div className="tournament-restart-schedule">
                                            <label htmlFor={`tournament-restart-${tournament.id}`}>
                                                New season start
                                            </label>
                                            <input
                                                id={`tournament-restart-${tournament.id}`}
                                                className="cyber-input"
                                                type="datetime-local"
                                                value={restartAt}
                                                onChange={(event) => setRestartAt(event.target.value)}
                                                min={new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
                                                    .toISOString()
                                                    .slice(0, 16)}
                                            />
                                            <span className="input-hint">
                                                Players will be asked to opt in. Their entry fee is charged only after they accept.
                                            </span>
                                            <div className="tournament-management-actions">
                                                <button
                                                    type="button"
                                                    className="tournament-action-button tournament-action-restart"
                                                    onClick={() => void handleRestart(tournament)}
                                                    disabled={isProcessing || processingTournamentId !== null}
                                                >
                                                    <RotateCcw size={15} />
                                                    {isProcessing ? 'Scheduling…' : 'Confirm schedule'}
                                                </button>
                                                <button
                                                    type="button"
                                                    className="tournament-action-button"
                                                    onClick={() => setRestartTournamentId(null)}
                                                    disabled={isProcessing}
                                                >
                                                    Cancel
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                )}
            </section>
            <form className="admin-form" onSubmit={handleSubmit}>
                <section className="form-section setup-section">
                    <h2 className="section-title">Tournament details</h2>
                    <div className="input-group">
                        <label htmlFor="tournament-name">Tournament name</label>
                        <input
                            id="tournament-name"
                            className="cyber-input"
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                            maxLength={255}
                            placeholder="e.g. Footy IQ Champions League"
                            required
                        />
                    </div>
                    <div className="input-group">
                        <label htmlFor="tournament-description">Description</label>
                        <textarea
                            id="tournament-description"
                            className="cyber-textarea"
                            value={description}
                            onChange={(event) => setDescription(event.target.value)}
                            rows={3}
                            placeholder="Give players a quick overview of the competition."
                        />
                    </div>
                    <div className="input-group">
                        <label>Tournament format</label>
                        <div className="quiz-format-toggle-bar" role="group" aria-label="Tournament format">
                            <button
                                type="button"
                                className={`format-toggle-btn ${tournamentType === 'league' ? 'active' : ''}`}
                                onClick={() => setTournamentType('league')}
                            >
                                <Trophy size={18} /> 1v1 League
                            </button>
                            <button
                                type="button"
                                className={`format-toggle-btn ${tournamentType === 'group_knockout' ? 'active' : ''}`}
                                onClick={() => setTournamentType('group_knockout')}
                            >
                                <Users size={18} /> Group + Knockout
                            </button>
                        </div>
                        <span className="input-hint">
                            {tournamentType === 'league'
                                ? 'League registration supports up to 20 players and starts automatically at the date below.'
                                : 'Exactly 32 players are required. Registration closes at kick-off; the tournament is cancelled and entry fees refunded if fewer than 32 join.'}
                        </span>
                    </div>
                    <div className="settings-grid">
                        <div className="input-group">
                            <label htmlFor="tournament-entry-fee">Entry fee (Footy Coins)</label>
                            <input
                                id="tournament-entry-fee"
                                className="cyber-input"
                                type="number"
                                min="0"
                                step="1"
                                value={entryFee}
                                onChange={(event) => setEntryFee(Number(event.target.value))}
                                required
                            />
                            <span className="input-hint">Set to 0 for free entry.</span>
                        </div>
                        <div className="input-group">
                            <label htmlFor="tournament-start">Scheduled start</label>
                            <input
                                id="tournament-start"
                                className="cyber-input"
                                type="datetime-local"
                                value={startAt}
                                onChange={(event) => setStartAt(event.target.value)}
                                required
                            />
                            <span className="input-hint">All dates are stored in UTC after conversion from your local time.</span>
                        </div>
                    </div>
                </section>
                <section className="form-section tournament-rewards-section">
                    <div className="tournament-rewards-heading">
                        <span className="tournament-rewards-icon"><Trophy size={19} /></span>
                        <div>
                            <h2 className="section-title">Winner rewards</h2>
                            <p className="admin-subtitle">Set Footy Coin prizes for the final standings.</p>
                        </div>
                    </div>
                    <div className="input-group tournament-reward-place-count">
                        <label htmlFor="tournament-reward-places">Places rewarded</label>
                        <select
                            id="tournament-reward-places"
                            className="cyber-input"
                            value={rewardPlaces}
                            onChange={(event) => setRewardPlaces(Number(event.target.value))}
                        >
                            <option value={0}>No coin rewards</option>
                            {[1, 2, 3, 4].map((places) => (
                                <option key={places} value={places}>
                                    {places} {places === 1 ? 'place' : 'places'}
                                </option>
                            ))}
                        </select>
                        <span className="input-hint">Choose from champion only up to the top four.</span>
                    </div>
                    {rewardPlaces > 0 && (
                        <div className="tournament-reward-ladder">
                            {Array.from({ length: rewardPlaces }, (_, index) => (
                                <div className="tournament-reward-row" key={index}>
                                    <div className="tournament-reward-place">
                                        <span>{String(index + 1).padStart(2, '0')}</span>
                                        <strong>{TOURNAMENT_PLACE_LABELS[index]}</strong>
                                    </div>
                                    <label className="tournament-reward-amount" htmlFor={`tournament-reward-${index + 1}`}>
                                        <input
                                            id={`tournament-reward-${index + 1}`}
                                            className="cyber-input"
                                            type="number"
                                            min="1"
                                            max="1000000000"
                                            step="1"
                                            value={placeRewards[index]}
                                            onChange={(event) => {
                                                const updatedRewards = [...placeRewards];
                                                updatedRewards[index] = Number(event.target.value);
                                                setPlaceRewards(updatedRewards);
                                            }}
                                            required
                                        />
                                        <span>Footy Coins</span>
                                    </label>
                                </div>
                            ))}
                            <p className="tournament-reward-note">
                                Players tied on a place each receive that place&apos;s full reward.
                            </p>
                        </div>
                    )}
                </section>
                <div className="tournament-create-summary">
                    <CalendarClock size={19} />
                    <span>Registration closes at the scheduled start, even when fewer than 20 players join.</span>
                    <span className="tournament-capacity"><Coins size={15} /> {entryFee} coins</span>
                    {rewardPlaces > 0 && (
                        <span className="tournament-capacity">
                            <Trophy size={15} />
                            {placeRewards.slice(0, rewardPlaces).reduce((total, reward) => total + reward, 0).toLocaleString()} prize pool
                        </span>
                    )}
                </div>
                <button className="btn-publish-quiz" type="submit" disabled={isSaving}>
                    {isSaving ? 'Creating tournament…' : 'Create tournament'}
                </button>
            </form>
        </main>
    );
};

type AdminDestination = 'menu' | 'quiz' | 'tournament' | 'broadcast' | 'analytics';

export const AdminPage: React.FC = () => {
    const [destination, setDestination] = useState<AdminDestination>('menu');

    if (destination === 'quiz') {
        return <AdminQuizPage onBack={() => setDestination('menu')} />;
    }

    if (destination === 'tournament') {
        return <AdminTournamentPage onBack={() => setDestination('menu')} />;
    }

    if (destination === 'broadcast') {
        return <BroadcastPage onBack={() => setDestination('menu')} />;
    }

    if (destination === 'analytics') {
        return <AnalyticsPage onBack={() => setDestination('menu')} />;
    }

    return (
        <main className="admin-page admin-hub">
            <header className="admin-header">
                <span className="admin-hub-kicker">CONTROL ROOM / 01</span>
                <h1 className="admin-title">Admin panel</h1>
                <p className="admin-subtitle">Create quizzes, reach players, and track how the game is growing.</p>
            </header>

            <section className="admin-destinations" aria-label="Admin actions">
                <button
                    type="button"
                    className="admin-destination admin-destination-quiz"
                    onClick={() => setDestination('quiz')}
                >
                    <span className="admin-destination-index">01 / QUIZ DESK</span>
                    <span className="admin-destination-icon"><Send size={22} /></span>
                    <span className="admin-destination-copy">
                        <strong>Send quiz</strong>
                        <span>Build a new quiz and publish it to players.</span>
                    </span>
                    <span className="admin-destination-action">Open quiz settings <ArrowLeft size={15} /></span>
                </button>

                <button
                    type="button"
                    className="admin-destination admin-destination-tournament"
                    onClick={() => setDestination('tournament')}
                >
                    <span className="admin-destination-index">02 / COMPETITIONS</span>
                    <span className="admin-destination-icon"><Trophy size={22} /></span>
                    <span className="admin-destination-copy">
                        <strong>Create tournament</strong>
                        <span>Set league entry, coin fees, scheduled kick-off, and place rewards.</span>
                    </span>
                    <span className="admin-destination-action">Open tournament setup <ArrowLeft size={15} /></span>
                </button>

                <button
                    type="button"
                    className="admin-destination admin-destination-broadcast"
                    onClick={() => setDestination('broadcast')}
                >
                    <span className="admin-destination-index">03 / COMMUNITY</span>
                    <span className="admin-destination-icon"><Megaphone size={22} /></span>
                    <span className="admin-destination-copy">
                        <strong>Broadcast message</strong>
                        <span>Send an announcement directly to all players via the bot.</span>
                    </span>
                    <span className="admin-destination-action">Compose broadcast <ArrowLeft size={15} /></span>
                </button>

                <button
                    type="button"
                    className="admin-destination admin-destination-analytics"
                    onClick={() => setDestination('analytics')}
                >
                    <span className="admin-destination-index">04 / INSIGHTS</span>
                    <span className="admin-destination-icon"><BarChart3 size={22} /></span>
                    <span className="admin-destination-copy">
                        <strong>Game analytics</strong>
                        <span>Explore player activity, league growth, and quiz performance.</span>
                    </span>
                    <span className="admin-destination-action">Open analytics <ArrowLeft size={15} /></span>
                </button>
            </section>
        </main>
    );
};
