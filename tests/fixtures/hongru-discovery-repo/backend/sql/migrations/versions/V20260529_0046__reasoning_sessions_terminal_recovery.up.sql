ALTER TABLE public.reasoning_sessions
  ADD COLUMN IF NOT EXISTS terminal_recovery_state JSONB;
