import { Controller, Post, Body, Logger } from '@nestjs/common';
import { IngestService, IngestInput } from './ingest.service';
import { IsString, IsArray, IsEnum, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import * as fs from 'fs/promises';
import * as path from 'path';

class IngestDocDto {
  @IsString()
  title: string;

  @IsString()
  text: string;

  @IsArray()
  @IsOptional()
  tags?: string[];

  @IsString()
  @IsOptional()
  section?: string;
}

class IngestDto {
  @IsEnum(['symptom', 'food'])
  domain: 'symptom' | 'food';

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => IngestDocDto)
  docs: IngestDocDto[];
}

@Controller('rag')
export class IngestController {
  private readonly logger = new Logger(IngestController.name);

  constructor(private readonly ingestService: IngestService) {}

  /**
   * POST /rag/ingest - Ingest seed documents from filesystem
   */
  @Post('ingest')
  async ingestSeeds() {
    this.logger.log('Starting seed ingestion from /seeds directory');

    try {
      // Determine seeds directory path (relative to project root)
      const seedsDir = path.join(process.cwd(), '..', 'seeds');
      this.logger.log(`Reading from seeds directory: ${seedsDir}`);

      // Read symptom documents
      const symptomsPath = path.join(seedsDir, 'symptoms.md');
      const symptomsText = await fs.readFile(symptomsPath, 'utf-8');
      this.logger.log('Read symptoms.md');

      const constipationPath = path.join(seedsDir, 'constipation.md');
      const constipationText = await fs.readFile(constipationPath, 'utf-8');
      this.logger.log('Read constipation.md');

      const fatiguePath = path.join(seedsDir, 'fatigue.md');
      const fatigueText = await fs.readFile(fatiguePath, 'utf-8');
      this.logger.log('Read fatigue.md');

      // Read food documents
      const foodPath = path.join(seedsDir, 'food.md');
      const foodText = await fs.readFile(foodPath, 'utf-8');
      this.logger.log('Read food.md');

      const indianVegetablesPath = path.join(seedsDir, 'indian-vegetables.md');
      const indianVegetablesText = await fs.readFile(indianVegetablesPath, 'utf-8');
      this.logger.log('Read indian-vegetables.md');

      const healthySnacksPath = path.join(seedsDir, 'healthy-snacks.md');
      const healthySnacksText = await fs.readFile(healthySnacksPath, 'utf-8');
      this.logger.log('Read healthy-snacks.md');

      // Clear existing data
      await this.ingestService.clearDomain('symptom');
      await this.ingestService.clearDomain('food');

      // Ingest symptom documents
      const symptomResult = await this.ingestService.ingest({
        domain: 'symptom',
        docs: [
          {
            title: 'Symptom Guidance Reference',
            text: symptomsText,
            tags: ['symptoms', 'health', 'medical-guidance'],
          },
          {
            title: 'Constipation: Causes, Management, and Prevention',
            text: constipationText,
            tags: ['constipation', 'digestive-health', 'symptoms'],
          },
          {
            title: 'Fatigue and Low Energy: Understanding and Management',
            text: fatigueText,
            tags: ['fatigue', 'energy', 'symptoms', 'wellness'],
          },
        ],
      });

      // Ingest food documents
      const foodResult = await this.ingestService.ingest({
        domain: 'food',
        docs: [
          {
            title: 'Food & Nutrition Reference Guide',
            text: foodText,
            tags: ['nutrition', 'food', 'diet', 'indian-cuisine'],
          },
          {
            title: 'Indian Vegetables: Nutritional Guide',
            text: indianVegetablesText,
            tags: ['vegetables', 'nutrition', 'indian-food', 'healthy-eating'],
          },
          {
            title: 'Healthy Indian Snacks: Nutritional Information',
            text: healthySnacksText,
            tags: ['snacks', 'nutrition', 'indian-food', 'healthy-eating'],
          },
        ],
      });

      return {
        success: true,
        message: 'Seed documents ingested successfully',
        results: {
          symptom: symptomResult,
          food: foodResult,
        },
        totalDocuments: symptomResult.documentsCreated + foodResult.documentsCreated,
        totalChunks: symptomResult.chunksCreated + foodResult.chunksCreated,
      };
    } catch (error) {
      this.logger.error('Failed to ingest seeds:', error);
      throw error;
    }
  }

  /**
   * POST /rag/ingest-custom - Custom ingestion endpoint
   */
  @Post('ingest-custom')
  async ingestCustom(@Body() dto: IngestDto) {
    this.logger.log(`Custom ingestion for domain: ${dto.domain}`);

    const result = await this.ingestService.ingest(dto);

    return {
      success: true,
      message: 'Custom documents ingested successfully',
      result,
    };
  }
}

