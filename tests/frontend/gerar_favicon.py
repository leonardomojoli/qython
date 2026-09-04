# gerar_favicon.py - Gera favicons otimizados do isotipo Qython
# O favicon precisa ter o Q preenchendo bem o espaço, sem muito padding

from PIL import Image
import os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ISOTIPO_PATH = os.path.join(SCRIPT_DIR, 'qython-isotipo.png')

# Tamanhos de favicon padrão
FAVICON_SIZES = [16, 32, 48, 64, 128, 180, 192, 512]

def create_favicon(source_path, output_dir):
    """Cria favicons otimizados cortando o padding excessivo do isotipo."""

    try:
        img = Image.open(source_path)
    except FileNotFoundError:
        print(f"Erro: Arquivo '{source_path}' não encontrado.")
        return

    # Converter para RGBA se necessário
    if img.mode != 'RGBA':
        img = img.convert('RGBA')

    # Encontrar o bounding box do conteúdo não transparente
    bbox = img.getbbox()
    if bbox:
        # Adicionar pequena margem (5% de cada lado)
        left, upper, right, lower = bbox
        width = right - left
        height = lower - upper
        margin = int(max(width, height) * 0.02)  # 2% de margem - Q bem grande

        # Expandir bbox com margem
        left = max(0, left - margin)
        upper = max(0, upper - margin)
        right = min(img.width, right + margin)
        lower = min(img.height, lower + margin)

        # Cropar a imagem
        cropped = img.crop((left, upper, right, lower))

        # Tornar quadrado (centralizado)
        size = max(cropped.width, cropped.height)
        square = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        x_offset = (size - cropped.width) // 2
        y_offset = (size - cropped.height) // 2
        square.paste(cropped, (x_offset, y_offset), cropped)
    else:
        square = img

    # Gerar cada tamanho
    for size in FAVICON_SIZES:
        resized = square.resize((size, size), Image.Resampling.LANCZOS)
        output_path = os.path.join(output_dir, f'favicon-{size}x{size}.png')
        resized.save(output_path, 'PNG')
        print(f"Criado: {output_path}")

    # Criar o favicon principal (32x32 para uso geral)
    main_favicon = square.resize((32, 32), Image.Resampling.LANCZOS)
    main_path = os.path.join(output_dir, 'favicon.png')
    main_favicon.save(main_path, 'PNG')
    print(f"Criado favicon principal: {main_path}")

    # Criar versão para apple-touch-icon (180x180)
    apple_icon = square.resize((180, 180), Image.Resampling.LANCZOS)
    apple_path = os.path.join(output_dir, 'apple-touch-icon.png')
    apple_icon.save(apple_path, 'PNG')
    print(f"Criado apple-touch-icon: {apple_path}")

    return square

if __name__ == '__main__':
    output_dir = SCRIPT_DIR
    optimized = create_favicon(ISOTIPO_PATH, output_dir)

    if optimized:
        # Também salvar versão otimizada do isotipo
        optimized_path = os.path.join(output_dir, 'qython-isotipo-optimized.png')
        optimized.save(optimized_path, 'PNG')
        print(f"\nIsotipo otimizado salvo: {optimized_path}")
        print("\nPara usar como favicon, copie favicon.png para:")
        print("  frontend/public/assets/images/branding/")
