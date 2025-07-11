import { Injectable } from '@nestjs/common';

@Injectable()
export class ViewService {
  private views: any[] = [];
  private nextId = 1;

  async getViews() {
    return this.views;
  }

  async saveView(viewData: any) {
    const newView = {
      id: this.nextId++,
      name: viewData.name,
      filters: viewData.filters,
      createdAt: new Date()
    };
    this.views.push(newView);
    return newView;
  }

  async deleteView(id: number) {
    const index = this.views.findIndex(view => view.id === id);
    if (index > -1) {
      this.views.splice(index, 1);
      return { success: true };
    }
    throw new Error('View not found');
  }
}
