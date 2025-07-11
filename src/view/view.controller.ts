import { Controller, Get, Post, Delete, Body, Param } from '@nestjs/common';
import { ViewService } from './view.service';

@Controller('views')
export class ViewController {
  constructor(private readonly viewService: ViewService) {}

  @Get()
  async getViews() {
    return this.viewService.getViews();
  }

  @Post()
  async saveView(@Body() viewData: any) {
    return this.viewService.saveView(viewData);
  }

  @Delete(':id')
  async deleteView(@Param('id') id: string) {
    return this.viewService.deleteView(parseInt(id));
  }
}
