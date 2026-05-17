'use client';

import KnowledgeBaseManager from '../../../components/Admin/KnowledgeBaseManager';

export default function SymptomsAdminPage() {
  return (
    <KnowledgeBaseManager
      domain="symptom"
      title="Symptom Knowledge Base"
      description="Manage health symptom information, guidance, and red flags"
    />
  );
}

