import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class EmployeeService {
  constructor(private prisma: PrismaService) {}

  async getEmployees(query: any) {
    const {
      page = 1,
      limit = 50,
      sortBy = 'empNo',
      sortOrder = 'asc',
      name,
      names,
      departments,
      minSalary,
      maxSalary,
      minAge,
      maxAge,
    } = query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    let where: any = {};
    let orderBy: any = {};

    if (name) {
      where.OR = [
        { firstName: { contains: name } },
        { lastName: { contains: name } },
      ];
    }

    if (names && names.length > 0) {
      const nameArray = Array.isArray(names) ? names : [names];
      where.OR = nameArray.map(fullName => {
        const [firstName, ...lastNameParts] = fullName.split(' ');
        const lastName = lastNameParts.join(' ');
        return {
          AND: [
            { firstName: { contains: firstName } },
            { lastName: { contains: lastName } }
          ]
        };
      });
    }

    if (departments) {
      const deptArray = Array.isArray(departments) ? departments : [departments];
      where.deptEmp = {
        some: {
          department: {
            deptNo: { in: deptArray }
          }
        }
      };
    }

    if (minAge || maxAge) {
      const currentDate = new Date();
      if (maxAge) {
        const minBirthDate = new Date(currentDate.getFullYear() - parseInt(maxAge) - 1, currentDate.getMonth(), currentDate.getDate());
        where.birthDate = { ...where.birthDate, gte: minBirthDate };
      }
      if (minAge) {
        const maxBirthDate = new Date(currentDate.getFullYear() - parseInt(minAge), currentDate.getMonth(), currentDate.getDate());
        where.birthDate = { ...where.birthDate, lte: maxBirthDate };
      }
    }

    switch (sortBy) {
      case 'name':
        orderBy = { firstName: sortOrder };
        break;
      case 'department':
        orderBy = { empNo: 'asc' }; 
        break;
      case 'lastSalary':
        orderBy = { empNo: 'asc' }; 
        break;
      default:
        orderBy = { empNo: sortOrder };
    }

    try {
      let employees;
      
      if (sortBy === 'lastSalary' || sortBy === 'department') {
        const allMatchingEmployees = await this.prisma.employee.findMany({
          where,
          include: {
            deptEmp: {
              orderBy: { fromDate: 'desc' },
              take: 1,
              include: { department: true }
            },
            salaries: {
              orderBy: { fromDate: 'desc' },
              take: 1
            },
            titles: {
              orderBy: { fromDate: 'desc' },
              take: 1
            }
          }
        });
        
        const sortedEmployees = allMatchingEmployees.sort((a, b) => {
          if (sortBy === 'lastSalary') {
            const salaryA = a.salaries[0]?.salary || 0;
            const salaryB = b.salaries[0]?.salary || 0;
            
            if (sortOrder === 'asc') {
              return salaryA - salaryB;
            } else {
              return salaryB - salaryA;
            }
          } else if (sortBy === 'department') {
            const deptA = a.deptEmp[0]?.department?.deptName || 'No Department';
            const deptB = b.deptEmp[0]?.department?.deptName || 'No Department';
            
            if (sortOrder === 'asc') {
              return deptA.localeCompare(deptB);
            } else {
              return deptB.localeCompare(deptA);
            }
          }
          return 0;
        });
        
        employees = sortedEmployees.slice(skip, skip + take);
      } else {
        employees = await this.prisma.employee.findMany({
          where,
          skip,
          take,
          orderBy,
          include: {
            deptEmp: {
              orderBy: { fromDate: 'desc' },
              take: 1,
              include: { department: true }
            },
            salaries: {
              orderBy: { fromDate: 'desc' },
              take: 1
            },
            titles: {
              orderBy: { fromDate: 'desc' },
              take: 1
            }
          }
        });
      }

      let filteredEmployees = employees;

      if (minSalary || maxSalary) {
        filteredEmployees = employees.filter(emp => {
          const lastSalary = emp.salaries[0]?.salary || 0;
          if (minSalary && lastSalary < parseInt(minSalary)) return false;
          if (maxSalary && lastSalary > parseInt(maxSalary)) return false;
          return true;
        });
      }

      const total = await this.prisma.employee.count({ where });

      const result = filteredEmployees.map(emp => ({
        empNo: emp.empNo,
        firstName: emp.firstName,
        lastName: emp.lastName,
        name: `${emp.firstName} ${emp.lastName}`,
        gender: emp.gender,
        birthDate: emp.birthDate,
        hireDate: emp.hireDate,
        department: emp.deptEmp[0]?.department?.deptName || 'No Department',
        deptNo: emp.deptEmp[0]?.department?.deptNo || null,
        lastTitle: emp.titles[0]?.title || 'No Title',
        lastSalary: emp.salaries[0]?.salary || 0,
        age: Math.floor((new Date().getTime() - new Date(emp.birthDate).getTime()) / (1000 * 60 * 60 * 24 * 365.25))
      }));

      return {
        data: result,
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit))
      };
    } catch (error) {
      console.error('Error fetching employees:', error);
      throw new Error('Failed to fetch employees');
    }
  }

  async searchEmployeeNames(searchTerm: string, limit: number = 50): Promise<string[]> {
    if (!searchTerm || searchTerm.length < 2) {
      return [];
    }

    try {
      const employees = await this.prisma.employee.findMany({
        where: {
          OR: [
            {
              firstName: {
                contains: searchTerm
              }
            },
            {
              lastName: {
                contains: searchTerm
              }
            },
            {
              firstName: {
                startsWith: searchTerm
              }
            },
            {
              lastName: {
                startsWith: searchTerm
              }
            }
          ]
        },
        select: {
          firstName: true,
          lastName: true
        },
        orderBy: [
          { firstName: 'asc' },
          { lastName: 'asc' }
        ],
        take: limit * 2 
      });

      const fullNames = employees.map(emp => `${emp.firstName} ${emp.lastName}`);
      const uniqueNames = [...new Set(fullNames)];
      
      return uniqueNames
        .sort((a, b) => a.localeCompare(b))
        .slice(0, limit);

    } catch (error) {
      console.error('Error searching employee names:', error);
      throw new Error('Failed to search employee names');
    }
  }

  async getEmployeeRanges() {
    try {
  
      const salaryStats = await this.prisma.salary.aggregate({
        _min: { salary: true },
        _max: { salary: true }
      });

      const birthDateStats = await this.prisma.employee.aggregate({
        _min: { birthDate: true },
        _max: { birthDate: true }
      });

      const currentDate = new Date();
      const minAge = Math.floor((currentDate.getTime() - new Date(birthDateStats._max.birthDate).getTime()) / (1000 * 60 * 60 * 24 * 365.25));
      const maxAge = Math.floor((currentDate.getTime() - new Date(birthDateStats._min.birthDate).getTime()) / (1000 * 60 * 60 * 24 * 365.25));

      return {
        salaryRange: {
          min: salaryStats._min.salary || 30000,
          max: salaryStats._max.salary || 150000
        },
        ageRange: {
          min: minAge || 20,
          max: maxAge || 70
        }
      };
    } catch (error) {
      console.error('Error fetching employee ranges:', error);
      throw new Error('Failed to fetch employee ranges');
    }
  }

  async getEmployee(empNo: number) {
    try {
      const employee = await this.prisma.employee.findUnique({
        where: { empNo },
        include: {
          deptEmp: {
            include: { department: true }
          },
          salaries: {
            orderBy: { fromDate: 'desc' }
          },
          titles: {
            orderBy: { fromDate: 'desc' }
          }
        }
      });

      if (!employee) {
        throw new Error('Employee not found');
      }

      return {
        ...employee,
        name: `${employee.firstName} ${employee.lastName}`,
        age: Math.floor((new Date().getTime() - new Date(employee.birthDate).getTime()) / (1000 * 60 * 60 * 24 * 365.25))
      };
    } catch (error) {
      console.error('Error fetching employee:', error);
      throw new Error('Failed to fetch employee details');
    }
  }

  async getEmployeeSalaries(empNo: number) {
    try {
      return this.prisma.salary.findMany({
        where: { empNo },
        orderBy: { fromDate: 'desc' }
      });
    } catch (error) {
      console.error('Error fetching employee salaries:', error);
      throw new Error('Failed to fetch employee salaries');
    }
  }

  async getEmployeeTitles(empNo: number) {
    try {
      return this.prisma.title.findMany({
        where: { empNo },
        orderBy: { fromDate: 'desc' }
      });
    } catch (error) {
      console.error('Error fetching employee titles:', error);
      throw new Error('Failed to fetch employee titles');
    }
  }
}


