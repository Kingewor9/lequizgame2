import React from 'react';
import { Coins, Sparkles } from 'lucide-react';
import { Modal } from './Modal';
import '../styles/components/WelcomeBonusModal.css';

interface WelcomeBonusModalProps {
  onClose: () => void;
}

export const WelcomeBonusModal: React.FC<WelcomeBonusModalProps> = ({ onClose }) => (
  <Modal isOpen onClose={onClose} title="Welcome to Footy IQ!">
    <div className="welcome-bonus">
      <div className="welcome-bonus-icon" aria-hidden="true">
        <Coins size={30} />
        <Sparkles size={16} />
      </div>
      <p className="welcome-bonus-eyebrow">SIGN-IN BONUS</p>
      <p className="welcome-bonus-amount">+250</p>
      <p className="welcome-bonus-currency">Footy Coins</p>
      <p className="welcome-bonus-copy">
        250 Footy Coins have been added to your balance. Use them to play quizzes and compete!
      </p>
      <button type="button" className="btn-primary welcome-bonus-button" onClick={onClose}>
        Let&apos;s play
      </button>
    </div>
  </Modal>
);
