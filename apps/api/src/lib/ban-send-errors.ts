import {
  DAILY_BAN_LIMIT_ERROR,
  DAILY_BAN_LIMIT_ERROR_CODE,
  INSUFFICIENT_ENERGY_ERROR,
  type CanSendBanCode,
} from '@98plus/shared';

export { INSUFFICIENT_ENERGY_ERROR, DAILY_BAN_LIMIT_ERROR_CODE };

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

export class DailyBanLimitError extends Error {
  readonly code = DAILY_BAN_LIMIT_ERROR_CODE;
  readonly redirectToLobby = true;

  constructor(message = DAILY_BAN_LIMIT_ERROR) {
    super(message);
    this.name = 'DailyBanLimitError';
  }
}

export function isInsufficientEnergyError(
  err: unknown,
): err is InsufficientEnergyError {
  return err instanceof InsufficientEnergyError;
}

export function isDailyBanLimitError(err: unknown): err is DailyBanLimitError {
  return err instanceof DailyBanLimitError;
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
  if (result.code === DAILY_BAN_LIMIT_ERROR_CODE) {
    throw new DailyBanLimitError(
      result.reason === DAILY_BAN_LIMIT_ERROR ? result.reason : undefined,
    );
  }
  throw new Error(result.reason ?? 'Not allowed');
}
