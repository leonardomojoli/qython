import React, { useState, useEffect, useCallback } from 'react';
import AdminLayout from './AdminLayout';
import { useNotification } from '../../contexts/NotificationContext';
import { api } from '../../api';
import { useTranslation } from 'react-i18next';
import {
    FaServer, FaUserShield, FaToggleOn, FaToggleOff, FaSave,
    FaCreditCard, FaChartLine, FaHistory, FaExclamationTriangle,
    FaSpinner, FaClock, FaShieldAlt, FaSyncAlt
} from 'react-icons/fa';
import { SiStripe } from 'react-icons/si';
import styles from './AdminSettings.module.css';

const AdminSettings = () => {
    const { addNotification } = useNotification();
    const { t } = useTranslation();

    // Loading states
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Settings state
    const [settings, setSettings] = useState({
        payment_gateway_stripe_enabled: false,
        payment_gateway_binance_enabled: false,
        payment_gateway_dlocal_enabled: false,
        server_maintenance_level: 0,
        new_registrations_enabled: true,
        require_invite: false,
        rate_limit_enabled: true,
        rate_limit_requests_per_minute: 60,
        auto_maintenance_enabled: true,
        auto_maintenance_cpu_threshold: 90,
        auto_maintenance_memory_threshold: 85,
    });

    // Server metrics state
    const [metrics, setMetrics] = useState(null);
    const [metricsLoading, setMetricsLoading] = useState(false);

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
                payment_gateway_stripe_enabled: data.payment_gateway_stripe_enabled === 'true',
                payment_gateway_binance_enabled: data.payment_gateway_binance_enabled === 'true',
                payment_gateway_dlocal_enabled: data.payment_gateway_dlocal_enabled === 'true',
                server_maintenance_level: parseInt(data.server_maintenance_level) || 0,
                new_registrations_enabled: data.new_registrations_enabled === 'true',
                require_invite: data.require_invite === 'true',
                rate_limit_enabled: data.rate_limit_enabled === 'true',
                rate_limit_requests_per_minute: parseInt(data.rate_limit_requests_per_minute) || 60,
                auto_maintenance_enabled: data.auto_maintenance_enabled === 'true',
                auto_maintenance_cpu_threshold: parseInt(data.auto_maintenance_cpu_threshold) || 90,
                auto_maintenance_memory_threshold: parseInt(data.auto_maintenance_memory_threshold) || 85,
            });
        } catch (error) {
            console.error('Error fetching settings:', error);
            addNotification('Erro ao carregar configurações', 'error');
        } finally {
            setLoading(false);
        }
    }, [addNotification]);

    // Fetch server metrics
    const fetchMetrics = useCallback(async () => {
        setMetricsLoading(true);
        try {
            const response = await api.get('/admin/metrics?hours=1');
            setMetrics(response.data);
        } catch (error) {
            console.error('Error fetching metrics:', error);
        } finally {
            setMetricsLoading(false);
        }
    }, []);

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
        fetchMetrics();
        fetchAuditLog();
        fetchViolations();

        // Refresh metrics every 60 seconds
        const metricsInterval = setInterval(fetchMetrics, 60000);
        return () => clearInterval(metricsInterval);
    }, [fetchSettings, fetchMetrics, fetchAuditLog, fetchViolations]);

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
        const criticalSettings = ['payment_gateway_stripe_enabled', 'payment_gateway_binance_enabled', 'payment_gateway_dlocal_enabled', 'new_registrations_enabled'];

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

    // Handle maintenance level change
    const handleMaintenanceLevelChange = (level) => {
        if (level > settings.server_maintenance_level) {
            // Escalating - show confirmation
            setConfirmModal({
                open: true,
                key: 'server_maintenance_level',
                newValue: String(level),
                reason: ''
            });
        } else {
            // De-escalating
            setSettings(prev => ({ ...prev, server_maintenance_level: level }));
            updateSetting('server_maintenance_level', level);
        }
    };

    // Override auto-maintenance
    const handleOverrideAutoMaintenance = async (hours) => {
        try {
            await api.post(`/admin/maintenance/override?hours=${hours}`);
            addNotification(`Auto-manutenção desabilitada por ${hours} hora(s)`, 'success');
            fetchAuditLog();
        } catch (error) {
            addNotification('Erro ao desabilitar auto-manutenção', 'error');
        }
    };

    // Confirm modal action
    const confirmAction = () => {
        updateSetting(confirmModal.key, confirmModal.newValue, confirmModal.reason);
        setSettings(prev => ({
            ...prev,
            [confirmModal.key]: confirmModal.key === 'server_maintenance_level'
                ? parseInt(confirmModal.newValue)
                : confirmModal.newValue === 'true'
        }));
    };

    // Render progress bar
    const ProgressBar = ({ value, color, threshold }) => (
        <div className={styles.progressBar}>
            <div
                className={styles.progressFill}
                style={{
                    width: `${value || 0}%`,
                    backgroundColor: value > (threshold || 90) ? '#ff6b6b' : color
                }}
            />
            <span className={styles.progressValue}>{value?.toFixed(1) || 0}%</span>
        </div>
    );

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
                        onClick={() => { fetchSettings(); fetchMetrics(); fetchAuditLog(); }}
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
                {/* Server Metrics Card */}
                <div className={styles.card}>
                    <div className={styles.cardHeader}>
                        <FaChartLine size={24} style={{ color: '#03dac6' }} />
                        <h3>Métricas do Servidor</h3>
                        {metricsLoading && <FaSpinner className={styles.spinner} />}
                    </div>

                    {metrics?.latest ? (
                        <div className={styles.metricsGrid}>
                            <div className={styles.metricItem}>
                                <label>CPU</label>
                                <ProgressBar
                                    value={metrics.latest.cpu_percent}
                                    color="#03dac6"
                                    threshold={settings.auto_maintenance_cpu_threshold}
                                />
                            </div>
                            <div className={styles.metricItem}>
                                <label>Memória</label>
                                <ProgressBar
                                    value={metrics.latest.memory_percent}
                                    color="#bb86fc"
                                    threshold={settings.auto_maintenance_memory_threshold}
                                />
                            </div>
                            <div className={styles.metricItem}>
                                <label>Disco</label>
                                <ProgressBar value={metrics.latest.disk_percent} color="#6627cd" threshold={90} />
                            </div>
                            <div className={styles.metricItem}>
                                <label>Conexões Ativas</label>
                                <span className={styles.metricValue}>{metrics.latest.active_connections || 0}</span>
                            </div>
                        </div>
                    ) : (
                        <p className={styles.noData}>Nenhuma métrica disponível</p>
                    )}
                </div>

                {/* Payment Gateways Card */}
                <div className={styles.card}>
                    <div className={styles.cardHeader}>
                        <FaCreditCard size={24} style={{ color: '#bb86fc' }} />
                        <h3>Gateways de Pagamento</h3>
                    </div>

                    <div className={styles.settingsList}>
                        <div className={styles.settingItem}>
                            <div className={styles.settingInfo}>
                                <FaCreditCard size={20} style={{ color: '#1a8cff' }} />
                                <div>
                                    <strong>dLocal</strong>
                                    <span>Cartão, PIX e boleto (LatAm) — merchant Olympos Group SAS</span>
                                </div>
                            </div>
                            <ToggleButton
                                active={settings.payment_gateway_dlocal_enabled}
                                onClick={() => handleToggle('payment_gateway_dlocal_enabled')}
                            />
                        </div>

                        <div className={styles.settingItem}>
                            <div className={styles.settingInfo}>
                                <SiStripe size={20} style={{ color: '#6772e5' }} />
                                <div>
                                    <strong>Stripe</strong>
                                    <span>Cartões de crédito e débito</span>
                                </div>
                            </div>
                            <ToggleButton
                                active={settings.payment_gateway_stripe_enabled}
                                onClick={() => handleToggle('payment_gateway_stripe_enabled')}
                            />
                        </div>

                        <div className={styles.settingItem}>
                            <div className={styles.settingInfo}>
                                <span style={{ fontWeight: 'bold', color: '#f0b90b' }}>B</span>
                                <div>
                                    <strong>Binance Pay</strong>
                                    <span>Criptomoedas</span>
                                </div>
                            </div>
                            <ToggleButton
                                active={settings.payment_gateway_binance_enabled}
                                onClick={() => handleToggle('payment_gateway_binance_enabled')}
                            />
                        </div>
                    </div>
                </div>

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

                {/* Maintenance Mode Card */}
                <div className={styles.card}>
                    <div className={styles.cardHeader}>
                        <FaServer size={24} style={{ color: '#ff6b6b' }} />
                        <h3>Modo de Manutenção</h3>
                    </div>

                    <div className={styles.maintenanceLevels}>
                        {[
                            { level: 0, name: 'Normal', desc: 'Tudo funcionando', color: '#03dac6' },
                            { level: 1, name: 'Alto Tráfego', desc: 'Cadastros pausados', color: '#f0b90b' },
                            { level: 2, name: 'Manutenção', desc: 'Somente leitura', color: '#ff6b6b' },
                        ].map(({ level, name, desc, color }) => (
                            <button
                                key={level}
                                className={`${styles.levelButton} ${settings.server_maintenance_level === level ? styles.levelActive : ''}`}
                                onClick={() => handleMaintenanceLevelChange(level)}
                                style={{ borderColor: settings.server_maintenance_level === level ? color : 'transparent' }}
                            >
                                <span className={styles.levelName} style={{ color: settings.server_maintenance_level === level ? color : '#e0e0e0' }}>
                                    {name}
                                </span>
                                <span className={styles.levelDesc}>{desc}</span>
                            </button>
                        ))}
                    </div>

                    <div className={styles.autoMaintenanceSection}>
                        <div className={styles.settingItem}>
                            <div className={styles.settingInfo}>
                                <FaShieldAlt />
                                <div>
                                    <strong>Auto-Manutenção</strong>
                                    <span>Ativa automaticamente quando recursos atingem threshold</span>
                                </div>
                            </div>
                            <ToggleButton
                                active={settings.auto_maintenance_enabled}
                                onClick={() => handleToggle('auto_maintenance_enabled')}
                            />
                        </div>

                        {settings.auto_maintenance_enabled && (
                            <div className={styles.thresholdInputs}>
                                <div className={styles.thresholdItem}>
                                    <label>CPU Threshold</label>
                                    <input
                                        type="number"
                                        value={settings.auto_maintenance_cpu_threshold}
                                        onChange={(e) => {
                                            const val = parseInt(e.target.value) || 90;
                                            setSettings(prev => ({ ...prev, auto_maintenance_cpu_threshold: val }));
                                        }}
                                        onBlur={() => updateSetting('auto_maintenance_cpu_threshold', settings.auto_maintenance_cpu_threshold)}
                                        min={50}
                                        max={99}
                                    />
                                    <span>%</span>
                                </div>
                                <div className={styles.thresholdItem}>
                                    <label>RAM Threshold</label>
                                    <input
                                        type="number"
                                        value={settings.auto_maintenance_memory_threshold}
                                        onChange={(e) => {
                                            const val = parseInt(e.target.value) || 85;
                                            setSettings(prev => ({ ...prev, auto_maintenance_memory_threshold: val }));
                                        }}
                                        onBlur={() => updateSetting('auto_maintenance_memory_threshold', settings.auto_maintenance_memory_threshold)}
                                        min={50}
                                        max={99}
                                    />
                                    <span>%</span>
                                </div>
                            </div>
                        )}

                        <button
                            className={styles.overrideButton}
                            onClick={() => handleOverrideAutoMaintenance(1)}
                        >
                            <FaClock /> Override Manual (1h)
                        </button>
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
