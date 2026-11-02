import type { AuthenticatedPrincipal } from './oidc-token.service';

/** Entrée commune transmise par les contrôleurs aux services. */
export interface RequestInput {
  params?: Record<string, string>;
  query?: Record<string, string>;
  body?: unknown;
  principal?: AuthenticatedPrincipal;
}
