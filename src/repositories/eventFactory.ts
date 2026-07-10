import {
  encryptPayload,
  generateDataKey,
  signEvent,
  wrapDataKey,
  type ActiveRoleContext,
  type DatabaseKind,
  type DeviceCertificate,
  type SignedEvent,
  type UserKeySet,
} from "@klinok/protocol";

export interface EventFactoryOptions {
  context: ActiveRoleContext;
  keys: UserKeySet;
}

export class EventFactory {
  constructor(private options: EventFactoryOptions) {}

  setContext(context: ActiveRoleContext) {
    this.options = { ...this.options, context };
  }

  async create<TMetadata extends Record<string, unknown>>(input: {
    database: DatabaseKind;
    eventType: string;
    aggregateId: string;
    resourceId?: string;
    operationId?: string;
    parents?: string[];
    proofIds?: string[];
    metadata: TMetadata;
    cleartext: unknown;
    recipients: DeviceCertificate[];
    dataKey?: CryptoKey;
  }): Promise<SignedEvent<TMetadata>> {
    const dataKey = input.dataKey ?? await generateDataKey();
    const keyring = await wrapDataKey(dataKey, await Promise.all(input.recipients.map(async (certificate) => ({
      recipientId: certificate.accountId,
      keyVersion: certificate.userKeyVersion,
      publicKey: await crypto.subtle.importKey(
        "jwk",
        certificate.encryptionPublicKey,
        { name: "RSA-OAEP", hash: "SHA-256" },
        true,
        ["wrapKey"],
      ),
    }))));
    const context = this.options.context;
    return signEvent({
      schemaVersion: 1,
      database: input.database,
      eventId: crypto.randomUUID(),
      operationId: input.operationId ?? crypto.randomUUID(),
      eventType: input.eventType,
      aggregateId: input.aggregateId,
      resourceId: input.resourceId ?? input.aggregateId,
      createdAt: new Date().toISOString(),
      actorAccountId: context.accountId,
      actorDeviceId: context.deviceId,
      orbitIdentityId: context.orbitIdentityId,
      activeRole: context.role,
      parents: input.parents ?? [],
      keyVersion: context.userKeyVersion,
      proofIds: input.proofIds ?? [context.roleProofId],
      metadata: input.metadata,
      keyring,
      payload: await encryptPayload(input.cleartext, dataKey),
    }, this.options.keys.signingPrivateKey);
  }
}
