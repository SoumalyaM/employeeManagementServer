import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DepartmentService {
  constructor(private prisma: PrismaService) {}

  async getDepartments() {
    try {
      const departments = await this.prisma.department.findMany({
        include: {
          deptManager: {
            where: { toDate: new Date('9999-01-01') },
            include: { employee: true }
          }
        }
      });

      return departments.map(dept => ({
        deptNo: dept.deptNo,
        deptName: dept.deptName,
        lastManager: dept.deptManager[0] ? {
          empNo: dept.deptManager[0].employee.empNo,
          name: `${dept.deptManager[0].employee.firstName} ${dept.deptManager[0].employee.lastName}`,
          fromDate: dept.deptManager[0].fromDate,
          toDate: dept.deptManager[0].toDate
        } : null
      }));
    } catch (error) {
      console.error('Error fetching departments:', error);
      throw new Error('Failed to fetch departments');
    }
  }

  async getDepartmentManagers(deptNo: string) {
    try {
      const managers = await this.prisma.deptManager.findMany({
        where: { deptNo },
        include: { employee: true },
        orderBy: { fromDate: 'desc' }
      });

      return managers.map(manager => ({
        empNo: manager.employee.empNo,
        name: `${manager.employee.firstName} ${manager.employee.lastName}`,
        fromDate: manager.fromDate,
        toDate: manager.toDate,
        duration: this.calculateDuration(manager.fromDate, manager.toDate)
      }));
    } catch (error) {
      console.error('Error fetching department managers:', error);
      throw new Error('Failed to fetch department managers');
    }
  }

  private calculateDuration(fromDate: Date, toDate: Date): string {
    const start = new Date(fromDate);
    const end = toDate.getTime() === new Date('9999-01-01').getTime() ? new Date() : new Date(toDate);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    const years = Math.floor(diffDays / 365);
    const months = Math.floor((diffDays % 365) / 30);
    
    if (years > 0) {
      return `${years} year${years > 1 ? 's' : ''} ${months} month${months > 1 ? 's' : ''}`;
    } else {
      return `${months} month${months > 1 ? 's' : ''}`;
    }
  }
}
