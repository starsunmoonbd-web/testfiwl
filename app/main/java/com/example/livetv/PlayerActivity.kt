package com.example.livetv

import android.net.Uri
import android.os.Bundle
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.google.android.exoplayer2.ExoPlayer
import com.google.android.exoplayer2.MediaItem
import com.google.android.exoplayer2.ui.PlayerView

class PlayerActivity : AppCompatActivity() {
    private var player: ExoPlayer? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_player)

        val view = findViewById<PlayerView>(R.id.player)
        val url = intent.getStringExtra("url")?.trim().orEmpty()
        if (url.isBlank()) {
            Toast.makeText(this, "Stream URL missing", Toast.LENGTH_LONG).show()
            finish()
            return
        }

        player = ExoPlayer.Builder(this).build().also { exo ->
            view.player = exo
            exo.setMediaItem(MediaItem.fromUri(Uri.parse(url)))
            exo.prepare()
            exo.playWhenReady = true
        }
    }

    override fun onDestroy() {
        player?.release()
        player = null
        super.onDestroy()
    }
}
