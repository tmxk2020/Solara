/**
 * 收藏列表云端存储端点
 * 
 * GET /starlist.txt - 获取收藏列表（纯文本格式）
 * GET /starlist.txt?format=json - 获取收藏列表（JSON格式）
 * POST /starlist.txt - 添加歌曲到收藏
 * DELETE /starlist.txt - 移除收藏歌曲
 * PUT /starlist.txt - 替换整个收藏列表
 */

const JSON_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,DELETE,PUT,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
};

const TEXT_HEADERS = {
  "Content-Type": "text/plain; charset=utf-8",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,DELETE,PUT,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Cache-Control": "no-cache, no-store, must-revalidate",
};

const FAVORITES_KEY = "favorites_songs";

// 环境变量类型
interface Env {
  SOLARA_STORAGE?: {
    get(key: string, type?: "text" | "json" | "arrayBuffer" | "stream"): Promise<string | null>;
    put(key: string, value: string | ReadableStream | ArrayBuffer | FormData): Promise<void>;
    delete(key: string): Promise<void>;
    list(options?: { prefix?: string; limit?: number; cursor?: string }): Promise<{ keys: { name: string }[]; list_complete: boolean; cursor?: string }>;
  };
}

function textResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: TEXT_HEADERS,
  });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: JSON_HEADERS,
  });
}

function formatFavoritesAsText(songs: Song[]): string {
  if (!songs || songs.length === 0) {
    return "=== Solara 收藏列表 ===\n\n暂无收藏歌曲\n";
  }

  const header = "=== Solara 收藏列表 ===\n";
  const date = `更新时间: ${new Date().toISOString()}\n`;
  const count = `收藏数量: ${songs.length} 首\n`;
  const separator = "========================\n\n";

  const songList = songs
    .map((song, index) => {
      const num = String(index + 1).padStart(3, " ");
      const name = song.name || "未知歌曲";
      const artist = song.artist || "未知艺术家";
      const album = song.album ? ` - ${song.album}` : "";
      const source = song.source ? ` [${song.source}]` : "";
      return `${num}. ${name} - ${artist}${album}${source}`;
    })
    .join("\n");

  return `${header}${date}${count}${separator}${songList}\n`;
}

interface Song {
  id: string | number;
  name: string;
  artist: string;
  album?: string;
  source: string;
  pic_id?: string;
  url_id?: string;
  lyric_id?: string;
}

interface RequestBody {
  song?: Song;
  songs?: Song[];
  songId?: string | number;
  source?: string;
}

// GET 处理 - 读取收藏列表
async function handleGet(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const format = url.searchParams.get("format") || "text";

  const storage = env.SOLARA_STORAGE;
  if (!storage) {
    if (format === "json") {
      return jsonResponse(
        { error: "Storage not configured", songs: [], message: "请配置 SOLARA_STORAGE KV 命名空间" },
        503
      );
    }
    return textResponse(
      "=== Solara 收藏列表 ===\n\n存储未配置\n请在 Cloudflare Pages 中配置 SOLARA_STORAGE KV 绑定\n",
      503
    );
  }

  try {
    const stored = await storage.get(FAVORITES_KEY, "text");
    const songs: Song[] = stored ? JSON.parse(stored) : [];

    if (format === "json") {
      return jsonResponse({ success: true, songs, count: songs.length });
    }

    return textResponse(formatFavoritesAsText(songs));
  } catch (error) {
    console.error("读取收藏列表失败:", error);
    const errorBody = { error: "Failed to read favorites", details: String(error) };
    return format === "json" ? jsonResponse(errorBody, 500) : textResponse("读取收藏列表失败\n", 500);
  }
}

