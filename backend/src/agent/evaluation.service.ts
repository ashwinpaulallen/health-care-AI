import { Injectable, Logger } from '@nestjs/common';
import { RetrievedChunk } from '../rag/retriever.service';
import { AgentResponse } from './graph';
import { ConversationContext } from './context-builder.service';

export interface EvaluationMetrics {
  relevance: number; // 0-1: How relevant are retrieved docs to query?
  clarity: number; // 0-1: How clear and understandable is the answer?
  completeness: number; // 0-1: How complete is the answer?
  citationQuality: number; // 0-1: Are citations appropriate and present?
  overallScore: number; // 0-1: Weighted average of all metrics
  needsImprovement: boolean; // Should we trigger self-correction?
  feedback?: string; // Specific feedback for improvement
}

@Injectable()
export class EvaluationService {
  private readonly logger = new Logger(EvaluationService.name);

  /**
   * Evaluate the quality of an agent response
   */
  async evaluateResponse(
    query: string,
    response: AgentResponse,
    retrievedDocs: RetrievedChunk[],
    conversationContext?: ConversationContext,
  ): Promise<EvaluationMetrics> {
    this.logger.log('Evaluating response quality');

    // Calculate individual metrics
    const relevance = this.calculateRelevance(query, retrievedDocs, conversationContext);
    const clarity = this.calculateClarity(response);
    const completeness = this.calculateCompleteness(query, response, conversationContext);
    const citationQuality = this.calculateCitationQuality(response, retrievedDocs);

    // Calculate overall score (weighted average)
    const overallScore =
      relevance * 0.3 + clarity * 0.25 + completeness * 0.25 + citationQuality * 0.2;

    // Determine if improvement is needed (threshold: 0.7)
    const needsImprovement = overallScore < 0.7;

    // Generate feedback if needed
    let feedback: string | undefined;
    if (needsImprovement) {
      const issues: string[] = [];
      if (relevance < 0.6) issues.push('Low relevance to query');
      if (clarity < 0.6) issues.push('Answer lacks clarity');
      if (completeness < 0.6) issues.push('Answer is incomplete');
      if (citationQuality < 0.6) issues.push('Citations are insufficient');
      feedback = `Areas for improvement: ${issues.join(', ')}`;
    }

    const metrics: EvaluationMetrics = {
      relevance,
      clarity,
      completeness,
      citationQuality,
      overallScore,
      needsImprovement,
      feedback,
    };

    this.logger.log(
      `Evaluation complete - Overall: ${overallScore.toFixed(2)}, Needs improvement: ${needsImprovement}`,
    );

    return metrics;
  }

  /**
   * Calculate relevance: How well do retrieved docs match the query?
   * Now also checks if response considers conversation context for follow-up questions
   */
  private calculateRelevance(query: string, docs: RetrievedChunk[], conversationContext?: ConversationContext): number {
    if (docs.length === 0) return 0;

    // Extract key terms from query
    const queryTerms = this.extractKeyTerms(query);

    // Check if docs contain query terms
    let matchingDocs = 0;
    let totalScore = 0;

    for (const doc of docs) {
      const docTextLower = doc.text.toLowerCase();
      const hasMatch = queryTerms.some((term) => docTextLower.includes(term.toLowerCase()));

      if (hasMatch) {
        matchingDocs++;
      }

      // Use similarity score as relevance indicator
      totalScore += doc.score;
    }

    // Relevance = (matching docs ratio + average similarity score) / 2
    const matchingRatio = matchingDocs / docs.length;
    const avgScore = totalScore / docs.length;
    let relevance = (matchingRatio * 0.5 + Math.min(avgScore, 1) * 0.5);

    // Check if this is a follow-up question and if response considers conversation context
    if (conversationContext?.recentMessages.length > 0) {
      const isFollowUp = /(will|would|do you think|can|should).*(help|work|good|better)/i.test(query);
      const hasSymptomDiscussion = conversationContext.recentMessages.some((msg) => {
        const text = msg.text.toLowerCase();
        return text.includes('bloat') || text.includes('pain') || text.includes('discomfort') || text.includes('ache') || text.includes('symptom');
      });

      if (isFollowUp && hasSymptomDiscussion) {
        // Check if response mentions the symptom from conversation
        const responseText = (response.summary + ' ' + (response.steps?.join(' ') || '')).toLowerCase();
        const mentionsSymptom = conversationContext.recentMessages.some((msg) => {
          const symptomWords = ['bloat', 'pain', 'discomfort', 'ache', 'symptom', 'feel'];
          return symptomWords.some(word => msg.text.toLowerCase().includes(word) && responseText.includes(word));
        });

        if (!mentionsSymptom) {
          // Penalize relevance if follow-up doesn't reference conversation context
          relevance *= 0.6; // Reduce relevance by 40% if context is ignored
        }
      }
    }

    return Math.min(1, Math.max(0, relevance));
  }

