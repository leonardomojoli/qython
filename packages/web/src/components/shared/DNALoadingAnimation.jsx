// frontend/src/components/shared/DNALoadingAnimation.js
import React from 'react';
import styles from './DNALoadingAnimation.module.css';

const DNALoadingAnimation = () => {
  return (
    <div className={styles.dnaContainer}>
      {/* Ajustado viewBox para centralização horizontal e vertical */}
      <svg className={styles.dnaSvg} viewBox="10 25 90 50" preserveAspectRatio="xMidYMid meet">
        <g className={styles.dnaHelix}>
          {/* Primeira hélice: Violet/Purple (cor primária) */}
          <path
            className={styles.dnaStrand1}
            d="M10,50 Q25,25 40,50 T70,50 T100,50"
            fill="none"
            stroke="var(--brand-primary)"
            strokeWidth="2"
          />
          {/* Segunda hélice: Teal/Turquesa (sempre turquesa para contraste visual) */}
          <path
            className={styles.dnaStrand2}
            d="M10,50 Q25,75 40,50 T70,50 T100,50"
            fill="none"
            stroke="#2dd4bf"
            strokeWidth="2"
          />
          {/* Barras horizontais */}
          {[...Array(10)].map((_, i) => (
            <line
              key={i}
              x1={10 + i * 9}
              y1="50"
              x2={10 + i * 9}
              y2="50"
              stroke="var(--brand-primary-light)"
              strokeWidth="1"
              className={styles.dnaBar}
              style={{ '--delay': `${i * 0.1}s` }}
            />
          ))}
        </g>
      </svg>
    </div>
  );
};

export default DNALoadingAnimation;
