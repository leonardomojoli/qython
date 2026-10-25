// frontend/src/components/academic/ClinicalCasePlayer.js

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faUser,
  faHeartbeat,
  faCheck,
  faTimes,
  faRedo,
  faTrophy,
  faStethoscope,
  faFlask,
  faArrowRight
} from '@fortawesome/free-solid-svg-icons';
import styles from './ClinicalCasePlayer.module.css';

const ClinicalCasePlayer = ({ caseData }) => {
  const { t } = useTranslation();
  const clinicalCase = caseData?.clinical_case;

  const [currentBlockId, setCurrentBlockId] = useState('start');
  const [selectedOption, setSelectedOption] = useState(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [history, setHistory] = useState([]);
  const [score, setScore] = useState(0);
  const [maxPossibleScore, setMaxPossibleScore] = useState(0);

  if (!clinicalCase) {
    return <p className={styles.noData}>{t('noClinicalCaseData')}</p>;
  }

  const currentBlock = clinicalCase.blocks?.find(b => b.id === currentBlockId);
  const isEnded = currentBlock?.type === 'end';

  // Calculate max possible score at the start
  const calculateMaxScore = () => {
    let max = 0;
    clinicalCase.blocks?.forEach(block => {
      if (block.decision?.options) {
        const bestOption = block.decision.options.find(o => o.is_best);
        if (bestOption) {
          max += bestOption.points || 0;
        }
      }
    });
    return max;
  };

  const handleSelect = (option) => {
    if (showFeedback) return;

    setSelectedOption(option);
    setShowFeedback(true);
    setScore(s => s + (option.points || 0));
    setHistory(h => [...h, {
      blockId: currentBlockId,
      optionId: option.id,
      isBest: option.is_best,
      points: option.points || 0
    }]);

    // Calculate max score on first selection
    if (history.length === 0) {
      setMaxPossibleScore(calculateMaxScore());
    }
  };

  const handleContinue = () => {
    if (selectedOption?.next) {
      setCurrentBlockId(selectedOption.next);
    }
    setSelectedOption(null);
    setShowFeedback(false);
  };

  const handleRestart = () => {
    setCurrentBlockId('start');
    setSelectedOption(null);
    setShowFeedback(false);
    setHistory([]);
    setScore(0);
  };

  const getScorePercentage = () => {
    if (maxPossibleScore === 0) return 0;
    return Math.round((score / maxPossibleScore) * 100);
  };

  const getScoreGrade = () => {
    const percentage = getScorePercentage();
    if (percentage >= 90) return { label: t('excellent'), color: '#4caf50' };
    if (percentage >= 70) return { label: t('good'), color: '#03dac6' };
    if (percentage >= 50) return { label: t('regular'), color: '#ffc107' };
    return { label: t('needsImprovement'), color: '#f44336' };
  };

  // Render conclusion screen
  if (isEnded) {
    const grade = getScoreGrade();
    return (
      <div className={styles.conclusion}>
        <div className={styles.trophyContainer}>
          <FontAwesomeIcon icon={faTrophy} className={styles.trophy} />
        </div>
        <h3>{t('caseCompleted')}</h3>

        <div className={styles.scoreCard}>
          <div className={styles.scoreHeader}>{t('yourScore')}</div>
          <div className={styles.scoreValue}>{score} pts</div>
          <div className={styles.scoreGrade} style={{ color: grade.color }}>
            {grade.label} ({getScorePercentage()}%)
          </div>
        </div>

        <div className={styles.summary}>
          <p>{currentBlock.content}</p>
          {currentBlock.summary && (
            <p className={styles.caseSummary}>{currentBlock.summary}</p>
          )}
          {currentBlock.learning_points?.length > 0 && (
            <div className={styles.learningPoints}>
              <h4>{t('keyLearningPoints')}</h4>
              <ul>
                {currentBlock.learning_points.map((point, i) => (
                  <li key={i}>{point}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <button onClick={handleRestart} className={styles.restartBtn}>
          <FontAwesomeIcon icon={faRedo} /> {t('playAgain')}
        </button>
      </div>
    );
  }

  // Render case in progress
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.caseTitle}>
          <FontAwesomeIcon icon={faStethoscope} />
          <h3>{clinicalCase.title}</h3>
        </div>
        <div className={styles.progress}>
          <div
            className={styles.progressFill}
            style={{ width: `${Math.min(((history.length + 1) / (clinicalCase.blocks?.length || 1)) * 100, 100)}%` }}
          />
        </div>
        <div className={styles.currentScore}>
          <span>{score} pts</span>
        </div>
      </div>

      <div className={styles.patientCard}>
        <div className={styles.patientInfo}>
          <FontAwesomeIcon icon={faUser} className={styles.patientIcon} />
          <span className={styles.patientDetails}>
            {clinicalCase.patient?.age} {t('yearsOld')}, {clinicalCase.patient?.gender === 'M' ? t('male') : t('female')}
          </span>
        </div>
        <span className={styles.complaint}>{clinicalCase.patient?.complaint}</span>
      </div>

      <div className={styles.scenario}>
        <p className={styles.scenarioText}>{currentBlock?.content}</p>

        {currentBlock?.vitals && (
          <div className={styles.vitals}>
            <div className={styles.vitalsHeader}>
              <FontAwesomeIcon icon={faHeartbeat} />
              <span>{t('vitalSigns')}</span>
            </div>
            <div className={styles.vitalsGrid}>
              {Object.entries(currentBlock.vitals).map(([key, value]) => (
                <div key={key} className={styles.vitalItem}>
                  <span className={styles.vitalLabel}>{key}</span>
                  <span className={styles.vitalValue}>{value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {currentBlock?.exam_results && (
          <div className={styles.examResults}>
            <div className={styles.examHeader}>
              <FontAwesomeIcon icon={faFlask} />
              <span>{t('examResults')}</span>
            </div>
            <div className={styles.examGrid}>
              {Object.entries(currentBlock.exam_results).map(([key, value]) => (
                <div key={key} className={styles.examItem}>
                  <span className={styles.examLabel}>{key}</span>
                  <span className={styles.examValue}>{value}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {currentBlock?.decision && (
        <div className={styles.decision}>
          <h4 className={styles.decisionQuestion}>{currentBlock.decision.question}</h4>
          <div className={styles.options}>
            {currentBlock.decision.options.map(option => {
              const isSelected = selectedOption?.id === option.id;
              const showResult = showFeedback && isSelected;

              return (
                <button
                  key={option.id}
                  className={`${styles.optionBtn} ${
                    showResult
                      ? option.is_best ? styles.correct : styles.wrong
                      : ''
                  } ${isSelected ? styles.selected : ''}`}
                  onClick={() => handleSelect(option)}
                  disabled={showFeedback}
                >
                  <span className={styles.optionText}>{option.text}</span>
                  {showResult && (
                    <FontAwesomeIcon
                      icon={option.is_best ? faCheck : faTimes}
                      className={styles.resultIcon}
                    />
                  )}
                </button>
              );
            })}
          </div>

          {showFeedback && selectedOption && (
            <div className={`${styles.feedback} ${selectedOption.is_best ? styles.positive : styles.negative}`}>
              <div className={styles.feedbackHeader}>
                <FontAwesomeIcon icon={selectedOption.is_best ? faCheck : faTimes} />
                <span>{selectedOption.is_best ? t('correctChoice') : t('suboptimalChoice')}</span>
                <span className={styles.pointsEarned}>+{selectedOption.points || 0} pts</span>
              </div>
              <p className={styles.feedbackText}>{selectedOption.feedback}</p>
              <button onClick={handleContinue} className={styles.continueBtn}>
                {t('continue')} <FontAwesomeIcon icon={faArrowRight} />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ClinicalCasePlayer;
