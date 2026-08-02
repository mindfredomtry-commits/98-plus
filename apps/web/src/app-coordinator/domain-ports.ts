/**
 * Coordinator → domain port contracts.
 * Built at composition boundary; Coordinator never imports domain controllers.
 */
import type { DomainCapability } from '@/domain-capability';
import type { DomainId } from './application-owner';
import type { CreateBanUiIntent } from '@/product-flow/create-ban/create-ban.types';
import type { SettingsIntent } from '@/settings/settings.types';

/** CreateBan domain port — typed intents stay at this boundary. */
export type CreateBanDomainPort = {
  dispatch(intent: CreateBanUiIntent): void;
  getCapability(): DomainCapability;
};

/** Settings domain port — typed intents stay at this boundary. */
export type SettingsDomainPort = {
  dispatch(intent: SettingsIntent): void;
  getCapability(): DomainCapability;
};

/**
 * Registered domain ports for Stage 8 Phase 4.
 * Typed registry — not an untyped service locator.
 */
export type ApplicationDomainPorts = {
  CREATE_BAN: CreateBanDomainPort;
  SETTINGS: SettingsDomainPort;
};

export type DomainIntent =
  | { domain: 'CREATE_BAN'; intent: CreateBanUiIntent }
  | { domain: 'SETTINGS'; intent: SettingsIntent };

export type DomainIntentRouter = {
  /**
   * Route a domain intent to exactly one port when domain is Current Owner.
   * Does not inspect intent payload.
   */
  routeDomainIntent(input: DomainIntent): void;
};
