# Search Feature Implementation Plan

**Feature:** Universal search for videos and channels with autocomplete  
**Date:** 2025-01-11  
**Status:** Planning

---

## Overview

Implement YouTube-like search functionality with two main components:
1. **Autocomplete/Instant Search** - Dropdown with mixed video and channel results
2. **Dedicated Search Page** - Full results with separate sections for channels and videos

## User Experience Flow

### 1. Search Autocomplete (Global Header)
```
┌─────────────────────────────────────────────────────┐
│ [🔍] Search videos and channels...            [×]   │
├─────────────────────────────────────────────────────┤
│ 🔍 CHANNELS                                         │
│ 👤 gabi belle                              5 videos │
│ 👤 Danny Gonzalez                         12 videos │
│                                                     │
│ 🔍 VIDEOS                                          │
│ 📺 Forgotten Online Games                          │
│     gabi belle • 2024-10-28 • 15:32               │
│ 📺 I Tried Every Weird Mobile Game Ad              │
│     Danny Gonzalez • 2024-09-15 • 18:45           │
└─────────────────────────────────────────────────────┘
```

**Behavior:**
- Shows results on 2+ characters typed
- Max 3 channels + 5 videos in dropdown
- Click channel → go to channel page
- Click video → go to video page
- Enter key → go to search results page

### 2. Search Results Page (`/search?q=query`)
```
┌─────────────────────────────────────────────────────┐
│ Search results for "gabi"                    x results │
│                                                     │
│ CHANNELS (2)                                        │
│ ┌─────────────────────────────────────────────────┐ │
│ │ [👤] gabi belle                      5 videos   │ │
│ │      UC-oYqxpi6TO1J7BjQksSuOA                  │ │
│ └─────────────────────────────────────────────────┘ │
│                                                     │
│ VIDEOS (8)                                          │
│ ┌─[thumbnail]─┬─────────────────────────────────────┐ │
│ │             │ Forgotten Online Games              │ │
│ │   [🎬]      │ gabi belle • 2024-10-28 • 15:32   │ │
│ │             │ "...exploring forgotten games..."  │ │
│ └─────────────┴─────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

---

## Backend API Design

### 1. Autocomplete API
**Endpoint:** `GET /api/search/autocomplete?q={query}&limit={limit}`

**Response:**
```json
{
  "query": "gabi",
  "channels": [
    {
      "uploaderId": "UC-oYqxpi6TO1J7BjQksSuOA",
      "name": "gabi belle",
      "videoCount": 5,
      "thumbnailPath": "/path/to/image.jpg"
    }
  ],
  "videos": [
    {
      "videoId": "FrMftAsnaI0",
      "title": "Forgotten Online Games",
      "uploader": "gabi belle",
      "uploaderId": "UC-oYqxpi6TO1J7BjQksSuOA",
      "uploadDate": "2024-10-28",
      "durationSeconds": 932,
      "thumbnailPath": "/path/to/thumb.jpg"
    }
  ]
}
```

### 2. Full Search API
**Endpoint:** `GET /api/search?q={query}&type={all|videos|channels}&page={page}&limit={limit}`

**Response:**
```json
{
  "query": "gabi",
  "results": {
    "channels": {
      "items": [...],
      "total": 2
    },
    "videos": {
      "items": [...],
      "total": 8,
      "pagination": {
        "page": 1,
        "limit": 20,
        "pages": 1
      }
    }
  },
  "totalResults": 10
}
```

---

## Database Search Strategy

### Fuzzy Search Implementation Options

**Option 1: SQLite LIKE with wildcards (Simple)**
```sql
SELECT * FROM video 
WHERE title LIKE '%gabi%' 
   OR uploader LIKE '%gabi%'
ORDER BY uploadDate DESC;
```

**Option 2: SQLite FTS5 (Better performance + ranking)**
```sql
-- Create virtual table
CREATE VIRTUAL TABLE video_fts USING fts5(
  video_id, title, uploader, description, 
  content='video'
);

-- Search query
SELECT * FROM video_fts WHERE video_fts MATCH 'gabi*';
```

**Option 3: Fuse.js fuzzy search (Most flexible)**
- Load data into memory
- Use Fuse.js for fuzzy matching with scoring
- Good for smaller datasets (< 50k videos)

### Recommended Approach
Start with **Option 1** (LIKE) for MVP, then upgrade to **Option 2** (FTS5) for better performance.

### Search Logic
```typescript
interface SearchOptions {
  query: string;
  limit?: number;
  offset?: number;
  types?: ('videos' | 'channels')[];
}

