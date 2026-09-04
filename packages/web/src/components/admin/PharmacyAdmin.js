// frontend/src/components/admin/PharmacyAdmin.js

import React, { useState, useEffect, useCallback } from 'react';
import AdminLayout from './AdminLayout';
import {
  getPharmacyChains, createPharmacyChain, updatePharmacyChain,
  getPharmacies, createPharmacy, updatePharmacy, deletePharmacy,
  getPharmacyWaitlist, updatePharmacyWaitlistEntry, getChainMetrics,
} from '../../api';
import InlineLoading from '../shared/InlineLoading';
import {
  FaStore, FaLink, FaClipboardList, FaChartBar,
  FaPlus, FaEdit, FaTrash, FaCheck, FaSearch,
  FaMapMarkerAlt, FaPhone, FaEnvelope, FaBuilding, FaEye,
} from 'react-icons/fa';

const TIER_LABELS = {
  individual: 'Individual',
  regional: 'Regional',
  enterprise: 'Enterprise',
};

const TIER_COLORS = {
  individual: '#03dac6',
  regional: '#bb86fc',
  enterprise: '#cf6679',
};

const tabButtonStyle = (isActive) => ({
  padding: '10px 20px',
  border: 'none',
  borderRadius: '8px',
  cursor: 'pointer',
  fontWeight: '500',
  transition: 'all 0.2s',
  background: isActive ? 'linear-gradient(135deg, #bb86fc 0%, #9a67ea 100%)' : 'rgba(255,255,255,0.05)',
  color: isActive ? '#fff' : '#a0a0a0',
  fontSize: '0.85rem',
});

const cardStyle = {
  background: 'rgba(30,30,40,0.95)',
  borderRadius: '12px',
  border: '1px solid rgba(255,255,255,0.08)',
  padding: '20px',
  marginBottom: '16px',
};

const inputStyle = {
  width: '100%',
  padding: '10px 14px',
  borderRadius: '8px',
  border: '1px solid rgba(255,255,255,0.15)',
  background: 'rgba(255,255,255,0.05)',
  color: '#e0e0e0',
  fontSize: '0.9rem',
  outline: 'none',
};

const buttonPrimary = {
  padding: '10px 20px',
  borderRadius: '8px',
  border: 'none',
  background: 'linear-gradient(135deg, #bb86fc 0%, #9a67ea 100%)',
  color: '#fff',
  fontWeight: '600',
  cursor: 'pointer',
  fontSize: '0.85rem',
};

const buttonDanger = {
  padding: '8px 16px',
  borderRadius: '8px',
  border: 'none',
  background: 'rgba(207,102,121,0.2)',
  color: '#cf6679',
  cursor: 'pointer',
  fontSize: '0.8rem',
};

const buttonSecondary = {
  padding: '8px 16px',
  borderRadius: '8px',
  border: '1px solid rgba(255,255,255,0.15)',
  background: 'transparent',
  color: '#e0e0e0',
  cursor: 'pointer',
  fontSize: '0.8rem',
};

const labelStyle = {
  display: 'block',
  fontSize: '0.8rem',
  color: '#a0a0a0',
  marginBottom: '4px',
  fontWeight: '500',
};

