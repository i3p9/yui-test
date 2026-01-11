import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { searchAutocomplete } from '../lib/api';

interface SearchResult {
  channels: Array<{
    uploaderId: string;
    name: string;
    videoCount: number;
    thumbnailPath?: string;
  }>;
  videos: Array<{
    videoId: string;
    title: string;
    uploader?: string;
    uploaderId?: string;
    uploadDate?: string;
    durationSeconds?: number;
  }>;
}

// Debounce hook
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

export function SearchInput() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const navigate = useNavigate();
  
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const debouncedQuery = useDebounce(query, 300);

  // Calculate total results and flattened list for keyboard navigation
  const { allResults, totalResults } = useMemo(() => {
    if (!results) return { allResults: [], totalResults: 0 };
    
    const allResults = [
      ...results.channels.map(channel => ({ type: 'channel' as const, item: channel })),
      ...results.videos.map(video => ({ type: 'video' as const, item: video })),
    ];
    
    return { allResults, totalResults: allResults.length };
  }, [results]);

  // Search effect
  useEffect(() => {
    const performSearch = async () => {
      if (debouncedQuery.length >= 2) {
        setIsLoading(true);
        try {
          const searchResults = await searchAutocomplete(debouncedQuery);
          setResults(searchResults);
          setIsOpen(true);
          setSelectedIndex(-1);
        } catch (error) {
          console.error('Search failed:', error);
          setResults(null);
        } finally {
          setIsLoading(false);
        }
      } else {
        setResults(null);
        setIsOpen(false);
        setSelectedIndex(-1);
      }
    };

    performSearch();
  }, [debouncedQuery]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current && 
        !dropdownRef.current.contains(event.target as Node) &&
        !inputRef.current?.contains(event.target as Node)
      ) {
        setIsOpen(false);
        setSelectedIndex(-1);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || !results) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => 
          prev < totalResults - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => prev > -1 ? prev - 1 : -1);
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < totalResults) {
          const selected = allResults[selectedIndex];
          handleResultClick(selected.type, selected.item);
        } else if (query.length >= 2) {
          // Go to search page
          navigate(`/search?q=${encodeURIComponent(query)}`);
          setIsOpen(false);
          inputRef.current?.blur();
        }
        break;
      case 'Escape':
        setIsOpen(false);
        setSelectedIndex(-1);
        inputRef.current?.blur();
        break;
    }
  };

  const handleResultClick = (type: 'channel' | 'video', item: any) => {
    if (type === 'channel') {
      navigate(`/channels/${item.uploaderId}`);
    } else {
      navigate(`/watch/${item.videoId}`);
    }
    setIsOpen(false);
    setQuery('');
    inputRef.current?.blur();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
  };

  const handleInputFocus = () => {
    if (query.length >= 2 && results) {
      setIsOpen(true);
    }
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return '';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getChannelThumbnailUrl = (uploaderId: string) => {
    return `http://localhost:3001/api/library/channels/${uploaderId}/thumbnail`;
  };

  return (
    <div className="relative flex-1 max-w-2xl mx-8">
      {/* Input */}
      <div className="bg-zinc-900 border-2 border-zinc-800 focus-within:border-red-600 transition-colors flex items-center px-4 py-2">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={handleInputFocus}
          placeholder="Search videos and channels..."
          className="flex-1 bg-transparent outline-none text-sm font-mono placeholder-zinc-600"
        />
        {isLoading ? (
          <div className="w-5 h-5 border-2 border-zinc-600 border-t-red-600 rounded-full animate-spin" />
        ) : (
          <svg
            className="w-5 h-5 text-zinc-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="square"
              strokeLinejoin="miter"
              strokeWidth={3}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        )}
      </div>

      {/* Dropdown */}
      {isOpen && results && (results.channels.length > 0 || results.videos.length > 0) && (
        <div
          ref={dropdownRef}
          className="absolute top-full left-0 right-0 mt-2 bg-zinc-900 border-2 border-zinc-800 shadow-xl max-h-96 overflow-y-auto z-50"
        >
          {/* Channels Section */}
          {results.channels.length > 0 && (
            <div>
              <div className="px-4 py-2 bg-zinc-800 text-xs font-bold text-zinc-400 uppercase tracking-wider">
                🔍 CHANNELS
              </div>
              {results.channels.map((channel, index) => {
                const globalIndex = index;
                const isSelected = selectedIndex === globalIndex;
                
                return (
                  <button
                    key={channel.uploaderId}
                    onClick={() => handleResultClick('channel', channel)}
                    className={`w-full px-4 py-3 text-left hover:bg-zinc-800 transition-colors border-b border-zinc-800 ${
                      isSelected ? 'bg-red-600' : ''
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-zinc-800 border border-zinc-700 flex items-center justify-center flex-shrink-0">
                        {channel.thumbnailPath ? (
                          <img
                            src={getChannelThumbnailUrl(channel.uploaderId)}
                            alt={channel.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <svg className="w-4 h-4 text-zinc-600" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z" />
                          </svg>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-sm truncate">{channel.name}</div>
                        <div className="text-xs text-zinc-400 font-mono">{channel.videoCount} videos</div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Videos Section */}
          {results.videos.length > 0 && (
            <div>
              <div className="px-4 py-2 bg-zinc-800 text-xs font-bold text-zinc-400 uppercase tracking-wider">
                🔍 VIDEOS
              </div>
              {results.videos.map((video, index) => {
                const globalIndex = results.channels.length + index;
                const isSelected = selectedIndex === globalIndex;
                
                return (
                  <button
                    key={video.videoId}
                    onClick={() => handleResultClick('video', video)}
                    className={`w-full px-4 py-3 text-left hover:bg-zinc-800 transition-colors border-b border-zinc-800 ${
                      isSelected ? 'bg-red-600' : ''
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-zinc-800 border border-zinc-700 flex items-center justify-center flex-shrink-0">
                        <svg className="w-4 h-4 text-zinc-600" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-sm truncate">{video.title}</div>
                        <div className="text-xs text-zinc-400 font-mono">
                          {video.uploader && <span>{video.uploader} • </span>}
                          {video.uploadDate && <span>{video.uploadDate} • </span>}
                          {video.durationSeconds && <span>{formatDuration(video.durationSeconds)}</span>}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Show more results link */}
          {(results.channels.length > 0 || results.videos.length > 0) && (
            <button
              onClick={() => {
                navigate(`/search?q=${encodeURIComponent(query)}`);
                setIsOpen(false);
                inputRef.current?.blur();
              }}
              className="w-full px-4 py-3 text-center text-sm font-bold text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors border-t border-zinc-800"
            >
              View all results for "{query}"
            </button>
          )}
        </div>
      )}

      {/* No results */}
      {isOpen && results && results.channels.length === 0 && results.videos.length === 0 && !isLoading && query.length >= 2 && (
        <div
          ref={dropdownRef}
          className="absolute top-full left-0 right-0 mt-2 bg-zinc-900 border-2 border-zinc-800 shadow-xl z-50"
        >
          <div className="px-4 py-6 text-center text-zinc-500 font-mono">
            No results found for "{query}"
          </div>
        </div>
      )}
    </div>
  );
}