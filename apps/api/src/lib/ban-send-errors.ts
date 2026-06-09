import {
  INSUFFICIENT_ENERGY_ERROR,
  type CanSendBanCode,
} from '@98plus/shared';

export { INSUFFICIENT_ENERGY_ERROR };

export class InsufficientEnergyError extends Error {
  readonly code = INSUFFICIENT_ENERGY_ERROR;
  readonly redirectToLobby = true;

  constructor(
    message = 'Выполни пару запретов от других — и сможешь запрещать снова!',
  ) {
    super(message);
    this.name = 'InsufficientEnergyError';
  }
}

export function isInsufficientEnergyError(
  err: unknown,
): err is InsufficientEnergyError {
  return err instanceof InsufficientEnergyError;
}

export type CanSendBanResult = {
  allowed: boolean;
  reason?: string;
  code?: CanSendBanCode;
};

export function assertCanSendBan(result: CanSendBanResult): void {
  if (result.allowed) return;
  if (result.code === INSUFFICIENT_ENERGY_ERROR) {
    throw new InsufficientEnergyError(result.reason);
  }
  throw new Error(result.reason ?? 'Not allowed');
}
