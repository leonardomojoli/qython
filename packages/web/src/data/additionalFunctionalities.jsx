import React from 'react';

export const getAdditionalFunctionalities = (t) => [
    {
        id: 3,
        icon: '🎓',
        titleKey: 'studyMaterials',
        subtitleKey: 'studyMaterialsSubtitle',
        modalTitle: t('studyMaterialsModalTitle'),
        modalContent: (
            <div>
                <h2>{t('studyMaterialsModalHeading')}</h2>
                <p>{t('studyMaterialsModalIntro')}</p>
                <h3>{t('studyMaterialsFeature1Title')}</h3>
                <p>{t('studyMaterialsFeature1Desc')}</p>
                <h3>{t('studyMaterialsFeature2Title')}</h3>
                <p>{t('studyMaterialsFeature2Desc')}</p>
                <h3>{t('studyMaterialsFeature3Title')}</h3>
                <p>{t('studyMaterialsFeature3Desc')}</p>
                <button className="modal-cta-button">{t('tryStudyMaterials')}</button>
            </div>
        ),
    },
    {
        id: 4,
        icon: '🏆',
        titleKey: 'arenaCompetition',
        subtitleKey: 'arenaSubtitle',
        modalTitle: t('arenaModalTitle'),
        modalContent: (
            <div>
                <h2>{t('arenaModalHeading')}</h2>
                <p>{t('arenaModalIntro')}</p>
                <h3>{t('arenaFeature1Title')}</h3>
                <p>{t('arenaFeature1Desc')}</p>
                <h3>{t('arenaFeature2Title')}</h3>
                <p>{t('arenaFeature2Desc')}</p>
                <h3>{t('arenaFeature3Title')}</h3>
                <p>{t('arenaFeature3Desc')}</p>
                <button className="modal-cta-button">{t('tryArena')}</button>
            </div>
        ),
    },
    {
        id: 5,
        icon: '📚',
        titleKey: 'intelligentLibrary',
        subtitleKey: 'librarySubtitle',
        modalTitle: t('libraryModalTitle'),
        modalContent: (
            <div>
                <h2>{t('libraryModalHeading')}</h2>
                <p>{t('libraryModalIntro')}</p>
                <h3>{t('libraryFeature1Title')}</h3>
                <p>{t('libraryFeature1Desc')}</p>
                <h3>{t('libraryFeature2Title')}</h3>
                <p>{t('libraryFeature2Desc')}</p>
                <h3>{t('libraryFeature3Title')}</h3>
                <p>{t('libraryFeature3Desc')}</p>
                <button className="modal-cta-button">{t('tryLibrary')}</button>
            </div>
        ),
    },
    {
        id: 6,
        icon: '🔬',
        titleKey: 'imageAnalysis',
        subtitleKey: 'imageAnalysisSubtitle',
        modalTitle: t('imageAnalysisModalTitle'),
        modalContent: (
            <div>
                <h2>{t('imageAnalysisModalHeading')}</h2>
                <p>{t('imageAnalysisModalIntro')}</p>
                <h3>{t('imageAnalysisFeature1Title')}</h3>
                <p>{t('imageAnalysisFeature1Desc')}</p>
                <h3>{t('imageAnalysisFeature2Title')}</h3>
                <p>{t('imageAnalysisFeature2Desc')}</p>
                <h3>{t('imageAnalysisFeature3Title')}</h3>
                <p>{t('imageAnalysisFeature3Desc')}</p>
                <button className="modal-cta-button">{t('tryImageAnalysis')}</button>
            </div>
        ),
    },
    {
        id: 7,
        icon: '📝',
        titleKey: 'examSimulations',
        subtitleKey: 'examSimulationsSubtitle',
        modalTitle: t('examSimulationsModalTitle'),
        modalContent: (
            <div>
                <h2>{t('examSimulationsModalHeading')}</h2>
                <p>{t('examSimulationsModalIntro')}</p>
                <h3>{t('examSimulationsFeature1Title')}</h3>
                <p>{t('examSimulationsFeature1Desc')}</p>
                <h3>{t('examSimulationsFeature2Title')}</h3>
                <p>{t('examSimulationsFeature2Desc')}</p>
                <h3>{t('examSimulationsFeature3Title')}</h3>
                <p>{t('examSimulationsFeature3Desc')}</p>
                <button className="modal-cta-button">{t('tryExamSimulations')}</button>
            </div>
        ),
    },
];
