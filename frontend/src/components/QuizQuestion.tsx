import React, { useMemo } from 'react';
import { Question } from '../types';
import '../styles/components/QuizQuestion.css';
//Option type removed from imports as it is not used in this file

interface QuizQuestionProps {
  question: Question;
  currentIndex: number;
  totalQuestions: number;
  selectedOptionId: string | null;
  isAnswered: boolean;
  isCorrect: boolean | null;
  onOptionSelect: (optionId: string) => void;
}

export const QuizQuestion: React.FC<QuizQuestionProps> = ({
  question,
  currentIndex,
  totalQuestions,
  selectedOptionId,
  isAnswered,
  isCorrect,
  onOptionSelect,
}) => {
  const shuffledOptions = useMemo(() => {
    return [...question.options].sort(() => Math.random() - 0.5);
  }, [question.options]);

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
    </div>
  );
};