  /**
   * Calculate clarity: Is the answer clear and understandable?
   */
  private calculateClarity(response: AgentResponse): number {
    let score = 0.5; // Base score

    // Check summary length (should be reasonable, not too short/long)
    const summaryLength = response.summary.length;
    if (summaryLength >= 50 && summaryLength <= 500) {
      score += 0.2;
    }

    // Check if steps are provided (actionable)
    if (response.steps && response.steps.length > 0) {
      score += 0.15;
    }

    // Check if answer is not a fallback message
    if (
      !response.summary.includes("I don't have enough information") &&
      !response.summary.includes('Try rephrasing')
    ) {
      score += 0.15;
    }

    return Math.min(1, Math.max(0, score));
  }

  /**
   * Calculate completeness: Does the answer fully address the query?
   * Now also checks if response considers conversation context
   */
  private calculateCompleteness(query: string, response: AgentResponse, conversationContext?: ConversationContext): number {
    let score = 0.3; // Base score

    // Check if answer is not empty
    if (response.summary && response.summary.length > 20) {
      score += 0.2;
    }

    // Check if steps are provided (indicates actionable answer)
    if (response.steps && response.steps.length >= 2) {
      score += 0.25;
    }

    // Check if citations are present (indicates grounded answer)
    if (response.citations && response.citations.length > 0) {
      score += 0.25;
    }

    // Check if answer addresses query intent
    const queryLower = query.toLowerCase();
    const summaryLower = response.summary.toLowerCase();

    // Simple keyword matching
    const queryWords = this.extractKeyTerms(query);
    const matchingWords = queryWords.filter((word) => summaryLower.includes(word.toLowerCase()));
    const wordMatchRatio = matchingWords.length / Math.max(queryWords.length, 1);

    score += wordMatchRatio * 0.2;

    // Check if response considers conversation context for follow-up questions
    if (conversationContext?.recentMessages.length > 0) {
      const isFollowUp = /(will|would|do you think|can|should).*(help|work|good|better)/i.test(query);
      if (isFollowUp) {
        const responseText = (response.summary + ' ' + (response.steps?.join(' ') || '')).toLowerCase();
        // Check if response references conversation context
        const referencesContext = conversationContext.recentMessages.some((msg) => {
          const keyTerms = this.extractKeyTerms(msg.text);
          return keyTerms.some(term => responseText.includes(term.toLowerCase()));
        });

        if (referencesContext) {
          score += 0.1; // Bonus for considering context
        } else {
          score *= 0.8; // Penalty for ignoring context
        }
      }
    }

    return Math.min(1, Math.max(0, score));
  }

  /**
   * Calculate citation quality: Are citations appropriate?
   */
  private calculateCitationQuality(
    response: AgentResponse,
    retrievedDocs: RetrievedChunk[],
  ): number {
    if (!response.citations || response.citations.length === 0) {
      return 0;
    }

    let score = 0.5; // Base score for having citations

    // Check citation count (should have at least 1, ideally 2-3)
    const citationCount = response.citations.length;
    if (citationCount >= 2) {
      score += 0.2;
    }
    if (citationCount >= 3) {
      score += 0.1;
    }

    // Check if citations match retrieved docs
    // Since RetrievedChunk doesn't have title, we check if citations exist and match domain
    if (retrievedDocs.length > 0 && response.citations.length > 0) {
      // Simple check: if we have citations and docs, give partial credit
      // More sophisticated matching would require fetching document titles
      score += 0.15; // Partial credit for having citations when docs exist
    }

    return Math.min(1, Math.max(0, score));
  }

  /**
   * Extract key terms from text (simple approach)
   */
  private extractKeyTerms(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[?!.,;:()]/g, ' ')
      .split(/\s+/)
      .map((term) => term.trim())
      .filter((term) => term.length > 3)
      .filter(
        (term) =>
          !['what', 'are', 'the', 'benefits', 'health', 'good', 'for', 'how', 'much', 'is', 'in', 'about', 'with', 'from', 'this', 'that', 'when', 'where', 'why'].includes(
            term,
          ),
      )
      .slice(0, 10); // Limit to top 10 terms
  }
}

