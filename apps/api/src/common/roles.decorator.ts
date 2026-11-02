import { SetMetadata } from '@nestjs/common';
import { Role } from './roles';

export const ROLES_KEY = 'roles';
/** Rôles autorisés sur la route (C = client, P = prestataire, A = administrateur). */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
