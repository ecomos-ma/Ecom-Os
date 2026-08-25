import { useState, useRef, useCallback } from 'react';
import { Upload, X, Loader2, Camera, User } from 'lucide-react';
import { Modal } from './Modal';
import { toast } from './Toast';
import { uploadAvatar, removeAvatar, getUserInitials } from '../services/avatarService';
import { useAuth } from '../hooks/useAuth';

interface ProfilePictureUploaderProps {
  currentAvatarUrl?: string | null;
  fullName?: string | null;
  onAvatarChange?: (newUrl: string | null) => void;
}

export function ProfilePictureUploader({ 
  currentAvatarUrl, 
  fullName,
  onAvatarChange 
}: ProfilePictureUploaderProps) {
  const { profile, workspace, refreshProfile } = useAuth();
  const [isUploading, setIsUploading] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback(async (file: File) => {
    if (!profile?.id || !workspace?.id) {
      toast.error('User or workspace not found');
      return;
    }

    setIsUploading(true);
    
    try {
      const result = await uploadAvatar(file, profile.id, workspace.id);
      
      if (result.success && result.avatarUrl) {
        toast.success('Profile picture updated successfully');
        onAvatarChange?.(result.avatarUrl);
        await refreshProfile();
      } else {
        toast.error(result.error || 'Failed to upload profile picture');
      }
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Failed to upload profile picture');
    } finally {
      setIsUploading(false);
    }
  }, [profile?.id, workspace?.id, onAvatarChange, refreshProfile]);

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
    // Reset input
    e.target.value = '';
  };

  const handleRemoveConfirm = async () => {
    if (!profile?.id || !workspace?.id) {
      toast.error('User or workspace not found');
      return;
    }

    setIsRemoving(true);
    setShowRemoveConfirm(false);
    
    try {
      const result = await removeAvatar(profile.id, workspace.id);
      
      if (result.success) {
        toast.success('Profile picture removed');
        onAvatarChange?.(null);
        await refreshProfile();
      } else {
        toast.error(result.error || 'Failed to remove profile picture');
      }
    } catch (error) {
      console.error('Remove error:', error);
      toast.error('Failed to remove profile picture');
    } finally {
      setIsRemoving(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const initials = getUserInitials(fullName);
  const hasAvatar = !!currentAvatarUrl;

  return (
    <>
      <div className="rounded-xl border border-base-border bg-base-surface p-6 shadow-card">
        <div className="flex items-center gap-2 mb-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-accent/15 text-brand-accent">
            <Camera size={15} />
          </div>
          <div className="text-[14px] font-semibold text-ink">Profile Picture</div>
        </div>

        <div className="flex flex-col items-center gap-4">
          {/* Avatar Display */}
          <div
            className={`relative group cursor-pointer transition-all duration-200 ${
              isDragging ? 'scale-105' : 'hover:scale-105'
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={hasAvatar ? undefined : handleUploadClick}
          >
            {/* Avatar Image or Initials */}
            <div
              className={`relative h-[120px] w-[120px] rounded-full overflow-hidden border-4 transition-all duration-200 ${
                isDragging
                  ? 'border-brand-accent shadow-lg shadow-brand-accent/30'
                  : 'border-brand-accent/50 shadow-md group-hover:border-brand-accent group-hover:shadow-lg group-hover:shadow-brand-accent/20'
              } ${isUploading ? 'opacity-50' : ''}`}
            >
              {currentAvatarUrl ? (
                <img
                  src={currentAvatarUrl}
                  alt="Profile"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-brand-accent/20 to-brand-accent/10">
                  <span className="text-4xl font-bold text-brand-accent">
                    {initials}
                  </span>
                </div>
              )}

              {/* Upload Overlay */}
              {!isUploading && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                  <div className="flex flex-col items-center gap-1 text-white">
                    <Upload size={24} />
                    <span className="text-xs font-medium">
                      {hasAvatar ? 'Change' : 'Upload'}
                    </span>
                  </div>
                </div>
              )}

              {/* Loading Spinner */}
              {isUploading && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                  <Loader2 size={32} className="animate-spin text-white" />
                </div>
              )}
            </div>

            {/* Drag Overlay */}
            {isDragging && (
              <div className="absolute inset-0 -m-2 rounded-full border-4 border-dashed border-brand-accent bg-brand-accent/10 flex items-center justify-center">
                <div className="text-center">
                  <Upload size={32} className="mx-auto mb-2 text-brand-accent" />
                  <span className="text-sm font-medium text-brand-accent">
                    Drop to upload
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap justify-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/webp"
              onChange={handleFileChange}
              className="hidden"
            />

            <button
              onClick={handleUploadClick}
              disabled={isUploading || isRemoving}
              className="flex items-center gap-2 rounded-lg bg-brand-accent px-4 py-2 text-sm font-medium text-white hover:bg-brand-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isUploading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload size={16} />
                  {hasAvatar ? 'Change Photo' : 'Upload Photo'}
                </>
              )}
            </button>

            {hasAvatar && (
              <button
                onClick={() => setShowRemoveConfirm(true)}
                disabled={isUploading || isRemoving}
                className="flex items-center gap-2 rounded-lg border border-base-border bg-base-surface px-4 py-2 text-sm font-medium text-ink hover:bg-base-raised disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isRemoving ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Removing...
                  </>
                ) : (
                  <>
                    <X size={16} />
                    Remove Photo
                  </>
                )}
              </button>
            )}
          </div>

          {/* File Requirements */}
          <div className="text-center">
            <p className="text-xs text-ink-muted">
              Supported: PNG, JPG, JPEG, WEBP
            </p>
            <p className="text-xs text-ink-muted">
              Maximum size: 5 MB • Recommended: 500 × 500 px
            </p>
          </div>
        </div>
      </div>

      {/* Remove Confirmation Modal */}
      {showRemoveConfirm && (
        <Modal
          title="Remove Profile Picture"
          onClose={() => setShowRemoveConfirm(false)}
        >
          <div className="flex flex-col gap-4">
            <p className="text-sm text-ink">
              Are you sure you want to remove your profile picture? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowRemoveConfirm(false)}
                className="rounded-lg border border-base-border bg-base-surface px-4 py-2 text-sm font-medium text-ink hover:bg-base-raised transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleRemoveConfirm}
                disabled={isRemoving}
                className="rounded-lg bg-danger px-4 py-2 text-sm font-medium text-white hover:bg-danger/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isRemoving ? (
                  <>
                    <Loader2 size={16} className="inline animate-spin mr-2" />
                    Removing...
                  </>
                ) : (
                  'Remove'
                )}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}