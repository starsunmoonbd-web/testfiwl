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
              "User-Agent":
                "Mozilla/5.0 HLS-Proxy"
            },
            cf: {
              cacheTtl: 0,
              cacheEverything: false
            }
          });

        if (!response.ok) {
          return new Response(
            `Upstream error: ${response.status}`,
            {
              status: response.status,
              headers: corsHeaders()
            }
          );
        }

        const contentType =
          response.headers.get(
            "content-type"
          ) || "";

        // =================================
        // PLAYLIST
        // =================================
        if (
          contentType.includes(
            "mpegurl"
          ) ||
          target.pathname.endsWith(
            ".m3u8"
          ) ||
          target.pathname.endsWith(
            ".m3u"
          )
        ) {
          const text =
            await response.text();

          const rewritten =
            rewritePlaylist(
              text,
              target,
              token,
              targetUrl,
              env.STREAM_SECRET,
              new URL(request.url).origin
            );

          return new Response(
            rewritten,
            {
              status: 200,
              headers: {
                ...corsHeaders(),
                "Content-Type":
                  "application/vnd.apple.mpegurl",
                "Cache-Control":
                  "no-store, no-cache, must-revalidate"
              }
            }
          );
        }

        // =================================
        // VIDEO / SEGMENT / OTHER DATA
        // =================================
        return new Response(
          response.body,
          {
            status: response.status,
            headers: {
              ...corsHeaders(),
              "Content-Type":
                contentType ||
                "application/octet-stream",
              "Cache-Control":
                "no-store, no-cache, must-revalidate"
            }
          }
        );
      }

      // =====================================
      // 404
      // =====================================
      return textResponse(
        "Not found",
        404
      );

    } catch (error) {
      return jsonResponse(
        {
          error: "Internal Server Error",
          message: error.message
        },
        500
      );
    }
  }
};


// =========================================
// GET PLAYLIST
// =========================================

async function getPlaylist(
  playlistUrl,
  token,
  origin,
  secret
) {
  const response =
    await fetch(playlistUrl, {
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 HLS-Proxy"
      },
      cf: {
        cacheTtl: 0,
        cacheEverything: false
      }
    });

  if (!response.ok) {
    return textResponse(
      `Upstream playlist error: ${response.status}`,
      response.status
    );
  }

  const text =
    await response.text();

  const base =
    new URL(playlistUrl);

  const rewritten =
    rewritePlaylist(
      text,
      base,
      token,
      playlistUrl,
      secret,
      origin
    );

  return new Response(
    rewritten,
    {
      status: 200,
      headers: {
        ...corsHeaders(),
        "Content-Type":
          "application/vnd.apple.mpegurl",
        "Cache-Control":
          "no-store, no-cache, must-revalidate"
      }
    }
  );
}


// =========================================
// REWRITE HLS PLAYLIST
// =========================================

function rewritePlaylist(
  text,
  baseUrl,
  token,
  originalUrl,
  secret,
  origin
) {
  // Rewrite URI="..."
  text = text.replace(
    /URI="([^"]+)"/g,
    (match, uri) => {
      try {
        const absolute =
          new URL(
            uri,
            baseUrl
          ).toString();

        if (
          isAllowedHost(
            absolute
          )
        ) {
          return `URI="${makeProxyUrl(
            absolute,
            token,
            secret,
            origin
          )}"`;
        }

        return match;

      } catch (e) {
        return match;
      }
    }
  );

  // Rewrite normal playlist lines
  const lines =
    text.split("\n");

  const output =
    lines.map((line) => {
      const trimmed =
        line.trim();

      // Empty/comment line
      if (
        !trimmed ||
        trimmed.startsWith("#")
      ) {
        return line;
      }

      try {
        const absolute =
          new URL(
            trimmed,
            baseUrl
          ).toString();

        if (
          isAllowedHost(
            absolute
          )
        ) {
          return makeProxyUrl(
            absolute,
            token,
            secret,
            origin
          );
        }

        return line;

      } catch (e) {
        return line;
      }
    });

  return output.join("\n");
}


// =========================================
// CREATE PROXY URL
// =========================================

async function makeProxyUrl(
  target,
  token,
  secret,
  origin
) {
  const encrypted =
    await encryptTarget(
      target,
      secret
    );

  return (
    `${origin}/hls` +
    `?token=${encodeURIComponent(token)}` +
    `&p=${encodeURIComponent(encrypted)}`
  );
}


// =========================================
// HOST VALIDATION
// =========================================

function isAllowedHost(
  targetUrl
) {
  try {
    const u =
      new URL(targetUrl);

    return (
      u.protocol === "https:" &&
      u.hostname === UPSTREAM_HOST
    );

  } catch (e) {
    return false;
  }
}


// =========================================
// TOKEN CREATE
// =========================================

async function createToken(
  secret
) {
  const expires =
    Math.floor(
      Date.now() / 1000
    ) + TOKEN_TTL;

  const data =
    String(expires);

  const signature =
    await hmacSign(
      data,
      secret
    );

  return `${expires}.${signature}`;
}


