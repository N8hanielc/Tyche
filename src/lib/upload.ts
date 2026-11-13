import { supabase } from "@/lib/supabase";

/**
 * Moves an in-memory image (data URL from the camera roll) into Supabase
 * Storage and returns its public URL. Anything that isn't a data URL (already
 * uploaded, or offline demo mode) is returned unchanged.
 */
export async function uploadImage(image: string | undefined, kind: "avatar" | "challenge" | "chat" | "evidence"): Promise<string | undefined> {
  if (!image || !image.startsWith("data:") || !supabase) return image;
  const { data: auth } = await supabase.auth.getSession();
  const userId = auth.session?.user.id;
  if (!userId) return image;
  const match = /^data:([^;]+);base64,(.*)$/.exec(image);
  if (!match) return image;
  const [, type, b64] = match;
  const bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
  const ext = type.split("/")[1]?.replace("jpeg", "jpg") || "jpg";
  const path = `${userId}/${kind}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("media").upload(path, new Blob([bytes], { type }), { contentType: type, cacheControl: "31536000", upsert: false });
  if (error) {
    // Storage not set up yet (storage.sql not run) — fall back to storing the image inline.
    console.warn("Tyche: photo upload failed, storing inline", error.message);
    return image;
  }
  return supabase.storage.from("media").getPublicUrl(path).data.publicUrl;
}
