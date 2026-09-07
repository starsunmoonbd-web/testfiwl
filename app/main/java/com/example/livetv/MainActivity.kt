package com.example.livetv

import android.content.Intent
import android.os.Bundle
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import kotlinx.coroutines.launch

class MainActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        val list = findViewById<RecyclerView>(R.id.list)
        list.layoutManager = LinearLayoutManager(this)

        if (ApiConfig.BASE_URL.isBlank() || !ApiConfig.BASE_URL.startsWith("https://")) {
            Toast.makeText(this, "Invalid API base URL", Toast.LENGTH_LONG).show()
            return
        }
        if (ApiConfig.API_KEY.isBlank()) {
            Toast.makeText(this, "API key is not configured", Toast.LENGTH_LONG).show()
            return
        }

        lifecycleScope.launch {
            try {
                val response = RetrofitClient.api.channels()
                if (response.success && !response.data.isNullOrEmpty()) {
                    list.adapter = ChannelAdapter(response.data) { channel ->
                        startActivity(Intent(this@MainActivity, PlayerActivity::class.java).apply {
                            putExtra("name", channel.name)
                            putExtra("url", channel.stream_url)
                        })
                    }
                } else {
                    Toast.makeText(
                        this@MainActivity,
                        response.message ?: "No channels available",
                        Toast.LENGTH_LONG
                    ).show()
                }
            } catch (e: Exception) {
                Toast.makeText(
                    this@MainActivity,
                    "API error: ${e.message ?: "Connection failed"}",
                    Toast.LENGTH_LONG
                ).show()
            }
        }
    }
}
