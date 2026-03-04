import React, { useState } from 'react';
import { apiService } from '../services/apiService';
import { Loading } from '../components/Loading';
import { Alert, AlertType } from '../components/Alert';
import '../styles/pages/AdminPage.css';

interface QuestionDraft {
    id: string;
    question_text: string;
    options: [string, string, string, string];
    correct_option_index: number;
}

export const AdminPage: React.FC = () => {
    const [isLoading, setIsLoading] = useState(false);
    const [alert, setAlert] = useState<{ message: string; type: AlertType } | null>(null);

    // Quiz Form State
    const [quizName, setQuizName] = useState('');
    const [quizDescription, setQuizDescription] = useState('');
    const [timeLimit, setTimeLimit] = useState<number>(30);
    const [pointsPerQuestion, setPointsPerQuestion] = useState<number>(10);
    const [costInCoins, setCostInCoins] = useState<number>(0);
    const [expiresInHours, setExpiresInHours] = useState<number>(24);

    // Dynamic Questions State
    const [questions, setQuestions] = useState<QuestionDraft[]>([{
        id: Date.now().toString(),
        question_text: '',
        options: ['', '', '', ''],
        correct_option_index: 0
    }]);

    const handleAddQuestion = () => {
        setQuestions([
            ...questions,
            {
                id: Date.now().toString(),
                question_text: '',
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

    const handleQuestionChange = (id: string, field: 'question_text' | 'correct_option_index', value: string | number) => {
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
        for (const [idx, q] of questions.entries()) {
            if (!q.question_text.trim()) return `Question ${idx + 1} is missing text.`;
            for (const [oIdx, opt] of q.options.entries()) {
                if (!opt.trim()) return `Question ${idx + 1}, Option ${oIdx + 1} is empty.`;
            }
        }
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

            const expires_at_date = new Date();
            expires_at_date.setHours(expires_at_date.getHours() + expiresInHours);

            const payload = {
                name: quizName,
                description: quizDescription,
                total_questions: questions.length,
                time_limit_seconds: timeLimit,
                points_per_question: pointsPerQuestion,
                total_points: pointsPerQuestion * questions.length,
                cost_in_footy_coins: costInCoins,
                expires_at: expires_at_date.toISOString(),
                questions: questions.map(q => ({
                    question_text: q.question_text,
                    options: q.options,
                    correct_option_index: q.correct_option_index,
                }))
            };

            const response = await apiService.post('/admin/quizzes/bulk', payload);

            if (response.success) {
                setAlert({ message: 'Quiz successfully created and sent to users!', type: 'success' });
                // Reset form
                setQuizName('');
                setQuizDescription('');
                setQuestions([{ id: Date.now().toString(), question_text: '', options: ['', '', '', ''], correct_option_index: 0 }]);
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

            <div className="admin-header">
                <h1 className="admin-title">Admin Panel</h1>
                <p className="admin-subtitle">Create & Publish Quizzes</p>
            </div>

            <form className="admin-form" onSubmit={handleSubmit}>
                <div className="form-section setup-section">
                    <h2 className="section-title">Quiz Details</h2>

                    <div className="input-group">
                        <label>Quiz Title</label>
                        <input
                            type="text"
                            placeholder="e.g. Champions League Final Trivia"
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
                        <div key={q.id} className="question-card">
                            <div className="question-card-header">
                                <h3>Question {idx + 1}</h3>
                                <button type="button" className="btn-remove-q" onClick={() => handleRemoveQuestion(q.id)}>✕</button>
                            </div>

                            <div className="input-group">
                                <input
                                    type="text"
                                    placeholder="Enter the question text..."
                                    value={q.question_text}
                                    onChange={(e) => handleQuestionChange(q.id, 'question_text', e.target.value)}
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
                                            onChange={() => handleQuestionChange(q.id, 'correct_option_index', oIdx)}
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
                        </div>
                    ))}
                </div>

                <div className="form-actions">
                    <button type="button" className="btn-add-q" onClick={handleAddQuestion}>
                        + Add Another Question
                    </button>

                    <button type="submit" className="btn-publish-quiz">
                        🚀 Publish Quiz to App
                    </button>
                </div>
            </form>
        </div>
    );
};
