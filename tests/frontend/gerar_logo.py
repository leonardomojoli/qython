# gerar_logo.py (VERSÃO FINAL COM ALINHAMENTO CORRIGIDO)

from PIL import Image, ImageDraw, ImageFont
import os

# --- Configurações ---
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

# Caminhos baseados na localização do script
LOGO_PATH = os.path.join(SCRIPT_DIR, 'qython-isotipo.png')
FONT_PATH = os.path.join(SCRIPT_DIR, 'Inter-Medium.ttf') 
OUTPUT_FILENAME = os.path.join(SCRIPT_DIR, 'qython_logo_imagotipo.png')

FONT_SIZE = 60
LOGO_HEIGHT = 120  # Increased for better proportion with text
SPACING = -20  # Negative spacing - close like original but Q tail doesn't touch Y

# Cores do gradiente (y menos saturado, n mais saturado)
GRADIENT_START = (96, 235, 224)    # #60ebe0 - teal claro/menos saturado (y)
GRADIENT_END = (0, 176, 160)       # #00b0a0 - teal escuro/mais saturado (n)

# --- Início do Script ---

try:
    font = ImageFont.truetype(FONT_PATH, FONT_SIZE)
except IOError:
    print(f"Erro: A fonte '{FONT_PATH}' não foi encontrada.")
    print("Por favor, certifique-se de que o arquivo de fonte está no mesmo diretório que este script.")
    exit()

try:
    logo_img = Image.open(LOGO_PATH)
except FileNotFoundError:
    print(f"Erro: O arquivo de logo '{LOGO_PATH}' não foi encontrado.")
    print("Por favor, certifique-se de que o arquivo 'qython-logo.png' está no mesmo diretório que este script.")
    exit()

# Redimensionar o logo
aspect_ratio = logo_img.width / logo_img.height
logo_width = int(LOGO_HEIGHT * aspect_ratio)
logo_img = logo_img.resize((logo_width, LOGO_HEIGHT), Image.Resampling.LANCZOS)

# Determinar o tamanho exato do texto
temp_draw = ImageDraw.Draw(Image.new('RGB', (1, 1)))
left, top, right, bottom = temp_draw.textbbox((0, 0), "ython", font=font)
text_width = right - left
text_height = bottom - top

# Calcular as dimensões do canvas final
canvas_width = logo_width + SPACING + text_width
canvas_height = LOGO_HEIGHT
canvas = Image.new('RGBA', (canvas_width, canvas_height), (0, 0, 0, 0))

# Colar o logo no canvas (já centralizado verticalmente)
logo_y_pos = (canvas_height - LOGO_HEIGHT) // 2
canvas.paste(logo_img, (0, logo_y_pos), logo_img)

# --- Geração do Texto com Gradiente ---

# Criar a máscara do texto
text_mask = Image.new('L', (text_width, text_height), 0)
mask_draw = ImageDraw.Draw(text_mask)
mask_draw.text((-left, -top), "ython", font=font, fill=255)

# Criar a imagem do gradiente
gradient_img = Image.new('RGBA', (text_width, text_height))
gradient_draw = ImageDraw.Draw(gradient_img)

for x in range(text_width):
    ratio = x / (text_width - 1)
    r = int(GRADIENT_START[0] * (1 - ratio) + GRADIENT_END[0] * ratio)
    g = int(GRADIENT_START[1] * (1 - ratio) + GRADIENT_END[1] * ratio)
    b = int(GRADIENT_START[2] * (1 - ratio) + GRADIENT_END[2] * ratio)
    gradient_draw.line([(x, 0), (x, text_height)], fill=(r, g, b))

# --- Colar o Texto no Canvas (com a correção de alinhamento) ---

text_x_pos = logo_width + SPACING

# AJUSTE PRINCIPAL AQUI:
# Esta nova fórmula centraliza o bloco de texto (gradient_img) na vertical
# em relação à altura do canvas, garantindo o alinhamento com o logo.
text_y_pos = (canvas_height - text_height) // 2 + 3  # +3px lower to match original alignment

# Colar o gradiente no canvas usando a máscara de texto
canvas.paste(gradient_img, (text_x_pos, text_y_pos), text_mask)

# Salvar a imagem final
canvas.save(OUTPUT_FILENAME)

print(f"Logomarca completa e alinhada salva com sucesso como '{OUTPUT_FILENAME}'!")