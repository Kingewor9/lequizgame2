import React from 'react';
import { ArrowRight, Shield, Sparkles, X } from 'lucide-react';
import { MilestoneNotification } from '../constants/milestones';
import '../styles/components/MilestoneModal.css';

interface Props {
  milestone: MilestoneNotification;
  onClose: () => void;
}

export const MilestoneModal: React.FC<Props> = ({ milestone, onClose }) => (
  <div className="milestone-modal-overlay" role="presentation" onClick={onClose}>
    <section
      className="milestone-modal-card"
      role="dialog"
      aria-modal="true"
      aria-labelledby="milestone-modal-title"
      onClick={(event) => event.stopPropagation()}
    >
      <div className="milestone-modal-confetti" aria-hidden="true">
        {Array.from({ length: 20 }, (_, index) => (
          <span className="milestone-confetti-piece" key={index} />
        ))}
      </div>

      <button
        type="button"
        className="milestone-modal-close"
        onClick={onClose}
        aria-label="Close milestone message"
      >
        <X size={18} />
      </button>

      <div className="milestone-modal-emblem" aria-hidden="true">
        <span className="milestone-emblem-ring" />
        <Shield className="milestone-emblem-shield" strokeWidth={1.6} />
        <Sparkles className="milestone-emblem-sparkle" size={21} />
      </div>

      <p className="milestone-modal-kicker">NEW REPUTATION UNLOCKED</p>
      <h2 id="milestone-modal-title">You&apos;ve made your mark.</h2>
      <p className="milestone-modal-message">
        A new chapter in your Footy IQ career starts now.
      </p>
      <div className="milestone-modal-titleplate">
        <span>YOUR NEW TITLE</span>
        <strong>{milestone.title}</strong>
      </div>
      <p className="milestone-modal-points">
        {milestone.points.toLocaleString()} career points
      </p>

      <button type="button" className="milestone-modal-action" onClick={onClose}>
        Keep climbing
        <ArrowRight size={18} />
      </button>
    </section>
  </div>
);
