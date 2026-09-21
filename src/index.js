const UPSTREAM_M3U8 =
  "https://d1g8wgjurz8via.cloudfront.net/bpk-tv/ColorsHD/default/ColorsHD.m3u8";

const UPSTREAM_HOST = "d1g8wgjurz8via.cloudfront.net";

const TOKEN_TTL = 300;

// =========================================
// MAIN WORKER
// =========================================

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);

      // =====================================
      // CORS / OPTIONS
      // =====================================
      if (request.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: corsHeaders()
        });
      }

      // =====================================
      // SECRET CHECK
      // =====================================
      if (!env.STREAM_SECRET) {
        return jsonResponse(
          {
            error: "STREAM_SECRET is not configured"
          },
          500
        );
      }

      // =====================================
      // TOKEN ENDPOINT
      // =====================================
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

      // =====================================
      // MAIN PLAYLIST
      // =====================================
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

      // =====================================
      // HLS PROXY
      // =====================================
      if (url.pathname === "/hls") {
        const token =
          url.searchParams.get("token");

        const encrypted =
          url.searchParams.get("p");

        if (!token || !encrypted) {
          return textResponse(
            "Missing parameters",
            403
          );
        }

        // Verify token
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

        // Decrypt target URL
        let targetUrl;

        try {
          targetUrl =
            await decryptTarget(
              encrypted,
              env.STREAM_SECRET
            );
        } catch (e) {
          return textResponse(
            "Invalid target",
            403
          );
        }

        // Validate target URL
        let target;

        try {
          target = new URL(targetUrl);
        } catch (e) {
          return textResponse(
            "Invalid URL",
            400
          );
        }

        // Only allow the configured upstream host
        if (
          target.hostname !== UPSTREAM_HOST
        ) {
          return textResponse(
            "Host not allowed",
            403
          );
        }

        // Fetch upstream resource
        const response =
          await fetch(target.toString(), {
            method: "GET",
            headers: {
              "User