// =========================================
// TOKEN VERIFY
// =========================================

async function verifyToken(
  token,
  secret
) {
  try {
    const parts =
      token.split(".");

    if (parts.length !== 2) {
      return false;
    }

    const expires =
      Number(parts[0]);

    const signature =
      parts[1];

    if (
      !Number.isFinite(expires)
    ) {
      return false;
    }

    const now =
      Math.floor(
        Date.now() / 1000
      );

    if (expires < now) {
      return false;
    }

    const expected =
      await hmacSign(
        String(expires),
        secret
      );

    return timingSafeEqual(
      signature,
      expected
    );

  } catch (e) {
    return false;
  }
}


// =========================================
// HMAC SHA-256
// =========================================

async function hmacSign(
  message,
  secret
) {
  const encoder =
    new TextEncoder();

  const key =
    await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      {
        name: "HMAC",
        hash: "SHA-256"
      },
      false,
      ["sign"]
    );

  const signature =
    await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(message)
    );

  return arrayBufferToBase64Url(
    signature
  );
}


// =========================================
// ENCRYPT TARGET URL
// =========================================

async function encryptTarget(
  text,
  secret
) {
  const key =
    await deriveAESKey(secret);

  const iv =
    crypto.getRandomValues(
      new Uint8Array(12)
    );

  const encoder =
    new TextEncoder();

  const encrypted =
    await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv
      },
      key,
      encoder.encode(text)
    );

  const result =
    new Uint8Array(
      iv.length +
      encrypted.byteLength
    );

  result.set(iv, 0);

  result.set(
    new Uint8Array(encrypted),
    iv.length
  );

  return arrayBufferToBase64Url(
    result.buffer
  );
}


// =========================================
// DECRYPT TARGET URL
// =========================================

async function decryptTarget(
  encoded,
  secret
) {
  const key =
    await deriveAESKey(secret);

  const data =
    base64UrlToUint8Array(
      encoded
    );

  if (data.length < 13) {
    throw new Error(
      "Invalid encrypted data"
    );
  }

  const iv =
    data.slice(0, 12);

  const encrypted =
    data.slice(12);

  const decrypted =
    await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv
      },
      key,
      encrypted
    );

  return new TextDecoder().decode(
    decrypted
  );
}


// =========================================
// DERIVE AES KEY
// =========================================

async function deriveAESKey(
  secret
) {
  const encoder =
    new TextEncoder();

  const hash =
    await crypto.subtle.digest(
      "SHA-256",
      encoder.encode(secret)
    );

  return crypto.subtle.importKey(
    "raw",
    hash,
    {
      name: "AES-GCM"
    },
    false,
    [
      "encrypt",
      "decrypt"
    ]
  );
}


// =========================================
// BASE64 URL
// =========================================

function arrayBufferToBase64Url(
  buffer
) {
  const bytes =
    new Uint8Array(buffer);

  let binary = "";

  for (
    let i = 0;
    i < bytes.length;
    i++
  ) {
    binary += String.fromCharCode(
      bytes[i]
    );
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}


// =========================================
// BASE64 URL DECODE
// =========================================

function base64UrlToUint8Array(
  input
) {
  let base64 =
    input
      .replace(/-/g, "+")
      .replace(/_/g, "/");

  while (
    base64.length % 4
  ) {
    base64 += "=";
  }

  const binary =
    atob(base64);

  const bytes =
    new Uint8Array(
      binary.length
    );

  for (
    let i = 0;
    i < binary.length;
    i++
  ) {
    bytes[i] =
      binary.charCodeAt(i);
  }

  return bytes;
}


// =========================================
// TIMING SAFE EQUAL
// =========================================

function timingSafeEqual(
  a,
  b
) {
  if (
    typeof a !== "string" ||
    typeof b !== "string"
  ) {
    return false;
  }

  if (
    a.length !== b.length
  ) {
    return false;
  }

  let result = 0;

  for (
    let i = 0;
    i < a.length;
    i++
  ) {
    result |=
      a.charCodeAt(i) ^
      b.charCodeAt(i);
  }

  return result === 0;
}


// =========================================
// CORS
// =========================================

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods":
      "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization",
    "Access-Control-Expose-Headers":
      "Content-Length, Content-Type"
  };
}


// =========================================
// TEXT RESPONSE
// =========================================

function textResponse(
  text,
  status = 200
) {
  return new Response(
    text,
    {
      status,
      headers: {
        ...corsHeaders(),
        "Content-Type":
          "text/plain; charset=utf-8",
        "Cache-Control":
          "no-store"
      }
    }
  );
}


// =========================================
// JSON RESPONSE
// =========================================

function jsonResponse(
  data,
  status = 200
) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        ...corsHeaders(),
        "Content-Type":
          "application/json; charset=utf-8",
        "Cache-Control":
          "no-store"
      }
    }
  );
          }
