// docs/backlog.md #36-#38 — Services CRUD, soft-delete, validation
// docs/api/endpoints.md — Services endpoints

import {
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateServiceDto, UpdateServiceDto } from './dto/services.dto';

@Injectable()
export class ServicesService {
  private readonly logger = new Logger(ServicesService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * List services
   * docs/api/endpoints.md — GET /api/v1/services
   * Master sees all, client sees active only
   */
  async findAll(tenantId: string, role: string) {
    const where: Record<string, unknown> = { tenantId };

    // Clients only see active services
    if (role === 'client') {
      where.isActive = true;
    }

    return this.prisma.tenantClient.service.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  /**
   * Get service by ID
   */
  async findById(tenantId: string, serviceId: string) {
    const service = await this.prisma.tenantClient.service.findFirst({
      where: { id: serviceId, tenantId },
    });

    if (!service) {
      throw new NotFoundException('Service not found');
    }

    return service;
  }

  /**
   * Create service
   * docs/api/endpoints.md — POST /api/v1/services
   * docs/backlog.md #38 — Validation: name, price > 0, duration > 0
   */
  async create(tenantId: string, dto: CreateServiceDto) {
    // Get max sort_order for this tenant
    const maxSortOrder = await this.prisma.tenantClient.service.aggregate({
      where: { tenantId },
      _max: { sortOrder: true },
    });

    const service = await this.prisma.tenantClient.service.create({
      data: {
        tenantId,
        name: dto.name,
        description: dto.description,
        durationMinutes: dto.durationMinutes,
        price: dto.price,
        currency: dto.currency,
        bufferMinutes: dto.bufferMinutes || 0,
        category: dto.category,
        color: dto.color,
        sortOrder: (maxSortOrder._max.sortOrder || 0) + 1,
      },
    });

    this.logger.log(`Service created: ${service.name} in tenant ${tenantId}`);
    return service;
  }

  /**
   * Update service
   * docs/api/endpoints.md — PUT /api/v1/services/:id
   */
  async update(tenantId: string, serviceId: string, dto: UpdateServiceDto) {
    // Verify service belongs to tenant
    await this.findById(tenantId, serviceId);

    return this.prisma.tenantClient.service.update({
      where: { id: serviceId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.durationMinutes !== undefined && { durationMinutes: dto.durationMinutes }),
        ...(dto.price !== undefined && { price: dto.price }),
        ...(dto.currency !== undefined && { currency: dto.currency }),
        ...(dto.bufferMinutes !== undefined && { bufferMinutes: dto.bufferMinutes }),
        ...(dto.category !== undefined && { category: dto.category }),
        ...(dto.color !== undefined && { color: dto.color }),
        ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
      },
    });
  }

  /**
   * Soft delete service (set is_active = false)
   * docs/backlog.md #37 — Service soft-delete (is_active flag)
   */
  async softDelete(tenantId: string, serviceId: string) {
    await this.findById(tenantId, serviceId);

    await this.prisma.tenantClient.service.update({
      where: { id: serviceId },
      data: { isActive: false },
    });

    this.logger.log(`Service soft-deleted: ${serviceId} in tenant ${tenantId}`);
  }
}
