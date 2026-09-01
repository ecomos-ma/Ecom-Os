// Minimal application-facing database typing for legal workflows. The runtime
// schema remains authoritative; regenerate the full Supabase type file when the
// legal tables change.
type GenericRow = Record<string, any>;

export type Database = {
  public: {
    Tables: {
      data_deletion_requests: { Row: GenericRow };
      platform_legal_settings: { Row: GenericRow };
      refund_requests: { Row: GenericRow };
    };
  };
};
