import { randomUUID } from "node:crypto";
import { Tracer } from "judgeval";
import { PDFDocument, StandardFonts } from "pdf-lib";
import {
  nodeInput,
  connectionInput,
  type Board,
} from "../../src/domain/canvas";
import type { Json } from "../../src/domain/runtime";
import type { Project } from "../../src/domain/project";
import { RuntimeEngine } from "../../src/domain/runtime-engine";
import { ComposioGmail } from "../../src/server/integrations/composio-gmail";
import {
  extractForStep,
  reasonForStep,
  runtimeModelConfiguration,
} from "../../src/server/integrations/openai-step";
import { invokeApprovedStep } from "../../src/server/runtime/invoke-step";
import type { ReasoningDocument } from "../../src/server/runtime/documents";

export const onboardingCases = [
  { id: "complete-packet", ndc: "SYNTHETIC-NDC-001", certificate: true },
  { id: "missing-ndc", ndc: null, certificate: true },
  { id: "missing-certificate", ndc: "SYNTHETIC-NDC-003", certificate: false },
  {
    id: "ambiguous-filename",
    ndc: "SYNTHETIC-NDC-004",
    certificate: true,
    filename: "SYNTHETIC-scan-004.pdf",
  },
  {
    id: "duplicate-attachments",
    ndc: "SYNTHETIC-NDC-005",
    certificate: true,
    copies: 2,
  },
  {
    id: "certificate-reply",
    ndc: "SYNTHETIC-NDC-006",
    certificate: true,
    reply: true,
  },
  {
    id: "multiple-batches",
    ndc: "SYNTHETIC-NDC-007",
    certificate: true,
    batches: 2,
  },
  {
    id: "unicode-and-whitespace",
    ndc: " SYNTHETIC-NDC-008 ",
    certificate: true,
    supplier: "SYNTHETIC Société Démo",
  },
  {
    id: "ambiguous-shipment",
    ndc: "SYNTHETIC-NDC-009",
    certificate: true,
    ambiguous: true,
  },
  { id: "human-review", ndc: null, certificate: false, human: true },
] satisfies OnboardingCase[];

export interface OnboardingCase {
  id: string;
  ndc: string | null;
  certificate: boolean;
  filename?: string;
  copies?: number;
  reply?: boolean;
  batches?: number;
  supplier?: string;
  ambiguous?: boolean;
  human?: boolean;
}

