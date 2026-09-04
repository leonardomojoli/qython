import joaoSilva from '../assets/testimonials/doctor_joao_silva.png';
import mariaSantos from '../assets/testimonials/doctor_maria_santos.png';
import pedroAlmeida from '../assets/testimonials/doctor_pedro_almeida.png';
import fernandaCosta from '../assets/testimonials/doctor_fernanda_costa.png';
import robertoFonseca from '../assets/testimonials/professor_roberto_fonseca.png';
import carolinaMendes from '../assets/testimonials/student_carolina_mendes.png';

const testimonials = [
    {
        id: 1,
        name: 'Dr. João Silva',
        role: 'Cardiologista',
        institution: 'Hospital do Coração - CRM 12345/SP',
        image: joaoSilva,
        rating: 5,
        testimonial:
            'O Qython transformou minha prática clínica. O que antes levava horas em documentação agora leva minutos. A IA entende contexto médico e me ajuda a manter registros completos sem sacrificar tempo com pacientes. Reduzi 3 horas de trabalho administrativo por dia.',
    },
    {
        id: 2,
        name: 'Dra. Maria Santos',
        role: 'Neurologista',
        institution: 'Clínica NeuroExcelência - CRM 67890/RJ',
        image: mariaSantos,
        rating: 5,
        testimonial:
            'A Rede Neural da Qython é minha segunda opinião confiável. Quando tenho casos complexos, a IA sugere diagnósticos diferenciais que eu talvez não considerasse, sempre com base em evidências científicas. É como ter acesso instantâneo ao conhecimento de milhares de especialistas.',
    },
    {
        id: 3,
        name: 'Dr. Pedro Almeida',
        role: 'Residente de Clínica Médica',
        institution: 'Hospital das Clínicas USP - CRM 11223/SP',
        image: pedroAlmeida,
        rating: 5,
        testimonial:
            'Como residente, tenho muito a aprender. A Arena de Competição do Qython me ajudou a identificar gaps no meu conhecimento e estudar de forma direcionada. Minha pontuação nos simulados aumentou 40% em 3 meses. Sinto que estou muito mais preparado para o R3.',
    },
    {
        id: 4,
        name: 'Dra. Fernanda Costa',
        role: 'Chefe do Departamento de Pediatria',
        institution: 'Hospital Infantil São Lucas - CRM 44556/SP',
        image: fernandaCosta,
        rating: 5,
        testimonial:
            'Implementamos o Qython em toda a equipe de pediatria. Os resultados foram impressionantes: 25% de aumento na capacidade de atendimento, redução de 30% em erros de prescrição e 98% de satisfação dos médicos. Nossos pacientes também notaram a diferença na qualidade do atendimento.',
    },
    {
        id: 5,
        name: 'Prof. Dr. Roberto Fonseca',
        role: 'Professor de Medicina',
        institution: 'Faculdade de Medicina UNIFESP - CRM 77889/SP',
        image: robertoFonseca,
        rating: 5,
        testimonial:
            'Uso o Qython tanto na prática clínica quanto no ensino. A ferramenta de criação automática de materiais didáticos é revolucionária. Transformo artigos complexos em podcasts e vídeos para meus alunos em minutos. A biblioteca com RAG permite que eles façam perguntas sofisticadas e recebam respostas precisas.',
    },
    {
        id: 6,
        name: 'Carolina Mendes',
        role: 'Estudante de Medicina - 5º Ano',
        institution: 'Universidade Federal do Rio de Janeiro',
        image: carolinaMendes,
        rating: 5,
        testimonial:
            'O Qython é indispensável para minha rotina de estudos. Faço upload dos PDFs das aulas e a IA cria resumos, mapas mentais e até podcasts que ouço no caminho da faculdade. A Arena me motiva a estudar diariamente e competir com colegas de todo o Brasil. Meu rendimento melhorou significativamente.',
    },
];

export default testimonials;
