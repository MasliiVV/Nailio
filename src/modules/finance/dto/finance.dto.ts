// docs/api/endpoints.md — Finance DTOs
// docs/database/schema.md — transactions table

import {
  IsString,
  IsOptional,
  IsInt,
  IsEnum,
  IsUUID,
  Min,
  MaxLength,
  IsDateString,
} from 'class-validator';
import { PaymentMethod, TransactionType } from '@prisma/client';

export class CreateTransactionDto {
  @IsEnum(TransactionType)
  @IsOptional()
  type?: TransactionType; // default 'income'

  @IsUUID()
  @IsOptional()
  bookingId?: string;

  @IsUUID()
  @IsOptional()
  clientId?: string;

  @IsInt()
  @Min(1)
  amount!: number; // in kopiykas

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  @MaxLength(3)
  currency?: string; // default UAH

  @IsEnum(PaymentMethod)
  @IsOptional()
  paymentMethod?: PaymentMethod; // default cash
}

export class TransactionListQueryDto {
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @IsString()
  limit?: string;
}
