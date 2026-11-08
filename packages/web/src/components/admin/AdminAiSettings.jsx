import React, { useCallback, useEffect, useMemo, useState } from 'react';
import AdminLayout from './AdminLayout';
import { useNotification } from '../../contexts/NotificationContext';
import { api } from '../../api';
import { FaRobot, FaSpinner, FaSave, FaPlug, FaUndo, FaExclamationTriangle, FaCheckCircle, FaTimesCircle } from 'react-icons/fa';
import settingsStyles from './AdminSettings.module.css';
import styles from './AdminAiSettings.module.css';

// Os três jeitos de dar IA ao Qython. O backend só conhece dois provedores ('openai' e 'gemini');
// "local" é o servidor que o próprio app desktop sobe e gerencia.
const MODES = {
    local: { title: 'IA local do Qython', hint: 'O app roda o modelo neste computador. Nada do que você digita sai daqui.' },
    server: { title: 'Servidor de IA próprio', hint: 'Qualquer servidor compatível com a API da OpenAI: llama.cpp, Ollama, LM Studio, vLLM, OpenRouter.' },
    gemini: { title: 'Gemini (Google)', hint: 'Respostas melhores e busca na web, com o texto das perguntas indo para o Google.' },
};

const sourceLabel = { interface: 'definido aqui', ambiente: 'do ambiente', 'padrão': 'padrão' };

