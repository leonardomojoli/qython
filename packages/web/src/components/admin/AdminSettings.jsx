import React, { useState, useEffect, useCallback } from 'react';
import AdminLayout from './AdminLayout';
import { useNotification } from '../../contexts/NotificationContext';
import { api } from '../../api';
import { useTranslation } from 'react-i18next';
import {
    FaUserShield, FaToggleOn, FaToggleOff,
    FaHistory, FaExclamationTriangle,
    FaSpinner, FaSyncAlt
} from 'react-icons/fa';
import styles from './AdminSettings.module.css';

const AdminSettings = () => {
    const { addNotification } = useNotification();
    const { t } = useTranslation();
    // Loading states
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Settings state
    const [settings, setSettings] = useState({
        new_registrations_enabled: true,
        require_invite: false,
        rate_limit_enabled: true,
        rate_limit_requests_per_minute: 60,
    });

    // Audit log state
    const [auditLog, setAuditLog] = useState([]);
    const [auditLoading, setAuditLoading] = useState(false);

    // Rate limit violations
    const [violations, setViolations] = useState([]);
    const [violationsLoading, setViolationsLoading] = useState(false);

    // Confirmation modal
    const [confirmModal, setConfirmModal] = useState({ open: false, key: '', newValue: '', reason: '' });

    // Fetch all settings
    const fetchSettings = useCallback(async () => {
        try {
            const response = await api.get('/admin/settings');
            const data = response.data;

            setSettings({
                new_registrations_enabled: data.new_registrations_enabled === 'true',
                require_invite: data.require_invite === 'true',
                rate_limit_enabled: data.rate_limit_enabled === 'true',
                rate_limit_requests_per_minute: parseInt(data.rate_limit_requests_per_minute) || 60,
            });
        } catch (error) {
            console.error('Error fetching settings:', error);
            addNotification('Erro ao carregar configurações', 'error');
        } finally {
            setLoading(false);
        }
    }, [addNotification]);

    // Fetch audit log
    const fetchAuditLog = useCallback(async () => {
        setAuditLoading(true);
        try {
            const response = await api.get('/admin/settings/audit-log?limit=10');
            setAuditLog(response.data);
        } catch (error) {
            console.error('Error fetching audit log:', error);
        } finally {
            setAuditLoading(false);
        }
    }, []);

    // Fetch rate limit violations
    const fetchViolations = useCallback(async () => {
        setViolationsLoading(true);
        try {
            const response = await api.get('/admin/rate-limits/violations?hours=24');
            setViolations(response.data.violations || []);
        } catch (error) {
            console.error('Error fetching violations:', error);
        } finally {
            setViolationsLoading(false);
        }
    }, []);

    // Initial load
    useEffect(() => {
        fetchSettings();
        fetchAuditLog();
        fetchViolations();
    }, [fetchSettings, fetchAuditLog, fetchViolations]);

    // Update a single setting
    const updateSetting = async (key, value, reason = '') => {
        setSaving(true);
        try {
            await api.put(`/admin/settings/${key}`, { value: String(value), reason });
            addNotification(`Configuração "${key}" atualizada com sucesso`, 'success');
            fetchAuditLog(); // Refresh audit log
        } catch (error) {
            console.error('Error updating setting:', error);
            addNotification('Erro ao atualizar configuração', 'error');
            // Revert to previous value
            fetchSettings();
        } finally {
            setSaving(false);
            setConfirmModal({ open: false, key: '', newValue: '', reason: '' });
        }
    };

    // Toggle with confirmation for critical settings
    const handleToggle = (key) => {
        const newValue = !settings[key];
        const criticalSettings = ['new_registrations_enabled'];

        if (criticalSettings.includes(key) && !newValue) {
            // Show confirmation modal for disabling critical settings
            setConfirmModal({
                open: true,
                key,
                newValue: String(newValue),
                reason: ''
            });
        } else {
            // Update directly
            setSettings(prev => ({ ...prev, [key]: newValue }));
            updateSetting(key, newValue);
        }
    };

    // Confirm modal action
    const confirmAction = () => {
        updateSetting(confirmModal.key, confirmModal.newValue, confirmModal.reason);
        setSettings(prev => ({ ...prev, [confirmModal.key]: confirmModal.newValue === 'true' }));
    };

    // Render toggle button
    const ToggleButton = ({ active, onClick, disabled, color = '#03dac6' }) => (
        <button
            onClick={onClick}
            disabled={disabled || saving}
            className={styles.toggleButton}
            style={{ color: active ? color : '#4a4a4a' }}
        >
            {saving ? <FaSpinner className={styles.spinner} /> : (active ? <FaToggleOn /> : <FaToggleOff />)}
        </button>
    );

    if (loading) {
        return (
            <AdminLayout>
                <div className={styles.loadingContainer}>
                    <FaSpinner className={styles.spinner} size={40} />
                    <p>Carregando configurações...</p>
                </div>
            </AdminLayout>
        );
    }

    return (
        <AdminLayout>
            <div className="admin-header">
                <h1>{t('systemSettings') || 'Configurações do Sistema'}</h1>
                <div className="admin-actions">
                    <button
                        className={styles.refreshButton}
                        onClick={() => { fetchSettings(); fetchAuditLog(); }}
                    >
                        <FaSyncAlt /> Atualizar
                    </button>
                </div>
            </div>

            {/* Confirmation Modal */}
            {confirmModal.open && (
                <div className={styles.modalOverlay} onClick={() => setConfirmModal({ open: false, key: '', newValue: '', reason: '' })}>
                    <div className={styles.modal} onClick={e => e.stopPropagation()}>
                        <h3><FaExclamationTriangle style={{ color: '#ff6b6b' }} /> Confirmar Alteração</h3>
                        <p>Você está prestes a alterar uma configuração crítica do sistema.</p>
                        <div className={styles.modalField}>
                            <label>Motivo (opcional):</label>
                            <input
                                type="text"
                                value={confirmModal.reason}
                                onChange={(e) => setConfirmModal(prev => ({ ...prev, reason: e.target.value }))}
                                placeholder="Motivo da alteração..."
                            />
                        </div>
                        <div className={styles.modalActions}>
                            <button
                                className={styles.cancelButton}
                                onClick={() => setConfirmModal({ open: false, key: '', newValue: '', reason: '' })}
                            >
                                Cancelar
                            </button>
                            <button className={styles.confirmButton} onClick={confirmAction}>
                                {saving ? <FaSpinner className={styles.spinner} /> : 'Confirmar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className={styles.settingsGrid}>
                {/* Access Control Card */}
                <div className={styles.card}>
                    <div className={styles.cardHeader}>
                        <FaUserShield size={24} style={{ color: '#03dac6' }} />
                        <h3>Controle de Acesso</h3>
                    </div>

                    <div className={styles.settingsList}>
                        <div className={styles.settingItem}>
                            <div className={styles.settingInfo}>
                                <div>
                                    <strong>Novos Cadastros</strong>
                                    <span>Permitir novos usuários se registrar</span>
                                </div>
                            </div>
                            <ToggleButton
                                active={settings.new_registrations_enabled}
                                onClick={() => handleToggle('new_registrations_enabled')}
                            />
                        </div>

                        <div className={styles.settingItem}>
                            <div className={styles.settingInfo}>
                                <div>
                                    <strong>Exigir Convite (Waitlist)</strong>
                                    <span>Ligado: usuário verificado precisa de convite. Desligado: entra direto (sem fricção).</span>
                                </div>
                            </div>
                            <ToggleButton
                                active={settings.require_invite}
                                onClick={() => handleToggle('require_invite')}
                            />
                        </div>

                        <div className={styles.settingItem}>
                            <div className={styles.settingInfo}>
                                <div>
                                    <strong>Rate Limiting</strong>
                                    <span>{settings.rate_limit_requests_per_minute} req/min por usuário</span>
                                </div>
                            </div>
                            <ToggleButton
                                active={settings.rate_limit_enabled}
                                onClick={() => handleToggle('rate_limit_enabled')}
                            />
                        </div>
                    </div>
                </div>

                {/* Audit Log Card */}
                <div className={styles.card}>
                    <div className={styles.cardHeader}>
                        <FaHistory size={24} style={{ color: '#bb86fc' }} />
                        <h3>Log de Alterações</h3>
                        {auditLoading && <FaSpinner className={styles.spinner} />}
                    </div>

                    {auditLog.length > 0 ? (
                        <div className={styles.auditList}>
                            {auditLog.map((log) => (
                                <div key={log.id} className={styles.auditItem}>
                                    <div className={styles.auditTime}>
                                        {new Date(log.changed_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                                    </div>
                                    <div className={styles.auditContent}>
                                        <span className={styles.auditUser}>{log.changed_by}</span>
                                        <span className={styles.auditKey}>{log.setting_key}</span>
                                        <span className={styles.auditChange}>
                                            {log.old_value ? (
                                                <><span className={styles.oldValue}>{log.old_value}</span> → </>
                                            ) : null}
                                            <span className={styles.newValue}>{log.new_value}</span>
                                        </span>
                                        {log.reason && <span className={styles.auditReason}>"{log.reason}"</span>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className={styles.noData}>Nenhuma alteração registrada</p>
                    )}
                </div>

                {/* Rate Limit Violations Card */}
                <div className={styles.card}>
                    <div className={styles.cardHeader}>
                        <FaExclamationTriangle size={24} style={{ color: '#ff6b6b' }} />
                        <h3>Violações de Rate Limit (24h)</h3>
                        {violationsLoading && <FaSpinner className={styles.spinner} />}
                    </div>

                    {violations.length > 0 ? (
                        <div className={styles.violationsList}>
                            {violations.map((v, idx) => (
                                <div key={idx} className={styles.violationItem}>
                                    <span className={styles.violationIp}>{v.ip_address}</span>
                                    <span className={styles.violationCount}>{v.request_count} requisições</span>
                                    <span className={styles.violationTime}>
                                        Último: {new Date(v.last_seen).toLocaleString('pt-BR', { timeStyle: 'short' })}
                                    </span>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className={styles.noData}>Nenhuma violação nas últimas 24h</p>
                    )}
                </div>
            </div>
        </AdminLayout>
    );
};

export default AdminSettings;
