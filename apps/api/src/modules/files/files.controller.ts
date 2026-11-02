import { Controller, Get, Post, Param, Body, Query } from '@nestjs/common';
import { Roles } from '../../common/roles.decorator';
import { FilesService } from './files.service';

/**
 * Module files — Stockage, analyse antivirus
 */
@Controller()
export class FilesController {
  constructor(private readonly service: FilesService) {}

  /** URL signée de dépôt — rôles : any */
  @Post('files/presign')
  @Roles('any')
  postFilesPresign(@Body() body: unknown) {
    return this.service.postFilesPresign({ body });
  }

  /** Téléchargement contrôlé — rôles : authorized */
  @Get('files/:id')
  @Roles('authorized')
  getFilesById(@Param() params: Record<string, string>, @Query() query: Record<string, string>) {
    return this.service.getFilesById({ params, query });
  }

}
