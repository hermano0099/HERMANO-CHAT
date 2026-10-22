-- HERMANO MAP 0.2: collega un ristorante a un canale pubblico di HERMANO CHAT.
-- Da eseguire UNA SOLA VOLTA nel SQL Editor del tuo attuale progetto Supabase.
-- Non ricrea le tabelle e non modifica o cancella i ristoranti precedenti.
ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS channel_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS restaurants_channel_id_idx ON public.restaurants(channel_id);

-- RLS esistente rimane attiva. Solo il team può approvare le proposte.
