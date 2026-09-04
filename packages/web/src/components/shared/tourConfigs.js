// frontend/src/components/shared/tourConfigs.js
// Tour configurations for all sections

// ===== CONSULTATION MANAGER TOUR =====
export const consultationTourSteps = [
    { id: 'welcome', target: null, titleKey: 'tourConsultationWelcomeTitle', descKey: 'tourConsultationWelcomeDesc', position: 'center' },
    { id: 'specialty', target: '[data-tour="specialty-select"]', titleKey: 'tourSpecialtyTitle', descKey: 'tourSpecialtyDesc', position: 'bottom' },
    { id: 'editor', target: '[data-tour="editor-area"]', titleKey: 'tourEditorTitle', descKey: 'tourEditorDesc', position: 'top' },
    { id: 'improve', target: '[data-tour="improve-button"]', titleKey: 'tourImproveTitle', descKey: 'tourImproveDesc', position: 'top' },
    { id: 'navigation', target: '[data-tour="nav-buttons"]', titleKey: 'tourNavTitle', descKey: 'tourNavDesc', position: 'bottom' },
    { id: 'finish', target: null, titleKey: 'tourFinishTitle', descKey: 'tourFinishDesc', position: 'center' }
];

// Handler for consultation tour - switches to "Nova Consulta" tab when needed
export const handleConsultationStepChange = (step) => {
    const stepsRequiringFormTab = ['specialty', 'editor', 'improve'];
    if (stepsRequiringFormTab.includes(step.id)) {
        const navButtons = document.querySelector('[data-tour="nav-buttons"]');
        if (navButtons) {
            const newConsultationBtn = navButtons.querySelectorAll('button')[1];
            if (newConsultationBtn) {
                newConsultationBtn.click();
            }
        }
    }
};

// ===== COPILOT (NEURALWEB) TOUR =====
export const copilotTourSteps = [
    { id: 'welcome', target: null, titleKey: 'tourWelcomeTitle', descKey: 'tourWelcomeDesc', position: 'center' },
    { id: 'input', target: '[data-tour="copilot-input"]', titleKey: 'tourCopilotInputTitle', descKey: 'tourCopilotInputDesc', position: 'top' },
    { id: 'attachments', target: '[data-tour="copilot-attachments"]', titleKey: 'tourCopilotAttachTitle', descKey: 'tourCopilotAttachDesc', position: 'top' },
    { id: 'library', target: '[data-tour="copilot-library"]', titleKey: 'tourCopilotLibraryTitle', descKey: 'tourCopilotLibraryDesc', position: 'top' },
    { id: 'conversations', target: '[data-tour="copilot-conversations"]', titleKey: 'tourCopilotConversationsTitle', descKey: 'tourCopilotConversationsDesc', position: 'bottom' },
    { id: 'finish', target: null, titleKey: 'tourCopilotFinishTitle', descKey: 'tourCopilotFinishDesc', position: 'center' }
];

// ===== ACADEMIC CENTER TOUR =====
export const academicTourSteps = [
    { id: 'welcome', target: null, titleKey: 'tourAcademicWelcomeTitle', descKey: 'tourAcademicWelcomeDesc', position: 'center' },
    { id: 'navigation', target: '[data-tour="academic-nav"]', titleKey: 'tourAcademicNavTitle', descKey: 'tourAcademicNavDesc', position: 'bottom' },
    { id: 'libraries', target: '[data-tour="academic-libraries"]', titleKey: 'tourAcademicLibrariesTitle', descKey: 'tourAcademicLibrariesDesc', position: 'bottom' },
    { id: 'producer', target: '[data-tour="academic-producer"]', titleKey: 'tourAcademicProducerTitle', descKey: 'tourAcademicProducerDesc', position: 'bottom' },
    { id: 'arena', target: '[data-tour="academic-arena"]', titleKey: 'tourAcademicArenaTitle', descKey: 'tourAcademicArenaDesc', position: 'bottom' },
    { id: 'finish', target: null, titleKey: 'tourAcademicFinishTitle', descKey: 'tourAcademicFinishDesc', position: 'center' }
];

// ===== PROFILE TOUR =====
export const profileTourSteps = [
    { id: 'welcome', target: null, titleKey: 'tourProfileWelcomeTitle', descKey: 'tourProfileWelcomeDesc', position: 'center' },
    { id: 'stats', target: '[data-tour="profile-stats"]', titleKey: 'tourProfileStatsTitle', descKey: 'tourProfileStatsDesc', position: 'bottom', tab: 'perfil' },
    { id: 'personalInfo', target: '[data-tour="profile-personal-info"]', titleKey: 'tourProfileInfoTitle', descKey: 'tourProfileInfoDesc', position: 'top', tab: 'perfil' },
    { id: 'billing', target: '[data-tour="profile-billing"]', titleKey: 'tourProfileBillingTitle', descKey: 'tourProfileBillingDesc', position: 'left', tab: 'faturamento' },
    { id: 'reset', target: '[data-tour="profile-reset-tour"]', titleKey: 'tourProfileResetTitle', descKey: 'tourProfileResetDesc', position: 'top', tab: 'configuracoes' },
    { id: 'finish', target: null, titleKey: 'tourProfileFinishTitle', descKey: 'tourProfileFinishDesc', position: 'center' }
];

// Handler for profile tour - switches to correct tab when needed
export const handleProfileStepChange = (step) => {
    if (step.tab) {
        const tabButton = document.querySelector(`[data-tour="profile-tab-${step.tab}"]`);
        if (tabButton) {
            tabButton.click();
        }
    }
};

