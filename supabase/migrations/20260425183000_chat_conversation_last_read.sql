ALTER TABLE public.chat_conversation_settings
  ADD COLUMN IF NOT EXISTS last_read_at timestamptz;

CREATE INDEX IF NOT EXISTS chat_conversation_settings_last_read_idx
  ON public.chat_conversation_settings (instance_name, last_read_at DESC);
