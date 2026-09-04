import base64
import io
import os
import logging
from datetime import datetime
from weasyprint import HTML, CSS

from ..config import Config

logger = logging.getLogger("qython_logger")

# Traduções para o rodapé do PDF
PDF_FOOTER_TRANSLATIONS = {
    'pt': 'Esse documento foi gerado com a inteligência médica de Qython',
    'en': 'This document was generated with Qython medical intelligence',
    'es': 'Este documento fue generado con la inteligencia médica de Qython'
}

def get_footer_text(language: str = 'pt') -> str:
    """Retorna o texto do rodapé no idioma especificado."""
    return PDF_FOOTER_TRANSLATIONS.get(language, PDF_FOOTER_TRANSLATIONS['pt'])

# Configuração de caminhos
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROJECT_ROOT = os.path.dirname(BASE_DIR)
ASSETS_DIR = os.path.join(PROJECT_ROOT, 'packages', 'web', 'src', 'assets')

# CSS Base (Estilo Deep Tech / Clean para documentos médicos)
BASE_CSS = """
@page {
    margin: 2cm;
    @top-left { content: element(header); }
    @bottom-center { content: element(footer); }
}
body { 
    font-family: 'Helvetica', 'Arial', sans-serif; 
    line-height: 1.5; 
    color: #333; 
    font-size: 12pt;
}
#header {
    position: running(header);
    padding-bottom: 15px;
    padding-top: 10px;
    margin-bottom: 30px;
    display: flex;
    justify-content: space-between;
    align-items: center;
}
#header img { height: 45px; width: auto; }
#footer {
    position: running(footer);
    font-size: 8pt;
    color: #7f8c8d;
    text-align: center;
    padding-top: 10px;
}
#footer .page-number::after { content: counter(page); }

h1, h2 { color: #2c3e50; text-transform: uppercase; letter-spacing: 1px; }
h2 { font-size: 16pt; text-align: center; margin-bottom: 30px; margin-top: 0; }

.patient-box {
    background-color: #f8f9fa;
    border: 1px solid #e9ecef;
    border-left: 5px solid #2c3e50;
    padding: 15px;
    border-radius: 4px;
    margin-bottom: 30px;
}

table { width: 100%; border-collapse: collapse; margin: 20px 0; }
th { background-color: #ecf0f1; color: #2c3e50; font-weight: bold; text-align: left; padding: 10px; border-bottom: 2px solid #bdc3c7; }
td { padding: 12px 10px; border-bottom: 1px solid #ecf0f1; vertical-align: top; }
tr:last-child td { border-bottom: none; }

.signature-box {
    margin-top: 80px;
    text-align: center;
    page-break-inside: avoid;
}
.signature-line {
    border-top: 1px solid #333;
    width: 60%;
    margin: 0 auto 10px auto;
}
"""

def get_logo_path(doctor=None):
    """Returns doctor's custom logo path if available, otherwise Qython default."""
    if doctor and getattr(doctor, 'doctor_logo', None):
        from backend.config import Config
        logo_file = os.path.join(Config.UPLOAD_FOLDER_DOCTOR_LOGOS, doctor.doctor_logo)
        if os.path.exists(logo_file):
            url_path = logo_file.replace('\\', '/')
            return f'file:///{url_path}'
    # Fallback: Qython logo
    path = os.path.join(ASSETS_DIR, 'qython-imagotipo.png')
    if os.path.exists(path):
        url_path = path.replace('\\', '/')
        return f'file:///{url_path}'
    return ''

def generate_qr_code_base64(url: str) -> str:
    """Generate a QR code as base64-encoded PNG."""
    try:
        import qrcode
        qr = qrcode.QRCode(
            version=1,
            error_correction=qrcode.constants.ERROR_CORRECT_M,
            box_size=8,
            border=2,
        )
        qr.add_data(url)
        qr.make(fit=True)
        img = qr.make_image(fill_color="black", back_color="white")
        buffer = io.BytesIO()
        img.save(buffer, format="PNG")
        return base64.b64encode(buffer.getvalue()).decode("utf-8")
    except Exception as e:
        logger.warning(f"Failed to generate QR code: {e}")
        return ""


