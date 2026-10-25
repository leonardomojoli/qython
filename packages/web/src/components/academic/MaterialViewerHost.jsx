// frontend/src/components/academic/MaterialViewerHost.js
//
// Host de nível de app do visualizador de material. Fica montado FORA do <Routes>
// (ver App.js), então navegar entre seções da barra lateral NÃO o desmonta — é isto que
// mantém os quizzes vivos ao sair pro Copiloto e voltar pro Centro Acadêmico.
//
// Renderiza um MaterialResultModal por material aberto (o DOCK). Regras derivadas (sem efeito,
// sem ref):
//  - FORA do /academic, TUDO vira pílula (libera a tela de destino). Ao voltar, o material que
//    estava expandido reexpande sozinho — expandedId é preservado, então é só derivar.
//  - Uma pílula por material minimizado, empilhadas via stackIndex (mais recente na base).
//  - O modal pesado (reactflow, dagre) só monta seu conteúdo quando EXPANDIDO; minimizado ele
//    renderiza só a pílula. Carregado via React.lazy pra não inflar o bundle inicial.
import React, { Suspense, lazy } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useMaterialViewer } from '../../contexts/MaterialViewerContext';

const MaterialResultModal = lazy(() => import('./MaterialResultModal'));

const ACADEMIC_PREFIX = '/academic';

function MaterialViewerHost() {
  const location = useLocation();
  const navigate = useNavigate();
  const {
    materials,
    expandedId,
    closeMaterial,
    expandMaterial,
    minimizeExpanded,
  } = useMaterialViewer();

  if (materials.length === 0) return null;

  const onAcademic = location.pathname.startsWith(ACADEMIC_PREFIX);
  // Fora do Centro Acadêmico o overlay some (tudo vira pílula); dentro, só o expandedId fica
  // em tela cheia.
  const isMinimizedFor = (m) => !onAcademic || m.id !== expandedId;

  // stackIndex = posição entre as PÍLULAS (minimizadas), na ordem da lista (mais recente = 0 =
  // base do dock). O material expandido não ocupa slot de pílula.
  const minimizedList = materials.filter(isMinimizedFor);

  return (
    <Suspense fallback={null}>
      {materials.map((m) => {
        const minimized = isMinimizedFor(m);
        const stackIndex = minimized ? minimizedList.findIndex((x) => x.id === m.id) : 0;
        return (
          <MaterialResultModal
            key={m.id}
            isOpen
            isMinimized={minimized}
            stackIndex={stackIndex}
            onClose={() => closeMaterial(m.id)}
            onMinimize={minimizeExpanded}
            onRestore={() => {
              // Retomar SEMPRE mostra o material expandido no Centro Acadêmico (é onde ele
              // vive). Fora do /academic a regra derivada mantém tudo como pílula, então
              // clicar a pílula precisa navegar de volta E marcar o expandido — senão nada
              // acontece (era o bug: pílula no Copiloto não abria).
              if (!onAcademic) navigate(ACADEMIC_PREFIX);
              expandMaterial(m.id);
            }}
            result={m.result}
            job={m.job || null}
            onClearJob={m.onClearJob}
            sourceName={m.sourceName}
            sourceType={m.sourceType}
            materialType={m.materialType}
            trainingNote={m.trainingNote}
            onRedo={m.onRedo}
          />
        );
      })}
    </Suspense>
  );
}

export default MaterialViewerHost;
