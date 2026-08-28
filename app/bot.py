from telegram.ext import Application, CommandHandler, MessageHandler, CallbackQueryHandler, filters
from app.config import BOT_TOKEN
from app.handlers.start import start
from app.handlers.youtube import connect_youtube, my_channel
from app.handlers.video import handle_video


def create_application():
    app = Application.builder().token(BOT_TOKEN).build()
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CallbackQueryHandler(connect_youtube, pattern=r"^connect_youtube$"))
    app.add_handler(CallbackQueryHandler(my_channel, pattern=r"^my_channel$"))
    app.add_handler(MessageHandler(filters.VIDEO, handle_video))
    return app
