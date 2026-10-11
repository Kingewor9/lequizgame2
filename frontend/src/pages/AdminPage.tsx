import React, { useState } from 'react';
import { apiService } from '../services/apiService';
import { Loading } from '../components/Loading';
import { Alert, AlertType } from '../components/Alert';
import { ArrowLeft, Image as ImageIcon, ListFilter, Eye, Megaphone, Send } from 'lucide-react';
import '../styles/pages/AdminPage.css';
import { BroadcastPage } from './BroadcastPage';

interface QuestionDraft {
    id: string;
    question_type: 'multiple_choice' | 'image_text';
    question_text: string;
    image_url: string;
    correct_answer_text: string;
    options: [string, string, string, string];
    correct_option_index: number;
}

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
    
    // Publish State
    const [publishMode, setPublishMode] = useState<'now' | 'schedule'>('now');
    const [scheduledFor, setScheduledFor] = useState('');

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
                cost_in_footy_coins: costInCoins,
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
                setAlert({ message: 'Quiz successfully created and sent to users!', type: 'success' });
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

type AdminDestination = 'menu' | 'quiz' | 'broadcast';

export const AdminPage: React.FC = () => {
    const [destination, setDestination] = useState<AdminDestination>('menu');

    if (destination === 'quiz') {
        return <AdminQuizPage onBack={() => setDestination('menu')} />;
    }

    if (destination === 'broadcast') {
        return <BroadcastPage onBack={() => setDestination('menu')} />;
    }

    return (
        <main className="admin-page admin-hub">
            <header className="admin-header">
                <span className="admin-hub-kicker">CONTROL ROOM / 01</span>
                <h1 className="admin-title">Admin panel</h1>
                <p className="admin-subtitle">Choose what you want to send to the Footy IQ community.</p>
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
                    className="admin-destination admin-destination-broadcast"
                    onClick={() => setDestination('broadcast')}
                >
                    <span className="admin-destination-index">02 / COMMUNITY</span>
                    <span className="admin-destination-icon"><Megaphone size={22} /></span>
                    <span className="admin-destination-copy">
                        <strong>Broadcast message</strong>
                        <span>Send an announcement directly to all players via the bot.</span>
                    </span>
                    <span className="admin-destination-action">Compose broadcast <ArrowLeft size={15} /></span>
                </button>
            </section>
        </main>
    );
};
