// docs/api/endpoints.md — Services endpoints
// GET /api/v1/services 🔑
// POST /api/v1/services 🔑👑⚡
// GET /api/v1/services/:id 🔑
// PUT /api/v1/services/:id 🔑👑⚡
// DELETE /api/v1/services/:id 🔑👑⚡

import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { ServicesService } from './services.service';
import { CreateServiceDto, UpdateServiceDto, ServiceResponseDto } from './dto/services.dto';
import {
  Roles,
  RequiresActiveSubscription,
  CurrentTenant,
  CurrentUser,
} from '../../common/decorators';
import { JwtPayload } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard, RolesGuard } from '../../common/guards';

@ApiTags('Services')
@Controller('services')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
export class ServicesController {
  constructor(private readonly servicesService: ServicesService) {}

  /**
   * List services
   * docs/api/endpoints.md — GET /api/v1/services
   * Master: all, Client: active only
   */
  @Get()
  @ApiOperation({ summary: 'List services' })
  @ApiResponse({ status: 200, type: [ServiceResponseDto] })
  async findAll(@CurrentTenant() tenantId: string, @CurrentUser() user: JwtPayload) {
    return this.servicesService.findAll(tenantId, user.role);
  }

  /**
   * Get service by ID
   */
  @Get(':id')
  @ApiOperation({ summary: 'Get service details' })
  @ApiResponse({ status: 200, type: ServiceResponseDto })
  @ApiResponse({ status: 404, description: 'Service not found' })
  async findOne(@CurrentTenant() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.servicesService.findById(tenantId, id);
  }

  /**
   * Create service
   * docs/api/endpoints.md — POST /api/v1/services 🔑👑⚡
   */
  @Post()
  @Roles('master')
  @RequiresActiveSubscription()
  @UseGuards(RolesGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create service' })
  @ApiResponse({ status: 201, type: ServiceResponseDto })
  async create(@CurrentTenant() tenantId: string, @Body() dto: CreateServiceDto) {
    return this.servicesService.create(tenantId, dto);
  }

  /**
   * Update service
   * docs/api/endpoints.md — PUT /api/v1/services/:id 🔑👑⚡
   */
  @Put(':id')
  @Roles('master')
  @RequiresActiveSubscription()
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Update service' })
  @ApiResponse({ status: 200, type: ServiceResponseDto })
  @ApiResponse({ status: 404, description: 'Service not found' })
  async update(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateServiceDto,
  ) {
    return this.servicesService.update(tenantId, id, dto);
  }

  /**
   * Soft delete service (deactivate)
   * docs/api/endpoints.md — DELETE /api/v1/services/:id 🔑👑⚡
   * docs/backlog.md #37 — Soft-delete (is_active flag)
   */
  @Delete(':id')
  @Roles('master')
  @RequiresActiveSubscription()
  @UseGuards(RolesGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Deactivate service (soft delete)' })
  @ApiResponse({ status: 204, description: 'Service deactivated' })
  @ApiResponse({ status: 404, description: 'Service not found' })
  async remove(@CurrentTenant() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.servicesService.softDelete(tenantId, id);
  }
}