class SearchService {
  async search(options: SearchOptions): Promise<SearchResults> {
    // Split query into words for better matching
    const terms = options.query.split(' ').map(t => t.trim()).filter(t => t.length > 0);
    
    // Build WHERE conditions for each term
    const videoWhere = terms.map(term => 
      `(title ILIKE '%${term}%' OR uploader ILIKE '%${term}%')`
    ).join(' AND ');
    
    const channelWhere = terms.map(term => 
      `name ILIKE '%${term}%'`
    ).join(' AND ');
    
    // Execute searches...
  }
}
```

---

## Frontend Components

### 1. Search Input Component (`SearchInput.tsx`)
**Location:** Header/Navigation  
**Features:**
- Debounced input (300ms delay)
- Loading state indicator
- Keyboard navigation (up/down arrows, enter, escape)
- Click outside to close

```typescript
interface SearchInputProps {
  onVideoSelect: (videoId: string) => void;
  onChannelSelect: (uploaderId: string) => void;
  onSearchSubmit: (query: string) => void;
}

export function SearchInput({ onVideoSelect, onChannelSelect, onSearchSubmit }: SearchInputProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  
  // Debounced search function
  const debouncedSearch = useMemo(
    () => debounce(async (q: string) => {
      if (q.length >= 2) {
        const results = await searchAutocomplete(q);
        setResults(results);
        setIsOpen(true);
      } else {
        setIsOpen(false);
      }
    }, 300),
    []
  );
  
  // ... rest of implementation
}
```

### 2. Search Results Component (`SearchResults.tsx`)
**Location:** `/search` page  
**Features:**
- Separate sections for channels and videos
- Pagination for videos
- Grid/list view toggle
- Filtering by type

```typescript
interface SearchResultsProps {
  query: string;
  initialResults?: SearchResults;
}

export function SearchResults({ query, initialResults }: SearchResultsProps) {
  const [results, setResults] = useState(initialResults);
  const [page, setPage] = useState(1);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  
  // ... pagination and filtering logic
}
```

---

## Implementation Steps

### Phase 1: Backend Search API
1. **Create search service** (`backend/src/services/search-service.ts`)
   - Implement basic LIKE-based search for videos and channels
   - Add query sanitization and validation
   - Include proper ordering (relevance + recency)

2. **Create search routes** (`backend/src/routes/search.ts`)
   - `/api/search/autocomplete` endpoint
   - `/api/search` endpoint with pagination
   - Add query parameter validation

3. **Add to main server** (`backend/src/index.ts`)
   - Register search routes

### Phase 2: Frontend Search Components  
1. **Create search input component**
   - Debounced autocomplete functionality
   - Keyboard navigation support
   - Loading and error states

2. **Add to main layout**
   - Integrate search input into header/navigation
   - Handle routing to search results page

### Phase 3: Search Results Page
1. **Create search results page** (`/search`)
   - Display channels and videos in separate sections
   - Implement pagination for videos
   - Add filters and sorting options

2. **Add routing**
   - Set up `/search?q={query}` route
   - Handle URL state management

### Phase 4: Enhancements
1. **Improve search relevance**
   - Implement search result ranking
   - Add fuzzy matching for typos
   - Include description search

2. **Add advanced features**
   - Search filters (date range, duration, channel)
   - Search history
   - Saved searches

---

## Technical Questions

1. **Search scope**: Should we search within video descriptions initially, or focus on titles/uploaders for MVP?

2. **Performance threshold**: What's the expected video library size? This affects whether we use SQLite LIKE vs FTS5 vs in-memory search.

3. **Search ranking**: Should we prioritize by:
   - Exact matches over partial matches?
   - Recent videos over older ones?
   - Video duration or view count (if available)?

4. **Autocomplete limits**: 
   - How many results in dropdown? (Currently thinking 3 channels + 5 videos)
   - Minimum query length? (Currently thinking 2 characters)

5. **Search persistence**: Should search queries be stored in URL/browser history for sharing and navigation?

---

## Success Metrics

- **Functionality**: Search finds relevant results for video titles and channel names
- **Performance**: Search responds within 200ms for autocomplete, 500ms for full results  
- **UX**: Smooth keyboard navigation and visual feedback
- **Accuracy**: Fuzzy matching handles common typos and partial words

---

*Ready for implementation once technical questions are answered!*