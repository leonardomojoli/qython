# qython/backend/services/achievement_definitions.py
ACHIEVEMENTS = {
    # Onboarding (verificação completa)
    "ONBOARD_1": {
        "title": "Bem-Vindo", 
        "description": "Completou o cadastro e verificação.", 
        "icon": "onboard.png", 
        "category": "onboarding",
        "tier": "bronze"
    },
    
    # Consultas - Bronze (10), Prata (50), Ouro (100), Diamante (500)
    "CONSULT_10": {
        "title": "Dez Consultas", 
        "description": "Criou 10 consultas.", 
        "icon": "consult_10.png", 
        "category": "consultas",
        "tier": "bronze"
    },
    "CONSULT_50": {
        "title": "Cinquenta Consultas", 
        "description": "Criou 50 consultas.", 
        "icon": "consult_50.png", 
        "category": "consultas",
        "tier": "silver"
    },
    "CONSULT_100": {
        "title": "Cem Consultas", 
        "description": "Criou 100 consultas.", 
        "icon": "consult_100.png", 
        "category": "consultas",
        "tier": "gold"
    },
    "CONSULT_500": {
        "title": "Quinhentas Consultas", 
        "description": "Criou 500 consultas.", 
        "icon": "consult_500.png", 
        "category": "consultas",
        "tier": "diamond"
    },
    
    # Arena (Simulados) - Bronze (10), Prata (50), Ouro (100), Diamante (1000)
    "QUIZ_10": {
        "title": "Dez Simulados", 
        "description": "Completou 10 simulados.", 
        "icon": "quiz_10.png", 
        "category": "arena",
        "tier": "bronze"
    },
    "QUIZ_50": {
        "title": "Cinquenta Simulados", 
        "description": "Completou 50 simulados.", 
        "icon": "quiz_50.png", 
        "category": "arena",
        "tier": "silver"
    },
    "QUIZ_100": {
        "title": "Cem Simulados", 
        "description": "Completou 100 simulados.", 
        "icon": "quiz_100.png", 
        "category": "arena",
        "tier": "gold"
    },
    "QUIZ_1000": {
        "title": "Mil Simulados", 
        "description": "Completou 1.000 simulados.", 
        "icon": "quiz_1000.png", 
        "category": "arena",
        "tier": "diamond"
    },

    # Arena (Pontuação) - Bronze (1000), Prata (2500), Ouro (5000), Diamante (20000)
    "SCORE_1000": {
        "title": "1.000 Pontos", 
        "description": "Alcançou 1.000 pontos na Arena.", 
        "icon": "score_1000.png", 
        "category": "arena",
        "tier": "bronze"
    },
    "SCORE_2500": {
        "title": "2.500 Pontos", 
        "description": "Alcançou 2.500 pontos na Arena.", 
        "icon": "score_2500.png", 
        "category": "arena",
        "tier": "silver"
    },
    "SCORE_5000": {
        "title": "5.000 Pontos", 
        "description": "Alcançou 5.000 pontos na Arena.", 
        "icon": "score_5000.png", 
        "category": "arena",
        "tier": "gold"
    },
    "SCORE_20000": {
        "title": "20.000 Pontos", 
        "description": "Alcançou 20.000 pontos na Arena.", 
        "icon": "score_20000.png", 
        "category": "arena",
        "tier": "diamond"
    },

    # Pesquisa (Copilot) - Bronze (25), Prata (100), Ouro (250), Diamante (5000)
    "CHAT_25": {
        "title": "25 Pesquisas", 
        "description": "Realizou 25 conversas no Copilot.", 
        "icon": "chat_25.png", 
        "category": "pesquisa",
        "tier": "bronze"
    },
    "CHAT_100": {
        "title": "100 Pesquisas", 
        "description": "Realizou 100 conversas no Copilot.", 
        "icon": "chat_100.png", 
        "category": "pesquisa",
        "tier": "silver"
    },
    "CHAT_250": {
        "title": "250 Pesquisas", 
        "description": "Realizou 250 conversas no Copilot.", 
        "icon": "chat_250.png", 
        "category": "pesquisa",
        "tier": "gold"
    },
    "CHAT_5000": {
        "title": "5.000 Pesquisas", 
        "description": "Realizou 5.000 conversas no Copilot.", 
        "icon": "chat_5000.png", 
        "category": "pesquisa",
        "tier": "diamond"
    },
}
