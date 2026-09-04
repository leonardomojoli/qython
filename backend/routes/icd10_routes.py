# backend/routes/icd10_routes.py
"""
CID-10 / ICD-10 search endpoint for auto-complete functionality.
Uses a curated subset of most common codes for medical consultations.
"""
from fastapi import APIRouter, Query
from typing import List, Optional
import json
import os
from pathlib import Path

router = APIRouter(tags=["ICD-10"])

# Load ICD-10 data on startup
ICD10_DATA = []

def load_icd10_data():
    """Load ICD-10 data from JSON file"""
    global ICD10_DATA
    data_path = Path(__file__).parent.parent / "data" / "icd10_common.json"
    if data_path.exists():
        with open(data_path, 'r', encoding='utf-8') as f:
            ICD10_DATA = json.load(f)
    else:
        # Fallback to inline common codes if file doesn't exist
        ICD10_DATA = get_common_codes()

def get_common_codes() -> List[dict]:
    """Return most common ICD-10 codes used in ambulatory care"""
    return [
        # Cardiovascular
        {"code": "I10", "description": "Hipertensão essencial (primária)", "specialty": "Cardiologia"},
        {"code": "I11.9", "description": "Doença cardíaca hipertensiva, sem insuficiência cardíaca", "specialty": "Cardiologia"},
        {"code": "I20.9", "description": "Angina pectoris, não especificada", "specialty": "Cardiologia"},
        {"code": "I21.9", "description": "Infarto agudo do miocárdio, não especificado", "specialty": "Cardiologia"},
        {"code": "I25.9", "description": "Doença isquêmica crônica do coração", "specialty": "Cardiologia"},
        {"code": "I48", "description": "Fibrilação e flutter atrial", "specialty": "Cardiologia"},
        {"code": "I50.9", "description": "Insuficiência cardíaca, não especificada", "specialty": "Cardiologia"},
        
        # Endocrine
        {"code": "E11.9", "description": "Diabetes mellitus tipo 2, sem complicações", "specialty": "Endocrinologia"},
        {"code": "E10.9", "description": "Diabetes mellitus tipo 1, sem complicações", "specialty": "Endocrinologia"},
        {"code": "E03.9", "description": "Hipotireoidismo, não especificado", "specialty": "Endocrinologia"},
        {"code": "E05.9", "description": "Tireotoxicose, não especificada", "specialty": "Endocrinologia"},
        {"code": "E66.9", "description": "Obesidade, não especificada", "specialty": "Endocrinologia"},
        {"code": "E78.0", "description": "Hipercolesterolemia pura", "specialty": "Endocrinologia"},
        
        # Respiratory
        {"code": "J06.9", "description": "Infecção aguda das vias aéreas superiores", "specialty": "Pneumologia"},
        {"code": "J18.9", "description": "Pneumonia, não especificada", "specialty": "Pneumologia"},
        {"code": "J44.9", "description": "Doença pulmonar obstrutiva crônica (DPOC)", "specialty": "Pneumologia"},
        {"code": "J45.9", "description": "Asma, não especificada", "specialty": "Pneumologia"},
        
        # Gastroenterology
        {"code": "K21.0", "description": "Doença de refluxo gastroesofágico com esofagite", "specialty": "Gastroenterologia"},
        {"code": "K29.7", "description": "Gastrite, não especificada", "specialty": "Gastroenterologia"},
        {"code": "K80.2", "description": "Colelitíase sem colecistite", "specialty": "Gastroenterologia"},
        {"code": "K58.9", "description": "Síndrome do intestino irritável", "specialty": "Gastroenterologia"},
        
        # Neurology
        {"code": "G43.9", "description": "Migrânea (enxaqueca), não especificada", "specialty": "Neurologia"},
        {"code": "G40.9", "description": "Epilepsia, não especificada", "specialty": "Neurologia"},
        {"code": "G20", "description": "Doença de Parkinson", "specialty": "Neurologia"},
        {"code": "I64", "description": "Acidente vascular cerebral (AVC)", "specialty": "Neurologia"},
        {"code": "G35", "description": "Esclerose múltipla", "specialty": "Neurologia"},
        
        # Psychiatry
        {"code": "F32.9", "description": "Episódio depressivo, não especificado", "specialty": "Psiquiatria"},
        {"code": "F41.1", "description": "Transtorno de ansiedade generalizada", "specialty": "Psiquiatria"},
        {"code": "F41.0", "description": "Transtorno de pânico", "specialty": "Psiquiatria"},
        {"code": "F31.9", "description": "Transtorno afetivo bipolar", "specialty": "Psiquiatria"},
        {"code": "F20.9", "description": "Esquizofrenia, não especificada", "specialty": "Psiquiatria"},
        
        # Nephrology
        {"code": "N18.9", "description": "Doença renal crônica, não especificada", "specialty": "Nefrologia"},
        {"code": "N39.0", "description": "Infecção do trato urinário", "specialty": "Nefrologia"},
        {"code": "N17.9", "description": "Insuficiência renal aguda", "specialty": "Nefrologia"},
        
        # Rheumatology
        {"code": "M06.9", "description": "Artrite reumatoide, não especificada", "specialty": "Reumatologia"},
        {"code": "M32.9", "description": "Lúpus eritematoso sistêmico", "specialty": "Reumatologia"},
        {"code": "M79.3", "description": "Fibromialgia", "specialty": "Reumatologia"},
        {"code": "M15.9", "description": "Poliartrose, não especificada", "specialty": "Reumatologia"},
        
        # Urology
        {"code": "N40", "description": "Hiperplasia prostática benigna", "specialty": "Urologia"},
        {"code": "N20.0", "description": "Cálculo do rim (nefrolitíase)", "specialty": "Urologia"},
        {"code": "N30.9", "description": "Cistite, não especificada", "specialty": "Urologia"},
        
        # Dermatology
        {"code": "L20.9", "description": "Dermatite atópica", "specialty": "Dermatologia"},
        {"code": "L40.9", "description": "Psoríase, não especificada", "specialty": "Dermatologia"},
        {"code": "L30.9", "description": "Dermatite, não especificada", "specialty": "Dermatologia"},
        
        # Gynecology
        {"code": "N92.0", "description": "Menstruação excessiva e frequente", "specialty": "Ginecologia"},
        {"code": "N80.9", "description": "Endometriose, não especificada", "specialty": "Ginecologia"},
        {"code": "D25.9", "description": "Leiomioma uterino (mioma)", "specialty": "Ginecologia"},
        
        # Pediatrics
        {"code": "J00", "description": "Nasofaringite aguda (resfriado comum)", "specialty": "Pediatria"},
        {"code": "J20.9", "description": "Bronquite aguda, não especificada", "specialty": "Pediatria"},
        {"code": "A09", "description": "Diarreia e gastroenterite infecciosa", "specialty": "Pediatria"},
        
        # General / Common
        {"code": "R10.4", "description": "Outras dores abdominais e as não especificadas", "specialty": ""},
        {"code": "R51", "description": "Cefaleia", "specialty": ""},
        {"code": "R05", "description": "Tosse", "specialty": ""},
        {"code": "R50.9", "description": "Febre, não especificada", "specialty": ""},
        {"code": "M54.5", "description": "Dor lombar baixa (lombalgia)", "specialty": ""},
        {"code": "R53", "description": "Mal-estar e fadiga", "specialty": ""},
    ]

