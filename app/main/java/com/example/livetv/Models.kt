package com.example.livetv
data class Channel(
    val id: Int,
    val name: String,
    val stream_url: String,
    val logo_url: String?,
    val category: String?
)
data class ApiResponse<T>(val success: Boolean, val data: T?, val message: String?)
