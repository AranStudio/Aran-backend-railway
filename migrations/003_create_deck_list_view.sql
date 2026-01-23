-- Migration 003: Create lightweight view for deck listing
-- This view excludes the heavy 'content' column for fast list queries
-- Run this migration AFTER 001 and 002

-- =============================================================================
-- STEP 1: Create the deck_list view (excludes content/deck_json)
-- =============================================================================
CREATE OR REPLACE VIEW public.deck_list AS
SELECT
    id,
    user_id,
    title,
    tool,
    story_type,
    created_at,
    updated_at,
    thumbnail_url,
    export_pdf_url,
    prompt,
    -- Extract shareCode from content for sharing URLs (lightweight)
    content->>'shareCode' AS share_code,
    -- Extract shared status
    COALESCE((content->>'shared')::boolean, false) AS shared
FROM public.decks;

-- Add comment to document the view
COMMENT ON VIEW public.deck_list IS 
'Lightweight view of decks for list queries. Excludes heavy content column.';

-- =============================================================================
-- STEP 2: Create RPC function for paginated deck listing (optional but recommended)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.get_user_decks(
    p_user_id uuid,
    p_tool text DEFAULT NULL,
    p_limit int DEFAULT 50,
    p_offset int DEFAULT 0
)
RETURNS TABLE (
    id uuid,
    title text,
    tool text,
    story_type text,
    created_at timestamptz,
    updated_at timestamptz,
    thumbnail_url text,
    export_pdf_url text,
    prompt text,
    share_code text,
    shared boolean
) 
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT
        d.id,
        d.title,
        d.tool,
        d.story_type,
        d.created_at,
        d.updated_at,
        d.thumbnail_url,
        d.export_pdf_url,
        d.prompt,
        d.content->>'shareCode' AS share_code,
        COALESCE((d.content->>'shared')::boolean, false) AS shared
    FROM public.decks d
    WHERE d.user_id = p_user_id
      AND (p_tool IS NULL OR d.tool = p_tool)
    ORDER BY d.updated_at DESC NULLS LAST, d.created_at DESC
    LIMIT p_limit
    OFFSET p_offset;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_user_decks TO authenticated;

-- =============================================================================
-- STEP 3: Create function to get deck count by tool (for tabs)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.get_user_deck_counts(p_user_id uuid)
RETURNS TABLE (
    tool text,
    count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT 
        d.tool,
        COUNT(*)::bigint as count
    FROM public.decks d
    WHERE d.user_id = p_user_id
    GROUP BY d.tool;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_user_deck_counts TO authenticated;

-- =============================================================================
-- USAGE EXAMPLES:
-- =============================================================================
-- List all decks for a user (using view):
-- SELECT * FROM deck_list WHERE user_id = 'uuid-here' ORDER BY updated_at DESC LIMIT 50;

-- List Story Engine decks only:
-- SELECT * FROM deck_list WHERE user_id = 'uuid-here' AND tool = 'story_engine' ORDER BY updated_at DESC;

-- Use RPC function (recommended for production):
-- SELECT * FROM get_user_decks('uuid-here', 'story_engine', 50, 0);

-- Get deck counts per tool (for tab badges):
-- SELECT * FROM get_user_deck_counts('uuid-here');
