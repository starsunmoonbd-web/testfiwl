const UPSTREAM_M3U8 =
  "https://liveline.bond/st/live.php?id=11154&e=.m3u8";

const UPSTREAM_HOST = "liveline.bond";
const TOKEN_TTL = 300;

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);

      if (request.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: corsHeaders()
        });
      }

      if (!env.STREAM_SECRET) {
        return jsonResponse({
          error: "STREAM_SECRET is not configured"
        }, 500);
      }

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

      if (url.pathname === "/live.m3u8") {
        const token = url.searchParams.get("token");

        if (!token) {
          return textResponse("Token missing", 403);
        }

        if (!await verifyToken(token, env.STREAM_SECRET)) {
          return textResponse("Token expired or invalid", 403);
        }

        const response = await fetch(UPSTREAM_M3U8, {
          headers: {
            "User-Agent": "Mozilla/5.0"
          },
          cf: {
            cacheTtl: 0,
            cacheEverything: false
          }
        });

        if (!response.ok) {
          return textResponse(
            `Upstream error: ${response.status}`,
            502
          );
        }

        const content = await response.text();

        if (!content.trimStart().startsWith("#EXTM3U")) {
          return textResponse(
            "Upstream did not return an HLS playlist",
            502
          );
        }

        const playlist = await rewritePlaylist(
          content,
          new URL(UPSTREAM_M3U8),
          token,
          env.STREAM_SECRET,
          url.origin
        );

        return new Response(playlist, {
          headers: {
            ...corsHeaders(),
            "Content-Type": "application/vnd.apple.mpegurl",
            "Cache-Control": "no-store"
          }
        });
      }

      if (url.pathname === "/hls") {
        const token = url.searchParams.get("token");
        const encrypted = url.searchParams.get("p");

        if (!token || !encrypted) {
          return textResponse("Missing parameters", 400);
        }

        if (!await verifyToken(token, env.STREAM_SECRET)) {
          return textResponse("Token expired or invalid", 403);
        }

        let targetUrl;

        try {
          targetUrl = await decryptTarget(
            encrypted,
            env.STREAM_SECRET
          );
        } catch {
          return textResponse("Invalid encrypted URL", 403);
        }

        let target;

        try {
          target = new URL(targetUrl);
        } catch {
          return textResponse("Invalid target URL", 400);
        }

        if (
          target.protocol !== "https:" ||
          target.hostname !== UPSTREAM_HOST
        ) {
          return textResponse("Host not allowed", 403);
        }

        const response = await fetch(target.toString(), {
          headers: {
            "User-Agent": "Mozilla/5.0"
          },
          cf: {
            cacheTtl: 0,
            cacheEverything: false
          }
        });

        if (!response.ok) {
          return textResponse(
            `Upstream error: ${response.status}`,
            502
          );
        }

        const type =
          response.headers.get("content-type") || "";

        if (
          type.includes("mpegurl") ||
          target.pathname.endsWith(".m3u8") ||
          target.pathname.endsWith(".m3u")
        ) {
          const body = await response.text();

          const playlist = await rewritePlaylist(
            body,
            target,
            token,
            env.STREAM_SECRET,
            url.origin
          );

          return new Response(playlist, {
            headers: {
              ...corsHeaders(),
              "Content-Type": "application/vnd.apple.mpegurl",
              "Cache-Control": "no-store"
            }
          });
        }

        return new Response(response.body, {
          status: response.status,
          headers: {
            ...corsHeaders(),
            "Content-Type": type || "application/octet-stream",
            "Cache-Control": "no-store"
          }
        });
      }

      return textResponse("Not found", 404);

    } catch (error) {
      return jsonResponse({
        error: "Internal Server Error",
        message: error.message
      }, 500);
    }
  }
};

function isAllowedHost(targetUrl) {
  try {
