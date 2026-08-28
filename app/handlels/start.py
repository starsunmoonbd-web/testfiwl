from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import ContextTypes
from app.utils.helpers import is_admin


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user
    if not is_admin(user.id):
        await update.message.reply_text("❌ Unauthorized.")
        return

    keyboard = [
        [InlineKeyboardButton("🔗 Connect YouTube", callback_data="connect_youtube")],
        [InlineKeyboardButton("📺 My Channel", callback_data="my_channel")],
    ]
    await update.message.reply_text(
        "🤖 *YouTube Auto Uploader*\n\n"
        "প্রথমবার Connect YouTube চাপুন। Google authorization শেষ হলে "
        "Telegram-এ ফিরে এসে ভিডিও পাঠান।",
        parse_mode="Markdown",
        reply_markup=InlineKeyboardMarkup(keyboard),
    )
