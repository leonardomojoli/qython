"""Entrada do executável do backend (PyInstaller). A lógica fica em backend/desktop.py."""
import multiprocessing
import sys

if __name__ == "__main__":
    # Necessário no Windows quando o app congelado usa multiprocessing (o chromadb e o
    # PyMuPDF podem criar processos filhos): sem isto cada filho reabriria o servidor.
    multiprocessing.freeze_support()
    from backend.desktop import main

    sys.exit(main())
