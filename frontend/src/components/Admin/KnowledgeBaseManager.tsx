'use client';

import { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Typography,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Chip,
  Stack,
  Alert,
  CircularProgress,
  Grid,
} from '@mui/material';
import { Add, Edit, Delete, Visibility } from '@mui/icons-material';
import {
  getDocuments,
  getDocument,
  createDocument,
  updateDocument,
  deleteDocument,
  KnowledgeDocument,
  CreateDocumentRequest,
} from '../../app/admin-api';

interface KnowledgeBaseManagerProps {
  domain: 'symptom' | 'food';
  title: string;
  description: string;
}

export default function KnowledgeBaseManager({ domain, title, description }: KnowledgeBaseManagerProps) {
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // Dialog states
  const [openCreate, setOpenCreate] = useState(false);
  const [openEdit, setOpenEdit] = useState(false);
  const [openView, setOpenView] = useState(false);
  const [openDelete, setOpenDelete] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<KnowledgeDocument | null>(null);
  
  // Form states
  const [formTitle, setFormTitle] = useState('');
  const [formContent, setFormContent] = useState('');
  const [formTags, setFormTags] = useState('');
  const [formSection, setFormSection] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadDocuments();
  }, [domain]);

  const loadDocuments = async () => {
    try {
      setLoading(true);
      setError(null);
      const docs = await getDocuments(domain);
      setDocuments(docs);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    try {
      setSubmitting(true);
      setError(null);
      
      const request: CreateDocumentRequest = {
        domain,
        title: formTitle,
        content: formContent,
        tags: formTags ? formTags.split(',').map(t => t.trim()) : [],
        section: formSection || undefined,
      };
      
      await createDocument(request);
      setSuccess('Document created successfully!');
      setOpenCreate(false);
      resetForm();
      loadDocuments();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = async () => {
    if (!selectedDoc) return;
    
    try {
      setSubmitting(true);
      setError(null);
      
      await updateDocument(domain, selectedDoc.id, {
        title: formTitle,
        content: formContent,
        tags: formTags ? formTags.split(',').map(t => t.trim()) : [],
        section: formSection || undefined,
      });
      
      setSuccess('Document updated successfully!');
      setOpenEdit(false);
      resetForm();
      loadDocuments();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedDoc) return;
    
    try {
      setSubmitting(true);
      setError(null);
      
      await deleteDocument(domain, selectedDoc.id);
      setSuccess('Document deleted successfully!');
      setOpenDelete(false);
      setSelectedDoc(null);
      loadDocuments();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleViewDocument = async (doc: KnowledgeDocument) => {
    try {
      const fullDoc = await getDocument(domain, doc.id);
      setSelectedDoc(fullDoc);
      setOpenView(true);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleEditDocument = async (doc: KnowledgeDocument) => {
    try {
      const fullDoc = await getDocument(domain, doc.id);
      setSelectedDoc(fullDoc);
      setFormTitle(fullDoc.title);
      setFormContent(fullDoc.content || '');
      setFormTags(fullDoc.tags.join(', '));
      setFormSection('');
      setOpenEdit(true);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDeleteDocument = (doc: KnowledgeDocument) => {
    setSelectedDoc(doc);
    setOpenDelete(true);
  };

  const resetForm = () => {
    setFormTitle('');
    setFormContent('');
    setFormTags('');
    setFormSection('');
    setSelectedDoc(null);
  };

  const handleCloseCreate = () => {
    setOpenCreate(false);
    resetForm();
  };

  const handleCloseEdit = () => {
    setOpenEdit(false);
    resetForm();
  };

  return (
    <Box>
      {/* Header */}
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography variant="h5" gutterBottom>
            {title}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {description}
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<Add />}
          onClick={() => setOpenCreate(true)}
        >
          Add Document
        </Button>
      </Box>

      {/* Alerts */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess(null)}>
          {success}
        </Alert>
      )}

      {/* Documents List */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      ) : documents.length === 0 ? (
        <Card>
          <CardContent>
            <Typography variant="body1" color="text.secondary" align="center">
              No documents yet. Click "Add Document" to create one.
            </Typography>
          </CardContent>
        </Card>
      ) : (
        <Grid container spacing={2}>
          {documents.map((doc) => (
            <Grid item xs={12} md={6} lg={4} key={doc.id}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom noWrap>
                    {doc.title}
                  </Typography>
                  
                  <Stack direction="row" spacing={1} sx={{ mb: 2 }} flexWrap="wrap">
                    {doc.tags.map((tag) => (
                      <Chip key={tag} label={tag} size="small" />
                    ))}
                  </Stack>
                  
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    {doc.chunkCount} chunks
                  </Typography>
                  
                  <Typography variant="caption" color="text.secondary">
                    Created: {new Date(doc.createdAt).toLocaleDateString()}
                  </Typography>
                  
                  <Box sx={{ mt: 2, display: 'flex', gap: 1 }}>
                    <IconButton size="small" onClick={() => handleViewDocument(doc)}>
                      <Visibility />
                    </IconButton>
                    <IconButton size="small" onClick={() => handleEditDocument(doc)}>
                      <Edit />
                    </IconButton>
                    <IconButton size="small" color="error" onClick={() => handleDeleteDocument(doc)}>
                      <Delete />
                    </IconButton>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {/* Create Dialog */}
      <Dialog open={openCreate} onClose={handleCloseCreate} maxWidth="md" fullWidth>
        <DialogTitle>Add New Document</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Title"
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
              fullWidth
              required
            />
            <TextField
              label="Content"
              value={formContent}
              onChange={(e) => setFormContent(e.target.value)}
              fullWidth
              multiline
              rows={12}
              required
              placeholder="Enter the document content here..."
            />
            <TextField
              label="Tags (comma-separated)"
              value={formTags}
              onChange={(e) => setFormTags(e.target.value)}
              fullWidth
              placeholder="e.g., bloating, digestive, common"
            />
            <TextField
              label="Section (optional)"
              value={formSection}
              onChange={(e) => setFormSection(e.target.value)}
              fullWidth
              placeholder="e.g., Digestive Issues"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseCreate}>Cancel</Button>
          <Button
            onClick={handleCreate}
            variant="contained"
            disabled={!formTitle || !formContent || submitting}
          >
            {submitting ? 'Creating...' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={openEdit} onClose={handleCloseEdit} maxWidth="md" fullWidth>
        <DialogTitle>Edit Document</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Title"
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
              fullWidth
              required
            />
            <TextField
              label="Content"
              value={formContent}
              onChange={(e) => setFormContent(e.target.value)}
              fullWidth
              multiline
              rows={12}
              required
            />
            <TextField
              label="Tags (comma-separated)"
              value={formTags}
              onChange={(e) => setFormTags(e.target.value)}
              fullWidth
            />
            <TextField
              label="Section (optional)"
              value={formSection}
              onChange={(e) => setFormSection(e.target.value)}
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseEdit}>Cancel</Button>
          <Button
            onClick={handleEdit}
            variant="contained"
            disabled={!formTitle || !formContent || submitting}
          >
            {submitting ? 'Updating...' : 'Update'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* View Dialog */}
      <Dialog open={openView} onClose={() => setOpenView(false)} maxWidth="md" fullWidth>
        <DialogTitle>{selectedDoc?.title}</DialogTitle>
        <DialogContent>
          {selectedDoc && (
            <Box>
              <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
                {selectedDoc.tags.map((tag) => (
                  <Chip key={tag} label={tag} size="small" />
                ))}
              </Stack>
              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                {selectedDoc.content}
              </Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenView(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={openDelete} onClose={() => setOpenDelete(false)}>
        <DialogTitle>Delete Document</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete "{selectedDoc?.title}"? This will also delete all associated chunks.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenDelete(false)}>Cancel</Button>
          <Button onClick={handleDelete} color="error" disabled={submitting}>
            {submitting ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

