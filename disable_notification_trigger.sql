-- Temporarily disable the notification trigger to isolate the issue
drop trigger if exists notification_membership_change on public.profile_workspaces;