def render_prescription_pdf(prescription, doctor, patient, share_token: str = None) -> bytes:
    """
    Renderiza uma receita médica estruturada em PDF (bytes) usando HTML/CSS.
    """
    try:
        logo_url = get_logo_path(doctor)
        
        # Mapeamento de tipos para PT-BR
        type_map = {
            'simple': 'Receita Simples',
            'controlled_c1': 'Receita de Controle Especial (C1)',
            'controlled_b1': 'Notificação de Receita B (B1)'
        }
        presc_type = type_map.get(prescription.prescription_type, 'Receita Médica')

        # Formatando data
        date_str = prescription.created_at.strftime('%d/%m/%Y')

        # Construindo HTML
        # Header do Médico
        doctor_info = f"<b>{doctor.full_name}</b>"
        if hasattr(doctor, 'crm') and doctor.crm:
             doctor_info += f"<br><small>CRM: {doctor.crm}</small>"
        else:
             doctor_info += f"<br><small>{doctor.email}</small>"

        logo_html = f'<img src="{logo_url}">' if logo_url else 'Qython'

        # Construindo linhas da tabela
        rows_html = ""
        for idx, item in enumerate(prescription.items):
            med = item.get('medication', '')
            dosage = item.get('dosage', '')
            qtd = item.get('quantity', '')
            
            # Instruções combinadas
            instr_parts = []
            if item.get('instructions'): instr_parts.append(item.get('instructions'))
            if item.get('frequency'): instr_parts.append(f"Tomar: {item.get('frequency')}")
            if item.get('duration'): instr_parts.append(f"Durante: {item.get('duration')}")
            
            instr_html = "<br>".join(instr_parts)

            rows_html += f"""
            <tr>
                <td style="width: 5%; text-align: center; color: #7f8c8d;">{idx + 1}</td>
                <td style="width: 45%">
                    <div style="font-weight: bold; font-size: 1.1em;">{med}</div>
                    <div style="color: #555;">{dosage}</div>
                    <div style="font-size: 0.85em; margin-top: 4px; color: #7f8c8d;">Qtd: {qtd}</div>
                </td>
                <td style="width: 50%; color: #333;">{instr_html}</td>
            </tr>
            """

        # Observações
        notes_html = ""
        if prescription.notes:
            notes_html = f"""
            <div style="margin-top: 30px; background: #fffbe6; padding: 15px; border: 1px dashed #ffe58f; border-radius: 4px;">
                <strong style="color: #d48806;">Observações:</strong><br>
                <span style="color: #555;">{prescription.notes}</span>
            </div>
            """

        # QR Code section
        qr_html = ""
        if share_token:
            share_url = f"{Config.WEB_BASE_URL}/receita/{share_token}"
            qr_base64 = generate_qr_code_base64(share_url)
            if qr_base64:
                qr_html = f"""
                <div style="margin-top: 30px; text-align: center; page-break-inside: avoid;">
                    <div style="display: inline-block; padding: 10px; border: 1px solid #e9ecef; border-radius: 8px; background: #f8f9fa;">
                        <img src="data:image/png;base64,{qr_base64}" style="width: 2.5cm; height: 2.5cm;" alt="QR Code">
                        <div style="font-size: 8pt; color: #7f8c8d; margin-top: 5px;">Aponte a câmera para ver sua receita digital — qython.ai</div>
                    </div>
                </div>
                """

        full_html = f"""
        <!DOCTYPE html>
        <html>
        <head><title>Prescrição</title></head>
        <body>
            <div id="header">
                <div>{logo_html}</div>
                <div style="text-align: right;">{doctor_info}</div>
            </div>

            <div id="footer">
                <p>Documento gerado digitalmente pela plataforma Qython.app em {date_str} | Página <span class="page-number"></span></p>
            </div>

            <h2>{presc_type}</h2>

            <div class="patient-box">
                <span style="color: #7f8c8d; font-size: 0.9em; text-transform: uppercase; letter-spacing: 1px;">Paciente</span><br>
                <strong style="font-size: 1.4em; color: #2c3e50;">{patient.full_name}</strong>
            </div>

            <table>
                <thead>
                    <tr>
                        <th>#</th>
                        <th>Medicamento / Posologia</th>
                        <th>Instruções de Uso</th>
                    </tr>
                </thead>
                <tbody>
                    {rows_html}
                </tbody>
            </table>

            {notes_html}

            {qr_html}

            <div class="signature-box">
                <div class="signature-line"></div>
                <div>Assinatura e Carimbo do Médico</div>
            </div>
        </body>
        </html>
        """
        
        # Gerar PDF
        return HTML(string=full_html, base_url=PROJECT_ROOT).write_pdf(
            stylesheets=[CSS(string=BASE_CSS)]
        )

    except Exception as e:
        logger.error(f"Erro ao renderizar PDF da prescrição: {e}")
        raise e

