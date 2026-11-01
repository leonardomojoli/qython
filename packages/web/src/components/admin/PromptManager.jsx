import React, { useState, useEffect } from 'react';
import { api } from '../../api';
import { useNotification } from '../../contexts/NotificationContext';
import { FaSave, FaRobot } from 'react-icons/fa';
import './Admin.css';

const PromptManager = () => {
    const { addNotification } = useNotification();
    const [prompts, setPrompts] = useState({ neuralweb_chat: '', clinical_reasoning: '' });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        const loadPrompts = async () => {
            try {
                const res = await api.get('/admin/prompts');
                setPrompts(res.data || {});
            } catch (error) {
                addNotification('Erro ao carregar prompts.', 'error');
            } finally {
                setLoading(false);
            }
        };
        loadPrompts();
    }, [addNotification]);

    const handleSave = async () => {
        setSaving(true);
        try {
            await api.post('/admin/prompts', prompts);
            addNotification('Prompts atualizados e IA recarregada!', 'success');
        } catch (error) {
            addNotification('Erro ao salvar prompts.', 'error');
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div style={{ padding: '20px', color: '#aaa' }}>Carregando...</div>;

    const textareaStyles = {
        width: '100%',
        height: '300px',
        background: '#12151f',
        color: '#e0e0e0',
        border: '1px solid #333',
        padding: '15px',
        fontFamily: 'monospace',
        borderRadius: '8px',
        lineHeight: '1.5',
        resize: 'vertical'
    };

    return (
        <div className="admin-content-wrapper">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <FaRobot style={{ color: '#bb86fc' }} /> Engenharia de Prompt (Ao Vivo)
                </h2>
                <button
                    className="btn-primary"
                    onClick={handleSave}
                    disabled={saving}
                    style={{
                        background: 'linear-gradient(135deg, #03dac6, #00b4a0)',
                        border: 'none',
                        padding: '10px 20px',
                        borderRadius: '8px',
                        cursor: saving ? 'wait' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        fontWeight: 'bold'
                    }}
                >
                    <FaSave /> {saving ? 'Salvando...' : 'Salvar e Aplicar'}
                </button>
            </div>

            <div style={{ display: 'grid', gap: '20px' }}>
                <div className="stat-card" style={{ padding: '20px' }}>
                    <h3 style={{ color: '#03dac6', marginBottom: '5px' }}>Chat Padrão (NeuralWeb)</h3>
                    <p style={{ fontSize: '0.8rem', color: '#aaa', marginBottom: '15px' }}>
                        Define a personalidade do chat padrão.
                    </p>
                    <textarea
                        value={prompts.neuralweb_chat || ''}
                        onChange={(e) => setPrompts({ ...prompts, neuralweb_chat: e.target.value })}
                        style={textareaStyles}
                        placeholder="Cole aqui o prompt do chat padrão..."
                    />
                </div>

                <div className="stat-card" style={{ padding: '20px' }}>
                    <h3 style={{ color: '#bb86fc', marginBottom: '5px' }}>Agente de Raciocínio Clínico</h3>
                    <p style={{ fontSize: '0.8rem', color: '#aaa', marginBottom: '15px' }}>
                        Define como a IA age quando o modo "Raciocínio Clínico" está ativado.
                    </p>
                    <textarea
                        value={prompts.clinical_reasoning || ''}
                        onChange={(e) => setPrompts({ ...prompts, clinical_reasoning: e.target.value })}
                        style={textareaStyles}
                        placeholder="Cole aqui o prompt do raciocínio clínico..."
                    />
                </div>
            </div>
        </div>
    );
};

export default PromptManager;