// ============================================================================
// Chains Tab
// ============================================================================
const ChainsTab = () => {
  const [chains, setChains] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingChain, setEditingChain] = useState(null);
  const [form, setForm] = useState({
    name: '', brand_names: '', cnpj_matriz: '', website: '',
    contact_name: '', contact_email: '', contact_phone: '',
    subscription_tier: 'individual', subscription_active: false, is_verified: false,
  });

  const loadChains = useCallback(async () => {
    try {
      const data = await getPharmacyChains();
      setChains(data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadChains(); }, [loadChains]);

  const resetForm = () => {
    setForm({
      name: '', brand_names: '', cnpj_matriz: '', website: '',
      contact_name: '', contact_email: '', contact_phone: '',
      subscription_tier: 'individual', subscription_active: false, is_verified: false,
    });
    setEditingChain(null);
    setShowForm(false);
  };

  const handleEdit = (chain) => {
    setForm({
      name: chain.name || '',
      brand_names: (chain.brand_names || []).join(', '),
      cnpj_matriz: chain.cnpj_matriz || '',
      website: chain.website || '',
      contact_name: chain.contact_name || '',
      contact_email: chain.contact_email || '',
      contact_phone: chain.contact_phone || '',
      subscription_tier: chain.subscription_tier || 'individual',
      subscription_active: chain.subscription_active || false,
      is_verified: chain.is_verified || false,
    });
    setEditingChain(chain);
    setShowForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...form,
        brand_names: form.brand_names ? form.brand_names.split(',').map(s => s.trim()).filter(Boolean) : [],
      };
      if (editingChain) {
        await updatePharmacyChain(editingChain.id, payload);
      } else {
        await createPharmacyChain(payload);
      }
      resetForm();
      loadChains();
    } catch (e) { console.error(e); }
  };

  if (loading) return <InlineLoading />;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h3 style={{ margin: 0, color: '#e0e0e0' }}>
          <FaLink style={{ marginRight: '8px' }} />
          Redes de Farmácia ({chains.length})
        </h3>
        <button style={buttonPrimary} onClick={() => { resetForm(); setShowForm(true); }}>
          <FaPlus style={{ marginRight: '6px' }} /> Nova Rede
        </button>
      </div>

      {showForm && (
        <div style={{ ...cardStyle, border: '1px solid rgba(187,134,252,0.3)' }}>
          <h4 style={{ color: '#bb86fc', marginTop: 0 }}>{editingChain ? 'Editar Rede' : 'Nova Rede'}</h4>
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
              <div>
                <label style={labelStyle}>Nome da Rede *</label>
                <input style={inputStyle} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div>
                <label style={labelStyle}>Marcas (separadas por vírgula)</label>
                <input style={inputStyle} value={form.brand_names} onChange={e => setForm({ ...form, brand_names: e.target.value })} placeholder="Raia, Drogasil" />
              </div>
              <div>
                <label style={labelStyle}>CNPJ Matriz</label>
                <input style={inputStyle} value={form.cnpj_matriz} onChange={e => setForm({ ...form, cnpj_matriz: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle}>Website</label>
                <input style={inputStyle} value={form.website} onChange={e => setForm({ ...form, website: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle}>Contato Nome</label>
                <input style={inputStyle} value={form.contact_name} onChange={e => setForm({ ...form, contact_name: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle}>Email Contato</label>
                <input style={inputStyle} value={form.contact_email} onChange={e => setForm({ ...form, contact_email: e.target.value })} type="email" />
              </div>
              <div>
                <label style={labelStyle}>Telefone Contato</label>
                <input style={inputStyle} value={form.contact_phone} onChange={e => setForm({ ...form, contact_phone: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle}>Tier</label>
                <select
                  style={{ ...inputStyle, cursor: 'pointer' }}
                  value={form.subscription_tier}
                  onChange={e => setForm({ ...form, subscription_tier: e.target.value })}
                >
                  <option value="individual">Individual</option>
                  <option value="regional">Regional</option>
                  <option value="enterprise">Enterprise</option>
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
              <label style={{ color: '#a0a0a0', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                <input type="checkbox" checked={form.subscription_active} onChange={e => setForm({ ...form, subscription_active: e.target.checked })} />
                Assinatura Ativa
              </label>
              <label style={{ color: '#a0a0a0', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                <input type="checkbox" checked={form.is_verified} onChange={e => setForm({ ...form, is_verified: e.target.checked })} />
                Verificada
              </label>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button type="submit" style={buttonPrimary}>{editingChain ? 'Salvar' : 'Criar'}</button>
              <button type="button" style={buttonSecondary} onClick={resetForm}>Cancelar</button>
            </div>
          </form>
        </div>
      )}

      {chains.map(chain => (
        <div key={chain.id} style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h4 style={{ margin: '0 0 4px 0', color: '#e0e0e0' }}>{chain.name}</h4>
              {chain.brand_names?.length > 0 && (
                <div style={{ fontSize: '0.85rem', color: '#a0a0a0', marginBottom: '8px' }}>
                  Marcas: {chain.brand_names.join(', ')}
                </div>
              )}
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{
                  padding: '2px 10px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: '600',
                  background: `${TIER_COLORS[chain.subscription_tier]}20`,
                  color: TIER_COLORS[chain.subscription_tier],
                }}>
                  {TIER_LABELS[chain.subscription_tier]}
                </span>
                {chain.subscription_active && (
                  <span style={{ padding: '2px 10px', borderRadius: '12px', fontSize: '0.75rem', background: 'rgba(3,218,198,0.15)', color: '#03dac6' }}>
                    <FaCheck style={{ fontSize: '0.65rem', marginRight: '4px' }} /> Ativa
                  </span>
                )}
                {chain.is_verified && (
                  <span style={{ padding: '2px 10px', borderRadius: '12px', fontSize: '0.75rem', background: 'rgba(187,134,252,0.15)', color: '#bb86fc' }}>
                    Verificada
                  </span>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button style={buttonSecondary} onClick={() => handleEdit(chain)}>
                <FaEdit />
              </button>
            </div>
          </div>
          {(chain.contact_email || chain.contact_phone) && (
            <div style={{ marginTop: '12px', fontSize: '0.8rem', color: '#888', display: 'flex', gap: '16px' }}>
              {chain.contact_email && <span><FaEnvelope style={{ marginRight: '4px' }} />{chain.contact_email}</span>}
              {chain.contact_phone && <span><FaPhone style={{ marginRight: '4px' }} />{chain.contact_phone}</span>}
            </div>
          )}
        </div>
      ))}

      {chains.length === 0 && !showForm && (
        <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
          Nenhuma rede cadastrada. Crie a primeira rede de farmácia.
        </div>
      )}
    </div>
  );
};

// ============================================================================
// Pharmacies Tab
// ============================================================================
const PharmaciesTab = () => {
  const [pharmacies, setPharmacies] = useState([]);
  const [chains, setChains] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingPharmacy, setEditingPharmacy] = useState(null);
  const [searchCity, setSearchCity] = useState('');
  const [form, setForm] = useState({
    name: '', brand_name: '', chain_id: '', cnpj: '', phone: '', email: '',
    address: '', city: '', state: '', zip_code: '', latitude: '', longitude: '',
    is_verified: false,
  });

  const loadData = useCallback(async () => {
    try {
      const params = {};
      if (searchCity) params.city = searchCity;
      const [pharmsData, chainsData] = await Promise.all([
        getPharmacies(params),
        getPharmacyChains(),
      ]);
      setPharmacies(pharmsData?.pharmacies || pharmsData || []);
      setChains(chainsData || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [searchCity]);

  useEffect(() => { loadData(); }, [loadData]);

  const resetForm = () => {
    setForm({
      name: '', brand_name: '', chain_id: '', cnpj: '', phone: '', email: '',
      address: '', city: '', state: '', zip_code: '', latitude: '', longitude: '',
      is_verified: false,
    });
    setEditingPharmacy(null);
    setShowForm(false);
  };

  const handleEdit = (pharm) => {
    setForm({
      name: pharm.name || '',
      brand_name: pharm.brand_name || '',
      chain_id: pharm.chain_id || '',
      cnpj: pharm.cnpj || '',
      phone: pharm.phone || '',
      email: pharm.email || '',
      address: pharm.address || '',
      city: pharm.city || '',
      state: pharm.state || '',
      zip_code: pharm.zip_code || '',
      latitude: pharm.latitude || '',
      longitude: pharm.longitude || '',
      is_verified: pharm.is_verified || false,
    });
    setEditingPharmacy(pharm);
    setShowForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...form,
        chain_id: form.chain_id ? parseInt(form.chain_id) : null,
        latitude: form.latitude ? parseFloat(form.latitude) : null,
        longitude: form.longitude ? parseFloat(form.longitude) : null,
      };
      if (editingPharmacy) {
        await updatePharmacy(editingPharmacy.id, payload);
      } else {
        await createPharmacy(payload);
      }
      resetForm();
      loadData();
    } catch (e) { console.error(e); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Desativar esta farmácia?')) return;
    try {
      await deletePharmacy(id);
      loadData();
    } catch (e) { console.error(e); }
  };

  if (loading) return <InlineLoading />;

  const UF_OPTIONS = ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO'];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <h3 style={{ margin: 0, color: '#e0e0e0' }}>
          <FaStore style={{ marginRight: '8px' }} />
          Farmácias ({Array.isArray(pharmacies) ? pharmacies.length : 0})
        </h3>
        <div style={{ display: 'flex', gap: '10px' }}>
          <div style={{ position: 'relative' }}>
            <FaSearch style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#666' }} />
            <input
              style={{ ...inputStyle, width: '200px', paddingLeft: '32px' }}
              placeholder="Filtrar por cidade..."
              value={searchCity}
              onChange={e => setSearchCity(e.target.value)}
            />
          </div>
          <button style={buttonPrimary} onClick={() => { resetForm(); setShowForm(true); }}>
            <FaPlus style={{ marginRight: '6px' }} /> Nova Farmácia
          </button>
        </div>
      </div>

      {showForm && (
        <div style={{ ...cardStyle, border: '1px solid rgba(187,134,252,0.3)' }}>
          <h4 style={{ color: '#bb86fc', marginTop: 0 }}>{editingPharmacy ? 'Editar Farmácia' : 'Nova Farmácia'}</h4>
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '16px' }}>
              <div>
                <label style={labelStyle}>Nome *</label>
                <input style={inputStyle} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div>
                <label style={labelStyle}>Marca</label>
                <input style={inputStyle} value={form.brand_name} onChange={e => setForm({ ...form, brand_name: e.target.value })} placeholder="Ex: Drogasil" />
              </div>
              <div>
                <label style={labelStyle}>Rede</label>
                <select style={{ ...inputStyle, cursor: 'pointer' }} value={form.chain_id} onChange={e => setForm({ ...form, chain_id: e.target.value })}>
                  <option value="">Independente</option>
                  {chains.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>CNPJ</label>
                <input style={inputStyle} value={form.cnpj} onChange={e => setForm({ ...form, cnpj: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle}>Telefone</label>
                <input style={inputStyle} value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle}>Email</label>
                <input style={inputStyle} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} type="email" />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>Endereço</label>
                <input style={inputStyle} value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle}>Cidade</label>
                <input style={inputStyle} value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle}>UF</label>
                <select style={{ ...inputStyle, cursor: 'pointer' }} value={form.state} onChange={e => setForm({ ...form, state: e.target.value })}>
                  <option value="">--</option>
                  {UF_OPTIONS.map(uf => <option key={uf} value={uf}>{uf}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>CEP</label>
                <input style={inputStyle} value={form.zip_code} onChange={e => setForm({ ...form, zip_code: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle}>Latitude</label>
                <input style={inputStyle} value={form.latitude} onChange={e => setForm({ ...form, latitude: e.target.value })} type="number" step="any" />
              </div>
              <div>
                <label style={labelStyle}>Longitude</label>
                <input style={inputStyle} value={form.longitude} onChange={e => setForm({ ...form, longitude: e.target.value })} type="number" step="any" />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
              <label style={{ color: '#a0a0a0', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                <input type="checkbox" checked={form.is_verified} onChange={e => setForm({ ...form, is_verified: e.target.checked })} />
                Verificada
              </label>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button type="submit" style={buttonPrimary}>{editingPharmacy ? 'Salvar' : 'Criar'}</button>
              <button type="button" style={buttonSecondary} onClick={resetForm}>Cancelar</button>
            </div>
          </form>
        </div>
      )}

      {(Array.isArray(pharmacies) ? pharmacies : []).map(pharm => (
        <div key={pharm.id} style={{ ...cardStyle, opacity: pharm.is_active === false ? 0.5 : 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h4 style={{ margin: '0 0 4px 0', color: '#e0e0e0' }}>
                {pharm.name}
                {pharm.brand_name && <span style={{ fontSize: '0.85rem', color: '#a0a0a0', marginLeft: '8px' }}>({pharm.brand_name})</span>}
              </h4>
              <div style={{ fontSize: '0.8rem', color: '#888', display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '6px' }}>
                {pharm.address && <span><FaMapMarkerAlt style={{ marginRight: '4px' }} />{pharm.address}</span>}
                {pharm.city && <span>{pharm.city}/{pharm.state}</span>}
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {pharm.chain_name && (
                  <span style={{ padding: '2px 10px', borderRadius: '12px', fontSize: '0.75rem', background: 'rgba(187,134,252,0.15)', color: '#bb86fc' }}>
                    <FaBuilding style={{ marginRight: '4px', fontSize: '0.65rem' }} />{pharm.chain_name}
                  </span>
                )}
                {pharm.is_verified && (
                  <span style={{ padding: '2px 10px', borderRadius: '12px', fontSize: '0.75rem', background: 'rgba(3,218,198,0.15)', color: '#03dac6' }}>
                    Verificada
                  </span>
                )}
                {pharm.is_active === false && (
                  <span style={{ padding: '2px 10px', borderRadius: '12px', fontSize: '0.75rem', background: 'rgba(207,102,121,0.15)', color: '#cf6679' }}>
                    Inativa
                  </span>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button style={buttonSecondary} onClick={() => handleEdit(pharm)} title="Editar"><FaEdit /></button>
              {pharm.is_active !== false && (
                <button style={buttonDanger} onClick={() => handleDelete(pharm.id)} title="Desativar"><FaTrash /></button>
              )}
            </div>
          </div>
        </div>
      ))}

      {(!Array.isArray(pharmacies) || pharmacies.length === 0) && !showForm && (
        <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
          Nenhuma farmácia cadastrada.
        </div>
      )}
    </div>
  );
};

// ============================================================================
// Waitlist Tab
// ============================================================================
const STATUS_OPTIONS = [
  { value: 'pending', label: 'Pendente', color: '#bb86fc' },
  { value: 'contacted', label: 'Contatado', color: '#03dac6' },
  { value: 'onboarded', label: 'Onboarded', color: '#4caf50' },
  { value: 'rejected', label: 'Rejeitado', color: '#cf6679' },
];

const STATUS_COLORS = {
  pending: '#bb86fc',
  contacted: '#03dac6',
  onboarded: '#4caf50',
  rejected: '#cf6679',
};

const WaitlistTab = () => {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [editingEntry, setEditingEntry] = useState(null);
  const [editStatus, setEditStatus] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const data = await getPharmacyWaitlist(statusFilter || null);
      setEntries(data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [statusFilter]);

  useEffect(() => { setLoading(true); loadData(); }, [loadData]);

  const startEdit = (entry) => {
    setEditingEntry(entry.id);
    setEditStatus(entry.status);
    setEditNotes(entry.admin_notes || '');
  };

  const cancelEdit = () => {
    setEditingEntry(null);
    setEditStatus('');
    setEditNotes('');
  };

  const saveEntry = async (entryId) => {
    setSaving(true);
    try {
      await updatePharmacyWaitlistEntry(entryId, {
        status: editStatus,
        admin_notes: editNotes || null,
      });
      cancelEdit();
      loadData();
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  };

  if (loading) return <InlineLoading />;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h3 style={{ margin: 0, color: '#e0e0e0' }}>
          <FaClipboardList style={{ marginRight: '8px' }} />
          Lista de Espera ({entries.length})
        </h3>
        <select
          style={{ ...inputStyle, width: '180px', cursor: 'pointer' }}
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
        >
          <option value="">Todos</option>
          <option value="pending">Pendentes</option>
          <option value="contacted">Contatados</option>
          <option value="onboarded">Onboarded</option>
          <option value="rejected">Rejeitados</option>
        </select>
      </div>

      {entries.map(entry => (
        <div key={entry.id} style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <h4 style={{ margin: '0 0 4px 0', color: '#e0e0e0' }}>
                {entry.pharmacy_name}
                {entry.is_chain && (
                  <span style={{ fontSize: '0.8rem', color: '#bb86fc', marginLeft: '8px' }}>
                    (Rede - {entry.chain_size || '?'} unidades)
                  </span>
                )}
              </h4>
              <div style={{ fontSize: '0.8rem', color: '#888', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                <span>{entry.contact_name}</span>
                <span><FaEnvelope style={{ marginRight: '4px' }} />{entry.email}</span>
                {entry.phone && <span><FaPhone style={{ marginRight: '4px' }} />{entry.phone}</span>}
                {entry.city && <span><FaMapMarkerAlt style={{ marginRight: '4px' }} />{entry.city}/{entry.state}</span>}
              </div>
              {entry.cnpj && (
                <div style={{ marginTop: '6px', fontSize: '0.75rem', color: '#666' }}>CNPJ: {entry.cnpj}</div>
              )}
              {entry.created_at && (
                <div style={{ marginTop: '2px', fontSize: '0.75rem', color: '#555' }}>
                  {new Date(entry.created_at).toLocaleDateString('pt-BR')}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              {editingEntry !== entry.id && (
                <>
                  <span style={{
                    padding: '4px 12px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: '600',
                    background: `${STATUS_COLORS[entry.status] || '#666'}20`,
                    color: STATUS_COLORS[entry.status] || '#666',
                  }}>
                    {STATUS_OPTIONS.find(s => s.value === entry.status)?.label || entry.status}
                  </span>
                  <button style={buttonSecondary} onClick={() => startEdit(entry)} title="Editar">
                    <FaEdit />
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Admin notes (read-only when not editing) */}
          {entry.admin_notes && editingEntry !== entry.id && (
            <div style={{
              marginTop: '10px', padding: '8px 12px', borderRadius: '8px',
              background: 'rgba(255,255,255,0.03)', fontSize: '0.8rem', color: '#999',
              borderLeft: '3px solid rgba(255,255,255,0.1)',
            }}>
              {entry.admin_notes}
            </div>
          )}

          {/* Edit form */}
          {editingEntry === entry.id && (
            <div style={{
              marginTop: '12px', padding: '16px', borderRadius: '8px',
              background: 'rgba(187,134,252,0.05)', border: '1px solid rgba(187,134,252,0.2)',
            }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <label style={labelStyle}>Status</label>
                  <select
                    style={{ ...inputStyle, cursor: 'pointer' }}
                    value={editStatus}
                    onChange={e => setEditStatus(e.target.value)}
                  >
                    {STATUS_OPTIONS.map(s => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Notas Admin</label>
                  <input
                    style={inputStyle}
                    value={editNotes}
                    onChange={e => setEditNotes(e.target.value)}
                    placeholder="Notas internas sobre este contato..."
                  />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  style={{ ...buttonPrimary, opacity: saving ? 0.6 : 1 }}
                  onClick={() => saveEntry(entry.id)}
                  disabled={saving}
                >
                  <FaCheck style={{ marginRight: '6px' }} />
                  {saving ? 'Salvando...' : 'Salvar'}
                </button>
                <button style={buttonSecondary} onClick={cancelEdit}>Cancelar</button>
              </div>
            </div>
          )}
        </div>
      ))}

      {entries.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
          Nenhuma entrada na lista de espera.
        </div>
      )}
    </div>
  );
};

// ============================================================================
// Metrics Tab
// ============================================================================
const MetricsTab = () => {
  const [chains, setChains] = useState([]);
  const [selectedChain, setSelectedChain] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMetrics, setLoadingMetrics] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await getPharmacyChains();
        setChains(data);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    };
    load();
  }, []);

  const loadMetrics = async (chainId) => {
    setSelectedChain(chainId);
    setLoadingMetrics(true);
    try {
      const data = await getChainMetrics(chainId);
      setMetrics(data);
    } catch (e) { console.error(e); setMetrics(null); }
    finally { setLoadingMetrics(false); }
  };

  if (loading) return <InlineLoading />;

  return (
    <div>
      <h3 style={{ color: '#e0e0e0', marginBottom: '20px' }}>
        <FaChartBar style={{ marginRight: '8px' }} />
        Métricas por Rede
      </h3>

      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '24px' }}>
        {chains.map(chain => (
          <button
            key={chain.id}
            style={{
              ...tabButtonStyle(selectedChain === chain.id),
              padding: '8px 16px',
            }}
            onClick={() => loadMetrics(chain.id)}
          >
            {chain.name}
          </button>
        ))}
      </div>

      {loadingMetrics && <InlineLoading />}

      {metrics && !loadingMetrics && (
        <div>
          <h4 style={{ color: '#bb86fc', marginBottom: '16px' }}>{metrics.chain_name}</h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
            {[
              { label: 'Farmácias', value: metrics.total_pharmacies || 0, icon: <FaStore /> },
              { label: 'Receitas Recebidas', value: metrics.total_prescriptions_sent || 0, icon: <FaClipboardList /> },
              { label: 'Visualizadas', value: metrics.total_viewed || 0, icon: <FaEye /> },
              { label: 'Dispensadas', value: metrics.total_fulfilled || 0, icon: <FaCheck /> },
            ].map((stat, i) => (
              <div key={i} style={{ ...cardStyle, textAlign: 'center' }}>
                <div style={{ color: '#bb86fc', fontSize: '1.5rem', marginBottom: '8px' }}>{stat.icon}</div>
                <div style={{ color: '#e0e0e0', fontSize: '1.8rem', fontWeight: '700' }}>{stat.value}</div>
                <div style={{ color: '#888', fontSize: '0.8rem' }}>{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!selectedChain && chains.length > 0 && (
        <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
          Selecione uma rede para ver as métricas.
        </div>
      )}

      {chains.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
          Nenhuma rede cadastrada ainda.
        </div>
      )}
    </div>
  );
};

// ============================================================================
// Main PharmacyAdmin Component
// ============================================================================
const PharmacyAdmin = () => {
  const [activeTab, setActiveTab] = useState('chains');

  const tabs = [
    { id: 'chains', label: 'Redes', icon: <FaLink /> },
    { id: 'pharmacies', label: 'Farmácias', icon: <FaStore /> },
    { id: 'waitlist', label: 'Lista de Espera', icon: <FaClipboardList /> },
    { id: 'metrics', label: 'Métricas', icon: <FaChartBar /> },
  ];

  const renderContent = () => {
    switch (activeTab) {
      case 'chains': return <ChainsTab />;
      case 'pharmacies': return <PharmaciesTab />;
      case 'waitlist': return <WaitlistTab />;
      case 'metrics': return <MetricsTab />;
      default: return <ChainsTab />;
    }
  };

  return (
    <AdminLayout>
      <h2 style={{ color: '#e0e0e0', marginBottom: '24px' }}>
        <FaStore style={{ marginRight: '10px', color: '#bb86fc' }} />
        Gerenciamento de Farmácias
      </h2>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', flexWrap: 'wrap' }}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            style={tabButtonStyle(activeTab === tab.id)}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.icon}
            <span style={{ marginLeft: '6px' }}>{tab.label}</span>
          </button>
        ))}
      </div>

      {renderContent()}
    </AdminLayout>
  );
};

export default PharmacyAdmin;
