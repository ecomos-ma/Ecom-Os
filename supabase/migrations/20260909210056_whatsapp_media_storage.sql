-- Private workspace-scoped attachments for the WhatsApp inbox.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'whatsapp-media',
  'whatsapp-media',
  false,
  16777216,
  array[
    'image/jpeg','image/png','image/webp','image/gif',
    'application/pdf','application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/zip','text/plain'
  ]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists whatsapp_media_objects_read on storage.objects;
drop policy if exists whatsapp_media_objects_insert on storage.objects;
drop policy if exists whatsapp_media_objects_delete on storage.objects;

create policy whatsapp_media_objects_read
on storage.objects for select to authenticated
using (
  bucket_id = 'whatsapp-media'
  and case
    when ((storage.foldername(name))[1]) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then (select public.whatsapp_is_workspace_member(((storage.foldername(name))[1])::uuid))
    else false
  end
);

create policy whatsapp_media_objects_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'whatsapp-media'
  and case
    when ((storage.foldername(name))[1]) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then (select public.whatsapp_can_manage(((storage.foldername(name))[1])::uuid))
    else false
  end
  and owner_id = (select auth.uid())::text
);

create policy whatsapp_media_objects_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'whatsapp-media'
  and case
    when ((storage.foldername(name))[1]) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then (select public.whatsapp_can_manage(((storage.foldername(name))[1])::uuid))
    else false
  end
);
