import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

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
      
      if (nameArray.length > 1000) {
        const nameQuery = nameArray.map(fullName => {
          const [firstName, ...lastNameParts] = fullName.split(' ');
          const lastName = lastNameParts.join(' ');
          return `(firstName LIKE '%${firstName}%' AND lastName LIKE '%${lastName}%')`;
        }).join(' OR ');
        
        const nameFilteredEmps = await this.prisma.$queryRawUnsafe<Array<{emp_no: number}>>(
          `SELECT DISTINCT emp_no FROM employees WHERE ${nameQuery}`
        );
        
        if (nameFilteredEmps.length === 0) {
          return {
            data: [],
            total: 0,
            page: parseInt(page),
            limit: parseInt(limit),
            totalPages: 0
          };
        }
        
        const nameEmpNos = nameFilteredEmps.map(emp => emp.emp_no);
        
        if (nameEmpNos.length > 10000) {
          where._isLargeNameSet = true;
          where._nameEmpNos = nameEmpNos;
        } else {
          where.empNo = { in: nameEmpNos };
        }
      } else {
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

    if (departments) {
      const deptArray = Array.isArray(departments) ? departments : [departments];
      
      try {
        const placeholders = deptArray.map(() => '?').join(',');
        let query = `
          SELECT DISTINCT de1.emp_no
          FROM dept_emp de1
          INNER JOIN (
            SELECT emp_no, MAX(from_date) as max_date
            FROM dept_emp
            GROUP BY emp_no
          ) de2 ON de1.emp_no = de2.emp_no AND de1.from_date = de2.max_date
          WHERE de1.dept_no IN (${placeholders})
        `;
        
        if (minSalary || maxSalary) {
          query = `
            SELECT DISTINCT de1.emp_no
            FROM dept_emp de1
            INNER JOIN (
              SELECT emp_no, MAX(from_date) as max_date
              FROM dept_emp
              GROUP BY emp_no
            ) de2 ON de1.emp_no = de2.emp_no AND de1.from_date = de2.max_date
            INNER JOIN (
              SELECT emp_no, MAX(from_date) as max_salary_date
              FROM salaries
              GROUP BY emp_no
            ) s2 ON de1.emp_no = s2.emp_no
            INNER JOIN salaries s ON de1.emp_no = s.emp_no AND s.from_date = s2.max_salary_date
            WHERE de1.dept_no IN (${placeholders})
            ${minSalary ? `AND s.salary >= ${parseInt(minSalary)}` : ''}
            ${maxSalary ? `AND s.salary <= ${parseInt(maxSalary)}` : ''}
          `;
        }
        
        const latestDeptEmps = await this.prisma.$queryRawUnsafe<Array<{emp_no: number}>>(query, ...deptArray);
        
        if (latestDeptEmps.length === 0) {
          return {
            data: [],
            total: 0,
            page: parseInt(page),
            limit: parseInt(limit),
            totalPages: 0
          };
        }
        
        const departmentEmpNos = latestDeptEmps.map(emp => emp.emp_no);
        
        const BATCH_SIZE = 10000;
        const batches = [];
        for (let i = 0; i < departmentEmpNos.length; i += BATCH_SIZE) {
          batches.push(departmentEmpNos.slice(i, i + BATCH_SIZE));
        }
        
        let allEmployees = [];
        
        for (const batch of batches) {
          const batchWhere = { ...where, empNo: { in: batch } };
          
          const batchEmployees = await this.prisma.employee.findMany({
            where: batchWhere,
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
          allEmployees.push(...batchEmployees);
        }
        
        let filteredEmployees = allEmployees;
        
        if (sortBy === 'lastSalary' || sortBy === 'department') {
          filteredEmployees.sort((a, b) => {
            if (sortBy === 'lastSalary') {
              const salaryA = a.salaries[0]?.salary || 0;
              const salaryB = b.salaries[0]?.salary || 0;
              return sortOrder === 'asc' ? salaryA - salaryB : salaryB - salaryA;
            } else if (sortBy === 'department') {
              const deptA = a.deptEmp[0]?.department?.deptName || 'No Department';
              const deptB = b.deptEmp[0]?.department?.deptName || 'No Department';
              return sortOrder === 'asc' ? deptA.localeCompare(deptB) : deptB.localeCompare(deptA);
            }
            return 0;
          });
        } else {
          filteredEmployees.sort((a, b) => {
            if (sortBy === 'name') {
              const nameA = a.firstName;
              const nameB = b.firstName;
              return sortOrder === 'asc' ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA);
            } else {
              const fieldA = a[sortBy] || 0;
              const fieldB = b[sortBy] || 0;
              return sortOrder === 'asc' ? (fieldA > fieldB ? 1 : -1) : (fieldA < fieldB ? 1 : -1);
            }
          });
        }
        
        const total = filteredEmployees.length;
        const employees = filteredEmployees.slice(skip, skip + take);

        const result = employees.map(emp => ({
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
        throw new Error('Failed to fetch employees with department filter');
      }
    }

    try {
      let employees;
      let total;
      
      if (minSalary || maxSalary) {
        const salaryQuery = `
          SELECT DISTINCT e.emp_no
          FROM employees e
          INNER JOIN (
            SELECT emp_no, MAX(from_date) as max_salary_date
            FROM salaries
            GROUP BY emp_no
          ) s2 ON e.emp_no = s2.emp_no
          INNER JOIN salaries s ON e.emp_no = s.emp_no AND s.from_date = s2.max_salary_date
          WHERE 1=1
          ${minSalary ? `AND s.salary >= ${parseInt(minSalary)}` : ''}
          ${maxSalary ? `AND s.salary <= ${parseInt(maxSalary)}` : ''}
        `;
        
        const salaryFilteredEmps = await this.prisma.$queryRawUnsafe<Array<{emp_no: number}>>(salaryQuery);
        
        if (salaryFilteredEmps.length === 0) {
          return {
            data: [],
            total: 0,
            page: parseInt(page),
            limit: parseInt(limit),
            totalPages: 0
          };
        }
        
        const salaryEmpNos = salaryFilteredEmps.map(emp => emp.emp_no);
        
        const BATCH_SIZE = 10000;
        const batches = [];
        for (let i = 0; i < salaryEmpNos.length; i += BATCH_SIZE) {
          batches.push(salaryEmpNos.slice(i, i + BATCH_SIZE));
        }
        
        let allEmployees = [];
        
        for (const batch of batches) {
          const batchWhere = { ...where, empNo: { in: batch } };
          
          const batchEmployees = await this.prisma.employee.findMany({
            where: batchWhere,
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
          allEmployees.push(...batchEmployees);
        }
        
        if (sortBy === 'lastSalary' || sortBy === 'department') {
          const sortedEmployees = allEmployees.sort((a, b) => {
            if (sortBy === 'lastSalary') {
              const salaryA = a.salaries[0]?.salary || 0;
              const salaryB = b.salaries[0]?.salary || 0;
              return sortOrder === 'asc' ? salaryA - salaryB : salaryB - salaryA;
            } else if (sortBy === 'department') {
              const deptA = a.deptEmp[0]?.department?.deptName || 'No Department';
              const deptB = b.deptEmp[0]?.department?.deptName || 'No Department';
              return sortOrder === 'asc' ? deptA.localeCompare(deptB) : deptB.localeCompare(deptA);
            }
            return 0;
          });
          
          employees = sortedEmployees.slice(skip, skip + take);
          total = sortedEmployees.length;
        } else {
          allEmployees.sort((a, b) => {
            if (sortBy === 'name') {
              const nameA = a.firstName;
              const nameB = b.firstName;
              return sortOrder === 'asc' ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA);
            } else {
              const fieldA = a[sortBy] || 0;
              const fieldB = b[sortBy] || 0;
              return sortOrder === 'asc' ? (fieldA > fieldB ? 1 : -1) : (fieldA < fieldB ? 1 : -1);
            }
          });
          
          employees = allEmployees.slice(skip, skip + take);
          total = allEmployees.length;
        }
      } else if (sortBy === 'lastSalary' || sortBy === 'department') {
        let allMatchingEmployees;
        
        if (where._isLargeNameSet) {
          const nameEmpNos = where._nameEmpNos;
          delete where._isLargeNameSet;
          delete where._nameEmpNos;
          
          const BATCH_SIZE = 10000;
          const batches = [];
          for (let i = 0; i < nameEmpNos.length; i += BATCH_SIZE) {
            batches.push(nameEmpNos.slice(i, i + BATCH_SIZE));
          }
          
          allMatchingEmployees = [];
          
          for (const batch of batches) {
            const batchWhere = { ...where, empNo: { in: batch } };
            
            const batchEmployees = await this.prisma.employee.findMany({
              where: batchWhere,
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
            allMatchingEmployees.push(...batchEmployees);
          }
        } else {
          allMatchingEmployees = await this.prisma.employee.findMany({
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
        }
        
        const sortedEmployees = allMatchingEmployees.sort((a, b) => {
          if (sortBy === 'lastSalary') {
            const salaryA = a.salaries[0]?.salary || 0;
            const salaryB = b.salaries[0]?.salary || 0;
            return sortOrder === 'asc' ? salaryA - salaryB : salaryB - salaryA;
          } else if (sortBy === 'department') {
            const deptA = a.deptEmp[0]?.department?.deptName || 'No Department';
            const deptB = b.deptEmp[0]?.department?.deptName || 'No Department';
            return sortOrder === 'asc' ? deptA.localeCompare(deptB) : deptB.localeCompare(deptA);
          }
          return 0;
        });
        employees = sortedEmployees.slice(skip, skip + take);
        total = sortedEmployees.length;
      } else {
        if (where._isLargeNameSet) {
          const nameEmpNos = where._nameEmpNos;
          delete where._isLargeNameSet;
          delete where._nameEmpNos;
          
          const BATCH_SIZE = 10000;
          const batches = [];
          for (let i = 0; i < nameEmpNos.length; i += BATCH_SIZE) {
            batches.push(nameEmpNos.slice(i, i + BATCH_SIZE));
          }
          
          let allEmployees = [];
          
          for (const batch of batches) {
            const batchWhere = { ...where, empNo: { in: batch } };
            
            const batchEmployees = await this.prisma.employee.findMany({
              where: batchWhere,
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
            allEmployees.push(...batchEmployees);
          }
          
          allEmployees.sort((a, b) => {
            if (sortBy === 'name') {
              const nameA = a.firstName;
              const nameB = b.firstName;
              return sortOrder === 'asc' ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA);
            } else {
              const fieldA = a[sortBy] || 0;
              const fieldB = b[sortBy] || 0;
              return sortOrder === 'asc' ? (fieldA > fieldB ? 1 : -1) : (fieldA < fieldB ? 1 : -1);
            }
          });
          
          employees = allEmployees.slice(skip, skip + take);
          total = allEmployees.length;
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
          
          total = await this.prisma.employee.count({ where });
        }
      }

      const result = employees.map(emp => ({
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


