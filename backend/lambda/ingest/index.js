const {
  BedrockAgentClient,
  StartIngestionJobCommand,
  IngestKnowledgeBaseDocumentsCommand,
} = require("@aws-sdk/client-bedrock-agent");
const client = new BedrockAgentClient({
  region: process.env.AWS_REGION,
  customUserAgent: [["aws-samples-rag", "bedrock-kb"]],
});

/**
 * Ingest handler — supports two modes:
 * 1. Direct ingestion (DLA) — for single document via IngestKnowledgeBaseDocuments
 * 2. Full sync — triggers StartIngestionJob for all documents in S3
 *
 * Mode is determined by the event payload:
 * - If event contains "document" with content/s3Uri: uses DLA
 * - Otherwise: triggers full sync (existing behavior)
 */
exports.handler = async (event, context) => {
  const knowledgeBaseId = process.env.KNOWLEDGE_BASE_ID;
  const dataSourceId = process.env.DATA_SOURCE_ID;

  // Direct ingestion mode (DLA)
  if (event.document) {
    const doc = event.document;
    const docId = doc.id || context.awsRequestId;

    let content;
    if (doc.s3Uri) {
      content = {
        dataSourceType: "CUSTOM",
        custom: {
          customDocumentIdentifier: { id: docId },
          sourceType: "S3_LOCATION",
          s3Location: { uri: doc.s3Uri },
        },
      };
    } else {
      content = {
        dataSourceType: "CUSTOM",
        custom: {
          customDocumentIdentifier: { id: docId },
          sourceType: "IN_LINE",
          inlineContent: doc.mimeType
            ? { type: "BYTE", byteContent: { data: doc.data, mimeType: doc.mimeType } }
            : { type: "TEXT", textContent: { data: doc.data || "" } },
        },
      };
    }

    const documents = [{ content }];
    if (doc.metadata) {
      documents[0].metadata = {
        type: "IN_LINE_ATTRIBUTE",
        inlineAttributes: Object.entries(doc.metadata).map(([key, value]) => ({
          key,
          value: { stringValue: String(value), type: "STRING" },
        })),
      };
    }

    const command = new IngestKnowledgeBaseDocumentsCommand({
      knowledgeBaseId,
      dataSourceId,
      documents,
    });
    const response = await client.send(command);
    return JSON.stringify({ documentDetails: response.documentDetails });
  }

  // Full sync mode (existing behavior)
  const input = {
    knowledgeBaseId,
    dataSourceId,
    clientToken: context.awsRequestId,
  };
  const command = new StartIngestionJobCommand(input);
  const response = await client.send(command);
  return JSON.stringify({ ingestionJob: response.ingestionJob });
};
