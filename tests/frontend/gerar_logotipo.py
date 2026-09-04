# gerar_logotipo.py - Gera apenas o texto "ython" com gradiente

from PIL import Image, ImageDraw, ImageFont
import os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
FONT_PATH = os.path.join(SCRIPT_DIR, 'Inter-Medium.ttf')
OUTPUT_FILENAME = os.path.join(SCRIPT_DIR, 'qython-logotipo.png')

FONT_SIZE = 60

# Cores do gradiente (u menos saturado, n mais saturado)
GRADIENT_START = (96, 235, 224)    # #60ebe0 - teal claro (u)
GRADIENT_END = (0, 176, 160)       # #00b0a0 - teal escuro (n)

try:
    font = ImageFont.truetype(FONT_PATH, FONT_SIZE)
except IOError:
    print(f"Erro: A fonte '{FONT_PATH}' não foi encontrada.")
    exit()

# Determinar o tamanho exato do texto
temp_draw = ImageDraw.Draw(Image.new('RGB', (1, 1)))
left, top, right, bottom = temp_draw.textbbox((0, 0), "ython", font=font)
text_width = right - left
text_height = bottom - top

# Criar canvas
canvas = Image.new('RGBA', (text_width, text_height), (0, 0, 0, 0))

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

# Colar o gradiente no canvas usando a máscara de texto
canvas.paste(gradient_img, (0, 0), text_mask)

# Salvar a imagem final
canvas.save(OUTPUT_FILENAME)

print(f"Logotipo 'ython' salvo com sucesso como '{OUTPUT_FILENAME}'!")
