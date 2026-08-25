# Call-recording retention deployment

The client and database changes retain call metadata permanently while deleting
only the linked object in the private `call-recordings` bucket after seven days.

After applying migration `111_performance_invitation_and_call_recording_retention.sql`:

1. Deploy `cleanup-expired-call-recordings` as a Supabase Edge Function.
2. Set its `CALL_RECORDING_CLEANUP_SECRET` Edge Function secret to a long random value.
3. Configure one Supabase Cron job to send a `POST` request to the function every six hours with the `x-call-recording-cleanup-secret` header set to that secret.

The function processes up to 100 expired recording rows per run, retries a
temporary Storage failure on the next run, and updates `expired_at` only after
the object is gone. It does not delete orders, customers, call metadata, or any
other Storage bucket objects.
