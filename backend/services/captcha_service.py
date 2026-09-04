import logging
import os
import requests

# Configurar logging
logger = logging.getLogger(__name__)

# Função para verificar CAPTCHA Cloudflare
def verify_captcha(token):
    secret_key = os.getenv('CLOUDFLARE_SECRET_KEY')
    site_key = os.getenv('CLOUDFLARE_SITE_KEY') # Site key não é usada na verificação, mas pode ser útil ter aqui
    url = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'
    data = {
        'secret': secret_key,
        'response': token
    }
    response = requests.post(url, data=data)
    result = response.json()
    return result.get('success', False)

logger.info("Serviço de CAPTCHA inicializado")
