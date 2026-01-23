-- Migration 002: Backfill tool values for existing decks
-- Run this migration AFTER 001_add_tool_column_and_indexes.sql

-- =============================================================================
-- STEP 1: Set NULL tool values to default 'story_engine'
-- =============================================================================
UPDATE public.decks
SET tool = 'story_engine'
WHERE tool IS NULL;

-- =============================================================================
-- STEP 2: Detect Story Engine decks that may be incorrectly categorized
-- Story Engine decks typically have these markers in content:
-- - storyProfile (object)
-- - critique (object)
-- - altConcepts (array)
-- - beats (array with structured objects containing 'name', 'intent', 'beatText')
-- - toneImage (string - tone image URL)
-- =============================================================================

-- Fix decks with storyProfile (definite Story Engine indicator)
UPDATE public.decks
SET tool = 'story_engine'
WHERE tool != 'story_engine'
  AND (
    content ? 'storyProfile'
    OR content ? 'critique'
    OR content ? 'altConcepts'
  );

-- Fix decks with Story Engine beat structure (beats with 'name' field)
UPDATE public.decks
SET tool = 'story_engine'
WHERE tool != 'story_engine'
  AND content ? 'beats'
  AND jsonb_typeof(content->'beats') = 'array'
  AND jsonb_array_length(content->'beats') > 0
  AND (content->'beats'->0) ? 'name';

-- Fix decks with toneImage but no shots (likely Story Engine)
UPDATE public.decks
SET tool = 'story_engine'
WHERE tool != 'story_engine'
  AND content ? 'toneImage'
  AND content->>'toneImage' IS NOT NULL
  AND content->>'toneImage' != ''
  AND NOT (content ? 'shots' AND jsonb_array_length(COALESCE(content->'shots', '[]'::jsonb)) > 0);

-- =============================================================================
-- STEP 3: Detect Shot List decks
-- Shot List decks typically have:
-- - shots (array) without beats OR
-- - Large shots array with tcIn/tcOut timecodes
-- =============================================================================
UPDATE public.decks
SET tool = 'shot_list'
WHERE tool = 'story_engine'
  AND content ? 'shots'
  AND jsonb_typeof(content->'shots') = 'array'
  AND jsonb_array_length(content->'shots') > 0
  -- Has shots with timecodes (shot list specific)
  AND (content->'shots'->0) ? 'tcIn'
  -- No beats or empty beats (not a Story Engine deck)
  AND (
    NOT content ? 'beats'
    OR jsonb_array_length(COALESCE(content->'beats', '[]'::jsonb)) = 0
  );

-- =============================================================================
-- STEP 4: Detect Canvas/Whiteboard decks
-- Canvas decks typically have:
-- - canvasData (object)
-- - whiteboard (object)
-- - tool explicitly set to 'canvas' in content
-- =============================================================================
UPDATE public.decks
SET tool = 'canvas'
WHERE tool != 'canvas'
  AND (
    content ? 'canvasData'
    OR content ? 'whiteboard'
    OR content->>'tool' = 'canvas'
  );

-- =============================================================================
-- STEP 5: Extract content.tool value where present
-- If content has a tool field set, use it (unless already correctly set)
-- =============================================================================
UPDATE public.decks
SET tool = content->>'tool'
WHERE content ? 'tool'
  AND content->>'tool' IN ('story_engine', 'shot_list', 'canvas')
  AND tool IS DISTINCT FROM content->>'tool';

-- =============================================================================
-- STEP 6: Backfill updated_at from created_at where NULL
-- =============================================================================
UPDATE public.decks
SET updated_at = COALESCE(created_at, now())
WHERE updated_at IS NULL;

-- =============================================================================
-- STEP 7: Extract story_type for faster filtering (optional)
-- =============================================================================
UPDATE public.decks
SET story_type = content->>'contentType'
WHERE content ? 'contentType'
  AND content->>'contentType' IS NOT NULL
  AND content->>'contentType' != ''
  AND (story_type IS NULL OR story_type IS DISTINCT FROM content->>'contentType');

-- =============================================================================
-- VERIFICATION: Check tool distribution
-- =============================================================================
-- Run these queries to verify the backfill was successful:

-- SELECT tool, COUNT(*) as count 
-- FROM public.decks 
-- GROUP BY tool 
-- ORDER BY count DESC;

-- SELECT tool, story_type, COUNT(*) as count
-- FROM public.decks
-- GROUP BY tool, story_type
-- ORDER BY tool, count DESC;
