-- Run once in the Supabase SQL editor for an existing installation.
-- Existing sessions retain Michael; new sessions can select Michael or Bella.
ALTER TABLE public.interview_sessions
ADD COLUMN IF NOT EXISTS interviewer TEXT NOT NULL DEFAULT 'male'
CHECK (interviewer IN ('male', 'female'));
