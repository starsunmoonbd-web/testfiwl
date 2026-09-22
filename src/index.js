const TOKEN_TTL = 5 * 60;

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);

      // =========================
      // 1. TOKEN GENERATOR
      // =========================
      if (url.pathname === "/token") {
        if (!env.SECRET) {
          return new Response("ERROR: SECRET is missing", {
            status: 500
          });
        }

        const exp = Math.floor(Date.now() / 1000) + TOKEN_TTL;
        const token = await createToken(exp, env.SECRET);

        return new Response(JSON.stringify({
          token: token,
          expires_in: TOKEN_TTL,
          url: `${url.origin}/live.m3u8?token=${encodeURIComponent(token)}`
        }, null, 2), {
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store"
          }
        });
      }

      // =========================
      // 2. HLS
      // =========================
      if (url.pathname === "/live.m3u8") {
        if (!env.SECRET) {
          return new Response("ERROR: SECRET is missing", {
            status: 500
          });
        }

        const token = url.searchParams.get("token");

        if (!token) {
          return new Response("ERROR: token missing", {
            status: 401
          });
        }

        if (!await verifyToken(token, env.SECRET)) {
          return new Response("ERROR: token expired/invalid", {
            status: 403
          });
        }

        // ==========================================
        // নিজের অনুমোদিত HLS URL এখানে বসাবে
        // ==========================================
        const HLS_ORIGIN = env.HLS_ORIGIN;

        if (!HLS_ORIGIN) {
          return new Response(
            "ERROR: HLS_ORIGIN is not configured",
            { status: 500 }
          );
        }

        const response = await fetch(HLS_ORIGIN, {
          headers: {
            "User-Agent": "Mozilla/5.0",
            "Accept": "*/*"
          }
        });

        if (!response.ok) {
          return new Response(
            `Origin error: ${response.status}`,
            { status: 502 }
          );
        }

        return new Response(response.body, {
          status: 200,
          headers: {
            "Content-Type":
              response.headers.get("Content-Type") ||
              "application/vnd.apple.mpegurl",

            "Cache-Control": "no-store",
            "Access-Control-Allow-Origin": "*"
          }
        });
      }

      return new Response("Not Found", {
        status: 404
      });

    } catch (error) {
      return new Response(
        "Worker Error: " + error.message,
        { status: 500 }
      );
    }
  }
};


// ======================================
// HMAC TOKEN
// ======================================

async function createToken(exp, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    {
      name: "HMAC",
      hash: "SHA-256"
    },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(String(exp))
  );

  return `${exp}.${base64url(signature)}`;
}


async function verifyToken(token, secret) {
  try {
    const parts = token.split(".");

    if (parts.length !== 2) return false;

    const exp = Number(parts[0]);

    if (!Number.isFinite(exp)) return false;

    if (Math.floor(Date.now() / 1000) >= exp) {
      return false;
    }

    const expected = await createToken(exp, secret);

    return timingSafeEqual(token, expected);

  } catch {
    return false;
  }
}


function base64url(buffer) {
  let binary = "";

  for (const byte of new Uint8Array(buffer)) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}


function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;

  let result = 0;

  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
      }
