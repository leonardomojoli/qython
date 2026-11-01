// frontend/src/components/admin/AdminRoute.js

import React from 'react';
import { Navigate } from 'react-router-dom';
import { useUser } from '../../contexts/UserContext';
import DNALoadingAnimation from '../shared/DNALoadingAnimation';

const AdminRoute = ({ children }) => {
    const { user, isLoading } = useUser();
    const token = localStorage.getItem('authToken');

    // 1. Se o contexto ainda está carregando, espera.
    if (isLoading) {
        return <DNALoadingAnimation />;
    }

    // 2. CORREÇÃO CRÍTICA: Se não tem user, mas tem token, 
    // significa que o SessionManager ainda está processando o refresh.
    // Mostramos loading para não chutar o admin para fora.
    if (!user && token) {
        return <DNALoadingAnimation />;
    }

    // 3. Se não tem user E não tem token, ou se o user não é admin, tchau.
    if (!user || !user.is_admin) {
        return <Navigate to="/login" replace />;
    }

    return children;
};

export default AdminRoute;
