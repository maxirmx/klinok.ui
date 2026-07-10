import {
  InMemorySignedEventRepository,
  type ActiveRoleContext,
  type AuthSessionDto,
  type Role,
  type UserKeySet,
} from "@klinok/protocol";
import type { AppRuntimeConfig } from "../runtimeConfig";
import { ControlRepository } from "./controlRepository";
import { IndexedDbEventTransport, MemoryEventTransport, type EventTransport } from "./eventTransport";
import { MedicalRepository } from "./medicalRepository";
import { OrbitEventTransport } from "./orbitTransport";

export class KlinokRepository {
  readonly control: ControlRepository;
  readonly medical: MedicalRepository;

  private constructor(
    private readonly transport: EventTransport,
    control: ControlRepository,
    medical: MedicalRepository,
  ) {
    this.control = control;
    this.medical = medical;
  }

  static async create(options: {
    config: AppRuntimeConfig;
    session: Required<Pick<AuthSessionDto, "accountId" | "device">> & AuthSessionDto;
    keys: UserKeySet;
    initialRole: Role;
    transport?: EventTransport;
  }): Promise<KlinokRepository> {
    const context: ActiveRoleContext = {
      accountId: options.session.accountId,
      deviceId: options.session.device.deviceId,
      orbitIdentityId: options.session.device.orbitIdentityId,
      role: options.initialRole,
      roleProofId: `setup:${options.initialRole}`,
      userKeyVersion: options.keys.version,
    };
    const signed = new InMemorySignedEventRepository(options.config.p2p.bootstrapAccountId, {
      authAttestationPublicKey: options.config.p2p.authAttestationPublicKey,
      bootstrapSigningPublicKey: options.config.p2p.bootstrapSigningPublicKey,
      requireTrustedAttestation: options.config.p2p.enabled,
    });
    const transport = options.transport ?? (options.config.p2p.enabled
      ? new OrbitEventTransport(options.config.p2p, context.orbitIdentityId)
      : new IndexedDbEventTransport());
    await transport.initialize();
    const control = new ControlRepository(transport, context, options.keys, options.session.device, options.config.p2p.bootstrapAccountId, signed);
    const medical = new MedicalRepository(transport, context, options.keys, options.session.device, control);
    const enrollment = options.session.enrollments?.find((candidate) => candidate.deviceId === options.session.device.deviceId);
    await control.initialize(options.session.setup, enrollment?.operationId);
    await medical.initialize();
    return new KlinokRepository(transport, control, medical);
  }

  static memoryTransport() { return new MemoryEventTransport(); }

  setActiveRole(role: Role, roleProofId: string) {
    this.control.setActiveRole(role, roleProofId);
    this.medical.setActiveRole(role, roleProofId);
  }

  async conflicts() {
    const stored = await this.transport.listConflicts();
    const roleConflicts = this.control.signed.state.roleConflicts.map((conflict) => ({
      eventId: conflict.losingEventId,
      database: "control" as const,
      code: "ROLE_CONFLICT_LOST",
      message: `Конкурирующая ветвь роли проиграла событию ${conflict.winningEventId}.`,
      createdAt: "",
    }));
    return [...stored, ...roleConflicts];
  }

  async dispose() {
    await this.control.dispose();
    await this.medical.dispose();
    await this.transport.dispose();
  }
}
