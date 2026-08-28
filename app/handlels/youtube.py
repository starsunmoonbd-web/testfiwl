import asyncio
from html import escape

from flask import Flask, redirect, request
from telegram import Update
from telegram.ext import ContextTypes

from app.config import OAUTH_REDIRECT_URI
from app.services.youtube_service import (
    create_authorization_url,
    complete_authorization,
    get_channel,
)
from app.utils.helpers import is_admin


oauth_app = Flask(__name__)


@oauth_app.get("/oauth2callback")
def oauth2callback():
    error = request.args.get("error")
    if error:
        return f"<h2>❌ Google authorization failed</h2><p>{escape(error)}</p>", 400

    code = request.args.get("code")
    state = request.args.get("state")
    if not code or not state:
        return "Authorization code/state পাওয়া যায়নি। আবার Telegram থেকে Connect YouTube চাপুন।", 400

    try:
        complete_authorization(code=code, state=state)
        return "<h2>✅ YouTube connected successfully!</h2><p>এখন Telegram bot-এ ফিরে যান।</p>"
    except Exception as exc:
        return f"<h2>❌ YouTube connection failed</h2><pre>{escape(str(exc))}</pre>", 500


async def connect_youtube(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()

    if not is_admin(query.from_user.id):
        return

    if not OAUTH_REDIRECT_URI:
        await query.message.reply_text(
            "❌ OAUTH_REDIRECT_URI সেট করা হয়নি। .env ঠিক করুন।"
        )
        return

    try:
        url = await asyncio.to_thread(create_authorization_url)
        await query.message.reply_text(
            "🔗 *Connect YouTube*\n\n"
            "নিচের link-এ চাপুন, Google account দিয়ে login করে YouTube permission দিন।\n\n"
            f"{url}",
            parse_mode="Markdown",
            disable_web_page_preview=True,
        )
    except Exception as exc:
        await query.message.reply_text(f"❌ OAuth error:\n{exc}")


async def my_channel(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    if not is_admin(query.from_user.id):
        return

    try:
        channel = await asyncio.to_thread(get_channel)
        if not channel:
            await query.message.reply_text("❌ কোনো YouTube channel পাওয়া যায়নি।")
            return
        await query.message.reply_text(
            "📺 *Connected Channel*\n\n"
            f"Name: {channel['title']}\n"
            f"ID: `{channel['id']}`\n\n"
            f"{channel['url']}",
            parse_mode="Markdown",
        )
    except Exception as exc:
        await query.message.reply_text(f"❌ {exc}")
