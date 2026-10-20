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

// Upload, then drop the previous object. Returns the new path for the profile row. Removing the old file is
// best effort: a leftover costs a few hundred KB, a failed upload would cost the user their photo.
export async function uploadAvatar(sb: SupabaseClient, userId: string, file: File, previousPath: string): Promise<string> {
  const problem = avatarProblem(file);
  if (problem) throw new Error(problem);
  const path = avatarObjectPath(userId, file.type);
  const { error } = await sb.storage.from(AVATAR_BUCKET).upload(path, file, { contentType: file.type, upsert: false, cacheControl: '31536000' });
  if (error) throw new Error(error.message);
  if (previousPath && previousPath !== path) await sb.storage.from(AVATAR_BUCKET).remove([previousPath]).catch(() => undefined);
  return path;
}

export async function removeAvatar(sb: SupabaseClient, path: string): Promise<void> {
  if (!path) return;
  const { error } = await sb.storage.from(AVATAR_BUCKET).remove([path]);
  if (error) throw new Error(error.message);
}
