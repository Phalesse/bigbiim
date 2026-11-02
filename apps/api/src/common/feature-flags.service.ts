import { Injectable } from '@nestjs/common';

/**
 * Drapeaux de fonctionnalités (OpenFeature / Unleash, section 5.5).
 * À coder : brancher le fournisseur choisi.
 */
@Injectable()
export class FeatureFlagsService {
  isEnabled(key: string): boolean {
    void key;
    return false;
  }
}
