SELECT proname, pg_get_function_identity_arguments(oid) as args
FROM pg_proc
WHERE proname = 'get_effective_subscription_v1'
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');
