const UPSTREAM_M3U8 =
  "https://d1g8wgjurz8via.cloudfront.net/bpk-tv/ColorsHD/default/ColorsHD.m3u8";

const TOKEN_TTL = 300;

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);

      // OPTIONS / CORS
      if (request.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: corsHeaders()
        });
      }

      // Secret check
      if (!env.STREAM_SECRET) {
        return jsonResponse(
          {
            error: "STREAM_SECRET is not configured"
          },
          500
        );
      }

      // =========================================
      // TOKEN
      // =========================================
      if (url.pathname === "/token") {
        const token = await createToken(
          env.STREAM_SECRET
        );

        return jsonResponse({
          stream:
            `${url.origin}/live.m3u8?token=${encodeURIComponent(token)}`,
          expires_in: TOKEN_TTL
        });
      }

      // =========================================
      // MAIN PLAYLIST
      // =========================================
      if (url.pathname === "/live.m3u8") {
        const token =
          url.searchParams.get("token");

        if (!token) {
          return textResponse(
            "Token missing",
            403
          );
        }

        const valid =
          await verifyToken(
            token,
            env.STREAM_SECRET
          );

        if (!valid) {
          return textResponse(
            "Token expired or invalid",
            403
          );
        }

        return await getPlaylist(
          UPSTREAM_M3U8,
          token,
          url.origin,
          env.STREAM_SECRET
        );
      }

      // =========================================
      // HLS PROXY
      // =========================================
      if (url.pathname === "/hls
