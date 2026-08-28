import asyncio
from app.config import DOWNLOAD_DIR
from app.services.youtube_service import upload_video
from app.utils.helpers import is_admin, clean_title

from telegram import Update
from telegram.ext import ContextTypes


async def handle_video(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user
    if not is_admin(user.id):
        await update.message.reply_text("❌ Unauthorized.")
        return

    video = update.message.video
    if not video:
        return

    size = video.file_size or 0
    if size > 2000 * 1024 * 1024:
        await update.message.reply_text("❌ ভিডিও 2000 MB-এর বেশি।")
        return

    status_message = await update.message.reply_text(
        "📥 *ভিডিও পাওয়া গেছে!*\n\n⏳ VPS-এ download হচ্ছে...",
        parse_mode="Markdown",
    )
    file_path = DOWNLOAD_DIR / f"{video.file_unique_id}.mp4"

    try:
        telegram_file = await context.bot.get_file(video.file_id)
        await telegram_file.download_to_drive(custom_path=str(file_path))
        await status_message.edit_text("✅ Download complete!\n\n📤 YouTube upload শুরু হচ্ছে...")

        title = clean_title(update.message.caption or "New Video")
        description = "Uploaded automatically from Telegram."
        loop = asyncio.get_running_loop()
        last_progress = 0

        def progress_callback(percent):
            nonlocal last_progress
            if percent >= last_progress + 5 or percent == 100:
                last_progress = percent
                asyncio.run_coroutine_threadsafe(
                    status_message.edit_text(
                        "📤 *YouTube Uploading...*\n\n"
                        f"Progress: `{percent}%`",
                        parse_mode="Markdown",
                    ), loop
                )

        video_id = await asyncio.to_thread(
            upload_video, file_path, title, description, "public", progress_callback
        )
        youtube_url = f"https://www.youtube.com/watch?v={video_id}"
        await status_message.edit_text(
            "✅ *YouTube Upload Complete!*\n\n"
            f"🎬 Title: {title}\n\n🔗 {youtube_url}",
            parse_mode="Markdown",
        )
    except Exception as exc:
        await status_message.edit_text(
            "❌ *Upload failed*\n\n"
            f"`{str(exc)}`", parse_mode="Markdown"
        )
    finally:
        if file_path.exists():
            try:
                file_path.unlink()
            except Exception:
                pass
