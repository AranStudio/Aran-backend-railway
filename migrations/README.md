# Database Migrations for Deck Loading Optimization

This folder contains SQL migrations to optimize deck loading performance and fix Story Engine categorization.

## Overview

The migrations address the following issues:
1. **Slow deck loading** - Fixed by not selecting `content` (heavy JSON) in list views
2. **Story Engine decks not showing** - Fixed by properly setting the `tool` column
3. **Missing indexes** - Added indexes for fast queries

## Migration Files

Run these in order in your Supabase SQL Editor:

### 1. `001_add_tool_column_and_indexes.sql`
Adds the necessary columns and indexes:
- `tool` column (story_engine | shot_list | canvas)
- `updated_at` column with auto-update trigger
- `story_type` column for fast filtering
- `thumbnail_url` column for list view previews
- Composite indexes for fast queries

### 2. `002_backfill_tool_values.sql`
Migrates existing decks to correct tool values:
- Sets NULL tools to 'story_engine'
- Detects Story Engine decks by content markers (storyProfile, critique, altConcepts)
- Detects Shot List decks by timecode fields (tcIn, tcOut)
- Detects Canvas decks by canvas/whiteboard data

### 3. `003_create_deck_list_view.sql` (Optional)
Creates helper views and functions:
- `deck_list` view (excludes heavy content column)
- `get_user_decks()` RPC function for paginated queries
- `get_user_deck_counts()` RPC function for tab badges

## How to Run

1. Open your Supabase project dashboard
2. Go to **SQL Editor**
3. Copy and paste each migration file in order
4. Run each migration and verify it completes successfully
5. Use the verification queries at the end of each file to confirm

## API Changes

After running migrations, the deck API supports:

### List Decks (Optimized)
```
GET /api/decks?tool=story_engine&limit=50&offset=0
```

Query parameters:
- `tool` - Filter by tool type: `story_engine`, `shot_list`, `canvas`
- `limit` - Max results (default: 100, max: 500)
- `offset` - Pagination offset (default: 0)

### Get Deck Counts
```
GET /api/decks/counts
```

Returns counts per tool type for tab badges:
```json
{
  "ok": true,
  "counts": {
    "story_engine": 42,
    "shot_list": 5,
    "canvas": 3
  }
}
```

### Update Deck Tool
```
PATCH /api/decks/:id/tool
Body: { "tool": "story_engine" }
```

Move a deck to a different category.

## Verification

After running migrations, verify with these queries:

```sql
-- Check column structure
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'decks'
ORDER BY ordinal_position;

-- Check tool distribution
SELECT tool, COUNT(*) as count 
FROM public.decks 
GROUP BY tool 
ORDER BY count DESC;

-- Check indexes exist
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'decks';
```

## Rollback

If you need to rollback:

```sql
-- Remove new columns (CAUTION: data will be lost)
ALTER TABLE public.decks DROP COLUMN IF EXISTS tool;
ALTER TABLE public.decks DROP COLUMN IF EXISTS updated_at;
ALTER TABLE public.decks DROP COLUMN IF EXISTS story_type;
ALTER TABLE public.decks DROP COLUMN IF EXISTS thumbnail_url;

-- Remove indexes
DROP INDEX IF EXISTS decks_user_id_idx;
DROP INDEX IF EXISTS decks_tool_idx;
DROP INDEX IF EXISTS decks_updated_at_desc_idx;
DROP INDEX IF EXISTS decks_user_tool_updated_idx;

-- Remove trigger
DROP TRIGGER IF EXISTS decks_updated_at_trigger ON public.decks;
DROP FUNCTION IF EXISTS update_decks_updated_at();

-- Remove view and functions
DROP VIEW IF EXISTS public.deck_list;
DROP FUNCTION IF EXISTS public.get_user_decks;
DROP FUNCTION IF EXISTS public.get_user_deck_counts;
```
