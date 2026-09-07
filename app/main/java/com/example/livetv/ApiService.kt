package com.example.livetv
import retrofit2.http.GET
import retrofit2.http.Header

interface ApiService {
    @GET("api/channels.php")
    suspend fun channels(@Header("X-API-Key") apiKey: String = ApiConfig.API_KEY): ApiResponse<List<Channel>>
}
