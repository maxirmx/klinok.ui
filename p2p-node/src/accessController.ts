import {
  applyAcceptedEvent,
  ACCESS_CONTROLLER_TYPES,
  createProtocolState,
  describeOrbitEntryShape,
  extractSignedEvent,
  shouldDeferEventVerification,
  verifySignedEvent,
  type ProtocolState,
  type SignedEvent,
} from "@klinok/protocol";

interface LogEntry {
  identity?: string;
  payload?: { value?: unknown };
  value?: unknown;
}

export interface AccessRejectionDetails {
  entryShape: string;
  entryIdentity?: string;
  eventOrbitIdentity?: string;
}

export interface DynamicAccessControllerOptions {
  state?: ProtocolState;
  database?: "control" | "medical";
  onRejected?: (event: SignedEvent | undefined, code: string, details: AccessRejectionDetails) => void;
  onDeferred?: (event: SignedEvent, code: string, details: AccessRejectionDetails) => void;
  authAttestationPublicKey?: JsonWebKey;
  bootstrapSigningPublicKey?: JsonWebKey;
  requireTrustedAttestation?: boolean;
}

export function createDynamicAccessController(options: DynamicAccessControllerOptions = {}) {
  const state = options.state ?? createProtocolState(process.env.KLINOK_BOOTSTRAP_ACCOUNT_ID);
  const database = options.database ?? "control";
  const type = ACCESS_CONTROLLER_TYPES[database];
  const factory = async () => ({
    type,
    address: `/${type}`,
    async canAppend(entry: LogEntry) {
      const baseDetails = { entryShape: describeOrbitEntryShape(entry), ...(entry.identity ? { entryIdentity: entry.identity } : {}) };
      if (!entry.identity) {
        options.onRejected?.(undefined, "ENTRY_IDENTITY_MISSING", baseDetails);
        return false;
      }
      const event = extractSignedEvent(entry);
      if (!event) {
        options.onRejected?.(undefined, "EVENT_PAYLOAD_INVALID", baseDetails);
        return false;
      }
      const details = { ...baseDetails, eventOrbitIdentity: event.orbitIdentityId };
      if (event.database !== database) {
        options.onRejected?.(event, "DATABASE_MISMATCH", details);
        return false;
      }
      const result = await verifySignedEvent(event, state, {
        allowUnknownDevice: event.eventType === "device.attested",
        authAttestationPublicKey: options.authAttestationPublicKey,
        bootstrapSigningPublicKey: options.bootstrapSigningPublicKey,
        requireTrustedAttestation: options.requireTrustedAttestation,
      });
      // OrbitDB may replay a log from its heads towards its roots. A child can
      // reach canAppend before its logical parent even when both entries are
      // present. The deterministic reducer retries it once dependencies exist.
      if (shouldDeferEventVerification(result)) {
        options.onDeferred?.(event, result.code ?? "AUTHORIZATION_DEPENDENCY_MISSING", details);
        return true;
      }
      if (!result.accepted) {
        options.onRejected?.(event, result.code ?? "EVENT_REJECTED", details);
        return false;
      }
      applyAcceptedEvent(event, state);
      return true;
    },
  });
  return Object.assign(factory, { type });
}

export const KlinokAccessController = createDynamicAccessController();
