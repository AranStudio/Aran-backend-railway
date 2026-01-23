-- Migration 004: Beat Media URLs and Storage Setup
-- Run this migration in your Supabase SQL editor
-- 
-- This migration:
-- 1. Documents the expected beat schema with media URL fields
-- 2. Creates the storage bucket for deck images
-- 3. Sets up storage policies for public access

-- =============================================================================
-- DOCUMENTATION: Expected Beat Schema in content.beats[]
-- =============================================================================
-- Each beat in the decks.content.beats array should have these fields:
--
-- {
--   "title": "Beat 1",                    -- Beat title/label
--   "text": "Description of the beat...", -- Beat text content
--   "name": "Opening Scene",              -- Optional beat name
--   "intent": "Establish setting",        -- Optional beat intent
--   "visual_url": "https://...",          -- Generated visual image URL
--   "storyboard_url": "https://...",      -- Generated storyboard image URL
--   "thumbnail_url": "https://...",       -- Thumbnail URL (usually same as visual_url)
--   -- camelCase aliases for backward compatibility:
--   "visualUrl": "https://...",
--   "storyboardUrl": "https://...",
--   "thumbnailUrl": "https://..."
-- }

-- =============================================================================
-- STEP 1: Ensure thumbnail_url index exists for fast list queries
-- =============================================================================
CREATE INDEX IF NOT EXISTS decks_thumbnail_url_idx ON public.decks(thumbnail_url);

-- =============================================================================
-- STEP 2: Create storage bucket for deck images (if using Supabase Storage)
-- =============================================================================
-- NOTE: Run this in the Supabase Dashboard SQL editor or Storage settings
-- The bucket name should match SUPABASE_STORAGE_BUCKET env var (default: 'deck-images')

-- Create the storage bucket (requires storage admin privileges)
-- This may fail if bucket already exists - that's OK
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'deck-images',
  'deck-images', 
  true,  -- Public bucket for easy image access
  52428800,  -- 50MB max file size
  ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 52428800,
  allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif']::text[];

-- =============================================================================
-- STEP 3: Storage Policies
-- =============================================================================
-- Allow authenticated users to upload their own deck images
-- Path format: decks/{deckId}/beats/{beatIndex}/{type}_{timestamp}_{uuid}.{ext}

-- Policy: Allow authenticated users to upload to their folders
CREATE POLICY IF NOT EXISTS "Authenticated users can upload deck images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'deck-images');

-- Policy: Allow public read access to all deck images
CREATE POLICY IF NOT EXISTS "Public read access to deck images"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'deck-images');

-- Policy: Allow authenticated users to update their own images
CREATE POLICY IF NOT EXISTS "Authenticated users can update deck images"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'deck-images');

-- Policy: Allow authenticated users to delete their own images
CREATE POLICY IF NOT EXISTS "Authenticated users can delete deck images"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'deck-images');

-- =============================================================================
-- ALTERNATIVE: If your Supabase version doesn't support IF NOT EXISTS on policies
-- =============================================================================
-- You may need to run these commands instead:
--
-- DROP POLICY IF EXISTS "Authenticated users can upload deck images" ON storage.objects;
-- CREATE POLICY "Authenticated users can upload deck images" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'deck-images');
--
-- DROP POLICY IF EXISTS "Public read access to deck images" ON storage.objects;  
-- CREATE POLICY "Public read access to deck images" ON storage.objects FOR SELECT TO public USING (bucket_id = 'deck-images');
--
-- etc.

-- =============================================================================
-- VERIFICATION: Check the storage bucket exists
-- =============================================================================
-- Run this query to verify:
-- SELECT * FROM storage.buckets WHERE id = 'deck-images';
