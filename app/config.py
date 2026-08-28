import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

BOT_TOKEN = os.getenv("BOT_TOKEN", "").strip()
ADMIN_ID_RAW = os.getenv("ADMIN_ID", "").strip()
if not ADMIN_ID_RAW:
    raise RuntimeError("ADMIN_ID .env-এ সেট করা হয়নি।")
try:
    ADMIN_ID = int(ADMIN_ID_RAW)
except ValueError as exc:
    raise RuntimeError("ADMIN_ID অবশ্যই একটি সংখ্যার Telegram user ID হতে হবে।") from exc

CLIENT_SECRET_FILE = Path(os.getenv("CLIENT_SECRET_FILE", "credentials/client_secret.json"))
YOUTUBE_TOKEN_FILE = Path(os.getenv("YOUTUBE_TOKEN_FILE", "data/youtube/token.json"))
DOWNLOAD_DIR = Path(os.getenv("DOWNLOAD_DIR", "data/downloads"))

# Must be a public HTTPS URL pointing to /oauth2callback on this VPS.
OAUTH_REDIRECT_URI = os.getenv("OAUTH_REDIRECT_URI", "").strip().rstrip("/")
OAUTH_HOST = os.getenv("OAUTH_HOST", "0.0.0.0").strip()
OAUTH_PORT = int(os.getenv("OAUTH_PORT", "8080"))

DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)
YOUTUBE_TOKEN_FILE.parent.mkdir(parents=True, exist_ok=True)
CLIENT_SECRET_FILE.parent.mkdir(parents=True, exist_ok=True)
