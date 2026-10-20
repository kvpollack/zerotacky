// Profile photo in the public `avatars` bucket (supabase/013_profile_fields.sql). One file per account at
// <uid>/avatar-<ts>.<ext>; a new upload gets a new name so caches never show the old photo, then the old
// object is removed. Policies let a user write only inside their own <uid>/ folder.
import type { SupabaseClient } from '@supabase/supabase-js';

export const AVATAR_BUCKET = 'avatars';
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

export function avatarExt(mime: string): string | null {
  return EXT[mime.toLowerCase()] ?? null;
}

// Why a file cannot be used, or null when it is fine. Mirrors the bucket limits so the user hears it before the upload.
export function avatarProblem(file: { type: string; size: number }): string | null {
  if (!avatarExt(file.type)) return 'Use a JPG, PNG, or WebP photo.';
  if (file.size > AVATAR_MAX_BYTES) return 'Photos need to be under 2 MB.';
  return null;
}

export function avatarObjectPath(userId: string, mime: string, now = Date.now()): string {
  return `${userId}/avatar-${now}.${avatarExt(mime) ?? 'jpg'}`;
}

export function avatarPublicUrl(sb: SupabaseClient, path: string): string {
  if (!path) return '';
  return sb.storage.from(AVATAR_BUCKET).getPublicUrl(path).data.publicUrl;
}

// Upload the new file only; the caller saves the path, then calls finishAvatarReplace. Order matters (Astra P-H1):
// upload new -> save new path -> best-effort remove old. If the save fails, the old photo stays valid and the
// orphaned new upload is removed best effort, so no state ever points at a deleted object.
export async function uploadAvatar(sb: SupabaseClient, userId: string, file: File): Promise<string> {
  const problem = avatarProblem(file);
  if (problem) throw new Error(problem);
  const path = avatarObjectPath(userId, file.type);
  const { error } = await sb.storage.from(AVATAR_BUCKET).upload(path, file, { contentType: file.type, upsert: false, cacheControl: '31536000' });
  if (error) throw new Error(error.message);
  return path;
}

// Best effort: a leftover object costs a few hundred KB, a thrown error here would cost the user their photo.
export async function removeAvatarQuietly(sb: SupabaseClient, path: string): Promise<void> {
  if (!path) return;
  await sb.storage.from(AVATAR_BUCKET).remove([path]).catch(() => undefined);
}

// Full replace with the safe order. `savePath` is the profile write; it throws on failure.
export async function replaceAvatar(
  sb: SupabaseClient,
  userId: string,
  file: File,
  previousPath: string,
  savePath: (path: string) => Promise<void>,
): Promise<string> {
  const path = await uploadAvatar(sb, userId, file);
  try {
    await savePath(path);
  } catch (e) {
    await removeAvatarQuietly(sb, path);
    throw e;
  }
  if (previousPath && previousPath !== path) await removeAvatarQuietly(sb, previousPath);
  return path;
}

export async function removeAvatar(sb: SupabaseClient, path: string): Promise<void> {
  if (!path) return;
  const { error } = await sb.storage.from(AVATAR_BUCKET).remove([path]);
  if (error) throw new Error(error.message);
}
