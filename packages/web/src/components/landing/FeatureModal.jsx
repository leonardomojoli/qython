import React, { useEffect, useState } from 'react';
import './FeatureModal.css';

const FeatureModal = ({ isOpen, onClose, title, content }) => {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Controla a animação de entrada
    if (isOpen) {
      setShow(true);
    }
  }, [isOpen]);

  const handleClose = () => {
    // Controla a animação de saída
    setShow(false);
    // Espera a transição terminar antes de chamar a função onClose real
    setTimeout(onClose, 300); // 300ms deve corresponder à sua transição CSS
  };

  // Não retorna mais null, permitindo a animação de saída
  if (!isOpen && !show) return null;

  return (
    // Usamos 'handleClose' para o overlay e o botão
    <div className={`modal-overlay ${show ? 'open' : ''}`} onClick={handleClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close-button" onClick={handleClose}>&times;</button>
        <h2>{title}</h2>
        <div className="modal-body">
          {content}
        </div>
      </div>
    </div>
  );
};

export default FeatureModal;