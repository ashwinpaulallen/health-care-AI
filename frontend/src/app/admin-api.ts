/**
 * API client for admin knowledge base management
 */

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3001';

export interface KnowledgeDocument {
  id: string;
  domain: 'symptom' | 'food';
  title: string;
  sourceId: string;
  tags: string[];
  content?: string;
  chunkCount: number;
  createdAt: string;
  updatedAt?: string;
}

export interface CreateDocumentRequest {
  domain: 'symptom' | 'food';
  title: string;
  content: string;
  tags?: string[];
  section?: string;
}

export interface UpdateDocumentRequest {
  title?: string;
  content?: string;
  tags?: string[];
  section?: string;
}

export interface DomainStats {
  documents: number;
  chunks: number;
  averageChunksPerDocument: number;
}

/**
 * Get all documents for a domain
 */
export async function getDocuments(domain: 'symptom' | 'food'): Promise<KnowledgeDocument[]> {
  const response = await fetch(`${API_BASE}/admin/knowledge/${domain}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch documents: ${response.statusText}`);
  }
  const data = await response.json();
  return data.documents;
}

/**
 * Get a single document with content
 */
export async function getDocument(domain: 'symptom' | 'food', id: string): Promise<KnowledgeDocument> {
  const response = await fetch(`${API_BASE}/admin/knowledge/${domain}/${id}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch document: ${response.statusText}`);
  }
  const data = await response.json();
  return data.document;
}

/**
 * Create a new document
 */
export async function createDocument(request: CreateDocumentRequest): Promise<void> {
  const response = await fetch(`${API_BASE}/admin/knowledge/${request.domain}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to create document');
  }
}

/**
 * Update a document
 */
export async function updateDocument(
  domain: 'symptom' | 'food',
  id: string,
  request: UpdateDocumentRequest,
): Promise<void> {
  const response = await fetch(`${API_BASE}/admin/knowledge/${domain}/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to update document');
  }
}

/**
 * Delete a document
 */
export async function deleteDocument(domain: 'symptom' | 'food', id: string): Promise<void> {
  const response = await fetch(`${API_BASE}/admin/knowledge/${domain}/${id}`, {
    method: 'DELETE',
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to delete document');
  }
}

/**
 * Get domain statistics
 */
export async function getDomainStats(domain: 'symptom' | 'food'): Promise<DomainStats> {
  const response = await fetch(`${API_BASE}/admin/knowledge/${domain}/stats`);
  if (!response.ok) {
    throw new Error(`Failed to fetch stats: ${response.statusText}`);
  }
  const data = await response.json();
  return data.stats;
}

