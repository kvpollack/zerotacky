// Sponsor logo in the public `sponsor-logos` bucket (supabase/046). Stored at <uid>/logo-<ts>.<ext>; policies let a
// user write only inside their own <uid>/ folder, so a meet member uploads under their own id and the path is saved on
// the meet. Same safe order as avatars: upload, then the caller saves the listing; a failed save removes the upload.
import type { SupabaseClient } from '@supabase/supabase-js';
import { SPONSOR_LOGO_BUCKET, sponsorLogoObjectPath, sponsorLogoProblem } from '@/lib/website/extras';

export async function uploadSponsorLogo(sb: SupabaseClient, file: File): Promise<string> {
  const problem = sponsorLogoProblem(file);
  if (problem) throw new Error(problem);
  const { data } = await sb.auth.getSession();
  const uid = data.session?.user.id;
  if (!uid) throw new Error('Sign in first.');
  const path = sponsorLogoObjectPath(uid, file.type);
  const { error } = await sb.storage.from(SPONSOR_LOGO_BUCKET).upload(path, file, { contentType: file.type, upsert: false, cacheControl: '31536000' });
  if (error) throw new Error(error.message);
  return path;
}

export async function removeSponsorLogoQuietly(sb: SupabaseClient, path: string): Promise<void> {
  if (!path) return;
  await sb.storage.from(SPONSOR_LOGO_BUCKET).remove([path]).catch(() => undefined);
}
