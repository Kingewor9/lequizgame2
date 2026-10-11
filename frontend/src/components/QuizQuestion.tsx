import React, { useMemo, useState, useEffect } from 'react';
import { Send, Image as ImageIcon, AlertCircle } from 'lucide-react';
import { Question } from '../types';
import '../styles/components/QuizQuestion.css';

interface QuizQuestionProps {
  question: Question;
  currentIndex: number;
  totalQuestions: number;
  selectedOptionId: string | null;
  isAnswered: boolean;
  isCorrect: boolean | null;
  onOptionSelect: (optionId: string) => void;
  onTextAnswerSubmit?: (textAnswer: string, isCorrect: boolean) => void;
}

export const QuizQuestion: React.FC<QuizQuestionProps> = ({
  question,
  currentIndex,
  totalQuestions,
  selectedOptionId,
  isAnswered,
  isCorrect,
  onOptionSelect,
  onTextAnswerSubmit,
}) => {
  const [typedAnswer, setTypedAnswer] = useState('');
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  const isImageQuiz = question.question_type === 'image_text';

  // Reset local state when moving to a new question
  useEffect(() => {
    setTypedAnswer('');
    setImageError(false);
    setImageLoaded(false);
  }, [question.id]);

  const shuffledOptions = useMemo(() => {
    if (!question.options || question.options.length === 0) return [];
    return [...question.options].sort(() => Math.random() - 0.5);
  }, [question.options]);

  const handleSubmitText = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isAnswered || !typedAnswer.trim()) return;

    const trimmed = typedAnswer.trim();
    const rawCorrect = question.correct_answer_text || '';
    const aliases = rawCorrect
      .replace(/\|/g, ',')
      .split(',')
      .map((a) => a.trim().toLowerCase())
      .filter(Boolean);

    const isMatch = aliases.length > 0
      ? aliases.includes(trimmed.toLowerCase())
      : trimmed.toLowerCase() === rawCorrect.trim().toLowerCase();

    if (onTextAnswerSubmit) {
      onTextAnswerSubmit(trimmed, isMatch);
    } else {
      onOptionSelect(trimmed);
    }
  };

  const displayAnswer = (question.correct_answer_text || '').split(/[,|]/)[0]?.trim() || question.correct_answer_text || '';

  return (
    <div className="quiz-question">
      <div className="question-header">
        <span className="question-counter">
          {currentIndex + 1}/{totalQuestions}
        </span>
        <div className="progress-bar">
          <div
            className="progress-fill"
            style={{ width: `${((currentIndex + 1) / totalQuestions) * 100}%` }}
          />
        </div>
      </div>

      {isImageQuiz ? (
        <div className="image-quiz-body">
          {question.image_url && (
            <div className="quiz-image-frame">
              {!imageLoaded && !imageError && (
                <div className="quiz-image-skeleton">
                  <ImageIcon size={32} className="skeleton-icon animate-pulse" />
                  <span>Loading Image...</span>
                </div>
              )}
              {imageError ? (
                <div className="quiz-image-error">
                  <AlertCircle size={32} />
                  <span>Image unavailable. Check that the link is a public, direct image URL.</span>
                </div>
              ) : (
                <img
                  src={question.image_url}
                  alt={question.question_text || 'Quiz question'}
                  className={`quiz-image ${imageLoaded ? 'loaded' : ''}`}
                  onLoad={() => setImageLoaded(true)}
                  onError={() => setImageError(true)}
                />
              )}
            </div>
          )}

          <h2 className="question-text">{question.question_text}</h2>

          <form className="type-answer-form" onSubmit={handleSubmitText}>
            <div className={`type-answer-wrapper ${isAnswered ? (isCorrect ? 'correct' : 'incorrect') : ''}`}>
              <input
                type="text"
                className="type-answer-input"
                placeholder="Type your answer here..."
                value={isAnswered ? selectedOptionId || typedAnswer : typedAnswer}
                onChange={(e) => setTypedAnswer(e.target.value)}
                disabled={isAnswered}
                autoFocus
                autoComplete="off"
              />
              <button
                type="submit"
                className="btn-submit-type-answer"
                data-sound="none"
                disabled={isAnswered || !typedAnswer.trim()}
                aria-label="Submit Answer"
              >
                <Send size={16} />
                <span>Submit</span>
              </button>
            </div>
          </form>

          {isAnswered && isCorrect === false && (
            <div className="feedback-message error animate-fade">
              ✕ Incorrect. Answer: {displayAnswer}
            </div>
          )}
          {isAnswered && isCorrect === true && (
            <div className="feedback-message success animate-fade">
              ✓ Brilliant! That's correct!
            </div>
          )}
        </div>
      ) : (
        <>
          <h2 className="question-text">{question.question_text}</h2>

          <div className="options-container">
            {shuffledOptions.map((option) => (
              <button
                key={option.id}
                className={`option-button ${
                  selectedOptionId === option.id
                    ? isCorrect === true
                      ? 'correct'
                      : isCorrect === false
                      ? 'incorrect'
                      : 'selected'
                    : ''
                } ${isAnswered ? 'answered' : ''}`}
                data-sound="none"
                onClick={() => !isAnswered && onOptionSelect(option.id)}
                disabled={isAnswered}
              >
                <span className="option-text">{option.option_text}</span>
                {selectedOptionId === option.id && isAnswered && (
                  <span className={`option-indicator ${isCorrect === true ? '✓' : '✕'}`}>
                    {isCorrect === true ? '✓' : '✕'}
                  </span>
                )}
                {isAnswered && option.id === question.correct_option_id && selectedOptionId !== option.id && (
                  <span className="option-indicator correct-answer">✓</span>
                )}
              </button>
            ))}
          </div>

          {isAnswered && selectedOptionId !== question.correct_option_id && (
            <div className="feedback-message error">Incorrect. The correct answer is shown above.</div>
          )}
          {isAnswered && isCorrect === true && (
            <div className="feedback-message success">Great! That's correct.</div>
          )}
        </>
      )}
    </div>
  );
};
