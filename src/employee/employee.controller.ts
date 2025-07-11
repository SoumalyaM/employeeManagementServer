import { Controller, Get, Query, Param } from '@nestjs/common';
import { EmployeeService } from './employee.service';

@Controller('employees')
export class EmployeeController {
  constructor(private readonly employeeService: EmployeeService) {}

  @Get()
  async getEmployees(@Query() query: any) {
    return this.employeeService.getEmployees(query);
  }

  @Get('search-names')
  async searchEmployeeNames(@Query('q') searchTerm: string, @Query('limit') limit?: string) {
    return this.employeeService.searchEmployeeNames(searchTerm, parseInt(limit) || 50);
  }

  @Get('ranges')
  async getEmployeeRanges() {
    return this.employeeService.getEmployeeRanges();
  }

  @Get(':id')
  async getEmployee(@Param('id') id: string) {
    return this.employeeService.getEmployee(parseInt(id));
  }

  @Get(':id/salaries')
  async getEmployeeSalaries(@Param('id') id: string) {
    return this.employeeService.getEmployeeSalaries(parseInt(id));
  }

  @Get(':id/titles')
  async getEmployeeTitles(@Param('id') id: string) {
    return this.employeeService.getEmployeeTitles(parseInt(id));
  }
}