// These are external-service doubles, not trace payloads or quality-test answers.
// The real runtime, contract validation, provider adapter and AI SDK still execute.
export async function runOnboardingCase(
  sample: OnboardingCase,
  batchId: string,
) {
  const transport = globalThis.fetch;
  const signal = AbortSignal.timeout(20000);
  const artifactId = randomUUID();
  const certificateId = randomUUID();
  const invoiceArtifactIds = Array.from({ length: sample.copies || sample.batches || 1 }, (_, i) => i === 0 ? artifactId : randomUUID());
  const invoice = `SYNTHETIC-INV-${sample.id}`;
  const shipment = `SYNTHETIC-SHIPMENT-${sample.id}`;
  const batchNumbers = Array.from(
    { length: sample.batches || 1 },
    (_, i) => `SYNTHETIC-BATCH-${i + 1}`,
  );
  const source = `SYNTHETIC ONBOARDING DOCUMENT — NOT A REAL INVOICE\nSupplier: ${sample.supplier || "SYNTHETIC Example Supplier"}\nInvoice: ${invoice}\nNDC: ${sample.ndc ?? "not printed"}\nBatches: ${batchNumbers.join(", ")}\n`;
  const messageId = "aaaaaaaaaa000001";
  const filename = sample.filename || "SYNTHETIC-invoice.pdf";
  async function pdf(text: string) {
    const document = await PDFDocument.create();
    const font = await document.embedFont(StandardFonts.Helvetica);
    const page = document.addPage();
    text
      .split("\n")
      .forEach((line, i) =>
        page.drawText(line, { x: 35, y: 790 - i * 24, size: 10, font }),
      );
    return Buffer.from(await document.save());
  }
  const invoiceNumbers = invoiceArtifactIds.map((_, i) => sample.batches ? `${invoice}-${i + 1}` : invoice);
  const invoiceBytes = await Promise.all(invoiceNumbers.map(value => pdf(source.replace(`Invoice: ${invoice}`, `Invoice: ${value}`))));
  const certificateBytes = await pdf(
    `SYNTHETIC CERTIFICATE OF ANALYSIS — NOT REAL\nBatches: ${batchNumbers.join(", ")}`,
  );
  const certificateAttachment = {
    attachmentId: "SYNTHETIC-certificate",
    filename: "SYNTHETIC-certificate.pdf",
    mimeType: "application/pdf",
  };
  const rawMessage = {
    messageId,
    threadId: "SYNTHETIC-thread",
    subject: `SYNTHETIC invoice ${shipment}`,
    sender: "synthetic@example.invalid",
    messageTimestamp: "2026-10-28T12:00:00Z",
    messageText: `SYNTHETIC ONBOARDING EMAIL. ${sample.ambiguous ? "Please match this shipment; the reference is ambiguous." : shipment}`,
    attachmentList: Array.from({ length: invoiceArtifactIds.length }, (_, i) => ({
      attachmentId: `SYNTHETIC-attachment-${i}`,
      filename: sample.batches ? `SYNTHETIC-invoice-batch-${i + 1}.pdf` : filename,
      mimeType: "application/pdf",
    })),
  };
  if (sample.certificate && !sample.reply)
    rawMessage.attachmentList.push(certificateAttachment);
  const replyId = "aaaaaaaaaa000002";
  const reply = {
    ...rawMessage,
    messageId: replyId,
    subject: `SYNTHETIC certificate reply ${shipment}`,
    messageText: `SYNTHETIC reply attaching a certificate for ${shipment}.`,
    attachmentList: [certificateAttachment],
  };
  const gmailTransport: typeof fetch = async (input, init) => {
    const url = String(input);
    const args = init?.body ? JSON.parse(String(init.body)).arguments : {};
    if (url.includes("/connected_accounts/"))
      return Response.json({ user_id: "SYNTHETIC-user", status: "ACTIVE" });
    if (url.includes("GMAIL_FETCH_EMAILS"))
      return Response.json({
        successful: true,
        data: { messages: sample.reply ? [rawMessage, reply] : [rawMessage] },
      });
    if (url.includes("GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID"))
      return Response.json({
        successful: true,
        data: args.message_id === replyId ? reply : rawMessage,
      });
    if (url.includes("GMAIL_CREATE_EMAIL_DRAFT"))
      return Response.json({ successful: true, data: { id: "SYNTHETIC-mocked-draft-not-created" } });
    if (url.includes("GMAIL_GET_ATTACHMENT"))
      return Response.json({
        successful: true,
        data: {
          file: {
            s3url: `https://temp.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.r2.cloudflarestorage.com/${args.attachment_id}`,
          },
        },
      });
    if (url.startsWith("https://temp."))
      return new Response(
        new Uint8Array(
          url.endsWith("SYNTHETIC-certificate")
            ? certificateBytes
            : invoiceBytes[Number(url.split("-").at(-1))],
        ),
      );
    throw new Error("Unexpected synthetic Gmail request");
  };
  globalThis.fetch = async (input, init) => {
    const url = new URL(
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url,
    );
    if (url.origin === "https://api.judgmentlabs.ai")
      return transport(input, init);
    if (
      url.origin !== "https://api.openai.com" ||
      url.pathname !== "/v1/responses"
    )
      throw new Error(
        "Synthetic onboarding blocked an unexpected network destination",
      );
    const request = JSON.parse(String(init?.body));
    // This transport performs no inference. Record its actual cost explicitly
    // on the active model span; never apply this zero to production calls.
    const modelSpan = Tracer.getCurrentSpan();
    if (modelSpan) Tracer.recordLLMMetadata({ total_cost_usd: 0 }, modelSpan);
    const extracting = JSON.stringify(request.input).includes(
      "SYNTHETIC_INVOICE_EXTRACTION",
    );
    const selectedIndex = Math.max(0, invoiceArtifactIds.findIndex(id => JSON.stringify(request.input).includes(id)));
    const selectedInvoice = invoiceNumbers[selectedIndex];
    const selectedArtifact = invoiceArtifactIds[selectedIndex];
    const result = extracting
      ? {
          data: { invoice_number: selectedInvoice, ndc: sample.ndc, synthetic: true },
          fields: [
            {
              path: ["invoice_number"],
              raw_value: selectedInvoice,
              normalized_value: selectedInvoice,
              status: "found",
              evidence: [
                {
                  artifact_id: selectedArtifact,
                  page: 1,
                  text: `Invoice: ${selectedInvoice}`,
                },
              ],
              explanation: null,
            },
            {
              path: ["ndc"],
              raw_value: sample.ndc,
              normalized_value: sample.ndc,
              status: sample.ndc === null ? "absent" : "found",
              evidence: [
                {
                  artifact_id: selectedArtifact,
                  page: 1,
                  text: `NDC: ${sample.ndc ?? "not printed"}`,
                },
              ],
              explanation:
                sample.ndc === null
                  ? "SYNTHETIC fixture explicitly has no printed NDC."
                  : null,
            },
          ],
        }
      : {
          synthetic: true,
          source: "SYNTHETIC certificate interpretation",
          batches: sample.certificate ? batchNumbers : [],
          shipment_identity: sample.ambiguous ? "ambiguous" : shipment,
        };
    return Response.json({
      id: `resp_SYNTHETIC_${randomUUID()}`,
      object: "response",
      created_at: Math.floor(Date.now() / 1000),
      status: "completed",
      model: request.model,
      error: null,
      incomplete_details: null,
      output: [
        {
          type: "message",
          id: "msg_SYNTHETIC",
          role: "assistant",
          status: "completed",
          content: [
            {
              type: "output_text",
              text: JSON.stringify(result),
              annotations: [],
            },
          ],
        },
      ],
      // No model ran. These zero counts describe mocked execution, not measured inference.
      usage: {
        input_tokens: 0,
        output_tokens: 0,
        total_tokens: 0,
        input_tokens_details: { cached_tokens: 0 },
        output_tokens_details: { reasoning_tokens: 0 },
      },
    });
  };
  try {
    return await Tracer.observe(
      async (input: {
        synthetic: true;
        scenario: string;
        shipment: string;
      }) => {
        Tracer.setPropagatingAttribute("onboarding.synthetic", "true");
        Tracer.setPropagatingAttribute(
          "onboarding.source",
          "synthetic-onboarding-data",
        );
        Tracer.setPropagatingAttribute("onboarding.batch_id", batchId);
        Tracer.setPropagatingAttribute("onboarding.scenario", sample.id);
        Tracer.setPropagatingAttribute(
          "onboarding.external_dependencies",
          "mocked",
        );
        Tracer.setAttribute("judgment.agent_version", "meridian-onboarding-v1");
        const traceId = Tracer.getCurrentSpan()?.spanContext().traceId;
        const gmail = new ComposioGmail(
          { key: "SYNTHETIC-NOT-A-CREDENTIAL", account: "SYNTHETIC-account" },
          gmailTransport,
        );
        await gmail.search(`SYNTHETIC ${shipment}`, undefined, signal);
        const message = await gmail.message(messageId, signal);
        const messages = sample.reply
          ? [message, await gmail.message(replyId, signal)]
          : [message];
        const documents: ReasoningDocument[] = [];
        for (const captured of messages)
          for (const attachment of captured.attachments) {
            const bytes = await gmail.attachment(
              captured.id,
              attachment,
              signal,
            );
            documents.push({
              artifact_id:
                attachment.id === certificateAttachment.attachmentId
                  ? certificateId
                  : invoiceArtifactIds[Number(attachment.id.split("-").at(-1))],
              name: attachment.name,
              media_type: "application/pdf",
              bytes,
            });
          }
        const workflowId = randomUUID();
        const names = [
          "packet",
          "invoices",
          "certificates",
          "validate",
          ...(sample.human ? ["human"] : []),
          "report",
        ];
        const nodes = names.map((name, i) => ({
          ...nodeInput.parse({
            type:
              i === 0
                ? "trigger"
                : name === "report"
                  ? "outcome"
                  : name === "human"
                    ? "human_approval"
                    : "task",
            title: `SYNTHETIC ${name}`,
          }),
          id: randomUUID(),
          workflow_id: workflowId,
          revision: 1,
          config_version: 1,
        }));
        nodes[0].split_mode = "parallel";
        nodes[3].join_for_split_id = nodes[0].id;
        const paths = [
          [0, 1],
          [0, 2],
          [1, 3],
          [2, 3],
          ...Array.from({ length: nodes.length - 4 }, (_, i) => [i + 3, i + 4]),
        ];
        const connections = paths.map(([a, b]) => ({
          ...connectionInput.parse({
            source_node_id: nodes[a].id,
            target_node_id: nodes[b].id,
          }),
          id: randomUUID(),
          workflow_id: workflowId,
          revision: 1,
        }));
        const board = {
          workflow: { id: workflowId },
          nodes,
          connections,
        } as Board;
        const project: Project = {
          format: "meridian-project-v1",
          workflow_id: workflowId,
          frozen_spec_id: randomUUID(),
          plan_version_id: randomUUID(),
          entrypoint: "run-step.mjs",
          node_file_map: {},
          files: {},
          generator: {
            model: "SYNTHETIC-sandbox-double",
            summary:
              "External sandbox responses are mocked; no generated source executes.",
          },
        };
        const outputs: Record<string, Json> = {};
        let humanResponses = 0;
        const engine = new RuntimeEngine(
          randomUUID(),
          {
            board,
            methods: {},
            limits: { step_attempts: 20, active_ms: 20000 },
          },
          {
            now: Date.now,
            changed() {},
            async project() {},
            async human() {
              humanResponses++;
            },
            async step(scheduled, resume) {
              const index = nodes.findIndex((n) => n.id === scheduled.node_id);
              const name = names[index];
              if (name === "human" && !resume)
                return {
                  kind: "human",
                  step_id: scheduled.scheduling_key,
                  request_id: "SYNTHETIC-review",
                };
              const context: Record<string, Json> = {
                input: { ...input, email: message.text },
                steps: { ...outputs },
                ...(resume
                  ? {
                      human_response: {
                        synthetic: true,
                        decision: "request corrected documents",
                      },
                    }
                  : {}),
              };
              const result = await invokeApprovedStep(
                project,
                scheduled.node_id,
                name === "human"
                  ? "human"
                  : index === 1 || index === 2
                    ? "agent"
                    : "code",
                context,
                {
                  model: runtimeModelConfiguration(),
                  reason: reasonForStep,
                  extract: extractForStep,
                  async invoke(_project, _node, ctx) {
                    const complete = (output: Json) => ({
                      kind: "complete",
                      output,
                      matching_connection_ids: [],
                    });
                    if ("tool_result" in ctx)
                      return complete({
                        synthetic: true,
                        result: ctx.tool_result,
                      });
                    if (name === "invoices") {
                      const request = {
                        kind: "extract",
                        instructions:
                          "SYNTHETIC_INVOICE_EXTRACTION: extract printed invoice number and NDC; preserve missing fields.",
                        data: input,
                        document_ids: [artifactId],
                        output_schema: {
                          type: "object",
                          properties: {
                            invoice_number: { type: "string" },
                            ndc: { type: ["string", "null"] },
                            synthetic: { type: "boolean" },
                          },
                          required: ["invoice_number", "ndc", "synthetic"],
                          additionalProperties: false,
                        },
                        critical_paths: [["invoice_number"], ["ndc"]],
                      };
                      return sample.batches ? { kind: "extract_batch", batches: invoiceArtifactIds.map(id => ({ ...request, document_ids: [id] })) } : request;
                    }
                    if (name === "certificates")
                      return {
                        kind: "reason",
                        instructions:
                          "SYNTHETIC: interpret certificate evidence and flag uncertain shipment references.",
                        data: { ...input, email: message.text },
                        document_ids: sample.certificate ? [certificateId] : [],
                      };
                    return complete({
                      synthetic: true,
                      source: "SYNTHETIC sandbox response",
                      step: name,
                      shipment,
                      ...(name === "report"
                        ? {
                            preview: "SYNTHETIC ONBOARDING REPORT — not sent",
                            observed_steps: ctx.steps,
                          }
                        : {}),
                      ...(name === "human"
                        ? { response: ctx.human_response }
                        : {}),
                    });
                  },
                },
                signal,
                async (ids) =>
                  documents.filter((d) => ids.includes(d.artifact_id)),
              );
              outputs[name] = result.output;
              return {
                kind: "complete",
                step_id: scheduled.scheduling_key,
                connection_ids: connections
                  .filter((c) => c.source_node_id === scheduled.node_id)
                  .map((c) => c.id),
              };
            },
          },
        );
        const execution = await engine.run();
        if (execution.status !== "completed")
          Tracer.setError(
            new Error(
              execution.error?.message || "Synthetic execution incomplete",
            ),
          );
        const draftId = execution.status === "completed" && sample.human
          ? await gmail.createDraft({ subject: "SYNTHETIC missing invoice evidence", body: "SYNTHETIC ONBOARDING: please supply corrected documents. This draft is mocked and was not created.", recipient: "synthetic@example.invalid" }, signal)
          : null;
        return {
          synthetic: true,
          mocked_draft_id: draftId,
          scenario: sample.id,
          trace_id: traceId,
          status: execution.status,
          error: execution.error,
          human_responses: humanResponses,
          report: outputs.report,
        };
      },
      { spanType: "agent", spanName: "SYNTHETIC invoice workflow onboarding" },
    )({ synthetic: true, scenario: sample.id, shipment });
  } finally {
    globalThis.fetch = transport;
  }
}
