### Documents

Use Documents for extraction and e-signature workflow state before provider handoff:

```typescript
const extraction = await piezas.documents.createExtractionJob({
  documentId,
  provider: 'aws_textract',
  requestedFields: ['invoice_number', 'vendor_name', 'total', 'due_date'],
});

const signature = await piezas.documents.createSignatureRequest({
  title: 'Master services agreement',
  documentId,
  provider: 'docusign',
  signers: [{ name: 'Jane Client', email: 'jane@example.com' }],
});
```

Piezas owns the document record, its versions, the extraction job state, and the
e-signature request state. The provider call itself goes through Integrations, so
the app never holds a provider access token or webhook secret for it — store the
Piezas document id, job id, and signature request id as references and read status
back from Piezas.
