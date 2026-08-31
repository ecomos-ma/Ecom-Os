export class ReceiptProcessor {
  constructor({ repository, logger }) {
    this.repository = repository;
    this.logger = logger;
  }

  async handle(workspaceId, receipt) {
    if (!this.repository.configured || !receipt?.providerMessageId) return;
    try {
      await this.repository.updateReceipt(workspaceId, receipt.providerMessageId, receipt.status);
    } catch (error) {
      this.logger.error({ err: error, workspaceId, providerMessageId: receipt.providerMessageId }, "receipt persistence failed");
    }
  }
}