# Load data on module import
load_icd10_data()


@router.get("/search")
async def search_icd10(
    q: str = Query(..., min_length=2, description="Search query (code or description)"),
    specialty: Optional[str] = Query(None, description="Filter by specialty"),
    limit: int = Query(10, ge=1, le=50, description="Maximum results to return")
) -> List[dict]:
    """
    Search ICD-10 codes by code or description.
    Returns matching codes sorted by relevance.
    """
    query = q.lower().strip()
    results = []
    
    for item in ICD10_DATA:
        code_lower = item["code"].lower()
        desc_lower = item["description"].lower()
        
        # Score-based matching for relevance sorting
        score = 0
        
        # Exact code match (highest priority)
        if code_lower == query:
            score = 100
        # Code starts with query
        elif code_lower.startswith(query):
            score = 80
        # Code contains query
        elif query in code_lower:
            score = 60
        # Description contains query
        elif query in desc_lower:
            score = 40
        # Word match in description
        elif any(word.startswith(query) for word in desc_lower.split()):
            score = 30
        
        if score > 0:
            # Boost if specialty matches
            if specialty and item.get("specialty", "").lower() == specialty.lower():
                score += 15
            
            results.append({**item, "_score": score})
    
    # Sort by score (descending) and limit results
    results.sort(key=lambda x: x["_score"], reverse=True)
    
    # Remove internal score before returning
    return [{k: v for k, v in r.items() if k != "_score"} for r in results[:limit]]


@router.get("/popular")
async def get_popular_codes(
    specialty: Optional[str] = Query(None, description="Filter by specialty"),
    limit: int = Query(10, ge=1, le=30)
) -> List[dict]:
    """
    Get most commonly used ICD-10 codes, optionally filtered by specialty.
    """
    if specialty:
        filtered = [item for item in ICD10_DATA if item.get("specialty", "").lower() == specialty.lower()]
        return filtered[:limit]
    
    # Return general/most common codes first
    general = [item for item in ICD10_DATA if not item.get("specialty")]
    return general[:limit]
