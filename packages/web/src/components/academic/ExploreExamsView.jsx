// frontend/src/components/academic/ExploreExamsView.js

import React from 'react';
import { useTranslation } from 'react-i18next';
import styles from './ArenaQython.module.css';

const ExploreExamsView = ({ availableExams, enrolledExamCodes, onEnroll }) => {
  const { t } = useTranslation();

  return (
    <div className={styles.cardsContainer}>
      {availableExams.map(exam => {
        const isEnrolled = enrolledExamCodes.includes(exam.exam_code);
        return (
          <div key={exam.exam_code} className={styles.card}>
            <h3 className={styles.cardTitle}>{exam.flag} {t(exam.title_key)}</h3>
            <p className={styles.cardDescription}>{t(exam.description_key)}</p>
            <button
              onClick={() => onEnroll(exam.exam_code)}
              disabled={isEnrolled}
              className={styles.enrollButton}
            >
              {isEnrolled ? t('enrolled') : t('enroll')}
            </button>
          </div>
        );
      })}
    </div>
  );
};

export default ExploreExamsView;