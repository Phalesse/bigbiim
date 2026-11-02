import { Injectable, NotImplementedException } from '@nestjs/common';
import { RequestInput } from '../../common/request-input';

/**
 * Module files — Stockage, analyse antivirus
 */
@Injectable()
export class FilesService {
  /** POST /files/presign — URL signée de dépôt */
  async postFilesPresign(input: RequestInput): Promise<unknown> {
    void input;
    throw new NotImplementedException(
      'Dépôt indisponible : aucun stockage objet ni fournisseur d’URL pré-signée/scan antivirus n’est configuré.',
    );
  }

  /** GET /files/{id} — Téléchargement contrôlé */
  async getFilesById(input: RequestInput): Promise<unknown> {
    void input;
    throw new NotImplementedException(
      'Téléchargement indisponible : aucun service de stockage ni mécanisme d’URL temporaire n’est configuré.',
    );
  }

}
