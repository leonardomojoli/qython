import React from 'react';
import PublicPageHeader from '../shared/PublicPageHeader';
import './LegalPage.css';

/**
 * Página pública do Encarregado pelo Tratamento de Dados (DPO/LGPD Art. 41).
 * Acessível em qython.ai/encarregado.
 */
const DPO = () => {
    return (
        <>
            <PublicPageHeader />
            <div className="legal-page-container">
                <div className="legal-content">
                    <h1>Encarregado pelo Tratamento de Dados Pessoais</h1>
                    <p className="legal-last-updated">Atualizado em 27 de Maio de 2026</p>

                    <div className="legal-intro">
                        <p>
                            Conforme exigido pelo Art. 41 da Lei Geral de Proteção de Dados
                            (Lei 13.709/2018), o Qython mantém um Encarregado pelo Tratamento
                            de Dados Pessoais (DPO) como canal de comunicação entre titulares
                            de dados, a Autoridade Nacional de Proteção de Dados (ANPD) e
                            nossa organização.
                        </p>
                    </div>

                    <section className="legal-section">
                        <h2>Quem é</h2>
                        <div className="legal-section-content">
                            <p><strong>Leonardo Abreu Santos</strong></p>
                            <p>Fundador e responsável pela conformidade com a LGPD.</p>
                        </div>
                    </section>

                    <section className="legal-section">
                        <h2>Como entrar em contato</h2>
                        <div className="legal-section-content">
                            <p>
                                <strong>E-mail:</strong> <a href="mailto:dpo@qython.ai">dpo@qython.ai</a>
                            </p>
                            <p>
                                <strong>Prazo de resposta:</strong> até 15 dias corridos para
                                solicitações relativas aos direitos do titular previstos no
                                Art. 18 da LGPD.
                            </p>
                        </div>
                    </section>

                    <section className="legal-section">
                        <h2>Para que serve o canal</h2>
                        <div className="legal-section-content">
                            <ul>
                                <li>Exercício dos direitos do titular (acesso, correção, exclusão, portabilidade, revogação de consentimento, oposição)</li>
                                <li>Esclarecimentos sobre como seus dados são tratados</li>
                                <li>Reclamações e denúncias sobre tratamento de dados pessoais</li>
                                <li>Comunicações da ANPD</li>
                            </ul>
                        </div>
                    </section>

                    <section className="legal-section">
                        <h2>Organização responsável</h2>
                        <div className="legal-section-content">
                            <p><strong>Olympos Group SAS</strong></p>
                            <p>RUT 22080158001-0</p>
                            <p>Av. Sarmiento 2519, Apto 1201 — Montevidéu, CP 11310 (Pocitos), Uruguai</p>
                            <p>Operadora do Qython.</p>
                        </div>
                    </section>

                    <section className="legal-section">
                        <h2>Exercendo seus direitos</h2>
                        <div className="legal-section-content">
                            <p>
                                Para a maioria das solicitações, você pode usar diretamente as
                                opções dentro do aplicativo, em <em>Configurações → Privacidade</em>:
                            </p>
                            <ul>
                                <li><strong>Exportar meus dados</strong> — gera um arquivo ZIP com todos os seus dados pessoais (Art. 18 V)</li>
                                <li><strong>Excluir minha conta</strong> — remove sua conta e dados associados (Art. 18 VI)</li>
                                <li><strong>Histórico de consentimentos</strong> — concede ou revoga consentimentos granulares</li>
                            </ul>
                            <p>
                                Para qualquer dúvida ou situação não coberta pelas opções
                                acima, escreva diretamente para o e-mail do Encarregado.
                            </p>
                        </div>
                    </section>
                </div>
            </div>
        </>
    );
};

export default DPO;
