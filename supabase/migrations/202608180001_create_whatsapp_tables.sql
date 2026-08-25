-- MIGRATION: 202608180001_create_whatsapp_tables

-- Table: whatsapp_settings
create table if not exists public.whatsapp_settings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null unique references workspaces(id) on delete cascade,
  
  enabled boolean not null default false,
  connection_status text not null default 'disconnected' check (connection_status in ('disconnected','initializing','qr_required','authenticated','ready','reconnecting','error')),
  connected_phone text,
  
  auto_order_confirmation boolean not null default false,
  send_delay_minutes integer not null default 0,
  
  allow_confirm boolean not null default true,
  allow_modify boolean not null default true,
  allow_cancel boolean not null default true,
  
  confirmation_message text not null default 'السلام عليكم {{customer_name}} 👋

توصلنا بالطلب ديالك رقم {{order_number}} ✅

🛍 {{product_summary}}
💰 المجموع: {{total}} DH
📍 {{city}}

المرجو تأكيد الطلب:

1️⃣ تأكيد الطلب
2️⃣ تعديل الطلب
3️⃣ إلغاء الطلب

جاوب غير بالرقم 1 أو 2 أو 3.',
  
  confirmed_message text not null default 'شكراً ✅

تم تأكيد الطلب ديالك بنجاح.
غادي يتم تحضيرو للتوصيل.',
  
  modification_message text not null default 'أكيد 👍

كتب لينا شنو بغيتي تبدل فالطلب،
وغادي يتاصل بك أحد أعضاء الفريق.',
  
  cancelled_message text not null default 'تم إلغاء الطلب ❌

شكراً على تواصلك معنا.',

  last_connected_at timestamptz,
  last_disconnected_at timestamptz,
  last_error text,
  
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Table: whatsapp_queue
create table if not exists public.whatsapp_queue (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  order_id uuid not null references orders(id) on delete cascade,
  
  phone text not null,
  message_type text not null check (message_type in ('confirmation', 'status_update', 'custom')),
  
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'failed', 'cancelled')),
  
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  
  scheduled_for timestamptz not null default now(),
  processing_at timestamptz,
  sent_at timestamptz,
  failed_at timestamptz,
  
  wa_message_id text,
  last_error text,
  
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  
  constraint unique_workspace_order_type unique (workspace_id, order_id, message_type)
);

-- Table: whatsapp_messages
create table if not exists public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  order_id uuid references orders(id) on delete set null,
  customer_id uuid references customers(id) on delete set null,
  
  phone text not null,
  direction text not null check (direction in ('inbound', 'outbound')),
  message_type text,
  
  body text,
  wa_message_id text,
  status text check (status in ('sent', 'delivered', 'read', 'failed', 'received')),
  
  created_at timestamptz not null default now()
);

-- Indexes for fast queue and message queries
create index if not exists idx_wa_queue_status on public.whatsapp_queue(status, scheduled_for) where status in ('pending', 'processing');
create index if not exists idx_wa_queue_workspace on public.whatsapp_queue(workspace_id);
create index if not exists idx_wa_messages_workspace_order on public.whatsapp_messages(workspace_id, order_id);
