const UPSTREAM_M3U8 =
  "https://d1g8wgjurz8via.cloudfront.net/bpk-tv/ColorsHD/default/ColorsHD.m3u8";

const TOKEN_TTL = 300;
const TARGET_TTL = 300;

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);

      if (!env.STREAM_SECRET) {
        return json({
          error: "STREAM_SECRET is not configured"
        }, 500);
      }

      if (request.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: cors()
        });
      }

      // =========================
      // TOKEN
      // =========================
      if (url.pathname === "/token") {
        const token = await createToken(env.STREAM_SECRET);

        return json({
          stream:
            `${url.origin}/live.m3u8?token=${encodeURIComponent(token)}`,
          expires_in: TOKEN_TTL
        });
      }

      // =========================
      // MASTER / MAIN PLAYLIST
      // =========================
      if (url.pathname === "/live.m3u8") {
        const token = url.searchParams.get("token");

        if (
          !token ||
          !(await verifyToken(token, env.STREAM_SECRET))
        ) {
          return text("Token expired or invalid", 403);
        }

        return await getPlaylist(
          UPSTREAM_M3U8,
          token,
          url.origin,
          env.STREAM_SECRET
        );
      }

      // =========================
      // PROXY
      // =========================
      if (url.pathname === "/hls") {
        const token = url.searchParams.get("token");
        const p = url.searchParams.get("p");

        if (
          !token ||
          !p ||
          !(await verifyToken(token, env.STREAM_SECRET))
        ) {
          return text("Forbidden", 403);
        }

        const target = await decryptTarget(
          p,
          env.STREAM_SECRET
        );

        if (!target) {
          return text("Invalid target", 403);
        }

        let targetURL;

        try {
          targetURL = new URL(target);
        } catch {
          return text("Invalid target", 400);
        }

        // Only allow your configured upstream host
        const upstreamHost =
          new URL(UPSTREAM_M3U8).hostname;

        if (targetURL.hostname !== upstreamHost) {
          return text("Forbidden", 403);
        }

        const response = await fetch(
          targetURL.toString(),
          {
            headers: {
              "User-Agent":
                "Mozilla/5.0"
            }
          }
        );

        if (!response.ok) {
          return text(
            `Upstream error ${response.status}`,
            502
          );
        }

        const contentType =
          response.headers.get("Content-Type") || "";

        // Playlist
        if (
          contentType
            .toLowerCase()
            .includes("mpegurl") ||
          targetURL.pathname
            .toLowerCase()
            .endsWith(".m3u
