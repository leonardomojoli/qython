import React from 'react';
import PublicPageHeader from '../shared/PublicPageHeader';
import './LegalPage.css';

/**
 * Aviso ao paciente em linguagem simples (LGPD Art. 9 — transparência).
 * Acessível em qython.ai/paciente.
 *
 * Este aviso atende a expectativa de transparência sem capturar consentimento
 * individual do paciente — o consentimento operacional para uso de dados
 * clínicos na consulta está coberto pelo Art. 11 §2º II f LGPD (tutela da
 * saúde por profissional). Dados de paciente nunca são usados em treinamento
 * de modelos sem anonimização irreversível prévia (Art. 12).
 */
const PatientNotice = () => {
    return (
        <>
            <PublicPageHeader />
            <div className="legal-page-container">
                <div className="legal-content">
                    <h1>Para o paciente</h1>
                    <p className="legal-last-updated">
                        Atualizado em 27 de Maio de 2026
                    </p>

                    <div className="legal-intro">
                        <p>
                            Seu médico usa o <strong>Qython</strong> como ferramenta de apoio
                            à decisão clínica. Esta página explica, em linguagem simples, o
                            que isso significa para os seus dados.
                        </p>
                    </div>

                    <section className="legal-section">
                        <h2>O que é o Qython?</h2>
                        <div className="legal-section-content">
                            <p>
                                O Qython é um copiloto clínico baseado em inteligência
                                artificial. Ele ajuda médicos a:
                            </p>
                            <ul>
                                <li>Documentar consultas com mais precisão e em menos tempo</li>
                                <li>Consultar literatura médica atualizada durante o atendimento</li>
                                <li>Gerar prescrições, atestados e orientações personalizadas</li>
                                <li>Manter prontuários organizados e acessíveis</li>
                            </ul>
                            <p>
                                Quem decide o que fazer com você sempre é o seu médico. O
                                Qython é uma ferramenta — como um livro, um sistema de
                                prontuário ou um aplicativo de calculadora médica.
                            </p>
                        </div>
                    </section>

                    <section className="legal-section">
                        <h2>Quais dados meus o Qython guarda?</h2>
                        <div className="legal-section-content">
                            <p>
                                Quando seu médico registra uma consulta no Qython, podem ser
                                guardados:
                            </p>
                            <ul>
                                <li>Identificação básica (nome, idade, documento, contato)</li>
                                <li>Histórico clínico, queixas, hipóteses diagnósticas, exames</li>
                                <li>Medicamentos prescritos, orientações dadas</li>
                                <li>Áudio da consulta (se o médico optar por gravar)</li>
                            </ul>
                            <p>
                                Esses dados ficam guardados em servidores na União Europeia
                                (jurisdição com alto padrão de proteção de dados), sob a
                                responsabilidade do seu médico (que é quem decide o que
                                registrar) e do Qython (que oferece a ferramenta).
                            </p>
                        </div>
                    </section>

                    <section className="legal-section">
                        <h2>Como meus dados são protegidos?</h2>
                        <div className="legal-section-content">
                            <ul>
                                <li>
                                    <strong>Criptografia em repouso:</strong> seus dados ficam
                                    embaralhados no banco de dados. Mesmo um invasor com
                                    acesso ao disco não conseguiria lê-los.
                                </li>
                                <li>
                                    <strong>Criptografia em trânsito:</strong> qualquer
                                    comunicação com nossos servidores é protegida por TLS 1.3.
                                </li>
                                <li>
                                    <strong>Registro de operações:</strong> guardamos
                                    histórico imutável de quem acessou seus dados e quando.
                                </li>
                                <li>
                                    <strong>Acesso restrito:</strong> apenas o médico que
                                    cadastrou você pode ver seus dados clínicos. Não temos
                                    "modo administrador" que liberaria seu prontuário para
                                    funcionários do Qython.
                                </li>
                            </ul>
                        </div>
                    </section>

                    <section className="legal-section">
                        <h2>Meus dados são usados para treinar a inteligência artificial?</h2>
                        <div className="legal-section-content">
                            <p>
                                <strong>Sim, mas sempre anonimizados.</strong>
                            </p>
                            <p>
                                Quando seu médico usa o Qython, parte do trabalho é melhorar
                                continuamente o copiloto. Para isso, podemos usar dados
                                clínicos em treinamento de modelos — mas apenas após um
                                processo de <strong>anonimização irreversível</strong>:
                            </p>
                            <ul>
                                <li>Nome, documento, telefone, endereço — <strong>removidos</strong></li>
                                <li>Idade exata — substituída por faixa etária (ex: "30-34")</li>
                                <li>CEP — generalizado para região (ex: "01-***")</li>
                                <li>Data exata — substituída por mês/ano</li>
                                <li>Especialidades raras — agrupadas como "outras" para evitar identificação por contexto</li>
                            </ul>
                            <p>
                                Esses dados anonimizados, conforme o Art. 12 da LGPD,
                                <strong> deixam de ser considerados dados pessoais</strong> —
                                não há como remontar quem você é a partir deles.
                            </p>
                        </div>
                    </section>

                    <section className="legal-section">
                        <h2>Posso pedir para acessar, corrigir ou apagar meus dados?</h2>
                        <div className="legal-section-content">
                            <p>
                                Sim. Pelo Art. 18 da LGPD, você tem direito a:
                            </p>
                            <ul>
                                <li>Saber quais dados seus são tratados</li>
                                <li>Receber uma cópia dos seus dados em formato portável</li>
                                <li>Corrigir dados incorretos ou desatualizados</li>
                                <li>Pedir a eliminação dos dados</li>
                                <li>Saber com quais terceiros seus dados são compartilhados</li>
                            </ul>
                            <p>
                                <strong>Como exercer:</strong> procure o seu médico. Ele tem
                                ferramentas dentro do Qython para atender a essas solicitações.
                                Se preferir, ou se o médico não puder ajudar, escreva
                                diretamente para o <a href="/encarregado">Encarregado pelo
                                Tratamento de Dados</a>: <a href="mailto:dpo@qython.ai">dpo@qython.ai</a>.
                            </p>
                        </div>
                    </section>

                    <section className="legal-section">
                        <h2>Mais informações</h2>
                        <div className="legal-section-content">
                            <ul>
                                <li><a href="/privacy-policy">Política de Privacidade completa</a></li>
                                <li><a href="/subprocessors">Lista de sub-operadores</a></li>
                                <li><a href="/encarregado">Contato do Encarregado (DPO)</a></li>
                            </ul>
                            <p>
                                Para denúncias e reclamações, você também pode contatar a
                                <a href="https://www.gov.br/anpd/pt-br" target="_blank" rel="noopener noreferrer"> Autoridade Nacional de Proteção de Dados</a>.
                            </p>
                        </div>
                    </section>
                </div>
            </div>
        </>
    );
};

export default PatientNotice;
