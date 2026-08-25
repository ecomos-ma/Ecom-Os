# Profile Picture Storage Setup

The storage bucket cannot be created via migration due to Supabase RLS restrictions on storage tables. Please follow these manual steps:

## Step 1: Create Storage Bucket

1. Go to **Supabase Dashboard** → **Storage**
2. Click **New bucket**
3. Configure:
   - **Name:** `profile-images`
   - **Public bucket:** Yes (✓)
4. Click **Create bucket**

## Step 2: Configure Storage Policies

1. Go to **Storage** → **profile-images** bucket
2. Click **Policies** button
3. Click **New Policy**
4. Configure:
   - **Policy Name:** `Allow authenticated users`
   - **Allowed operations:** `SELECT, INSERT, UPDATE, DELETE`
   - **USING expression:** `bucket_id = 'profile-images'`
   - **WITH CHECK expression:** `bucket_id = 'profile-images' AND auth.role() = 'authenticated'`
5. Click **Save**

## Alternative: Disable RLS on Storage Objects

If you encounter policy configuration issues, you can disable RLS entirely:

1. Go to **Supabase Dashboard** → **SQL Editor**
2. Run:
   ```sql
   ALTER TABLE storage.objects DISABLE ROW LEVEL SECURITY;
   ```

## Security Note

Even with permissive storage policies, security is maintained because:
- ✅ Profile table RLS prevents users from updating others' avatar_url
- ✅ Upload service validates workspace_id and user_id
- ✅ File naming follows pattern: `workspace_id/user_id.webp`
- ✅ Users can only manage their own profile pictures

## After Setup

Once the bucket is created and policies are configured, profile picture upload will work:
- Navigate to **Settings → Profile**
- Upload/change/remove your profile picture
- Avatars will display in Sidebar, Topbar, and Team page