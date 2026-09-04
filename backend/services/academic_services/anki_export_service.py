# backend/services/academic_services/anki_export_service.py

import os
import json
import sqlite3
import zipfile
import shutil
import uuid
import time
import hashlib
from typing import List, Dict
from ...config import Config


class AnkiExportService:
    """Creates .apkg files compatible with Anki."""

    def __init__(self):
        self.export_dir = os.path.join(Config.PERMANENT_UPLOAD_FOLDER, 'anki_exports')
        os.makedirs(self.export_dir, exist_ok=True)

    def _create_guid(self) -> str:
        """Generate unique GUID for Anki note."""
        return hashlib.md5(str(uuid.uuid4()).encode()).hexdigest()[:10]

    def _create_schema(self, cursor):
        """Create Anki SQLite schema."""
        cursor.executescript('''
            CREATE TABLE col (
                id INTEGER PRIMARY KEY, crt INTEGER, mod INTEGER, scm INTEGER,
                ver INTEGER, dty INTEGER, usn INTEGER, ls INTEGER,
                conf TEXT, models TEXT, decks TEXT, dconf TEXT, tags TEXT
            );
            CREATE TABLE notes (
                id INTEGER PRIMARY KEY, guid TEXT, mid INTEGER, mod INTEGER,
                usn INTEGER, tags TEXT, flds TEXT, sfld TEXT, csum INTEGER,
                flags INTEGER, data TEXT
            );
            CREATE TABLE cards (
                id INTEGER PRIMARY KEY, nid INTEGER, did INTEGER, ord INTEGER,
                mod INTEGER, usn INTEGER, type INTEGER, queue INTEGER,
                due INTEGER, ivl INTEGER, factor INTEGER, reps INTEGER,
                lapses INTEGER, left INTEGER, odue INTEGER, odid INTEGER,
                flags INTEGER, data TEXT
            );
            CREATE TABLE revlog (
                id INTEGER PRIMARY KEY, cid INTEGER, usn INTEGER, ease INTEGER,
                ivl INTEGER, lastIvl INTEGER, factor INTEGER, time INTEGER, type INTEGER
            );
            CREATE TABLE graves (usn INTEGER, oid INTEGER, type INTEGER);
            CREATE INDEX ix_notes_csum ON notes (csum);
            CREATE INDEX ix_cards_nid ON cards (nid);
            CREATE INDEX ix_revlog_cid ON revlog (cid);
        ''')

    def _build_model(self, model_id: int, deck_id: int) -> dict:
        """Create note model (Basic with front/back)."""
        return {
            str(model_id): {
                "id": model_id,
                "name": "Qython Medical Flashcard",
                "type": 0,
                "mod": int(time.time()),
                "usn": -1,
                "sortf": 0,
                "did": deck_id,
                "tmpls": [{
                    "name": "Card 1",
                    "ord": 0,
                    "qfmt": "{{Frente}}",
                    "afmt": "{{FrontSide}}<hr id=answer>{{Verso}}",
                    "bqfmt": "",
                    "bafmt": "",
                    "did": None,
                    "bfont": "",
                    "bsize": 0
                }],
                "flds": [
                    {"name": "Frente", "ord": 0, "sticky": False, "rtl": False, "font": "Arial", "size": 20, "media": []},
                    {"name": "Verso", "ord": 1, "sticky": False, "rtl": False, "font": "Arial", "size": 20, "media": []}
                ],
                "css": ".card { font-family: arial; font-size: 20px; text-align: center; color: black; background-color: white; }",
                "latexPre": "",
                "latexPost": "",
                "latexsvg": False,
                "req": [[0, "all", [0]]]
            }
        }

    def _build_deck(self, deck_id: int, deck_name: str) -> dict:
        """Create deck configuration."""
        return {
            "1": {
                "id": 1,
                "name": "Default",
                "mod": 0,
                "usn": 0,
                "lrnToday": [0, 0],
                "revToday": [0, 0],
                "newToday": [0, 0],
                "timeToday": [0, 0],
                "collapsed": False,
                "desc": ""
            },
            str(deck_id): {
                "id": deck_id,
                "name": deck_name,
                "mod": int(time.time()),
                "usn": -1,
                "lrnToday": [0, 0],
                "revToday": [0, 0],
                "newToday": [0, 0],
                "timeToday": [0, 0],
                "collapsed": False,
                "desc": "Deck gerado pelo Qython"
            }
        }

    def _build_dconf(self) -> dict:
        """Create deck configuration defaults."""
        return {
            "1": {
                "id": 1,
                "mod": 0,
                "name": "Default",
                "usn": 0,
                "maxTaken": 60,
                "autoplay": True,
                "timer": 0,
                "replayq": True,
                "new": {
                    "bury": True,
                    "delays": [1, 10],
                    "initialFactor": 2500,
                    "ints": [1, 4, 7],
                    "order": 1,
                    "perDay": 20,
                    "separate": True
                },
                "rev": {
                    "bury": True,
                    "ease4": 1.3,
                    "fuzz": 0.05,
                    "ivlFct": 1,
                    "maxIvl": 36500,
                    "perDay": 100,
                    "minSpace": 1
                },
                "lapse": {
                    "delays": [10],
                    "leechAction": 0,
                    "leechFails": 8,
                    "minInt": 1,
                    "mult": 0
                }
            }
        }

    def export_flashcards(self, flashcards: List[Dict], deck_name: str, user_id: int) -> str:
        """
        Export flashcards to .apkg format.

        Args:
            flashcards: List of {frente, verso, image_url?}
            deck_name: Name of the deck
            user_id: User ID

        Returns:
            Path to the generated .apkg file
        """
        work_dir = os.path.join(self.export_dir, f"temp_{user_id}_{uuid.uuid4().hex[:8]}")
        os.makedirs(work_dir, exist_ok=True)

        try:
            db_path = os.path.join(work_dir, 'collection.anki2')
            conn = sqlite3.connect(db_path)
            cursor = conn.cursor()

            self._create_schema(cursor)

            # Generate IDs
            now = int(time.time())
            deck_id = now * 1000
            model_id = deck_id + 1

            # Build configurations
            models = self._build_model(model_id, deck_id)
            decks = self._build_deck(deck_id, deck_name)
            dconf = self._build_dconf()

            col_conf = json.dumps({
                "activeDecks": [1],
                "curDeck": deck_id,
                "newSpread": 0,
                "collapseTime": 1200,
                "timeLim": 0,
                "estTimes": True,
                "dueCounts": True,
                "curModel": model_id,
                "nextPos": 1,
                "sortType": "noteFld",
                "sortBackwards": False,
                "addToCur": True
            })

            cursor.execute(
                "INSERT INTO col VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (1, now, now, now, 11, 0, 0, 0, col_conf, json.dumps(models), json.dumps(decks), json.dumps(dconf), "{}")
            )

            # Insert notes and cards
            for i, card in enumerate(flashcards):
                note_id = now * 1000 + i + 1
                card_id = note_id + len(flashcards)

                frente = card.get('frente', '').strip()
                verso = card.get('verso', '').strip()

                # Concatenated fields for Anki (separated by \x1f)
                flds = f"{frente}\x1f{verso}"
                sfld = frente[:100] if frente else ""
                csum = int(hashlib.sha1(sfld.encode('utf-8')).hexdigest()[:8], 16)

                cursor.execute(
                    "INSERT INTO notes VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                    (note_id, self._create_guid(), model_id, now, -1, "", flds, sfld, csum, 0, "")
                )

                cursor.execute(
                    "INSERT INTO cards VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                    (card_id, note_id, deck_id, 0, now, -1, 0, 0, i + 1, 0, 2500, 0, 0, 0, 0, 0, 0, "")
                )

            conn.commit()
            conn.close()

            # Create media manifest (empty for now - images can be added later)
            with open(os.path.join(work_dir, 'media'), 'w', encoding='utf-8') as f:
                json.dump({}, f)

            # Create .apkg (ZIP file)
            safe_name = "".join(c if c.isalnum() or c in ' -_' else '_' for c in deck_name)[:50]
            output_path = os.path.join(self.export_dir, f"{safe_name}_{user_id}_{uuid.uuid4().hex[:6]}.apkg")

            with zipfile.ZipFile(output_path, 'w', zipfile.ZIP_DEFLATED) as zf:
                zf.write(db_path, 'collection.anki2')
                zf.write(os.path.join(work_dir, 'media'), 'media')

            return output_path

        finally:
            # Cleanup temp directory
            shutil.rmtree(work_dir, ignore_errors=True)

    def cleanup_old_exports(self, max_age_hours: int = 24):
        """Remove old export files."""
        try:
            current_time = time.time()
            max_age_seconds = max_age_hours * 3600

            for filename in os.listdir(self.export_dir):
                if filename.endswith('.apkg'):
                    filepath = os.path.join(self.export_dir, filename)
                    file_age = current_time - os.path.getmtime(filepath)
                    if file_age > max_age_seconds:
                        os.remove(filepath)
        except Exception:
            pass  # Silently ignore cleanup errors


# Singleton instance
anki_export_service = AnkiExportService()
