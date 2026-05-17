import { Injectable, Logger } from '@nestjs/common';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { ConfigService } from '../common/config/config.service';

// Note: The @tavily/mcp-server package doesn't exist in npm yet.
// This service uses the direct Tavily API, which works perfectly.
// MCP code is commented out but preserved for future use if the package becomes available.

export interface TavilySearchResult {
  title: string;
  url: string;
  content: string;
  score?: number;
}

@Injectable()
export class TavilyMcpService {
  private readonly logger = new Logger(TavilyMcpService.name);
  private client: Client | null = null;
  private isConnected = false;

  constructor(private readonly configService: ConfigService) {}

  /**
   * Initialize MCP client connection to Tavily server
   * Returns false if MCP connection fails (will use fallback API)
   * 
   * Note: MCP server package doesn't exist yet, so we skip MCP and use direct API
   */
  async connect(): Promise<boolean> {
    // Skip MCP attempt - the @tavily/mcp-server package doesn't exist in npm
    // We'll use the direct API fallback which works perfectly
    this.logger.debug('Skipping MCP connection, using direct Tavily API');
    return false;
    
    // Uncomment below if Tavily MCP server becomes available:
    /*
    if (this.isConnected && this.client) {
      return true;
    }

    try {
      this.logger.log('Attempting to connect to Tavily MCP server...');
      
      const transport = new StdioClientTransport({
        command: 'npx',
        args: ['-y', '@tavily/mcp-server'],
        env: {
          TAVILY_API_KEY: process.env.TAVILY_API_KEY || '',
        },
      });

      this.client = new Client(
        {
          name: 'health-bot-backend',
          version: '1.0.0',
        },
        {
          capabilities: {},
        },
      );

      await this.client.connect(transport);
      this.isConnected = true;
      this.logger.log('Connected to Tavily MCP server');
      return true;
    } catch (error) {
      this.logger.warn('Failed to connect to Tavily MCP server, will use direct API fallback:', error);
      this.isConnected = false;
      this.client = null;
      return false;
    }
    */
  }

  /**
   * Search using Tavily
   * Uses direct API (MCP server package not available in npm)
   */
  async search(query: string, maxResults: number = 5): Promise<TavilySearchResult[]> {
    // Use direct API directly (MCP server package doesn't exist)
    // This avoids noisy error logs from trying to install non-existent package
    return this.fallbackSearch(query, maxResults);
    
    // Uncomment below if Tavily MCP server becomes available:
    /*
    // Try MCP connection if not connected
    if (!this.isConnected || !this.client) {
      const connected = await this.connect();
      // If MCP connection failed, use fallback directly
      if (!connected) {
        this.logger.log('Using direct Tavily API (MCP not available)');
        return this.fallbackSearch(query, maxResults);
      }
    }

    // MCP search code (commented out until MCP server package is available):
    /*
    // Try MCP search first
    try {
      this.logger.log(`Searching Tavily via MCP for: ${query}`);

      if (!this.client) {
        throw new Error('MCP client not available');
      }

      // Call Tavily search tool via MCP
      const result = await this.client.callTool({
        name: 'tavily_search',
        arguments: {
          query,
          max_results: maxResults,
          search_depth: 'advanced',
        },
      });

      if (result.content && Array.isArray(result.content)) {
        const results: TavilySearchResult[] = [];

        for (const item of result.content) {
          if (item.type === 'text') {
            try {
              const data = JSON.parse(item.text);
              
              if (Array.isArray(data.results)) {
                for (const result of data.results) {
                  results.push({
                    title: result.title || 'Untitled',
                    url: result.url || '',
                    content: result.content || '',
                    score: result.score,
                  });
                }
              }
            } catch (parseError) {
              this.logger.warn('Failed to parse Tavily MCP result:', parseError);
            }
          }
        }

        this.logger.log(`Tavily MCP search returned ${results.length} results`);
        return results;
      }

      // If MCP returned empty, try fallback
      this.logger.log('Tavily MCP returned no results, trying fallback API');
      return this.fallbackSearch(query, maxResults);
    } catch (error) {
      this.logger.warn('Tavily MCP search failed, using direct API fallback:', error);
      // Fallback: try direct API call if MCP fails
      return this.fallbackSearch(query, maxResults);
    }
    */
  }

  /**
   * Direct Tavily API call (primary method since MCP server package doesn't exist)
   */
  private async fallbackSearch(query: string, maxResults: number): Promise<TavilySearchResult[]> {
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) {
      this.logger.warn('TAVILY_API_KEY not set, skipping fallback search');
      return [];
    }

    try {
      this.logger.log('Using fallback Tavily API call');
      const response = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          api_key: apiKey,
          query,
          max_results: maxResults,
          search_depth: 'advanced',
        }),
      });

      if (!response.ok) {
        throw new Error(`Tavily API error: ${response.status}`);
      }

      const data = await response.json();
      const results: TavilySearchResult[] = [];

      if (Array.isArray(data.results)) {
        for (const result of data.results) {
          results.push({
            title: result.title || 'Untitled',
            url: result.url || '',
            content: result.content || '',
            score: result.score,
          });
        }
      }

      return results;
    } catch (error) {
      this.logger.error('Fallback Tavily search failed:', error);
      return [];
    }
  }

  /**
   * Disconnect from MCP server
   */
  async disconnect(): Promise<void> {
    if (this.client && this.isConnected) {
      try {
        await this.client.close();
        this.isConnected = false;
        this.client = null;
        this.logger.log('Disconnected from Tavily MCP server');
      } catch (error) {
        this.logger.error('Error disconnecting from Tavily MCP server:', error);
      }
    }
  }
}

