ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chat_messages_evolution_unique'
      AND conrelid = 'public.chat_messages'::regclass
  ) THEN
    ALTER TABLE public.chat_messages
      ADD CONSTRAINT chat_messages_evolution_unique
      UNIQUE (instance_name, evolution_message_id);
  END IF;
END $$;

DROP POLICY IF EXISTS "chat_messages_insert_by_instance_owner" ON public.chat_messages;
CREATE POLICY "chat_messages_insert_by_instance_owner"
  ON public.chat_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.whatsapp_instances wi
      WHERE wi.instance_name = chat_messages.instance_name
        AND wi.usuario_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "chat_messages_select_by_instance_owner" ON public.chat_messages;
CREATE POLICY "chat_messages_select_by_instance_owner"
  ON public.chat_messages
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.whatsapp_instances wi
      WHERE wi.instance_name = chat_messages.instance_name
        AND wi.usuario_id = auth.uid()
    )
  );
