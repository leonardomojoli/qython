// frontend/src/components/InlineLoading.js
import React from 'react';
import styles from './InlineLoading.module.css';

const InlineLoading = ({ text, size = 80 }) => {
  return (
    <div className={styles.loadingContainer}>
      <svg className={styles.dnaSvg} viewBox="10 25 90 50" preserveAspectRatio="xMidYMid meet" style={{ width: size, height: size }}>
        <g className={styles.dnaHelix}>
          <path
            className={styles.dnaStrand1}
            d="M10,50 Q25,25 40,50 T70,50 T100,50"
            fill="none"
            stroke="var(--primary-color)"
            strokeWidth="2"
          />
          <path
            className={styles.dnaStrand2}
            d="M10,50 Q25,75 40,50 T70,50 T100,50"
            fill="none"
            stroke="var(--secondary-color)"
            strokeWidth="2"
          />
          {[...Array(10)].map((_, i) => (
            <line
              key={i}
              x1={10 + i * 9}
              y1="50"
              x2={10 + i * 9}
              y2="50"
              stroke="var(--accent-color)"
              strokeWidth="1"
              className={styles.dnaBar}
              style={{ '--delay': `${i * 0.1}s` }}
            />
          ))}
        </g>
      </svg>
      {text && <p className={styles.loadingText}>{text}</p>}
    </div>
  );
};

export default InlineLoading;