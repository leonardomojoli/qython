// frontend/src/components/user/AchievementsSection.js
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../api';
import styles from './Profile.module.css';
import InlineLoading from '../shared/InlineLoading';

// Category display order and labels
const CATEGORY_CONFIG = {
  onboarding: { labelKey: 'categoryOnboarding', order: 0 },
  consultas: { labelKey: 'categoryConsultas', order: 1 },
  arena: { labelKey: 'categoryArena', order: 2 },
  pesquisa: { labelKey: 'categoryPesquisa', order: 3 },
};

// Default labels if translation keys don't exist
const DEFAULT_LABELS = {
  categoryOnboarding: 'Bem-Vindo',
  categoryConsultas: 'Consultas',
  categoryArena: 'Arena',
  categoryPesquisa: 'Pesquisa',
};

const AchievementsSection = () => {
  const { t } = useTranslation();
  const [allAchievements, setAllAchievements] = useState({});
  const [userAchievements, setUserAchievements] = useState([]);
  const [userStats, setUserStats] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        const [allRes, userRes, statsRes] = await Promise.all([
          api.get('/user/achievements/all'),
          api.get('/user/achievements'),
          api.get('/user/stats')
        ]);
        setAllAchievements(allRes.data);
        setUserAchievements(userRes.data.map(ach => ach.badge_code));
        setUserStats(statsRes.data);
      } catch (error) {
        console.error("Error fetching achievements:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  if (isLoading) {
    return <InlineLoading text={t('loadingAchievements')} />;
  }

  // Group achievements by category
  const groupedAchievements = {};
  Object.entries(allAchievements).forEach(([code, details]) => {
    const category = details.category || 'other';
    if (!groupedAchievements[category]) {
      groupedAchievements[category] = [];
    }
    groupedAchievements[category].push({ code, ...details });
  });

  // Sort categories by order
  const sortedCategories = Object.keys(groupedAchievements).sort((a, b) => {
    const orderA = CATEGORY_CONFIG[a]?.order ?? 99;
    const orderB = CATEGORY_CONFIG[b]?.order ?? 99;
    return orderA - orderB;
  });

  // Calculate progress for next achievement in category
  const getProgress = (category, achievements) => {
    const thresholds = achievements
      .map(a => {
        const parts = a.code.split('_');
        return parts.length === 2 ? parseInt(parts[1], 10) : null;
      })
      .filter(t => t !== null)
      .sort((a, b) => a - b);

    // Get current count based on category
    let currentCount = 0;
    if (category === 'consultas' && userStats?.consultations_created != null) {
      currentCount = userStats.consultations_created;
    } else if (category === 'arena' && userStats?.quizzes_completed != null) {
      currentCount = userStats.quizzes_completed;
    } else if (category === 'pesquisa' && userStats?.copilot_conversations != null) {
      currentCount = userStats.copilot_conversations;
    }

    // Find next incomplete threshold
    const completedCodes = userAchievements;
    for (const threshold of thresholds) {
      const code = Object.keys(allAchievements).find(c => {
        const details = allAchievements[c];
        return details.category === category && c.endsWith(`_${threshold}`);
      });
      if (code && !completedCodes.includes(code)) {
        return {
          current: currentCount,
          target: threshold,
          percentage: Math.min(100, Math.round((currentCount / threshold) * 100))
        };
      }
    }
    return null; // All completed
  };

  const getCategoryLabel = (category) => {
    const config = CATEGORY_CONFIG[category];
    if (config) {
      return t(config.labelKey, DEFAULT_LABELS[config.labelKey]);
    }
    return category.charAt(0).toUpperCase() + category.slice(1);
  };

  return (
    <div className="profile-section">
      <h3 className={styles['tab-section-title']}>{t('achievements')}</h3>

      {sortedCategories.map(category => {
        const achievements = groupedAchievements[category];
        const progress = getProgress(category, achievements);

        return (
          <div key={category} className={styles.achievementCategory}>
            <h4 className={styles.categoryTitle}>{getCategoryLabel(category)}</h4>

            <div className={styles.achievementsGrid}>
              {achievements.map(({ code, title, description, icon }) => {
                const isUnlocked = userAchievements.includes(code);
                const badgeClasses = `${styles.achievementBadge} ${!isUnlocked ? styles.locked : ''}`;

                return (
                  <div
                    key={code}
                    className={badgeClasses}
                    title={`${title}: ${description}`}
                  >
                    <div className={styles.achievementIconWrapper}>
                      {isUnlocked ? (
                        <span className={styles.checkmark}>✓</span>
                      ) : (
                        <span className={styles.lockIcon}>○</span>
                      )}
                    </div>
                    <span className={styles.achievementTitle}>{title}</span>
                  </div>
                );
              })}
            </div>

            {progress && (
              <div className={styles.progressSection}>
                <div className={styles.progressLabel}>
                  {progress.current}/{progress.target}
                </div>
                <div className={styles.progressBar}>
                  <div
                    className={styles.progressFill}
                    style={{ width: `${progress.percentage}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default AchievementsSection;
