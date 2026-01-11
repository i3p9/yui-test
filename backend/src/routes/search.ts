// ============================================
// SEARCH ROUTES
// ============================================

import { FastifyPluginAsync } from 'fastify';
import { SearchService } from '../services/search-service.js';

const searchRoutes: FastifyPluginAsync = async (fastify) => {
  const searchService = new SearchService();

  // GET /api/search/autocomplete - Quick search for dropdown
  fastify.get('/autocomplete', async (request, reply) => {
    const { q, channelLimit = 3, videoLimit = 8 } = request.query as {
      q?: string;
      channelLimit?: number;
      videoLimit?: number;
    };

    if (!q || typeof q !== 'string') {
      return reply.code(400).send({ error: 'Query parameter "q" is required' });
    }

    if (q.length < 2) {
      return {
        query: q,
        channels: [],
        videos: [],
      };
    }

    try {
      const results = await searchService.autocomplete(q, {
        channels: Number(channelLimit),
        videos: Number(videoLimit),
      });

      return results;
    } catch (error) {
      console.error('Search autocomplete error:', error);
      return reply.code(500).send({ error: 'Search failed' });
    }
  });

  // GET /api/search - Full search with pagination
  fastify.get('/', async (request, reply) => {
    const { 
      q, 
      type = 'all', 
      page = 1, 
      limit = 20 
    } = request.query as {
      q?: string;
      type?: 'all' | 'videos' | 'channels';
      page?: number;
      limit?: number;
    };

    if (!q || typeof q !== 'string') {
      return reply.code(400).send({ error: 'Query parameter "q" is required' });
    }

    if (q.length < 2) {
      return {
        query: q,
        results: {
          channels: { items: [], total: 0 },
          videos: { 
            items: [], 
            total: 0, 
            pagination: { page: 1, limit: 20, pages: 0 } 
          },
        },
        totalResults: 0,
      };
    }

    // Determine which types to search
    let types: ('videos' | 'channels')[] = ['videos', 'channels'];
    if (type === 'videos') {
      types = ['videos'];
    } else if (type === 'channels') {
      types = ['channels'];
    }

    try {
      const results = await searchService.search(q, {
        page: Number(page),
        limit: Number(limit),
        types,
      });

      return results;
    } catch (error) {
      console.error('Search error:', error);
      return reply.code(500).send({ error: 'Search failed' });
    }
  });

  // GET /api/search/suggestions - Get search suggestions (future feature)
  fastify.get('/suggestions', async (request, reply) => {
    // Future: Popular searches, recent searches, etc.
    return {
      suggestions: [
        'Recent uploads',
        'Popular channels',
        'Long videos',
        'Short videos',
      ]
    };
  });
};

export default searchRoutes;