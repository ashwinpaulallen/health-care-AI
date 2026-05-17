import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { RetrieverService } from './retriever.service';
import { EmbeddingService } from './embedding.service';
import { RagChunk } from './schemas/chunk.schema';
import { ConfigService } from '../common/config/config.service';

describe('RetrieverService', () => {
  let service: RetrieverService;
  let mockChunkModel: any;
  let mockEmbeddingService: any;

  // Mock embeddings (normalized vectors)
  const mockQueryEmbedding = new Float32Array([0.5, 0.5, 0.5, 0.5]);
  const symptomEmbedding = [0.6, 0.4, 0.5, 0.5]; // Similar to query
  const foodEmbedding = [0.1, 0.1, 0.1, 0.97]; // Different from query

  // Fake chunks
  const symptomChunk = {
    _id: 'symptom-chunk-id',
    docId: 'doc-1',
    domain: 'symptom',
    text: 'Bloating after meals can be caused by eating too quickly or swallowing air.',
    embedding: symptomEmbedding,
    meta: { section: 'Bloating' },
  };

  const foodChunk = {
    _id: 'food-chunk-id',
    docId: 'doc-2',
    domain: 'food',
    text: 'Protein sources include dal, paneer, eggs, and lean meats.',
    embedding: foodEmbedding,
    meta: { section: 'Protein' },
  };

  beforeEach(async () => {
    // Mock the Mongoose model
    const mockQuery = {
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([symptomChunk, foodChunk]),
    };

    mockChunkModel = {
      find: jest.fn().mockReturnValue(mockQuery),
    };

    // Mock EmbeddingService
    mockEmbeddingService = {
      embedOne: jest.fn().mockResolvedValue(mockQueryEmbedding),
    };

    // Mock ConfigService
    const mockConfigService = {
      ragTopK: 5,
      ragSimilarityThreshold: 0.7,
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RetrieverService,
        {
          provide: getModelToken(RagChunk.name),
          useValue: mockChunkModel,
        },
        {
          provide: EmbeddingService,
          useValue: mockEmbeddingService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<RetrieverService>(RetrieverService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should retrieve symptom chunk first when searching for bloating in symptom domain', async () => {
    // Act
    const results = await service.retrieve('bloating', 'symptom', 5);

    // Assert
    expect(results).toBeDefined();
    expect(results.length).toBeGreaterThan(0);

    // Symptom chunk should be first (higher similarity score)
    const firstResult = results[0];
    expect(firstResult.domain).toBe('symptom');
    expect(firstResult.text).toContain('Bloating');

    // Verify embedding service was called
    expect(mockEmbeddingService.embedOne).toHaveBeenCalledWith('bloating');
  });

  it('should filter results by domain', async () => {
    // Act
    const results = await service.retrieve('protein', 'food', 5);

    // Assert
    expect(mockChunkModel.find).toHaveBeenCalledWith(
      expect.objectContaining({
        domain: 'food',
      }),
      expect.anything(),
    );
  });

  it('should respect similarity threshold', async () => {
    // Simulate chunks with low similarity
    const lowSimilarityChunk = {
      ...symptomChunk,
      embedding: [0.0, 0.0, 0.0, 1.0], // Very different
    };

    const mockQuery = {
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([lowSimilarityChunk]),
    };

    mockChunkModel.find = jest.fn().mockReturnValue(mockQuery);

    // Act
    const results = await service.retrieve('bloating', 'symptom', 5);

    // Assert - low similarity chunks should be filtered out
    const hasLowSimilarity = results.some((r) => r.score < 0.3);
    expect(hasLowSimilarity).toBe(false);
  });
});