// POST 处理 - 添加歌曲到收藏
async function handlePost(request: Request, env: Env): Promise<Response> {
  const storage = env.SOLARA_STORAGE;
  if (!storage) {
    return jsonResponse({ error: "Storage not configured" }, 503);
  }

  try {
    const body = (await request.json().catch(() => ({}))) as RequestBody;

    // 支持单个或多个添加
    const newSongs: Song[] = [];
    if (body.song) {
      newSongs.push(body.song);
    } else if (body.songs && Array.isArray(body.songs)) {
      newSongs.push(...body.songs);
    }

    if (newSongs.length === 0) {
      return jsonResponse({ error: "No songs provided" }, 400);
    }

    // 读取现有收藏
    const stored = await storage.get(FAVORITES_KEY, "text");
    const existingSongs: Song[] = stored ? JSON.parse(stored) : [];

    // 创建去重集合
    const existingIds = new Set(
      existingSongs.map((s) => `${s.source}:${s.id}`)
    );

    // 添加新歌曲（去重）
    let addedCount = 0;
    for (const song of newSongs) {
      const key = `${song.source}:${song.id}`;
      if (!existingIds.has(key)) {
        existingSongs.push(song);
        existingIds.add(key);
        addedCount++;
      }
    }

    // 保存更新后的收藏
    await storage.put(FAVORITES_KEY, JSON.stringify(existingSongs));

    return jsonResponse({
      success: true,
      added: addedCount,
      total: existingSongs.length,
      message: `成功添加 ${addedCount} 首歌曲`,
    });
  } catch (error) {
    console.error("添加收藏失败:", error);
    return jsonResponse({ error: "Failed to add favorites", details: String(error) }, 500);
  }
}

// DELETE 处理 - 移除收藏歌曲
async function handleDelete(request: Request, env: Env): Promise<Response> {
  const storage = env.SOLARA_STORAGE;
  if (!storage) {
    return jsonResponse({ error: "Storage not configured" }, 503);
  }

  try {
    const body = (await request.json().catch(() => ({}))) as RequestBody;
    const { songId, source } = body;

    if (!songId || !source) {
      return jsonResponse({ error: "songId and source are required" }, 400);
    }

    // 读取现有收藏
    const stored = await storage.get(FAVORITES_KEY, "text");
    const existingSongs: Song[] = stored ? JSON.parse(stored) : [];

    // 过滤掉要删除的歌曲
    const deleteKey = `${source}:${songId}`;
    const filteredSongs = existingSongs.filter(
      (s) => `${s.source}:${s.id}` !== deleteKey
    );

    if (filteredSongs.length === existingSongs.length) {
      return jsonResponse({
        success: false,
        message: "歌曲未在收藏中找到",
      });
    }

    // 保存更新后的收藏
    await storage.put(FAVORITES_KEY, JSON.stringify(filteredSongs));

    return jsonResponse({
      success: true,
      removed: 1,
      total: filteredSongs.length,
      message: "成功移除收藏",
    });
  } catch (error) {
    console.error("移除收藏失败:", error);
    return jsonResponse({ error: "Failed to remove favorite", details: String(error) }, 500);
  }
}

// PUT 处理 - 替换整个收藏列表
async function handlePut(request: Request, env: Env): Promise<Response> {
  const storage = env.SOLARA_STORAGE;
  if (!storage) {
    return jsonResponse({ error: "Storage not configured" }, 503);
  }

  try {
    const body = (await request.json().catch(() => ({}))) as RequestBody;

    if (!Array.isArray(body.songs)) {
      return jsonResponse({ error: "songs array is required" }, 400);
    }

    await storage.put(FAVORITES_KEY, JSON.stringify(body.songs));

    return jsonResponse({
      success: true,
      total: body.songs.length,
      message: "收藏列表已更新",
    });
  } catch (error) {
    console.error("更新收藏列表失败:", error);
    return jsonResponse({ error: "Failed to update favorites", details: String(error) }, 500);
  }
}

// 主请求处理器
export async function onRequest(context: {
  request: Request;
  env: Env;
}): Promise<Response> {
  const { request, env } = context;
  const method = request.method.toUpperCase();

  // 处理 CORS 预检
  if (method === "OPTIONS") {
    return new Response(null, { status: 204, headers: JSON_HEADERS });
  }

  // 路由到对应的处理方法
  switch (method) {
    case "GET":
      return handleGet(request, env);
    case "POST":
      return handlePost(request, env);
    case "DELETE":
      return handleDelete(request, env);
    case "PUT":
      return handlePut(request, env);
    default:
      return jsonResponse({ error: "Method not allowed" }, 405);
  }
}