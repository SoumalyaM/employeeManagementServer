import { Controller, Get, Param } from '@nestjs/common';
import { DepartmentService } from './department.service';

@Controller('departments')
export class DepartmentController {
  constructor(private readonly departmentService: DepartmentService) {}

  @Get()
  async getDepartments() {
    return this.departmentService.getDepartments();
  }

  @Get(':id/managers')
  async getDepartmentManagers(@Param('id') id: string) {
    return this.departmentService.getDepartmentManagers(id);
  }
}
