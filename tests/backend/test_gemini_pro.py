import os
import sys
import google.generativeai as genai
from dotenv import load_dotenv

# Carrega variáveis de ambiente do arquivo .env na raiz do projeto (se existir)
load_dotenv()

# --- Configurações ---
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
# Tenta usar o modelo definido em GEMINI_MODEL_NAME, senão usa o Pro/Experimental diretamente
MODEL_NAME_TO_TEST = "gemini-2.5-pro-exp-03-25"
# MODEL_NAME_TO_TEST = "gemini-2.5-pro-exp-03-25" # Ou force o teste com este modelo

PROMPT_SIMPLE = "Olá"
PROMPT_ANAFILAXIA = "Qual é o tratamento da anafilaxia?"

safety_settings_off = [
    {"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_NONE"},
    {"category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_NONE"},
    {"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_NONE"},
    {"category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_NONE"},
]

generation_config = genai.GenerationConfig(temperature=0.5, max_output_tokens=1000)
# --- Fim das Configurações ---

def run_test(prompt_text):
    """Executa um teste com o prompt fornecido."""
    print(f"\n--- Testando com Modelo: {MODEL_NAME_TO_TEST} ---")
    print(f"Prompt: '{prompt_text}'")
    print(f"Safety Settings: BLOCK_NONE")

    if not GEMINI_API_KEY:
        print("ERRO: GEMINI_API_KEY não encontrada nas variáveis de ambiente.")
        return

    try:
        genai.configure(api_key=GEMINI_API_KEY)
        model = genai.GenerativeModel(MODEL_NAME_TO_TEST, generation_config=generation_config)
        response = model.generate_content(prompt_text, safety_settings=safety_settings_off)

        print("\n--- Resposta Completa da API ---")
        print(response)
        print("------------------------------")

        if response and response.candidates:
            print("\n--- Texto Gerado ---")
            print(response.text.strip())
            print("--------------------")
        elif response and hasattr(response, 'prompt_feedback'):
            print("\n--- BLOQUEIO DETECTADO ---")
            print(f"Feedback do Prompt: {response.prompt_feedback}")
            print("------------------------")
        else:
            print("\n--- RESPOSTA INESPERADA OU VAZIA ---")
            print("Não foi possível obter texto ou feedback.")
            print("------------------------------------")

    except Exception as e:
        print(f"\n--- ERRO DURANTE A EXECUÇÃO ---")
        print(f"Erro: {str(e)}")
        import traceback
        traceback.print_exc()
        print("-------------------------------")

if __name__ == "__main__":
    print("Iniciando teste isolado da API Gemini...")
    run_test(PROMPT_SIMPLE)
    run_test(PROMPT_ANAFILAXIA)
    print("\nTeste concluído.")
