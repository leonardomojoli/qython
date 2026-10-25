import React from 'react';
import PublicPageHeader from '../shared/PublicPageHeader';
import './LegalPage.css';

/**
 * Categorias de sub-operadores (LGPD Art. 18 VII / Art. 39).
 * Acessível em qython.ai/subprocessors.
 *
 * Por escolha de segurança, listamos por CATEGORIA FUNCIONAL + JURISDIÇÃO,
 * sem nomes comerciais. A identificação nominal de cada sub-operador é
 * fornecida ao titular mediante solicitação ao Encarregado — o que atende
 * o Art. 18 VII sem expor publicamente a stack técnica do Qython.
 */
const Subprocessors = () => {
    const categories = [
        {
            category: 'Modelos de IA (processamento de linguagem natural)',
            role: 'Geração de respostas do copiloto, sumários e apoio à documentação. Dados pessoais identificáveis são redigidos antes do envio.',
            jurisdiction: 'EUA / União Europeia',
        },
        {
            category: 'Modelos de IA (análise de imagem médica)',
            role: 'Apoio à interpretação de imagens, quando habilitado. Identificadores visuais do paciente são removidos antes do envio.',
            jurisdiction: 'EUA / União Europeia',
        },
        {
            category: 'Infraestrutura de hospedagem e banco de dados',
            role: 'Servidores de aplicação e armazenamento dos dados, criptografados em repouso.',
            jurisdiction: 'União Europeia',
        },
        {
            category: 'Processamento de pagamentos',
            role: 'Cobrança de planos e créditos. Dados de cartão não transitam pelos nossos servidores.',
            jurisdiction: 'Internacional',
        },
        {
            category: 'Autenticação e verificação de telefone',
            role: 'Envio de códigos de verificação por SMS no cadastro.',
            jurisdiction: 'Internacional',
        },
        {
            category: 'Verificação de identidade profissional médica',
            role: 'Validação de registro profissional (CFM, CNES, ICP-Brasil). Não recebe dado clínico.',
            jurisdiction: 'América do Sul',
        },
    ];

    return (
        <>
            <PublicPageHeader />
            <div className="legal-page-container">
                <div className="legal-content">
                    <h1>Sub-operadores</h1>
                    <p className="legal-last-updated">Atualizado em 13 de Julho de 2026</p>

                    <div className="legal-intro">
                        <p>
                            Para operar o serviço, o Qython (Olympos Group SAS) conta com
                            terceiros que tratam dados pessoais em seu nome. Abaixo listamos
                            esses terceiros por <strong>categoria funcional</strong> e
                            jurisdição.
                        </p>
                        <p>
                            Cada sub-operador opera sob contrato (Data Processing Agreement)
                            que limita o uso dos dados estritamente às finalidades necessárias
                            para a prestação do serviço.
                        </p>
                    </div>

                    <section className="legal-section">
                        <h2>Categorias de sub-operadores</h2>
                        <div className="legal-section-content">
                            <table className="subprocessors-table">
                                <thead>
                                    <tr>
                                        <th>Categoria</th>
                                        <th>Finalidade</th>
                                        <th>Jurisdição</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {categories.map((c, idx) => (
                                        <tr key={idx}>
                                            <td><strong>{c.category}</strong></td>
                                            <td>{c.role}</td>
                                            <td>{c.jurisdiction}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </section>

                    <section className="legal-section">
                        <h2>Identificação nominal</h2>
                        <div className="legal-section-content">
                            <p>
                                A identificação nominal de cada sub-operador (razão social,
                                contrato e jurisdição específica) está disponível ao titular
                                mediante solicitação, conforme o Art. 18, VII da LGPD. Basta
                                escrever para o <a href="/encarregado">Encarregado pelo
                                Tratamento de Dados</a>: <a href="mailto:dpo@qython.ai">dpo@qython.ai</a>.
                            </p>
                        </div>
                    </section>

                    <section className="legal-section">
                        <h2>Proteção em camadas</h2>
                        <div className="legal-section-content">
                            <p>
                                Antes de qualquer dado clínico ser enviado a um provedor de
                                modelos de IA, nossa infraestrutura aplica automaticamente:
                            </p>
                            <ul>
                                <li>Detecção e redação de dados pessoais identificáveis (CPF, RG, telefone, nomes)</li>
                                <li>Substituição por marcadores genéricos consistentes (ex: <code>[PATIENT_NAME]</code>, <code>[CPF]</code>)</li>
                                <li>Encriptação em trânsito (TLS 1.3)</li>
                            </ul>
                            <p>
                                Dados clínicos brutos (prontuários, anotações, evoluções)
                                permanecem em nossos servidores criptografados em repouso e
                                <strong> nunca</strong> são compartilhados com terceiros sem
                                anonimização irreversível prévia.
                            </p>
                        </div>
                    </section>

                    <section className="legal-section">
                        <h2>Mudanças</h2>
                        <div className="legal-section-content">
                            <p>
                                Esta lista é atualizada sempre que adicionamos ou removemos
                                uma categoria de sub-operador. Mudanças significativas são
                                comunicadas aos usuários por e-mail com 30 dias de
                                antecedência quando possível.
                            </p>
                            <p>
                                Para dúvidas, contate o
                                <a href="/encarregado"> Encarregado pelo Tratamento de Dados</a>.
                            </p>
                        </div>
                    </section>
                </div>
            </div>
        </>
    );
};

export default Subprocessors;
