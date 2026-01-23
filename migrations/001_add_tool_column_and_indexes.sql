-- Migration 001: Add tool column and indexes for fast deck loading
-- Run this migration in your Supabase SQL editor

-- =============================================================================
-- STEP 1: Add 'tool' column if it doesn't exist
-- =============================================================================
-- This column categorizes decks by their creator: story_engine, shot_list, canvas
ALTER TABLE public.decks
ADD COLUMN IF NOT EXISTS tool text DEFAULT 'story_engine';

-- Add check constraint to ensure valid tool values
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'decks_tool_check' AND conrelid = 'public.decks'::regclass
    ) THEN
        ALTER TABLE public.decks
        ADD CONSTRAINT decks_tool_check 
        CHECK (tool IN ('story_engine', 'shot_list', 'canvas'));
    END IF;
END $$;

-- =============================================================================
-- STEP 2: Add 'updated_at' column if it doesn't exist
-- =============================================================================
ALTER TABLE public.decks
ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- =============================================================================
-- STEP 3: Create indexes for fast list queries
-- =============================================================================
-- Index on user_id for ownership filtering
CREATE INDEX IF NOT EXISTS decks_user_id_idx ON public.decks(user_id);

-- Index on tool for filtering by deck type
CREATE INDEX IF NOT EXISTS decks_tool_idx ON public.decks(tool);

-- Index on updated_at for sorting (descending)
CREATE INDEX IF NOT EXISTS decks_updated_at_desc_idx ON public.decks(updated_at DESC);

-- Composite index for the most common query pattern:
-- SELECT ... FROM decks WHERE user_id = ? AND tool = ? ORDER BY updated_at DESC
CREATE INDEX IF NOT EXISTS decks_user_tool_updated_idx 
ON public.decks(user_id, tool, updated_at DESC);

-- =============================================================================
-- STEP 4: Create trigger to auto-update 'updated_at' on changes
-- =============================================================================
CREATE OR REPLACE FUNCTION update_decks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists and recreate
DROP TRIGGER IF EXISTS decks_updated_at_trigger ON public.decks;

CREATE TRIGGER decks_updated_at_trigger
BEFORE UPDATE ON public.decks
FOR EACH ROW
EXECUTE FUNCTION update_decks_updated_at();

-- =============================================================================
-- STEP 5: Add optional columns for lightweight list views
-- =============================================================================
-- Thumbnail URL for list view previews (optional, can be populated later)
ALTER TABLE public.decks
ADD COLUMN IF NOT EXISTS thumbnail_url text;

-- Story type for filtering (extracted from content for fast access)
ALTER TABLE public.decks
ADD COLUMN IF NOT EXISTS story_type text;

-- =============================================================================
-- VERIFICATION: Check the schema
-- =============================================================================
-- Run this query to verify the migration was successful:
-- SELECT column_name, data_type, is_nullable, column_default
-- FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'decks'
-- ORDER BY ordinal_position;