def render_generic_pdf(html_content: str, title: str = "Documento Qython", language: str = 'pt') -> bytes:
    """
    Renderiza um PDF genérico (ex: exportação de chat/resumo) mantendo a identidade visual.
    Aceita HTML já processado (ex: vindo de Markdown).
    """
    try:
        logo_url = get_logo_path()
        logo_html = f'<img src="{logo_url}">' if logo_url else 'Qython'
        footer_text = get_footer_text(language)

        # CSS Adicional específico para conteúdo de texto corrido (Markdown)
        markdown_css = """
        .content-body { text-align: justify; margin-top: 20px; }
        .content-body h1, .content-body h2 { color: #2c3e50; margin-top: 1.5em; border-bottom: 1px solid #eee; padding-bottom: 5px; }
        .content-body h3, .content-body h4 { color: #34495e; margin-top: 1.2em; }
        .content-body p { margin-bottom: 1em; line-height: 1.6; }
        .content-body ul, .content-body ol { margin-bottom: 1em; padding-left: 1.5em; }
        .content-body li { margin-bottom: 0.5em; }
        .content-body code { background: #f8f9fa; padding: 2px 4px; border-radius: 3px; font-family: monospace; }
        """

        full_html = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <title>{title}</title>
            <meta charset="UTF-8">
        </head>
        <body>
            <div id="header">
                <div>{logo_html}</div>
            </div>

            <div id="footer">
                <p>{footer_text} | Página <span class="page-number"></span></p>
            </div>

            <div class="content-body">
                {html_content}
            </div>
        </body>
        </html>
        """
        
        # Combina o CSS base com o CSS de markdown
        combined_css = BASE_CSS + markdown_css
        
        return HTML(string=full_html, base_url=PROJECT_ROOT).write_pdf(
            stylesheets=[CSS(string=combined_css)]
        )

    except Exception as e:
        logger.error(f"Erro ao renderizar PDF genérico: {e}")
        raise e


def render_document_pdf(document, doctor, patient) -> bytes:
    """
    Renderiza um documento médico (atestado, declaração, relatório, encaminhamento).
    """
    try:
        logo_url = get_logo_path(doctor)
        date_str = document.created_at.strftime('%d/%m/%Y')
        content = document.content or {}
        
        # Doctor info
        doctor_info = f"<b>{doctor.full_name}</b>"
        if hasattr(doctor, 'identifier_number') and doctor.identifier_number:
            doctor_info += f"<br><small>CRM: {doctor.identifier_number}</small>"
        else:
            doctor_info += f"<br><small>{doctor.email}</small>"
        
        logo_html = f'<img src="{logo_url}">' if logo_url else 'Qython'
        
        # Document type titles
        type_titles = {
            'sick_leave': 'Atestado Médico',
            'fitness': 'Atestado de Aptidão Física',
            'attendance': 'Declaração de Comparecimento',
            'report': 'Relatório Médico',
            'referral': 'Encaminhamento Médico'
        }
        doc_title = type_titles.get(document.document_type, 'Documento Médico')
        
        # Build content based on type
        content_html = ""
        
        if document.document_type == 'sick_leave':
            cid = content.get('cid', '')
            days = content.get('days', '')
            start_date = content.get('start_date', date_str)
            description = content.get('description', '')
            
            content_html = f"""
            <div style="text-align: justify; line-height: 1.8; font-size: 12pt;">
                <p>Atesto para os devidos fins que o(a) paciente <strong>{patient.full_name}</strong>
                esteve sob meus cuidados profissionais e necessita de afastamento de suas atividades
                por um período de <strong>{days} ({days}) dia(s)</strong>, a partir de <strong>{start_date}</strong>.</p>
                
                {f'<p><strong>CID-10:</strong> {cid}</p>' if cid else ''}
                
                {f'<p><strong>Observações:</strong> {description}</p>' if description else ''}
            </div>
            """
        
        elif document.document_type == 'fitness':
            purpose = content.get('purpose', 'atividades laborais')
            valid_until = content.get('valid_until', '')
            
            content_html = f"""
            <div style="text-align: justify; line-height: 1.8; font-size: 12pt;">
                <p>Atesto para os devidos fins que o(a) paciente <strong>{patient.full_name}</strong>
                encontra-se em boas condições de saúde, estando apto(a) para <strong>{purpose}</strong>.</p>
                
                {f'<p><strong>Válido até:</strong> {valid_until}</p>' if valid_until else ''}
            </div>
            """
        
        elif document.document_type == 'attendance':
            attendance_date = content.get('date', date_str)
            attendance_time = content.get('time', '')
            duration = content.get('duration', '')
            
            content_html = f"""
            <div style="text-align: justify; line-height: 1.8; font-size: 12pt;">
                <p>Declaro para os devidos fins que o(a) paciente <strong>{patient.full_name}</strong>
                compareceu a esta unidade de saúde na data de <strong>{attendance_date}</strong>
                {f'às <strong>{attendance_time}</strong>' if attendance_time else ''}
                {f', permanecendo em atendimento por aproximadamente <strong>{duration}</strong>' if duration else ''}.</p>
            </div>
            """
        
        elif document.document_type == 'report':
            report_content = content.get('content', '')
            diagnosis = content.get('diagnosis', '')
            
            content_html = f"""
            <div style="text-align: justify; line-height: 1.8; font-size: 12pt;">
                {f'<p><strong>Diagnóstico:</strong> {diagnosis}</p>' if diagnosis else ''}
                
                <div style="margin-top: 20px; white-space: pre-wrap;">{report_content}</div>
            </div>
            """
        
        elif document.document_type == 'referral':
            specialty = content.get('specialty', '')
            reason = content.get('reason', '')
            urgency = content.get('urgency', 'routine')
            
            urgency_labels = {
                'routine': 'Rotina',
                'urgent': 'Urgente',
                'emergency': 'Emergência'
            }
            urgency_label = urgency_labels.get(urgency, 'Rotina')
            
            content_html = f"""
            <div style="text-align: justify; line-height: 1.8; font-size: 12pt;">
                <p>Encaminho o(a) paciente <strong>{patient.full_name}</strong> para avaliação
                especializada em <strong>{specialty}</strong>.</p>
                
                <p><strong>Prioridade:</strong> {urgency_label}</p>
                
                <p><strong>Motivo do encaminhamento:</strong></p>
                <div style="margin-left: 20px; white-space: pre-wrap;">{reason}</div>
            </div>
            """
        
        full_html = f"""
        <!DOCTYPE html>
        <html>
        <head><title>{doc_title}</title></head>
        <body>
            <div id="header">
                <div>{logo_html}</div>
                <div style="text-align: right;">{doctor_info}</div>
            </div>
            
            <div id="footer">
                <p>Documento gerado digitalmente pela plataforma Qython.app em {date_str} | Página <span class="page-number"></span></p>
            </div>

            <h2>{doc_title}</h2>
            
            <div class="patient-box">
                <span style="color: #7f8c8d; font-size: 0.9em; text-transform: uppercase; letter-spacing: 1px;">Paciente</span><br>
                <strong style="font-size: 1.4em; color: #2c3e50;">{patient.full_name}</strong>
            </div>

            {content_html}

            <div class="signature-box">
                <div class="signature-line"></div>
                <div>Assinatura e Carimbo do Médico</div>
            </div>
        </body>
        </html>
        """
        
        return HTML(string=full_html, base_url=PROJECT_ROOT).write_pdf(
            stylesheets=[CSS(string=BASE_CSS)]
        )

    except Exception as e:
        logger.error(f"Erro ao renderizar PDF do documento: {e}")
        raise e


def render_exam_order_pdf(order, doctor, patient) -> bytes:
    """
    Renderiza um pedido de exames em PDF.
    """
    try:
        logo_url = get_logo_path(doctor)
        date_str = order.created_at.strftime('%d/%m/%Y')
        
        # Doctor info
        doctor_info = f"<b>{doctor.full_name}</b>"
        if hasattr(doctor, 'identifier_number') and doctor.identifier_number:
            doctor_info += f"<br><small>CRM: {doctor.identifier_number}</small>"
        else:
            doctor_info += f"<br><small>{doctor.email}</small>"
        
        logo_html = f'<img src="{logo_url}">' if logo_url else 'Qython'
        
        # Urgency label
        urgency_labels = {
            'routine': 'Rotina',
            'urgent': 'Urgente',
            'emergency': 'Emergência'
        }
        urgency_label = urgency_labels.get(order.urgency, 'Rotina')
        urgency_color = '#27ae60' if order.urgency == 'routine' else '#e74c3c' if order.urgency == 'emergency' else '#f39c12'
        
        # Build exam list
        exams_html = ""
        for idx, exam in enumerate(order.exams or []):
            exam_name = exam.get('name', '')
            exam_code = exam.get('code', '')
            exam_category = exam.get('category', '')
            
            exams_html += f"""
            <tr>
                <td style="width: 5%; text-align: center; color: #7f8c8d;">{idx + 1}</td>
                <td style="width: 50%; font-weight: bold;">{exam_name}</td>
                <td style="width: 25%; color: #555;">{exam_code}</td>
                <td style="width: 20%; color: #7f8c8d;">{exam_category}</td>
            </tr>
            """
        
        # Clinical indication
        indication_html = ""
        if order.clinical_indication:
            indication_html = f"""
            <div style="margin-top: 30px; background: #fffbe6; padding: 15px; border: 1px dashed #ffe58f; border-radius: 4px;">
                <strong style="color: #d48806;">Indicação Clínica:</strong><br>
                <span style="color: #555;">{order.clinical_indication}</span>
            </div>
            """
        
        full_html = f"""
        <!DOCTYPE html>
        <html>
        <head><title>Pedido de Exames</title></head>
        <body>
            <div id="header">
                <div>{logo_html}</div>
                <div style="text-align: right;">{doctor_info}</div>
            </div>
            
            <div id="footer">
                <p>Documento gerado digitalmente pela plataforma Qython.app em {date_str} | Página <span class="page-number"></span></p>
            </div>

            <h2>Pedido de Exames</h2>
            
            <div class="patient-box">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <span style="color: #7f8c8d; font-size: 0.9em; text-transform: uppercase; letter-spacing: 1px;">Paciente</span><br>
                        <strong style="font-size: 1.4em; color: #2c3e50;">{patient.full_name}</strong>
                    </div>
                    <div style="background: {urgency_color}; color: white; padding: 6px 12px; border-radius: 4px; font-weight: bold;">
                        {urgency_label}
                    </div>
                </div>
            </div>

            <table>
                <thead>
                    <tr>
                        <th>#</th>
                        <th>Exame</th>
                        <th>Código</th>
                        <th>Categoria</th>
                    </tr>
                </thead>
                <tbody>
                    {exams_html}
                </tbody>
            </table>

            {indication_html}

            <div class="signature-box">
                <div class="signature-line"></div>
                <div>Assinatura e Carimbo do Médico</div>
            </div>
        </body>
        </html>
        """
        
        return HTML(string=full_html, base_url=PROJECT_ROOT).write_pdf(
            stylesheets=[CSS(string=BASE_CSS)]
        )

    except Exception as e:
        logger.error(f"Erro ao renderizar PDF do pedido de exames: {e}")
        raise e


def render_flashcards_pdf(flashcards: list, language: str = 'pt') -> bytes:
    """
    Renderiza flashcards em PDF com estilo visual fiel ao frontend.
    Cada flashcard é exibido como um cartão com frente e verso.
    """
    try:
        logo_url = get_logo_path()
        logo_html = f'<img src="{logo_url}">' if logo_url else 'Qython'
        footer_text = get_footer_text(language)

        # CSS específico para flashcards
        flashcards_css = """
        @page {
            margin: 1.5cm;
            @top-left { content: element(header); }
            @bottom-center { content: element(footer); }
        }
        body {
            font-family: 'Helvetica', 'Arial', sans-serif;
            line-height: 1.4;
            color: #333;
            font-size: 10pt;
        }
        #header {
            position: running(header);
            padding-bottom: 10px;
            padding-top: 10px;
            margin-bottom: 20px;
        }
        #header img { height: 35px; }
        #footer {
            position: running(footer);
            font-size: 8pt;
            color: #7f8c8d;
            text-align: center;
            padding-top: 8px;
        }
        #footer .page-number::after { content: counter(page); }

        .flashcards-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 15px;
        }

        .flashcard {
            border: 1px solid #e0e0e0;
            border-radius: 8px;
            overflow: hidden;
            page-break-inside: avoid;
            background: #fff;
        }

        .flashcard-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 6px 10px;
            background: #f8f9fa;
            border-bottom: 1px solid #e0e0e0;
            font-size: 8pt;
        }

        .category-badge {
            background: #e8f4fd;
            color: #1976d2;
            padding: 2px 8px;
            border-radius: 10px;
            font-size: 7pt;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .difficulty-indicator {
            font-size: 8pt;
            font-weight: bold;
        }
        .difficulty-easy { color: #10b981; }
        .difficulty-medium { color: #f59e0b; }
        .difficulty-hard { color: #ef4444; }

        .flashcard-front {
            padding: 12px;
            background: #fff;
            min-height: 60px;
        }

        .flashcard-front p {
            margin: 0;
            font-weight: 600;
            color: #2c3e50;
            font-size: 9pt;
        }

        .flashcard-back {
            padding: 12px;
            background: #f0f7ff;
            border-top: 1px dashed #cce0ff;
            min-height: 60px;
        }

        .flashcard-back p {
            margin: 0;
            color: #333;
            font-size: 9pt;
        }

        .hint-section {
            margin-top: 8px;
            padding: 6px 8px;
            background: #fffbeb;
            border-radius: 4px;
            font-size: 8pt;
            color: #92400e;
        }

        .hint-section strong {
            color: #d97706;
        }

        .mnemonic-section {
            margin-top: 8px;
            padding: 6px 8px;
            background: #f0fdf4;
            border-radius: 4px;
            font-size: 8pt;
            color: #166534;
            font-style: italic;
        }

        .title-section {
            text-align: center;
            margin-bottom: 20px;
        }

        .title-section h1 {
            color: #2c3e50;
            font-size: 16pt;
            margin: 0 0 5px 0;
        }

        .title-section p {
            color: #7f8c8d;
            font-size: 10pt;
            margin: 0;
        }
        """

        # Mapear categorias para labels
        category_labels = {
            'fisiopatologia': 'Fisiopatologia',
            'quadro_clinico': 'Quadro Clínico',
            'diagnostico': 'Diagnóstico',
            'tratamento': 'Tratamento',
            'farmacologia': 'Farmacologia',
            'epidemiologia': 'Epidemiologia'
        }

        # Gerar HTML dos flashcards
        flashcards_html = ""
        for card in flashcards:
            categoria = card.get('categoria', '')
            dificuldade = card.get('dificuldade', 'medio')
            frente = card.get('frente', '')
            verso = card.get('verso', '')
            dica = card.get('dica', '')
            mnemonico = card.get('mnemonico', '')

            diff_class = f"difficulty-{dificuldade}" if dificuldade in ['facil', 'medio', 'dificil'] else 'difficulty-medium'
            diff_label = '●' if dificuldade == 'facil' else ('●●' if dificuldade == 'medio' else '●●●')
            cat_label = category_labels.get(categoria, categoria.replace('_', ' ').title()) if categoria else ''

            hint_html = f'<div class="hint-section"><strong>💡 Dica:</strong> {dica}</div>' if dica else ''
            mnemonic_html = f'<div class="mnemonic-section">🧠 {mnemonico}</div>' if mnemonico else ''

            flashcards_html += f"""
            <div class="flashcard">
                <div class="flashcard-header">
                    {f'<span class="category-badge">{cat_label}</span>' if cat_label else '<span></span>'}
                    <span class="difficulty-indicator {diff_class}">{diff_label}</span>
                </div>
                <div class="flashcard-front">
                    <p>{frente}</p>
                    {hint_html}
                </div>
                <div class="flashcard-back">
                    <p>{verso}</p>
                    {mnemonic_html}
                </div>
            </div>
            """

        full_html = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <title>Flashcards Qython</title>
            <meta charset="UTF-8">
        </head>
        <body>
            <div id="header">
                <div>{logo_html}</div>
            </div>

            <div id="footer">
                <p>{footer_text} | Página <span class="page-number"></span></p>
            </div>

            <div class="title-section">
                <h1>Flashcards de Estudo</h1>
                <p>{len(flashcards)} cartões</p>
            </div>

            <div class="flashcards-grid">
                {flashcards_html}
            </div>
        </body>
        </html>
        """

        return HTML(string=full_html, base_url=PROJECT_ROOT).write_pdf(
            stylesheets=[CSS(string=flashcards_css)]
        )

    except Exception as e:
        logger.error(f"Erro ao renderizar PDF de flashcards: {e}")
        raise e


def render_orientation_pdf(orientation, doctor, patient=None) -> bytes:
    """
    Renderiza uma orientação ao paciente em PDF.
    O campo content já contém HTML, então é embutido diretamente.
    """
    try:
        logo_url = get_logo_path(doctor)
        date_str = orientation.created_at.strftime('%d/%m/%Y')

        # Doctor info
        doctor_info = f"<b>{doctor.full_name}</b>"
        if hasattr(doctor, 'identifier_number') and doctor.identifier_number:
            doctor_info += f"<br><small>CRM: {doctor.identifier_number}</small>"
        else:
            doctor_info += f"<br><small>{doctor.email}</small>"

        logo_html = f'<img src="{logo_url}">' if logo_url else 'Qython'

        # Patient box (optional - orientations may not have a patient)
        patient_html = ""
        if patient:
            patient_html = f"""
            <div class="patient-box">
                <span style="color: #7f8c8d; font-size: 0.9em; text-transform: uppercase; letter-spacing: 1px;">Paciente</span><br>
                <strong style="font-size: 1.4em; color: #2c3e50;">{patient.full_name}</strong>
            </div>
            """

        full_html = f"""
        <!DOCTYPE html>
        <html>
        <head><title>{orientation.title}</title></head>
        <body>
            <div id="header">
                <div>{logo_html}</div>
                <div style="text-align: right;">{doctor_info}</div>
            </div>

            <div id="footer">
                <p>Documento gerado digitalmente pela plataforma Qython.app em {date_str} | Página <span class="page-number"></span></p>
            </div>

            {patient_html}

            <div style="text-align: justify; line-height: 1.6; font-size: 11pt;">
                {orientation.content}
            </div>

            <div class="signature-box">
                <div class="signature-line"></div>
                <div>Assinatura e Carimbo do Médico</div>
            </div>
        </body>
        </html>
        """

        return HTML(string=full_html, base_url=PROJECT_ROOT).write_pdf(
            stylesheets=[CSS(string=BASE_CSS)]
        )

    except Exception as e:
        logger.error(f"Erro ao renderizar PDF da orientação: {e}")
        raise e


def render_mind_map_pdf(image_base64: str, title: str = "Mapa Mental", language: str = 'pt') -> bytes:
    """
    Renderiza um mapa mental (imagem base64) em PDF landscape.
    """
    try:
        logo_url = get_logo_path()
        logo_html = f'<img src="{logo_url}">' if logo_url else 'Qython'
        footer_text = get_footer_text(language)

        # CSS específico para mapa mental - landscape com imagem centralizada
        mind_map_css = """
        @page {
            size: A4 landscape;
            margin: 1.5cm;
            @bottom-center { content: element(footer); }
        }
        body {
            font-family: 'Helvetica', 'Arial', sans-serif;
            margin: 0;
            padding: 0;
        }
        #header {
            text-align: center;
            padding-bottom: 10px;
            margin-bottom: 10px;
        }
        #header img { height: 40px; width: auto; }
        #header h1 {
            font-size: 18pt;
            color: #2c3e50;
            margin: 10px 0 0 0;
        }
        #footer {
            position: running(footer);
            font-size: 8pt;
            color: #7f8c8d;
            text-align: center;
            padding-top: 5px;
        }
        .mind-map-container {
            text-align: center;
            padding: 10px 0;
        }
        .mind-map-container img {
            max-width: 100%;
            max-height: 450px;
            width: auto;
            height: auto;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        """

        full_html = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <title>{title}</title>
            <meta charset="UTF-8">
        </head>
        <body>
            <div id="header">
                {logo_html}
                <h1>{title}</h1>
            </div>

            <div id="footer">
                <p>{footer_text}</p>
            </div>

            <div class="mind-map-container">
                <img src="data:image/png;base64,{image_base64}" alt="Mapa Mental">
            </div>
        </body>
        </html>
        """

        return HTML(string=full_html, base_url=PROJECT_ROOT).write_pdf(
            stylesheets=[CSS(string=mind_map_css)]
        )

    except Exception as e:
        logger.error(f"Erro ao renderizar PDF do mapa mental: {e}")
        raise e


# ---------------------------------------------------------------------------
# Questionário (objetivo/subjetivo) — PDF dedicado, retrato fiel do modo
# "não-quiz" da tela (MaterialResultModal → renderQuestionnaire):
#   • cada questão num bloco com badges de dificuldade + tópico e alternativas;
#   • o GABARITO (resposta correta + justificativa) agrupado ao FIM, por tipo.
# Renderizador próprio com CSS isolado (como flashcards/mapa mental) — evita o
# corte de logo do header genérico do BASE_CSS (running element transbordava a
# caixa de margem por causa de um margin-bottom inútil + altura grande).
# ---------------------------------------------------------------------------

QUESTIONNAIRE_PDF_I18N = {
    'pt': {
        'objective': 'Questões Objetivas',
        'subjective': 'Questões Subjetivas',
        'answer_key_objective': 'Gabarito — Questões Objetivas',
        'answer_key_subjective': 'Gabarito — Questões Subjetivas',
        'correct_alternative': 'Alternativa Correta',
        'justification': 'Justificativa',
        'expected_answer': 'Resposta Esperada',
        'easy': 'Fácil', 'medium': 'Médio', 'hard': 'Difícil',
    },
    'en': {
        'objective': 'Objective Questions',
        'subjective': 'Subjective Questions',
        'answer_key_objective': 'Answer Key — Objective Questions',
        'answer_key_subjective': 'Answer Key — Subjective Questions',
        'correct_alternative': 'Correct Alternative',
        'justification': 'Justification',
        'expected_answer': 'Expected Answer',
        'easy': 'Easy', 'medium': 'Medium', 'hard': 'Hard',
    },
    'es': {
        'objective': 'Preguntas Objetivas',
        'subjective': 'Preguntas Subjetivas',
        'answer_key_objective': 'Gabarito — Preguntas Objetivas',
        'answer_key_subjective': 'Gabarito — Preguntas Subjetivas',
        'correct_alternative': 'Alternativa Correcta',
        'justification': 'Justificación',
        'expected_answer': 'Respuesta Esperada',
        'easy': 'Fácil', 'medium': 'Medio', 'hard': 'Difícil',
    },
}

# Espelha getCategoryLabel do MaterialResultModal (rótulos PT + humanização snake_case).
_QUESTIONNAIRE_CATEGORY_LABELS = {
    'fisiopatologia': 'Fisiopatologia', 'quadro_clinico': 'Quadro Clínico',
    'diagnostico': 'Diagnóstico', 'tratamento': 'Tratamento',
    'farmacologia': 'Farmacologia', 'epidemiologia': 'Epidemiologia',
    'prevencao': 'Prevenção', 'anatomia': 'Anatomia', 'fisiologia': 'Fisiologia',
    'semiologia': 'Semiologia', 'saude_coletiva': 'Saúde Coletiva',
    'politicas_de_saude': 'Políticas de Saúde', 'atencao_primaria': 'Atenção Primária',
    'gestao_em_saude': 'Gestão em Saúde', 'financiamento_saude': 'Financiamento',
    'vigilancia_em_saude': 'Vigilância em Saúde', 'promocao_da_saude': 'Promoção da Saúde',
    'etica_e_legislacao': 'Ética e Legislação',
}

# Dificuldade → (chave de rótulo i18n, classe CSS do badge). Espelha getDifficultyClass.
_QUESTIONNAIRE_DIFFICULTY = {
    'facil': ('easy', 'diff-easy'),
    'medio': ('medium', 'diff-medium'),
    'dificil': ('hard', 'diff-hard'),
}


def _questionnaire_category_label(topico: str) -> str:
    if not topico:
        return ''
    if topico in _QUESTIONNAIRE_CATEGORY_LABELS:
        return _QUESTIONNAIRE_CATEGORY_LABELS[topico]
    return str(topico).replace('_', ' ').title()


def _as_question_list(value):
    """Questões/alternativas podem vir como lista OU dict {idx: item} — espelha o front."""
    if isinstance(value, dict):
        return list(value.values())
    return value or []


def _md_inline(text) -> str:
    """Converte markdown curto (negrito/itálico/fórmulas) p/ HTML, sem o <p> externo.
    Conteúdo é gerado pela própria plataforma (confiável), igual ao exportador genérico.

    ⚠️ Sequências de sublinhado são LACUNAS de questão (`______`), não ênfase: são
    escapadas antes da conversão para chegarem inteiras ao PDF (o mesmo que o
    `InlineMarkdown` faz na web)."""
    import re as _re
    import markdown as _markdown
    if not text:
        return ''
    safe = _re.sub(r'_{2,}', lambda m: m.group(0).replace('_', r'\_'), str(text).strip())
    rendered = _markdown.markdown(safe)
    # Remove um único <p>...</p> externo p/ uso inline (justificativa/enunciado curtos).
    if rendered.startswith('<p>') and rendered.endswith('</p>') and rendered.count('<p>') == 1:
        rendered = rendered[3:-4]
    return rendered


def render_questionnaire_pdf(objective_questions=None, subjective_questions=None,
                             language: str = 'pt', title: str = None,
                             support_texts=None) -> bytes:
    """
    Renderiza um questionário (objetivo e/ou subjetivo) em PDF, fiel ao modo não-quiz.
    objective_questions: [{pergunta, alternativas[], resposta_correta, justificativa, dificuldade?, topico?, texto_base?}]
    subjective_questions: [{pergunta, resposta_esperada, dificuldade?, topico?}]
    support_texts: [{rotulo, conteudo, fonte?}] — textos-base compartilhados por grupos de questões
    """
    try:
        import html as _html

        objective_questions = _as_question_list(objective_questions)
        subjective_questions = _as_question_list(subjective_questions)
        support_by_label = {
            str(t.get('rotulo') or '').strip().lower(): t
            for t in _as_question_list(support_texts)
            if isinstance(t, dict) and str(t.get('conteudo') or '').strip()
        }
        tr = QUESTIONNAIRE_PDF_I18N.get(language, QUESTIONNAIRE_PDF_I18N['pt'])

        logo_url = get_logo_path()
        logo_html = f'<img src="{logo_url}">' if logo_url else 'Qython'
        footer_text = get_footer_text(language)

        support_css = """
        .support { border: 1px solid #d8d8e0; border-left: 3px solid #7c3aed;
                   border-radius: 6px; padding: 10px 14px; margin: 0 0 12px; background: #fafafd; }
        .support-label { font-size: 9pt; font-weight: 700; letter-spacing: .04em;
                         text-transform: uppercase; color: #7c3aed; margin-bottom: 6px; }
        .support-body { font-size: 10.5pt; line-height: 1.55; }
        .support-source { font-size: 8.5pt; font-style: italic; color: #666; margin-top: 6px; }
        """

        def _badges(q):
            parts = []
            dif = q.get('dificuldade')
            if dif:
                label_key, css = _QUESTIONNAIRE_DIFFICULTY.get(dif, ('medium', 'diff-medium'))
                label = tr.get(label_key, dif)
                parts.append(f'<span class="badge {css}">{_html.escape(str(label))}</span>')
            topico = q.get('topico')
            if topico:
                parts.append(f'<span class="badge topic">{_html.escape(_questionnaire_category_label(topico))}</span>')
            return f'<div class="q-meta">{"".join(parts)}</div>' if parts else ''

        def _question_block(q, idx, with_alternatives):
            alts_html = ''
            if with_alternatives:
                items = ''.join(
                    f'<div class="alt"><span class="alt-letter">{chr(97 + j)})</span> {_md_inline(alt)}</div>'
                    for j, alt in enumerate(_as_question_list(q.get('alternativas')))
                )
                alts_html = f'<div class="alts">{items}</div>'
            return (
                f'<div class="q-block">{_badges(q)}'
                f'<div class="q-text"><span class="q-num">{idx + 1}.</span> {_md_inline(q.get("pergunta"))}</div>'
                f'{alts_html}</div>'
            )

        def _support_html(texto):
            fonte = (texto.get('fonte') or '').strip()
            return (
                f'<div class="support"><div class="support-label">'
                f'{_html.escape(str(texto.get("rotulo") or ""))}</div>'
                f'<div class="support-body">{_md_inline(texto.get("conteudo"))}</div>'
                + (f'<div class="support-source">{_html.escape(fonte)}</div>' if fonte else '')
                + '</div>'
            )

        def _blocks_html(questions, with_alternatives):
            # Agrupa por 'bloco' (provas de concurso geradas por blueprint) com um cabeçalho de
            # seção quando o bloco muda. Sem 'bloco' em nenhuma questão → lista flat (como antes).
            # O texto-base ("Texto I") é impresso UMA vez, antes da 1ª questão do grupo — como
            # na prova de papel, e ao contrário do quiz, onde ele se repete a cada questão.
            has_blocks = any(isinstance(q, dict) and q.get('bloco') for q in questions)
            out, current, current_support = [], None, None
            for i, q in enumerate(questions):
                if has_blocks:
                    blk = (q.get('bloco') if isinstance(q, dict) else '') or ''
                    if blk != current:
                        current = blk
                        current_support = None  # novo bloco: reimprime o texto se houver
                        if blk:
                            out.append(f'<h3 class="block-title">{_html.escape(str(blk))}</h3>')
                ref = (q.get('texto_base') if isinstance(q, dict) else '') or ''
                if ref and ref != current_support:
                    texto = support_by_label.get(str(ref).strip().lower())
                    if texto:
                        out.append(_support_html(texto))
                        current_support = ref
                elif not ref:
                    current_support = None
                out.append(_question_block(q, i, with_alternatives))
            return ''.join(out)

        sections = []

        if objective_questions:
            blocks = _blocks_html(objective_questions, True)
            answers = ''.join(
                f'<div class="a-block">'
                f'<div class="a-correct">{i + 1}. {tr["correct_alternative"]}: '
                f'<strong>{_html.escape(str(q.get("resposta_correta", "")).upper())}</strong></div>'
                f'<div class="a-just"><strong>{tr["justification"]}:</strong> {_md_inline(q.get("justificativa"))}</div>'
                f'</div>'
                for i, q in enumerate(objective_questions)
            )
            sections.append(
                f'<h2 class="section-title">{tr["objective"]}</h2>{blocks}'
                f'<div class="key-divider"></div>'
                f'<h2 class="section-title key-title">{tr["answer_key_objective"]}</h2>{answers}'
            )

        if subjective_questions:
            blocks = _blocks_html(subjective_questions, False)
            answers = ''.join(
                f'<div class="a-block">'
                f'<div class="a-correct">{i + 1}. {tr["expected_answer"]}</div>'
                f'<div class="a-just">{_md_inline(q.get("resposta_esperada"))}</div>'
                f'</div>'
                for i, q in enumerate(subjective_questions)
            )
            sections.append(
                f'<h2 class="section-title">{tr["subjective"]}</h2>{blocks}'
                f'<div class="key-divider"></div>'
                f'<h2 class="section-title key-title">{tr["answer_key_subjective"]}</h2>{answers}'
            )

        title_html = f'<div class="doc-title">{_html.escape(title)}</div>' if title else ''

        questionnaire_css = """
        @page {
            size: A4;
            margin: 2cm;
            margin-top: 1.7cm;
            @top-left { content: element(header); }
            @bottom-center { content: element(footer); }
        }
        body {
            font-family: 'Helvetica', 'Arial', sans-serif;
            line-height: 1.5;
            color: #2d3436;
            font-size: 11pt;
        }
        /* Header running — altura folgada dentro da caixa de margem (sem corte de logo) */
        #header { position: running(header); padding-top: 2px; }
        #header img { height: 36px; width: auto; }
        #footer {
            position: running(footer);
            font-size: 8pt;
            color: #95a5a6;
            text-align: center;
        }
        #footer .page-number::after { content: counter(page); }

        .doc-title { font-size: 15pt; font-weight: 700; color: #2c3e50; margin-bottom: 18px; }

        .section-title {
            font-size: 13pt;
            color: #2c3e50;
            text-transform: uppercase;
            letter-spacing: 1px;
            font-weight: 700;
            margin: 0 0 18px 0;
            padding-bottom: 8px;
            border-bottom: 2px solid #03dac6;
            page-break-after: avoid;
        }
        .section-title.key-title { margin-top: 4px; }
        .block-title {
            font-size: 11pt;
            color: #018786;
            font-weight: 700;
            margin: 22px 0 12px 0;
            padding: 6px 10px;
            background: #f0fbfa;
            border-left: 4px solid #03dac6;
            border-radius: 4px;
            page-break-after: avoid;
        }
        .key-divider { margin: 30px 0 22px 0; border-top: 1px dashed #d8dde0; }

        .q-block { margin-bottom: 18px; page-break-inside: avoid; }
        .q-meta { margin-bottom: 7px; }
        .badge {
            display: inline-block;
            padding: 2px 10px;
            border-radius: 12px;
            font-size: 7.5pt;
            font-weight: 600;
            margin-right: 6px;
            border: 1px solid transparent;
        }
        .badge.diff-easy   { background: #eafaf1; color: #1e8e54; border-color: #22c55e; }
        .badge.diff-medium { background: #fef6e7; color: #b9770e; border-color: #f59e0b; }
        .badge.diff-hard   { background: #fdecec; color: #c0392b; border-color: #ef4444; }
        .badge.topic       { background: #e6faf8; color: #018786; border-color: #03dac6; }

        .q-text { margin-bottom: 8px; }
        .q-num { font-weight: 700; color: #2c3e50; margin-right: 2px; }

        .alts { padding-left: 14px; }
        .alt { margin-bottom: 4px; line-height: 1.45; }
        .alt-letter { font-weight: 600; color: #34495e; margin-right: 2px; }

        .a-block {
            margin-bottom: 14px;
            padding: 6px 0 6px 14px;
            border-left: 3px solid #03dac6;
            page-break-inside: avoid;
        }
        .a-correct { font-weight: 700; color: #2c3e50; margin-bottom: 3px; }
        .a-just { color: #4a4a4a; font-size: 10.5pt; line-height: 1.5; }
        .a-just strong { color: #2c3e50; }
        .a-just p { margin: 0 0 0.4em 0; }
        .a-just p:last-child { margin-bottom: 0; }
        """

        full_html = f"""<!DOCTYPE html>
        <html>
        <head><meta charset="UTF-8"><title>Questionário Qython</title></head>
        <body>
            <div id="header"><div>{logo_html}</div></div>
            <div id="footer"><p>{footer_text} | Página <span class="page-number"></span></p></div>
            {title_html}
            {''.join(sections)}
        </body>
        </html>"""

        return HTML(string=full_html, base_url=PROJECT_ROOT).write_pdf(
            stylesheets=[CSS(string=questionnaire_css + support_css)]
        )

    except Exception as e:
        logger.error(f"Erro ao renderizar PDF do questionário: {e}")
        raise e