const AdminAiSettings = () => {
    const { addNotification } = useNotification();
    const [state, setState] = useState(null);
    const [mode, setMode] = useState('server');
    const [form, setForm] = useState({ base_url: '', model: '', context_tokens: '', api_key: '', gemini_api_key: '' });
    const [acknowledged, setAcknowledged] = useState(false);
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState(null);

    const load = useCallback(async () => {
        try {
            const { data } = await api.get('/admin/ai');
            setState(data);
            const current = data.provider === 'gemini' ? 'gemini'
                : (data.managed_local && !data.overridden ? 'local' : 'server');
            setMode(current);
            setForm({
                base_url: data.base_url || '', model: data.model || '',
                context_tokens: data.context_tokens || '', api_key: '', gemini_api_key: '',
            });
            setAcknowledged(data.provider === 'gemini');
        } catch (error) {
            console.error('Erro ao carregar a configuração da IA:', error);
            addNotification('Erro ao carregar a configuração da IA', 'error');
        }
    }, [addNotification]);

    useEffect(() => { load(); }, [load]);

    const modes = useMemo(() => (state?.managed_local ? ['local', 'server', 'gemini'] : ['server', 'gemini']), [state]);
    const needsAcknowledgement = mode === 'gemini' && !acknowledged;
    // No modo local o botão só faz sentido para desfazer uma configuração salva aqui.
    const nothingToRestore = mode === 'local' && !state?.overridden && state?.provider === 'openai';

    const set = (field) => (event) => {
        setForm((prev) => ({ ...prev, [field]: event.target.value }));
        setTestResult(null);
    };

    // O que enviar: só o que o usuário tocou ou o que o modo exige. Chave em branco = manter a salva.
    const buildPatch = () => {
        if (mode === 'gemini') {
            const patch = { provider: 'gemini' };
            if (form.gemini_api_key) patch.gemini_api_key = form.gemini_api_key;
            return patch;
        }
        const patch = { provider: 'openai', base_url: form.base_url, model: form.model, context_tokens: form.context_tokens };
        if (form.api_key) patch.api_key = form.api_key;
        return patch;
    };

    const save = async () => {
        setSaving(true);
        try {
            if (mode === 'local') {
                const { data } = await api.delete('/admin/ai');
                setState(data);
                addNotification('IA local do Qython restaurada', 'success');
            } else {
                await api.put('/admin/ai', buildPatch());
                addNotification('Configuração da IA salva', 'success');
            }
            await load();
        } catch (error) {
            addNotification(error.response?.data?.detail || 'Não foi possível salvar a configuração da IA', 'error');
        } finally {
            setSaving(false);
        }
    };

    const test = async () => {
        setTesting(true);
        setTestResult(null);
        try {
            const { data } = await api.post('/admin/ai/test', buildPatch());
            setTestResult(data);
        } catch (error) {
            setTestResult({ ok: false, detail: error.response?.data?.detail || 'Falha ao testar a conexão.' });
        } finally {
            setTesting(false);
        }
    };

    const openDesktopSetup = () => window.qythonDesktop?.openAiSetup?.();

    if (!state) {
        return (
            <AdminLayout>
                <div className={settingsStyles.loadingContainer}>
                    <FaSpinner className={settingsStyles.spinner} size={40} />
                    <p>Carregando a configuração da IA...</p>
                </div>
            </AdminLayout>
        );
    }

    const caps = state.capabilities || {};

    return (
        <AdminLayout>
            <div className="admin-header">
                <h1>Configurações da IA</h1>
            </div>

            <div className={settingsStyles.card}>
                <div className={settingsStyles.cardHeader}>
                    <FaRobot size={24} style={{ color: '#bb86fc' }} />
                    <h3>Provedor</h3>
                </div>

                <div className={styles.modes} role="radiogroup" aria-label="Provedor de IA">
                    {modes.map((id) => (
                        <label key={id} className={`${styles.mode} ${mode === id ? styles.modeActive : ''}`}>
                            <input
                                type="radio" name="provider-mode" value={id} checked={mode === id}
                                onChange={() => { setMode(id); setTestResult(null); }}
                            />
                            <span className={styles.modeText}>
                                <strong>{MODES[id].title}</strong>
                                <span>{MODES[id].hint}</span>
                            </span>
                        </label>
                    ))}
                </div>

                {mode === 'local' && (
                    <div className={styles.panel}>
                        <p>
                            O modelo e o download dele são gerenciados pelo app. Ele só é carregado na memória quando
                            alguém pede uma resposta e é descarregado depois de um tempo parado.
                        </p>
                        {window.qythonDesktop?.openAiSetup && (
                            <button type="button" className={styles.secondary} onClick={openDesktopSetup}>
                                Escolher o modelo e ver o download…
                            </button>
                        )}
                    </div>
                )}

                {mode === 'server' && (
                    <div className={styles.panel}>
                        <div className={styles.field}>
                            <label htmlFor="ai-base-url">Endereço do servidor</label>
                            <input id="ai-base-url" type="url" value={form.base_url} onChange={set('base_url')}
                                placeholder="http://127.0.0.1:8081/v1" autoComplete="off" />
                            <small>Com o /v1 no fim. {state.sources.base_url && `Hoje: ${sourceLabel[state.sources.base_url]}.`}</small>
                        </div>
                        <div className={styles.row}>
                            <div className={styles.field}>
                                <label htmlFor="ai-model">Modelo</label>
                                <input id="ai-model" type="text" value={form.model} onChange={set('model')}
                                    placeholder="gemma-4" autoComplete="off" />
                                <small>O Ollama exige o nome exato (ex.: gemma4:e4b); o llama.cpp ignora.</small>
                            </div>
                            <div className={styles.field}>
                                <label htmlFor="ai-ctx">Janela de contexto (tokens)</label>
                                <input id="ai-ctx" type="number" min="2048" step="1024" value={form.context_tokens}
                                    onChange={set('context_tokens')} placeholder="16384" />
                                <small>Precisa bater com o -c do llama.cpp ou o num_ctx do Ollama.</small>
                            </div>
                        </div>
                        <div className={styles.field}>
                            <label htmlFor="ai-key">Chave de API (opcional)</label>
                            <input id="ai-key" type="password" value={form.api_key} onChange={set('api_key')}
                                placeholder={state.has_api_key ? '•••••••• (salva; deixe em branco para manter)' : 'só se o servidor pedir'}
                                autoComplete="new-password" />
                        </div>
                    </div>
                )}

                {mode === 'gemini' && (
                    <div className={styles.panel}>
                        <div className={styles.field}>
                            <label htmlFor="ai-gemini">Chave de API do Gemini</label>
                            <input id="ai-gemini" type="password" value={form.gemini_api_key} onChange={set('gemini_api_key')}
                                placeholder={state.has_gemini_key ? '•••••••• (salva; deixe em branco para manter)' : 'AIza…'}
                                autoComplete="new-password" />
                            <small>Com dado de paciente real, use uma chave paga: no plano gratuito o Google pode usar o conteúdo enviado.</small>
                        </div>
                        <div className={`${styles.notice} ${state.pii_engine === 'regex' ? styles.noticeStrong : ''}`}>
                            <FaExclamationTriangle />
                            <div>
                                <strong>O texto das perguntas, incluindo o que vem de pacientes, sai deste computador e vai para o Google.</strong>
                                {state.pii_engine === 'presidio' ? (
                                    <span> Antes do envio, nomes e documentos são ocultados (Presidio).</span>
                                ) : (
                                    <span> Esta instalação não traz o ocultador de nomes completo: ele usa um detector simples
                                        (por padrões), que pode deixar passar nomes. Prefira não digitar nomes de pacientes.</span>
                                )}
                            </div>
                        </div>
                        <label className={styles.check}>
                            <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} />
                            Entendo que o texto vai para o Google.
                        </label>
                    </div>
                )}

                {testResult && (
                    <div className={`${styles.result} ${testResult.ok ? styles.resultOk : styles.resultFail}`} role="status">
                        {testResult.ok ? <FaCheckCircle /> : <FaTimesCircle />}
                        <div>
                            <strong>{testResult.detail}</strong>
                            {testResult.ok && testResult.latency_ms != null && <span> Respondeu em {testResult.latency_ms} ms.</span>}
                            {testResult.models?.length > 0 && <span> Modelos: {testResult.models.join(', ')}.</span>}
                        </div>
                    </div>
                )}

                <div className={styles.actions}>
                    {state.overridden && mode !== 'local' && (
                        <button type="button" className={styles.secondary}
                            onClick={() => { setMode(state.managed_local ? 'local' : 'server'); setTestResult(null); }}>
                            <FaUndo /> Voltar ao padrão
                        </button>
                    )}
                    {mode !== 'local' && (
                        <button type="button" className={styles.secondary} onClick={test} disabled={testing || saving}>
                            {testing ? <FaSpinner className={settingsStyles.spinner} /> : <FaPlug />} Testar conexão
                        </button>
                    )}
                    <button type="button" className={styles.primary} onClick={save}
                        disabled={saving || testing || needsAcknowledgement || nothingToRestore}>
                        {saving ? <FaSpinner className={settingsStyles.spinner} /> : <FaSave />}
                        {mode === 'local' ? ' Restaurar a IA local' : ' Salvar'}
                    </button>
                </div>
            </div>

            <div className={settingsStyles.card} style={{ marginTop: 25 }}>
                <div className={settingsStyles.cardHeader}>
                    <FaRobot size={24} style={{ color: '#03dac6' }} />
                    <h3>O que esta IA faz</h3>
                </div>
                <ul className={styles.caps}>
                    <li><strong>Provedor em uso:</strong> {caps.provider === 'gemini' ? 'Gemini' : `servidor compatível${caps.model ? ` (${caps.model})` : ''}`}</li>
                    <li>{caps.web_search ? '✔' : '✖'} Busca na web nas respostas {caps.web_search ? '' : '(sem Gemini, o copiloto usa o catálogo, a biblioteca e o PubMed)'}</li>
                    <li>{caps.image_generation ? '✔' : '✖'} Geração de imagens {caps.image_generation ? '' : '(pede a chave do Gemini)'}</li>
                    <li>{caps.vision ? '✔' : '✖'} Leitura de imagens</li>
                </ul>
            </div>
        </AdminLayout>
    );
};

export default AdminAiSettings;
