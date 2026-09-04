# Exemplo de test_medical_image_analyst_service.py
import sys
import os
import logging
import json

# Adiciona o diretório raiz do projeto ao sys.path para encontrar o pacote qython
project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
sys.path.insert(0, project_root)

from qython.backend.services.medical_image_analyst_service import analyze_medical_image
# Importar Config para que as variáveis de ambiente sejam carregadas e llm_services inicialize a Vertex AI

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

try:
    from qython.backend.config import Config
    from qython.backend.services.llm_services import initialize_vertex_ai
    initialize_vertex_ai() # Garante a inicialização da Vertex AI
    logger.info("Vertex AI inicializada para o teste.")
except ImportError as e:
    print(f"Erro de importação no script de teste: {e}. Verifique o PYTHONPATH e a estrutura do projeto.")
    exit(1)
except Exception as e_init:
    print(f"Erro ao inicializar Vertex AI no script de teste: {e_init}")
    exit(1)


if __name__ == "__main__":
    # Configurar manualmente as variáveis de ambiente se elas não estiverem no contexto de execução
    # os.environ['GOOGLE_APPLICATION_CREDENTIALS'] = 'caminho/para/seu/qython-systems-xxxx.json'
    # os.environ['GOOGLE_CLOUD_PROJECT'] = Config.GOOGLE_CLOUD_PROJECT # Assume que Config já carregou
    # os.environ['GOOGLE_CLOUD_LOCATION'] = Config.GOOGLE_CLOUD_LOCATION
    # os.environ['MEDICAL_IMAGE_ANALYST_MODEL'] = Config.MEDICAL_IMAGE_ANALYST_MODEL

    if not Config.GOOGLE_CLOUD_PROJECT or not Config.GOOGLE_CLOUD_LOCATION or not Config.MEDICAL_IMAGE_ANALYST_MODEL:
        logger.error("Variáveis de ambiente GOOGLE_CLOUD_PROJECT, GOOGLE_CLOUD_LOCATION ou MEDICAL_IMAGE_ANALYST_MODEL não estão configuradas.")
        exit(1)

    image_path = "caminho/para/sua/imagem_medica_de_teste.png"  # << SUBSTITUA PELO CAMINHO REAL
    if not os.path.exists(image_path):
        logger.error(f"Arquivo de imagem de teste não encontrado em: {image_path}")
        logger.error("Por favor, substitua 'caminho/para/sua/imagem_medica_de_teste.png' por um caminho válido.")
        exit(1)
        
    mime = "image/png"
    if image_path.lower().endswith((".jpg", ".jpeg")):
        mime = "image/jpeg"
    
    custom_prompt_pt = "Analise esta imagem em busca de fraturas ósseas e descreva os achados em português."
    custom_prompt_en = "Analyze this image for bone fractures and describe the findings in English."

    try:
        with open(image_path, "rb") as f:
            image_bytes = f.read()
        
        logger.info(f"Enviando imagem '{image_path}' para análise (modelo: {Config.MEDICAL_IMAGE_ANALYST_MODEL})...")
        
        # Teste 1: Prompt padrão (português)
        analysis_result_pt_default = analyze_medical_image(image_bytes, mime_type=mime)
        print("\n--- Resultado da Análise (Prompt Padrão PT-BR) ---")
        print(json.dumps(analysis_result_pt_default, indent=2, ensure_ascii=False))
        if "analysis" in analysis_result_pt_default:
            print(f"\nAnálise (PT-BR Default):\n{analysis_result_pt_default['analysis'][:500]}...")

        # Teste 2: Prompt customizado em inglês
        # analysis_result_en_custom = analyze_medical_image(image_bytes, mime_type=mime, prompt_text=custom_prompt_en, language_code='en')
        # print("\n--- Resultado da Análise (Prompt Customizado EN) ---")
        # print(json.dumps(analysis_result_en_custom, indent=2, ensure_ascii=False))
        # if "analysis" in analysis_result_en_custom:
        #     print(f"\nAnálise (EN Custom):\n{analysis_result_en_custom['analysis'][:500]}...")

    except FileNotFoundError: # Já tratado acima, mas para segurança
        logger.error(f"Erro: Arquivo de imagem não encontrado em '{image_path}'")
    except Exception as e:
        logger.error(f"Erro durante o teste: {e}", exc_info=True)
