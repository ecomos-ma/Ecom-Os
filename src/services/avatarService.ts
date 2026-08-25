import { supabase } from '../lib/supabase';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const TARGET_IMAGE_DIMENSION = 500; // Target max width/height (500x500 px)
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];

export interface AvatarUploadResult {
  success: boolean;
  avatarUrl?: string;
  error?: string;
}

/**
 * Validate image file
 */
export function validateImageFile(file: File): { valid: boolean; error?: string } {
  // Check file type
  if (!ALLOWED_TYPES.includes(file.type.toLowerCase())) {
    return {
      valid: false,
      error: 'Invalid file type. Please upload PNG, JPG, JPEG, or WEBP images.'
    };
  }

  // Check file size (5MB max)
  if (file.size > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: 'Image size must be less than 5 MB.'
    };
  }

  return { valid: true };
}

/**
 * Compress and resize image to max 500x500px aspect-ratio scaled WebP
 */
export async function compressImage(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    img.onload = () => {
      let width = img.width;
      let height = img.height;

      // Resize if larger than target dimension (500px)
      if (width > TARGET_IMAGE_DIMENSION || height > TARGET_IMAGE_DIMENSION) {
        const ratio = Math.min(TARGET_IMAGE_DIMENSION / width, TARGET_IMAGE_DIMENSION / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      canvas.width = width;
      canvas.height = height;

      if (ctx) {
        ctx.drawImage(img, 0, 0, width, height);

        // Convert to WebP with 0.82 quality for low size
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('Failed to compress image'));
            }
          },
          'image/webp',
          0.82
        );
      } else {
        reject(new Error('Failed to get canvas context'));
      }
    };

    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = URL.createObjectURL(file);
  });
}

/**
 * Upload avatar to Supabase Storage and update profile
 */
export async function uploadAvatar(
  file: File,
  userId: string,
  workspaceId: string
): Promise<AvatarUploadResult> {
  try {
    // 1. Validate file
    const validation = validateImageFile(file);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    // 2. Compress & resize image
    let compressedBlob: Blob;
    try {
      compressedBlob = await compressImage(file);
    } catch {
      compressedBlob = file;
    }

    const compressedFile = new File([compressedBlob], `${userId}.webp`, {
      type: 'image/webp'
    });

    // 3. Upload to Supabase Storage with bucket fallbacks
    const filePath = `${workspaceId}/${userId}-${Date.now()}.webp`;
    let avatarUrl: string | null = null;
    let lastError: string | null = null;

    const buckets = ['profile-pictures', 'avatars', 'product-images'];

    for (const bucket of buckets) {
      try {
        const { error: uploadError } = await supabase.storage
          .from(bucket)
          .upload(filePath, compressedFile, {
            upsert: true,
            contentType: 'image/webp'
          });

        if (!uploadError) {
          const { data: publicUrlData } = supabase.storage
            .from(bucket)
            .getPublicUrl(filePath);
          avatarUrl = publicUrlData?.publicUrl || null;
          if (avatarUrl) break;
        } else {
          lastError = uploadError.message;
        }
      } catch (err: any) {
        lastError = err.message;
      }
    }

    if (!avatarUrl) {
      return {
        success: false,
        error: lastError || 'Failed to upload image to Supabase Storage.'
      };
    }

    // 4. Update profiles table directly
    const { error: profileError } = await supabase
      .from('profiles')
      .update({ avatar_url: avatarUrl })
      .eq('id', userId);

    if (profileError) {
      console.warn('Profile table update notice:', profileError.message);
    }

    // 5. Secondary attempt via Edge Function (non-blocking)
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = (sessionData as any)?.data?.session?.access_token || null;

      await supabase.functions.invoke('update-avatar', {
        body: { user_id: userId, avatar_url: avatarUrl, workspace_id: workspaceId },
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined
      });
    } catch {
      // Ignored if function not deployed
    }

    return { success: true, avatarUrl };
  } catch (error) {
    console.error('Avatar upload error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to upload profile picture'
    };
  }
}

/**
 * Remove avatar from profile
 */
export async function removeAvatar(
  userId: string,
  workspaceId: string
): Promise<AvatarUploadResult> {
  try {
    // 1. Update profiles table to clear avatar_url
    const { error: profileError } = await supabase
      .from('profiles')
      .update({ avatar_url: null })
      .eq('id', userId);

    if (profileError) {
      console.warn('Profile table remove notice:', profileError.message);
    }

    // 2. Secondary attempt via Edge Function (non-blocking)
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = (sessionData as any)?.data?.session?.access_token || null;

      await supabase.functions.invoke('update-avatar', {
        body: { user_id: userId, avatar_url: null, workspace_id: workspaceId },
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined
      });
    } catch {
      // Ignored if function not deployed
    }

    return { success: true };
  } catch (error) {
    console.error('Avatar removal error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to remove avatar'
    };
  }
}

/**
 * Get user initials for fallback avatar
 */
export function getUserInitials(fullName?: string | null): string {
  if (!fullName) return '?';

  const parts = fullName.trim().split(' ');
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();

  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}