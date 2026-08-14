import "server-only";

const GRAPH_VERSION = process.env.META_GRAPH_API_VERSION ?? "v26.0";

export type FacebookReelInput = {
  fileUrl: string;
  description: string;
  title: string;
};

export type FacebookReelFileInput = {
  data: Uint8Array;
  description: string;
  title: string;
};

type GraphJson = Record<string, unknown>;

async function readJson(response: Response, step: string): Promise<GraphJson> {
  const body = (await response.json().catch(() => ({}))) as GraphJson;
  if (!response.ok) {
    throw new Error(
      `Meta ${step} falló (${response.status}): ${JSON.stringify(body)}`,
    );
  }
  return body;
}

function requiredString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Meta no devolvió ${name}`);
  }
  return value;
}

export async function publishFacebookReel(
  input: FacebookReelInput,
): Promise<{ videoId: string; result: GraphJson }> {
  const token = process.env.META_PAGE_ACCESS_TOKEN;
  if (!token) throw new Error("Falta META_PAGE_ACCESS_TOKEN");

  const start = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/me/video_reels`);
  start.searchParams.set("access_token", token);
  start.searchParams.set("upload_phase", "start");
  const startBody = await readJson(
    await fetch(start, { method: "POST", cache: "no-store" }),
    "inicio de subida",
  );
  const videoId = requiredString(startBody.video_id, "video_id");
  const uploadUrl = requiredString(startBody.upload_url, "upload_url");

  const upload = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      Authorization: `OAuth ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ file_url: input.fileUrl }),
    cache: "no-store",
  });
  await readJson(upload, "subida del video");

  const finish = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/me/video_reels`);
  finish.searchParams.set("access_token", token);
  finish.searchParams.set("video_id", videoId);
  finish.searchParams.set("upload_phase", "finish");
  finish.searchParams.set("video_state", "PUBLISHED");
  finish.searchParams.set("title", input.title);
  finish.searchParams.set("description", input.description);
  const result = await readJson(
    await fetch(finish, { method: "POST", cache: "no-store" }),
    "publicación del reel",
  );

  return { videoId, result };
}

export async function publishFacebookReelFile(
  input: FacebookReelFileInput,
): Promise<{ videoId: string; result: GraphJson }> {
  const token = process.env.META_PAGE_ACCESS_TOKEN;
  if (!token) throw new Error("Falta META_PAGE_ACCESS_TOKEN");

  const start = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/me/video_reels`);
  start.searchParams.set("access_token", token);
  start.searchParams.set("upload_phase", "start");
  const startBody = await readJson(
    await fetch(start, { method: "POST", cache: "no-store" }),
    "inicio de subida",
  );
  const videoId = requiredString(startBody.video_id, "video_id");
  const uploadUrl = requiredString(startBody.upload_url, "upload_url");

  const upload = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      Authorization: `OAuth ${token}`,
      offset: "0",
      file_size: String(input.data.byteLength),
      "Content-Type": "application/octet-stream",
    },
    body: input.data,
    cache: "no-store",
  });
  await readJson(upload, "subida del video");

  const finish = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/me/video_reels`);
  finish.searchParams.set("access_token", token);
  finish.searchParams.set("video_id", videoId);
  finish.searchParams.set("upload_phase", "finish");
  finish.searchParams.set("video_state", "PUBLISHED");
  finish.searchParams.set("title", input.title);
  finish.searchParams.set("description", input.description);
  const result = await readJson(
    await fetch(finish, { method: "POST", cache: "no-store" }),
    "publicación del reel",
  );

  return { videoId, result };
}
