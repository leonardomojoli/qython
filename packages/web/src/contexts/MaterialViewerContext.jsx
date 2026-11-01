// frontend/src/contexts/MaterialViewerContext.js
//
// Visualizador de material GLOBAL (acima do roteador) — agora um DOCK de vários materiais.
// Antes o modal de resultado vivia dentro do MaterialProducer (dentro da rota /academic) e
// era destruído ao navegar. Aqui os materiais viram estado de nível de app: o
// MaterialViewerHost (fora do <Routes>) mantém os modais montados entre navegações, então os
// quizzes sobrevivem e podem ser retomados.
//
// Modelo de DOCK (decidido com o user):
//  - até MAX_OPEN_MATERIALS materiais abertos ao mesmo tempo, empilhados em pílulas;
//  - no máximo UM expandido por vez (expandedId) — abrir/expandir um minimiza o anterior;
//  - o teto NÃO descarta nada sozinho: quem gera checa isViewerFull ANTES de debitar dracmas
//    (ver MaterialProducer) e avisa "feche um para abrir outro".
import React, { createContext, useContext, useState, useCallback, useRef } from 'react';

const MaterialViewerContext = createContext(null);

// Teto de materiais abertos simultaneamente. Uso real é 2–3; 5 dá folga sem virar bagunça e
// cabe limpo no canto inferior direito (~5 × ~68px). É 1 constante — trivial de afinar.
export const MAX_OPEN_MATERIALS = 5;

export const useMaterialViewer = () => {
  const ctx = useContext(MaterialViewerContext);
  if (!ctx) {
    throw new Error('useMaterialViewer deve ser usado dentro de um MaterialViewerProvider');
  }
  return ctx;
};

export const MaterialViewerProvider = ({ children }) => {
  // Lista de materiais abertos (mais RECENTE primeiro). Cada item guarda o payload que o
  // MaterialResultModal espera + um id estável:
  //   { id, result, materialType, sourceName, sourceType, trainingNote, onRedo, job?, onClearJob? }
  const [materials, setMaterials] = useState([]);
  // id do material EXPANDIDO (overlay em tela cheia). null = todos como pílula.
  const [expandedId, setExpandedId] = useState(null);
  const idRef = useRef(0);

  // Abre um novo material: entra no TOPO da lista (mais recente) e vira o expandido — o que
  // estava expandido recolhe pra pílula sozinho (expandedId muda). O teto é checado ANTES de
  // gerar/debitar (MaterialProducer); aqui NÃO barramos, pra nunca perder um material recém
  // gerado (pago) por uma corrida.
  const openMaterial = useCallback((payload) => {
    // IDEMPOTENTE por material: abrir o MESMO material de novo expande o que já está no
    // dock em vez de criar uma segunda entrada. Sem isto, um chamador que dispare duas
    // vezes (ex.: dois ticks do polling caindo juntos) põe o mesmo questionário no dock
    // como se fossem dois — um aberto e outro minimizado na pílula, que foi o que o
    // usuário viu. Vale como rede: qualquer chamador fica protegido, não só o polling.
    const materialId = payload?.result?.id;
    let idExistente = null;
    setMaterials((prev) => {
      const jaAberto = materialId ? prev.find((m) => m?.result?.id === materialId) : null;
      if (jaAberto) {
        idExistente = jaAberto.id;
        return prev;
      }
      const id = idRef.current + 1;
      idRef.current = id;
      idExistente = id;
      return [{ id, ...payload }, ...prev];
    });
    setExpandedId(idExistente);
    return idExistente;
  }, []);

  const closeMaterial = useCallback((id) => {
    setMaterials((prev) => prev.filter((m) => m.id !== id));
    setExpandedId((cur) => (cur === id ? null : cur));
  }, []);

  // Expande uma pílula (vira o overlay; o anterior recolhe). minimizeExpanded recolhe o atual.
  const expandMaterial = useCallback((id) => setExpandedId(id), []);
  const minimizeExpanded = useCallback(() => setExpandedId(null), []);

  const value = {
    materials,
    expandedId,
    openMaterial,
    closeMaterial,
    expandMaterial,
    minimizeExpanded,
    openMaterialsCount: materials.length,
    isViewerFull: materials.length >= MAX_OPEN_MATERIALS,
  };

  return (
    <MaterialViewerContext.Provider value={value}>
      {children}
    </MaterialViewerContext.Provider>
  );
};

export default MaterialViewerContext;
