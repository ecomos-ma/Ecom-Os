begin;

-- Trigger functions are invoked by PostgreSQL through their triggers; browser
-- roles never need to call this SECURITY DEFINER function as an RPC.
revoke all on function public.block_impersonation_writes() from public, anon, authenticated;

commit;
